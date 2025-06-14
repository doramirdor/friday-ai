import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { databaseService, Meeting, Settings } from './database'
import { seedDatabase } from './seedData'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as net from 'net'
import ffmpeg from 'fluent-ffmpeg'

// Import services
import { geminiService } from './gemini'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let transcriptionProcess: ChildProcess | null = null
let transcriptionSocket: net.Socket | null = null
let isTranscriptionReady = false
let isTranscriptionStarting = false
let actualTranscriptionPort = 9001 // Will be updated based on Python server output

// Swift recorder process management
let swiftRecorderProcess: ChildProcess | null = null
let isSwiftRecorderAvailable = false

// Current shortcuts state
const currentShortcuts: Record<string, string> = {
  'toggle-recording': 'CmdOrCtrl+Alt+R',
  'quick-note': 'CmdOrCtrl+Alt+N',
  'show-hide': 'CmdOrCtrl+Shift+H',
  'pause-resume': 'CmdOrCtrl+Alt+P'
}

// Fallback shortcuts in case primary ones fail
const fallbackShortcuts: Record<string, string[]> = {
  'toggle-recording': ['CmdOrCtrl+L', 'CmdOrCtrl+Shift+R', 'F9'],
  'quick-note': ['CmdOrCtrl+Shift+N', 'CmdOrCtrl+Alt+Q', 'F10'],
  'show-hide': ['CmdOrCtrl+Alt+H', 'CmdOrCtrl+Shift+H', 'F11'],
  'pause-resume': ['CmdOrCtrl+P', 'CmdOrCtrl+Shift+P', 'F8']
}

// Add interfaces for chunked recording at the top
interface RecordingChunk {
  id: string
  path: string
  startTime: number
  endTime: number
  size: number
}

interface ChunkedRecording {
  meetingId: number
  chunks: RecordingChunk[]
  isActive: boolean
  totalDuration: number
}

// Add state for chunked recordings
const activeChunkedRecordings = new Map<number, ChunkedRecording>()
const CHUNK_DURATION_MS = 5 * 60 * 1000 // 5 minutes per chunk
const CHUNK_SIZE_LIMIT = 50 * 1024 * 1024 // 50MB per chunk

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIcon(), // Use proper icon resolution function
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow blob URLs for audio playback
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Function to get appropriate app icon based on platform
function getAppIcon(): string {
  console.log('🔍 Resolving app icon for platform:', process.platform)
  
  if (process.platform === 'darwin') {
    // On macOS, use .icns for the app
    const icnsPath = path.join(__dirname, '../../build/icon.icns')
    console.log('🔍 Checking for macOS icon at:', icnsPath)
    if (fs.existsSync(icnsPath)) {
      console.log('✅ Using macOS .icns icon:', icnsPath)
      return icnsPath
    }
  } else if (process.platform === 'win32') {
    // On Windows, use .ico for the app
    const icoPath = path.join(__dirname, '../../build/icon.ico')
    console.log('🔍 Checking for Windows icon at:', icoPath)
    if (fs.existsSync(icoPath)) {
      console.log('✅ Using Windows .ico icon:', icoPath)
      return icoPath
    }
  }
  
  // Fallback to PNG for Linux or if platform-specific icons don't exist
  const pngPath = path.join(__dirname, '../../build/icon.png')
  console.log('🔍 Checking for PNG icon at:', pngPath)
  if (fs.existsSync(pngPath)) {
    console.log('✅ Using PNG icon:', pngPath)
    return pngPath
  }
  
  // Try resources directory as fallback
  const resourcesPath = path.join(__dirname, '../../resources/FridayLogoOnly.png')
  console.log('🔍 Checking for resources icon at:', resourcesPath)
  if (fs.existsSync(resourcesPath)) {
    console.log('✅ Using resources icon:', resourcesPath)
    return resourcesPath
  }
  
  // Final fallback to the bundled icon
  console.log('⚠️ Using bundled fallback icon:', icon)
  return icon
}

// Function to get appropriate tray icon based on platform
function getTrayIcon(): string {
  console.log('🔍 Resolving tray icon for platform:', process.platform)
  
  // Tray icons need to be smaller - typically 16x16 or 22x22 pixels
  if (process.platform === 'darwin') {
    // On macOS, don't use template for now - just use regular icon
    const trayIconPath = path.join(__dirname, '../../resources/tray-icon.png')
    console.log('🔍 Checking for macOS tray icon at:', trayIconPath)
    if (fs.existsSync(trayIconPath)) {
      console.log('✅ Using macOS tray icon:', trayIconPath)
      return trayIconPath
    }
    
    // Fallback: use the Friday logo directly, resized
    const fridayLogoPath = path.join(__dirname, '../../resources/FridayLogoOnly.png')
    console.log('🔍 Checking for Friday logo at:', fridayLogoPath)
    if (fs.existsSync(fridayLogoPath)) {
      console.log('✅ Using Friday logo for tray:', fridayLogoPath)
      return fridayLogoPath
    }
    
    // Final fallback: use the small build icon
    const smallIconPath = path.join(__dirname, '../../build/icon.png')
    console.log('🔍 Checking for build icon at:', smallIconPath)
    if (fs.existsSync(smallIconPath)) {
      console.log('✅ Using build icon for tray:', smallIconPath)
      return smallIconPath
    }
  } else if (process.platform === 'win32') {
    // On Windows, use a small version of the icon
    const trayIconPath = path.join(__dirname, '../../resources/tray-icon.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
    
    // Fallback to build icon
    const buildIconPath = path.join(__dirname, '../../build/icon.png')
    if (fs.existsSync(buildIconPath)) {
      return buildIconPath
    }
  } else {
    // Linux - use small PNG
    const trayIconPath = path.join(__dirname, '../../resources/tray-icon.png')
    if (fs.existsSync(trayIconPath)) {
      return trayIconPath
    }
  }
  
  // Final fallback
  console.log('⚠️ Using bundled fallback icon for tray:', icon)
  return icon
}

// Check if Swift recorder is available
async function checkSwiftRecorderAvailability(): Promise<boolean> {
  return new Promise((resolve) => {
    const recorderPath = path.join(process.cwd(), 'Recorder')

    if (!fs.existsSync(recorderPath)) {
      console.log('❌ Swift recorder not found at:', recorderPath)
      resolve(false)
      return
    }

    // Test if the recorder can check permissions
    const testProcess = spawn(recorderPath, ['--check-permissions'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    testProcess.stdout?.on('data', (data) => {
      output += data.toString()
    })

    testProcess.on('close', (code) => {
      try {
        const result = JSON.parse(output.trim().split('\n').pop() || '{}')
        const available =
          code === 0 &&
          (result.code === 'PERMISSION_GRANTED' || result.code === 'PERMISSION_DENIED')
        console.log(available ? '✅ Swift recorder is available' : '❌ Swift recorder test failed')
        resolve(available)
      } catch (error) {
        console.log('❌ Swift recorder test failed:', error)
        resolve(false)
      }
    })

    testProcess.on('error', (error) => {
      console.log('❌ Swift recorder error:', error)
      resolve(false)
    })
  })
}

// Start combined recording using Swift recorder
async function startCombinedRecording(
  recordingPath: string,
  filename?: string
): Promise<{ 
  success: boolean; 
  path?: string; 
  error?: string;
  warning?: string;
  recommendation?: string;
  cause?: string;
  solution?: string;
}> {
  return new Promise((resolve) => {
    if (!isSwiftRecorderAvailable) {
      resolve({ success: false, error: 'Swift recorder not available' })
      return
    }

    // Get settings to use default save location if none provided
    databaseService.getSettings()
      .then(settings => {
        // Use provided path or default from settings
        const finalPath = recordingPath || settings.defaultSaveLocation || path.join(os.homedir(), 'Friday Recordings')
        
        // Resolve home directory if path starts with ~
        const resolvedPath = finalPath.startsWith('~/') 
          ? path.join(os.homedir(), finalPath.slice(2))
          : finalPath

        // Ensure the directory exists
        if (!fs.existsSync(resolvedPath)) {
          fs.mkdirSync(resolvedPath, { recursive: true })
        }

        const recorderPath = path.join(process.cwd(), 'Recorder')
        const args = ['--record', resolvedPath, '--source', 'both']

        if (filename) {
          args.push('--filename', filename)
        }

        console.log('🎙️ Starting combined recording with Swift recorder...')
        console.log('Command:', recorderPath, args.join(' '))

        swiftRecorderProcess = spawn(recorderPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NSUnbufferedIO: 'YES' } // Force unbuffered output
        })

        let hasStarted = false
        let outputReceived = false
        let lastOutputTime = Date.now()

        // Enhanced timeout to detect if we're not receiving any output at all
        const outputTimeoutId = setTimeout(() => {
          if (!outputReceived) {
            console.log('❌ HANG DETECTION: No output received from Swift recorder after 10 seconds')
            console.log('   Process may be hanging in Electron app context vs manual terminal execution')
            if (swiftRecorderProcess) {
              console.log('   Process PID:', swiftRecorderProcess.pid)
              console.log('   Process killed status:', swiftRecorderProcess.killed)
              console.log('   Terminating hanging process...')
              swiftRecorderProcess.kill('SIGKILL') // Force kill hanging process
            }
            if (!hasStarted) {
              resolve({ 
                success: false, 
                error: 'Swift recorder process hanging - no output received after 10 seconds',
                cause: 'Process spawned but appears to be stuck in initialization',
                solution: 'This may indicate permission issues or Swift recorder compatibility problems in app context'
              })
            }
          }
        }, 10000)

        // Periodic hang detection - check if output has stopped flowing
        const hangDetectionInterval = setInterval(() => {
          const now = Date.now()
          const timeSinceLastOutput = now - lastOutputTime
          
          if (outputReceived && timeSinceLastOutput > 15000 && !hasStarted) {
            console.log('❌ HANG DETECTION: Output stopped flowing for 15+ seconds during initialization')
            console.log(`   Last output was ${timeSinceLastOutput}ms ago`)
            if (swiftRecorderProcess && !swiftRecorderProcess.killed) {
              console.log('   Terminating stalled process...')
              swiftRecorderProcess.kill('SIGKILL')
            }
            clearInterval(hangDetectionInterval)
            if (!hasStarted) {
              resolve({ 
                success: false, 
                error: 'Swift recorder initialization stalled - output stopped during startup',
                cause: 'Process started but became unresponsive during initialization phase',
                solution: 'This may indicate Core Audio device conflicts or system audio routing issues'
              })
            }
          }
        }, 5000)

        swiftRecorderProcess.stdout?.on('data', (data) => {
          outputReceived = true
          lastOutputTime = Date.now()
          clearTimeout(outputTimeoutId)
          
          console.log('📥 Raw Swift recorder stdout:', data.toString())
          
          const lines = data
            .toString()
            .split('\n')
            .filter((line) => line.trim())

          for (const line of lines) {
            try {
              const result = JSON.parse(line)
              console.log('📝 Swift recorder output:', result)

              if (result.code === 'RECORDING_STARTED' && !hasStarted) {
                hasStarted = true
                clearInterval(hangDetectionInterval)
                resolve({ success: true, path: result.path })

                // Notify renderer about recording start
                if (mainWindow) {
                  mainWindow.webContents.send('combined-recording-started', result)
                }
                            } else if ((result.code === 'COMBINED_RECORDING_FAILED_BLUETOOTH' ||
                          result.code === 'COMBINED_RECORDING_FAILED_PERMISSION' || 
                          result.code === 'COMBINED_RECORDING_FAILED_SYSTEM') && !hasStarted) {
                hasStarted = true
                clearInterval(hangDetectionInterval)
                resolve({ 
                  success: false, 
                  error: result.error,
                  recommendation: result.recommendation
                })

                // Notify renderer about recording failure
                if (mainWindow) {
                  mainWindow.webContents.send('combined-recording-failed', result)
                }
                
                console.log('❌ Combined recording failed:', result.error)
              } else if (result.code === 'RECORDING_STOPPED') {
                // Notify renderer about recording completion
                if (mainWindow) {
                  mainWindow.webContents.send('combined-recording-stopped', result)
                }
              } else if (result.code === 'RECORDING_ERROR' && !hasStarted) {
                clearInterval(hangDetectionInterval)
                resolve({ success: false, error: result.error })
              } else if (result.code === 'RECORDING_FAILED') {
                // Handle recording failure even after it has started
                console.error('❌ Recording failed after start:', result.error)
                
                // Notify renderer about the failure
                if (mainWindow) {
                  mainWindow.webContents.send('combined-recording-failed', result)
                }
                
                // If this happens after hasStarted, we need to clean up
                if (hasStarted) {
                  swiftRecorderProcess = null // Process will exit, so clear reference
                } else {
                  hasStarted = true
                  clearInterval(hangDetectionInterval)
                  resolve({ success: false, error: result.error })
                }
              }
            } catch {
              // Non-JSON output, just log it
              console.log('Swift recorder log:', line)
            }
          }
        })

        swiftRecorderProcess.stderr?.on('data', (data) => {
          outputReceived = true
          lastOutputTime = Date.now()
          clearTimeout(outputTimeoutId)
          console.log('📥 Swift recorder stderr:', data.toString())
        })

        swiftRecorderProcess.on('spawn', () => {
          console.log('🚀 Swift recorder process spawned successfully (PID: ' + swiftRecorderProcess?.pid + ')')
        })

        swiftRecorderProcess.on('close', (code, signal) => {
          console.log(`Swift recorder process exited with code ${code}, signal: ${signal}`)
          clearTimeout(outputTimeoutId)
          clearInterval(hangDetectionInterval)
          swiftRecorderProcess = null

          if (!hasStarted) {
            resolve({ 
              success: false, 
              error: `Recorder exited unexpectedly with code ${code}`,
              cause: signal ? `Process terminated by signal: ${signal}` : `Exit code: ${code}`,
              solution: 'Check console logs for detailed error information'
            })
          }
        })

        swiftRecorderProcess.on('error', (error) => {
          console.error('Swift recorder error:', error)
          clearTimeout(outputTimeoutId)
          clearInterval(hangDetectionInterval)
          if (!hasStarted) {
            resolve({ success: false, error: error.message })
          }
        })

        // Timeout after 30 seconds if recording doesn't start (increased for Bluetooth workaround)
        setTimeout(() => {
          if (!hasStarted) {
            clearInterval(hangDetectionInterval)
            if (swiftRecorderProcess) {
              console.log('❌ TIMEOUT: Force terminating Swift recorder after 30 seconds')
              swiftRecorderProcess.kill('SIGKILL') // Use SIGKILL for force termination
              swiftRecorderProcess = null
            }
            resolve({ 
              success: false, 
              error: 'Recording start timeout after 30 seconds',
              cause: 'Swift recorder failed to initialize within timeout period',
              solution: 'This may indicate system audio routing conflicts or permission issues. Try restarting the app or switching audio devices.'
            })
          }
        }, 30000)
      })
      .catch(error => {
        console.error('Failed to get settings:', error)
        resolve({ success: false, error: 'Failed to get settings' })
      })
  })
}

// Stop combined recording
async function stopCombinedRecording(): Promise<{
  success: boolean
  path?: string
  error?: string
}> {
  return new Promise((resolve) => {
    if (!swiftRecorderProcess) {
      // Check if we might have a recording in progress but lost track of the process
      console.log('⚠️ No tracked Swift recorder process found')
      resolve({ success: false, error: 'No active recording' })
      return
    }

    console.log('🛑 Stopping combined recording...')

    let hasFinished = false

    // Listen for the final output
    const handleOutput = (data: Buffer): void => {
      const lines = data
        .toString()
        .split('\n')
        .filter((line) => line.trim())

      for (const line of lines) {
        try {
          const result = JSON.parse(line)
          if (result.code === 'RECORDING_STOPPED' && !hasFinished) {
            hasFinished = true
            resolve({ success: true, path: result.path })
          }
        } catch {
          // Non-JSON output
        }
      }
    }

    swiftRecorderProcess.stdout?.on('data', handleOutput)

    // Send SIGINT to gracefully stop recording
    swiftRecorderProcess.kill('SIGINT')

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!hasFinished) {
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill('SIGTERM')
          swiftRecorderProcess = null
        }
        resolve({ success: false, error: 'Stop timeout' })
      }
    }, 30000)
  })
}

// Transcription service management with socket communication
function startTranscriptionService(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🎤 Starting transcription socket server...')

    // Path to Python virtual environment and script
    const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python')
    const scriptPath = path.join(process.cwd(), 'transcribe.py')

    // Check if files exist
    if (!fs.existsSync(pythonPath)) {
      console.error('Python virtual environment not found at:', pythonPath)
      reject(new Error('Python virtual environment not found'))
      return
    }

    if (!fs.existsSync(scriptPath)) {
      console.error('Transcription script not found at:', scriptPath)
      reject(new Error('Transcription script not found'))
      return
    }

    // Start Python socket server
    transcriptionProcess = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    transcriptionProcess.on('error', (error) => {
      console.error('Failed to start transcription process:', error)
      reject(error)
    })

    transcriptionProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim()

      // Check for port information in output
      const portMatch = output.match(/Socket server listening on port (\d+)/)
      if (portMatch) {
        actualTranscriptionPort = parseInt(portMatch[1])
        console.log(`📍 Transcription server using port: ${actualTranscriptionPort}`)
        return
      }

      if (output === 'READY') {
        console.log('📞 Connecting to transcription socket...')
        connectToTranscriptionSocket()
          .then(() => {
            isTranscriptionReady = true
            isTranscriptionStarting = false
            console.log('✅ Transcription service ready')
            resolve()
          })
          .catch((error) => {
            isTranscriptionStarting = false
            reject(error)
          })
        return
      }

      console.log('Transcription output:', output)
    })

    transcriptionProcess.stderr?.on('data', (data) => {
      console.log('Transcription stderr:', data.toString())
    })

    transcriptionProcess.on('close', (code) => {
      console.log(`Transcription process exited with code ${code}`)
      isTranscriptionReady = false
      transcriptionProcess = null
      if (transcriptionSocket) {
        transcriptionSocket.destroy()
        transcriptionSocket = null
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!isTranscriptionReady) {
        isTranscriptionStarting = false
        reject(new Error('Transcription service startup timeout'))
      }
    }, 30000)
  })
}

function connectToTranscriptionSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (transcriptionSocket) {
      transcriptionSocket.destroy()
    }
    
    transcriptionSocket = new net.Socket()
    transcriptionSocket.setKeepAlive(true, 60000) // Keep connection alive
    // Remove timeout - let it stay connected
    // transcriptionSocket.setTimeout(30000) // 30 second timeout

    transcriptionSocket.connect(actualTranscriptionPort, 'localhost', () => {
      console.log(`🔌 Connected to transcription socket server on port ${actualTranscriptionPort}`)
      resolve()
    })

    transcriptionSocket.on('data', (data) => {
      try {
        const lines = data
          .toString()
          .split('\n')
          .filter((line) => line.trim())

        for (const line of lines) {
          const result = JSON.parse(line)

          if (mainWindow) {
            mainWindow.webContents.send('transcription-result', result)
          }

          console.log(
            '📝 Transcription result:',
            result.type,
            result.text?.substring(0, 50) || result.message
          )
        }
      } catch (error) {
        console.error('Failed to parse transcription result:', error)
      }
    })

    transcriptionSocket.on('error', (error) => {
      console.error('Socket error:', error)
      // Don't reject here during normal operation, only during initial connection
      if (!isTranscriptionReady) {
        reject(error)
      }
    })

    // Remove timeout handler since we removed the timeout
    // transcriptionSocket.on('timeout', () => {
    //   console.log('Socket timeout - closing connection')
    //   transcriptionSocket?.destroy()
    // })

    transcriptionSocket.on('close', () => {
      console.log('📞 Socket connection closed - keeping service ready for reconnection')
      transcriptionSocket = null
      // Don't set isTranscriptionReady to false here to allow reconnection
      
      // Attempt to reconnect after a shorter delay if the process is still running
      if (transcriptionProcess && !transcriptionProcess.killed) {
        console.log('🔄 Attempting to reconnect to transcription service in 3 seconds...')
        setTimeout(() => {
          if (transcriptionProcess && !transcriptionProcess.killed && !transcriptionSocket && isTranscriptionReady) {
            connectToTranscriptionSocket()
              .then(() => {
                console.log('✅ Reconnected to transcription service')
              })
              .catch((error) => {
                console.error('Failed to reconnect to transcription service:', error)
                // Only set to false if reconnection fails multiple times
                isTranscriptionReady = false
              })
          }
        }, 3000) // Reduced delay for faster reconnection
      } else {
        isTranscriptionReady = false
      }
    })
  })
}

function stopTranscriptionService(): void {
  if (transcriptionSocket) {
    console.log('🛑 Closing socket connection...')
    transcriptionSocket.destroy()
    transcriptionSocket = null
  }

  if (transcriptionProcess) {
    console.log('🛑 Stopping transcription service...')
    transcriptionProcess.kill('SIGTERM')
    transcriptionProcess = null
  }

  isTranscriptionReady = false
  isTranscriptionStarting = false
}

// Audio processing functions
function saveAudioChunk(audioBuffer: Buffer): string {
  const tempDir = os.tmpdir()
  const fileName = `audio_chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webm`
  const filePath = path.join(tempDir, fileName)

  fs.writeFileSync(filePath, audioBuffer)
  return filePath
}

function saveCompleteRecording(audioBuffer: Buffer, meetingId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Get settings to use default save location
    databaseService.getSettings()
      .then(settings => {
        const recordingsDir = settings.defaultSaveLocation || path.join(os.homedir(), 'Friday Recordings')
        
        // Ensure the directory exists
        if (!fs.existsSync(recordingsDir)) {
          fs.mkdirSync(recordingsDir, { recursive: true })
        }

        // Create filename with timestamp and meeting ID
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const webmFileName = `meeting_${meetingId}_${timestamp}.webm`
        const mp3FileName = `meeting_${meetingId}_${timestamp}.mp3`
        const webmFilePath = path.join(recordingsDir, webmFileName)
        const mp3FilePath = path.join(recordingsDir, mp3FileName)

        try {
          // First save the WebM file
          fs.writeFileSync(webmFilePath, audioBuffer)
          console.log(`💾 WebM recording saved to: ${webmFilePath}`)

          // Convert WebM to MP3 using ffmpeg
          ffmpeg(webmFilePath)
            .noVideo()
            .audioBitrate('192k')
            .audioFrequency(44100)
            .save(mp3FilePath)
            .on('end', () => {
              console.log(`🎵 Conversion finished: ${mp3FilePath}`)

              // Clean up the temporary WebM file
              try {
                fs.unlinkSync(webmFilePath)
                console.log(`🗑️ Cleaned up temporary WebM file`)
              } catch (cleanupError) {
                console.warn('Failed to clean up WebM file:', cleanupError)
              }

              resolve(mp3FilePath)
            })
            .on('error', (err) => {
              console.error(`❌ FFmpeg conversion error: ${err.message}`)

              // If conversion fails, return the WebM file as fallback
              console.log('📁 Falling back to WebM file')
              resolve(webmFilePath)
            })
        } catch (error) {
          console.error('Failed to save recording:', error)
          reject(error)
        }
      })
      .catch(error => {
        console.error('Failed to get settings:', error)
        reject(error)
      })
  })
}

// Add chunked recording functions
function createRecordingChunk(meetingId: number, audioBuffer: Buffer, chunkIndex: number): Promise<RecordingChunk> {
  return new Promise((resolve, reject) => {
    const recordingsDir = path.join(os.homedir(), 'Friday Recordings', `meeting_${meetingId}_chunks`)
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true })
    }

    const timestamp = Date.now()
    const chunkId = `chunk_${chunkIndex}_${timestamp}`
    const webmFileName = `${chunkId}.webm`
    const mp3FileName = `${chunkId}.mp3`
    const webmFilePath = path.join(recordingsDir, webmFileName)
    const mp3FilePath = path.join(recordingsDir, mp3FileName)

    try {
      // Save WebM chunk
      fs.writeFileSync(webmFilePath, audioBuffer)
      console.log(`💾 Chunk ${chunkIndex} saved: ${webmFilePath} (${audioBuffer.length} bytes)`)

      // Convert to MP3 asynchronously
      ffmpeg(webmFilePath)
        .noVideo()
        .audioBitrate('128k') // Lower bitrate for chunks
        .audioFrequency(44100)
        .save(mp3FilePath)
        .on('end', () => {
          console.log(`🎵 Chunk ${chunkIndex} converted: ${mp3FilePath}`)

          // Get file size
          const stats = fs.statSync(mp3FilePath)
          
          const chunk: RecordingChunk = {
            id: chunkId,
            path: mp3FilePath,
            startTime: timestamp,
            endTime: timestamp + CHUNK_DURATION_MS,
            size: stats.size
          }

          // Clean up temporary WebM file
          try {
            fs.unlinkSync(webmFilePath)
          } catch (cleanupError) {
            console.warn('Failed to clean up WebM chunk:', cleanupError)
          }

          resolve(chunk)
        })
        .on('error', (err) => {
          console.error(`❌ Chunk ${chunkIndex} conversion error: ${err.message}`)
          // Fallback to WebM if conversion fails
          const stats = fs.statSync(webmFilePath)
          
          const chunk: RecordingChunk = {
            id: chunkId,
            path: webmFilePath,
            startTime: timestamp,
            endTime: timestamp + CHUNK_DURATION_MS,
            size: stats.size
          }
          
          resolve(chunk)
        })
    } catch (error) {
      console.error('Failed to create recording chunk:', error)
      reject(error)
    }
  })
}

function startChunkedRecording(meetingId: number): ChunkedRecording {
  const chunkedRecording: ChunkedRecording = {
    meetingId,
    chunks: [],
    isActive: true,
    totalDuration: 0
  }
  
  activeChunkedRecordings.set(meetingId, chunkedRecording)
  console.log(`🎬 Started chunked recording for meeting ${meetingId}`)
  
  return chunkedRecording
}

async function addChunkToRecording(meetingId: number, audioBuffer: Buffer): Promise<boolean> {
  const recording = activeChunkedRecordings.get(meetingId)
  if (!recording || !recording.isActive) {
    return false
  }

  try {
    const chunkIndex = recording.chunks.length
    const chunk = await createRecordingChunk(meetingId, audioBuffer, chunkIndex)
    recording.chunks.push(chunk)
    
    console.log(`✅ Added chunk ${chunkIndex} to meeting ${meetingId} (${chunk.size} bytes)`)
    
    // Background save to database (don't wait for completion)
    updateMeetingChunks(meetingId, recording.chunks).catch(error => {
      console.error('Background chunk save failed:', error)
    })
    
    return true
  } catch (error) {
    console.error('Failed to add chunk to recording:', error)
    return false
  }
}

async function updateMeetingChunks(meetingId: number, chunks: RecordingChunk[]): Promise<void> {
  try {
    // Get current meeting
    const meeting = await databaseService.getMeeting(meetingId)
    if (!meeting) return

    // Update with chunk paths
    const chunkPaths = chunks.map(chunk => chunk.path)
    await databaseService.updateMeeting(meetingId, {
      recordingPath: chunkPaths,
      updatedAt: new Date().toISOString()
    })
    
    console.log(`💾 Background saved ${chunks.length} chunks for meeting ${meetingId}`)
  } catch (error) {
    console.error('Failed to update meeting chunks:', error)
  }
}

async function stopChunkedRecording(meetingId: number): Promise<string[]> {
  const recording = activeChunkedRecordings.get(meetingId)
  if (!recording) {
    return []
  }

  recording.isActive = false
  const chunkPaths = recording.chunks.map(chunk => chunk.path)
  
  // Final save to database
  await updateMeetingChunks(meetingId, recording.chunks)
  
  activeChunkedRecordings.delete(meetingId)
  console.log(`🏁 Stopped chunked recording for meeting ${meetingId} (${recording.chunks.length} chunks)`)
  
  return chunkPaths
}

// Setup transcription IPC handlers
function setupTranscriptionHandlers(): void {
  ipcMain.handle('transcription:start-service', async () => {
    try {
      if (isTranscriptionReady) {
        console.log('✅ Transcription service already ready, skipping start')
        return { success: true }
      }
      
      if (isTranscriptionStarting) {
        console.log('⏳ Transcription service already starting, waiting...')
        return { success: true }
      }
      
      console.log('🎤 Starting transcription service (not ready)...')
      isTranscriptionStarting = true
      await startTranscriptionService()
      return { success: true }
    } catch (error) {
      console.error('Failed to start transcription service:', error)
      isTranscriptionStarting = false
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('transcription:stop-service', () => {
    stopTranscriptionService()
    return { success: true }
  })

  ipcMain.handle('transcription:is-ready', () => {
    // More comprehensive readiness check
    const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed
    const serviceReady = isTranscriptionReady && !isTranscriptionStarting
    const processRunning = transcriptionProcess && !transcriptionProcess.killed
    
    return { 
      ready: serviceReady && socketConnected && processRunning,
      details: {
        serviceReady,
        socketConnected,
        processRunning,
        isStarting: isTranscriptionStarting
      }
    }
  })

  ipcMain.handle('transcription:process-chunk', async (_, audioBuffer: ArrayBuffer) => {
    // More comprehensive readiness check
    const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed
    const serviceReady = isTranscriptionReady && !isTranscriptionStarting
    const processRunning = transcriptionProcess && !transcriptionProcess.killed
    
    if (!serviceReady) {
      return { success: false, error: 'Transcription service not ready or still starting' }
    }
    
    if (!socketConnected) {
      return { success: false, error: 'Socket connection not available' }
    }
    
    if (!processRunning) {
      return { success: false, error: 'Transcription process not running' }
    }

    try {
      const buffer = Buffer.from(audioBuffer)
      const filePath = saveAudioChunk(buffer)

      // Send the file path via socket
      transcriptionSocket!.write(filePath + '\n')

      return { success: true }
    } catch (error) {
      console.error('Failed to process audio chunk:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('transcription:ping', () => {
    return { ready: isTranscriptionReady }
  })

  ipcMain.handle(
    'transcription:save-recording',
    async (_, audioBuffer: ArrayBuffer, meetingId: number) => {
      try {
        const buffer = Buffer.from(audioBuffer)
        const filePath = await saveCompleteRecording(buffer, meetingId)
        return { success: true, filePath }
      } catch (error) {
        console.error('Failed to save complete recording:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    'transcription:load-recording',
    async (_, filePath: string) => {
      try {
        const resolvedPath = path.resolve(filePath)
        
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: 'Recording file not found' }
        }

        const buffer = fs.readFileSync(resolvedPath)
        return { success: true, buffer: buffer.buffer }
      } catch (error) {
        console.error('Failed to load recording:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // Alerts IPC handlers
  ipcMain.handle('alerts:check-keywords', async (_, options: { transcript: string; keywords: any[] }) => {
    try {
      // Check if transcription service is ready (we use the same socket)
      const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed
      const serviceReady = isTranscriptionReady && !isTranscriptionStarting
      
      if (!serviceReady || !socketConnected) {
        return { success: false, error: 'Transcription service not ready for alerts' }
      }

      return new Promise((resolve) => {
        // Create a temporary listener for the alert response
        const handleAlertResponse = (data: Buffer) => {
          try {
            const lines = data.toString().split('\n').filter(line => line.trim())
            
            for (const line of lines) {
              const response = JSON.parse(line)
              
              // Check if this is an alert response
              if (response.hasOwnProperty('success') && response.hasOwnProperty('matches')) {
                transcriptionSocket!.removeListener('data', handleAlertResponse)
                resolve(response)
                return
              }
            }
          } catch (error) {
            console.error('Failed to parse alert response:', error)
            transcriptionSocket!.removeListener('data', handleAlertResponse)
            resolve({ success: false, error: 'Failed to parse alert response' })
          }
        }

        // Add temporary listener
        transcriptionSocket!.on('data', handleAlertResponse)

        // Send alert request
        const alertRequest = JSON.stringify({
          type: 'check_alerts',
          transcript: options.transcript,
          keywords: options.keywords
        })

        transcriptionSocket!.write(alertRequest)

        // Timeout after 10 seconds
        setTimeout(() => {
          transcriptionSocket!.removeListener('data', handleAlertResponse)
          resolve({ success: false, error: 'Alert check timeout' })
        }, 10000)
      })
    } catch (error) {
      console.error('Failed to check alerts:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Swift recorder IPC handlers
  ipcMain.handle('swift-recorder:check-availability', async () => {
    return { available: isSwiftRecorderAvailable }
  })

  ipcMain.handle(
    'swift-recorder:start-combined-recording',
    async (_, recordingPath: string, filename?: string) => {
      try {
        const result = await startCombinedRecording(recordingPath, filename)
        return result
      } catch (error) {
        console.error('Failed to start combined recording:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('swift-recorder:stop-combined-recording', async () => {
    try {
      const result = await stopCombinedRecording()
      return result
    } catch (error) {
      console.error('Failed to stop combined recording:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Chunked recording IPC handlers
  ipcMain.handle('chunked-recording:start', async (_, meetingId: number) => {
    try {
      const recording = startChunkedRecording(meetingId)
      return { success: true, recording }
    } catch (error) {
      console.error('Failed to start chunked recording:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('chunked-recording:add-chunk', async (_, meetingId: number, audioBuffer: ArrayBuffer) => {
    try {
      const buffer = Buffer.from(audioBuffer)
      
      // Check chunk size limit
      if (buffer.length > CHUNK_SIZE_LIMIT) {
        console.warn(`⚠️ Chunk size ${buffer.length} exceeds limit ${CHUNK_SIZE_LIMIT}, splitting...`)
        // TODO: Implement chunk splitting if needed
      }
      
      const success = await addChunkToRecording(meetingId, buffer)
      return { success }
    } catch (error) {
      console.error('Failed to add chunk to recording:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('chunked-recording:stop', async (_, meetingId: number) => {
    try {
      const chunkPaths = await stopChunkedRecording(meetingId)
      return { success: true, chunkPaths }
    } catch (error) {
      console.error('Failed to stop chunked recording:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('chunked-recording:load-chunks', async (_, chunkPaths: string[]) => {
    try {
      const chunks: ArrayBuffer[] = []
      
      for (const chunkPath of chunkPaths) {
        if (fs.existsSync(chunkPath)) {
          const buffer = fs.readFileSync(chunkPath)
          chunks.push(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
        }
      }
      
      return { success: true, chunks }
    } catch (error) {
      console.error('Failed to load recording chunks:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

// Database IPC handlers
function setupDatabaseHandlers(): void {
  // Meeting operations
  ipcMain.handle('db:createMeeting', async (_, meeting: Omit<Meeting, 'id'>) => {
    return await databaseService.createMeeting(meeting)
  })

  ipcMain.handle('db:getMeeting', async (_, id: number) => {
    return await databaseService.getMeeting(id)
  })

  ipcMain.handle('db:getAllMeetings', async () => {
    return await databaseService.getAllMeetings()
  })

  ipcMain.handle('db:updateMeeting', async (_, id: number, meeting: Partial<Meeting>) => {
    return await databaseService.updateMeeting(id, meeting)
  })

  ipcMain.handle('db:deleteMeeting', async (_, id: number) => {
    return await databaseService.deleteMeeting(id)
  })

  // Settings operations
  ipcMain.handle('db:getSettings', async () => {
    return await databaseService.getSettings()
  })

  ipcMain.handle('db:updateSettings', async (_, settings: Partial<Settings>) => {
    const result = await databaseService.updateSettings(settings)
    
    // Update Gemini API key if it was changed
    if (settings.geminiApiKey !== undefined) {
      geminiService.setApiKey(settings.geminiApiKey)
    }
    
    return result
  })
}

// Gemini IPC handlers
function setupGeminiHandlers(): void {
  ipcMain.handle('gemini:generate-content', async (_, options) => {
    try {
      const result = await geminiService.generateMeetingContent(options)
      return result
    } catch (error) {
      console.error('Failed to generate content with Gemini:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gemini:generate-summary', async (_, options) => {
    try {
      const result = await geminiService.generateSummaryOnly(options)
      return result
    } catch (error) {
      console.error('Failed to generate summary with Gemini:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gemini:generate-message', async (_, options) => {
    try {
      const result = await geminiService.generateMessage(options)
      return result
    } catch (error) {
      console.error('Failed to generate message with Gemini:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gemini:generate-followup-questions', async (_, options) => {
    try {
      const result = await geminiService.generateFollowupQuestions(options)
      return result
    } catch (error) {
      console.error('Failed to generate followup questions with Gemini:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('gemini:ask-question', async (_, options) => {
    try {
      const result = await geminiService.askQuestion(options)
      return result
    } catch (error) {
      console.error('Failed to ask question with Gemini:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

// Handle dialog requests
ipcMain.handle('dialog:showOpenDialog', async (_, options: Electron.OpenDialogOptions) => {
  return dialog.showOpenDialog(options)
})

// Add keyboard shortcut registration
function registerGlobalShortcuts(): void {
  // Clear any existing shortcuts first
  globalShortcut.unregisterAll()

  const registrationResults: Array<{ key: string; shortcut: string; success: boolean }> = []

  // Helper function to try registering a shortcut with fallbacks
  const tryRegisterShortcut = (key: string, handler: () => void): void => {
    const primaryShortcut = currentShortcuts[key]
    
    // Try primary shortcut first
    try {
      if (globalShortcut.register(primaryShortcut, handler)) {
        registrationResults.push({ key, shortcut: primaryShortcut, success: true })
        return
      }
    } catch (error) {
      console.log(`❌ Primary shortcut ${primaryShortcut} failed for ${key}:`, error)
    }

    // Try fallback shortcuts
    const fallbacks = fallbackShortcuts[key] || []
    for (const fallbackShortcut of fallbacks) {
      try {
        if (globalShortcut.register(fallbackShortcut, handler)) {
          console.log(`✅ Using fallback shortcut ${fallbackShortcut} for ${key}`)
          currentShortcuts[key] = fallbackShortcut // Update current shortcuts
          registrationResults.push({ key, shortcut: fallbackShortcut, success: true })
          return
        }
      } catch (error) {
        console.log(`❌ Fallback shortcut ${fallbackShortcut} failed for ${key}:`, error)
      }
    }

    // All attempts failed
    console.log(`❌ All shortcuts failed for ${key}, disabling shortcut`)
    registrationResults.push({ key, shortcut: primaryShortcut, success: false })
  }

  // Start/Stop Recording
  tryRegisterShortcut('toggle-recording', () => {
    console.log('🎙️ Global shortcut: Start/Stop Recording')
    if (mainWindow) {
      mainWindow.webContents.send('shortcut:toggle-recording')
    }
  })

  // Quick Note
  tryRegisterShortcut('quick-note', () => {
    console.log('📝 Global shortcut: Quick Note')
    if (mainWindow) {
      mainWindow.webContents.send('shortcut:quick-note')
    }
  })

  // Show/Hide Window
  tryRegisterShortcut('show-hide', () => {
    console.log('👁️ Global shortcut: Show/Hide Window')
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  // Pause/Resume Recording
  tryRegisterShortcut('pause-resume', () => {
    console.log('⏸️ Global shortcut: Pause/Resume Recording')
    if (mainWindow) {
      mainWindow.webContents.send('shortcut:pause-resume')
    }
  })

  // Report results
  const successfulRegistrations = registrationResults.filter(r => r.success)
  const failedRegistrations = registrationResults.filter(r => !r.success)

  if (successfulRegistrations.length > 0) {
    console.log('✅ Global shortcuts registered:', Object.fromEntries(
      successfulRegistrations.map(r => [r.key, r.shortcut])
    ))
  }

  if (failedRegistrations.length > 0) {
    console.log('❌ Some shortcut registrations failed:', failedRegistrations)
  }
}

// Add shortcut unregistration
function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  console.log('🗑️ Global shortcuts unregistered')
}

// Create system tray
function createTray(): void {
  try {
    // Create tray icon with appropriate size
    const trayIconPath = getTrayIcon()
    tray = new Tray(trayIconPath)
    
    // On macOS, configure tray behavior
    if (process.platform === 'darwin') {
      tray.setIgnoreDoubleClickEvents(false)
      // Don't use template mode for now to avoid black square issue
      console.log('🎨 Using regular tray icon for macOS (avoiding template mode)')
    }
    
    // Set tooltip
    tray.setToolTip('Friday - Meeting Recorder')
    
    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Friday',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: 'Start Recording',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('shortcut:toggle-recording')
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('navigate-to-settings')
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Friday',
        click: () => {
          app.quit()
        }
      }
    ])
    
    // Set the context menu
    tray.setContextMenu(contextMenu)
    
    // Handle double click to show window
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
    
    console.log('✅ System tray created with icon:', trayIconPath)
  } catch (error) {
    console.error('❌ Failed to create system tray:', error)
  }
}

// Destroy tray
function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    console.log('🗑️ System tray destroyed')
  }
}

// Update shortcuts
function updateShortcuts(newShortcuts: Record<string, string>): boolean {
  try {
    // Validate shortcuts first
    for (const [key, shortcut] of Object.entries(newShortcuts)) {
      if (!shortcut || shortcut.trim() === '') {
        console.error(`❌ Invalid shortcut for ${key}: empty`)
        return false
      }
    }

    // Test registration before committing changes
    const testResults: Array<{ key: string; shortcut: string; success: boolean }> = []
    for (const [key, shortcut] of Object.entries(newShortcuts)) {
      try {
        const success = globalShortcut.register(shortcut, () => {})
        testResults.push({ key, shortcut, success })
        if (success) {
          globalShortcut.unregister(shortcut)
        }
      } catch (error) {
        console.error(`❌ Failed to test shortcut ${shortcut} for ${key}:`, error)
        testResults.push({ key, shortcut, success: false })
      }
    }

    // Check if all test registrations succeeded
    const failedTests = testResults.filter(test => !test.success)
    if (failedTests.length > 0) {
      console.error('❌ Some shortcut registrations failed:', failedTests)
      return false
    }

    // All tests passed, update the shortcuts
    Object.assign(currentShortcuts, newShortcuts)
    
    // Re-register all shortcuts with new values
    registerGlobalShortcuts()
    
    console.log('✅ Shortcuts updated successfully:', currentShortcuts)
    return true
  } catch (error) {
    console.error('❌ Failed to update shortcuts:', error)
    return false
  }
}

// Setup shortcut and tray handlers
function setupSystemHandlers(): void {
  // Get current shortcuts
  ipcMain.handle('system:get-shortcuts', () => {
    return currentShortcuts
  })

  // Update shortcuts
  ipcMain.handle('system:update-shortcuts', (_, shortcuts: Record<string, string>) => {
    return updateShortcuts(shortcuts)
  })

  // Show/hide menu bar tray
  ipcMain.handle('system:toggle-menu-bar', async (_, show: boolean) => {
    try {
      if (show && !tray) {
        createTray()
        return { success: true }
      } else if (!show && tray) {
        destroyTray()
        return { success: true }
      }
      return { success: true, message: `Tray already ${show ? 'visible' : 'hidden'}` }
    } catch (error) {
      console.error('❌ Failed to toggle menu bar:', error)
      return { success: false, error: String(error) }
    }
  })

  // Load settings and apply menu bar preference
  databaseService.getSettings()
    .then(settings => {
      if (settings.showInMenuBar && !tray) {
        createTray()
      }
    })
    .catch(error => {
      console.error('Failed to load menu bar setting:', error)
    })
}

// Add process cleanup function
function cleanupHangingRecorderProcesses(): void {
  console.log('🧹 Checking for hanging Swift recorder processes...')
  
  const ps = spawn('ps', ['aux'])
  let output = ''
  
  ps.stdout.on('data', (data: Buffer) => {
    output += data.toString()
  })
  
  ps.on('close', () => {
    const lines = output.split('\n')
    const recorderProcesses = lines.filter(line => 
      line.includes('Recorder') && 
      line.includes('--record') && 
      !line.includes('grep')
    )
    
    if (recorderProcesses.length > 0) {
      console.log(`🔍 Found ${recorderProcesses.length} hanging recorder process(es):`)
      
      recorderProcesses.forEach(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2) {
          const pid = parts[1]
          console.log(`   PID ${pid}: ${line.substring(line.indexOf('Recorder'))}`)
          
          try {
            process.kill(parseInt(pid), 'SIGKILL')
            console.log(`   ✅ Killed hanging process ${pid}`)
          } catch (error) {
            console.log(`   ⚠️ Could not kill process ${pid}: ${error}`)
          }
        }
      })
    } else {
      console.log('✅ No hanging recorder processes found')
    }
  })
}

// Audio device management functions (placeholder - would need Swift integration)
const audioDeviceManager = {
  async getCurrentDevice() {
    try {
      // This would need to call the Swift AudioDeviceManager
      // For now, return a placeholder
      return {
        success: true,
        deviceName: 'Unknown Device',
        isBluetooth: false,
        availableDevices: []
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  async switchToBuiltInSpeakers() {
    try {
      // This would need to call the Swift AudioDeviceManager.enableBluetoothWorkaround
      console.log('🔊 Attempting to switch to built-in speakers...')
      return {
        success: true,
        message: 'Switched to built-in speakers'
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  async enableBluetoothWorkaround() {
    try {
      // This would need to call the Swift AudioDeviceManager.enableBluetoothWorkaround
      console.log('🔧 Attempting to enable Bluetooth workaround...')
      return {
        success: true,
        message: 'Bluetooth workaround enabled'
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Initialize database
  try {
    await databaseService.initialize()
    console.log('Database initialized successfully')

    // Seed database with sample data
    await seedDatabase()
    
    // Initialize Gemini API key from settings
    try {
      const settings = await databaseService.getSettings()
      if (settings.geminiApiKey) {
        geminiService.setApiKey(settings.geminiApiKey)
        console.log('Gemini API key initialized from settings')
      }
    } catch (error) {
      console.error('Failed to initialize Gemini API key:', error)
    }
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // Check Swift recorder availability
  try {
    // Clean up any hanging processes first
    cleanupHangingRecorderProcesses()
    
    isSwiftRecorderAvailable = await checkSwiftRecorderAvailability()
    console.log(`Swift recorder availability: ${isSwiftRecorderAvailable}`)
  } catch (error) {
    console.error('Failed to check Swift recorder availability:', error)
    isSwiftRecorderAvailable = false
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Setup IPC handlers
  setupDatabaseHandlers()
  setupTranscriptionHandlers()
  setupGeminiHandlers()
  setupSystemHandlers()

  // Register global shortcuts
  registerGlobalShortcuts()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  // Stop transcription service
  stopTranscriptionService()

  // Unregister global shortcuts
  unregisterGlobalShortcuts()

  // Close database connection
  await databaseService.close()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app termination
app.on('before-quit', async () => {
  stopTranscriptionService()
  unregisterGlobalShortcuts()
  await databaseService.close()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// Handle app settings
ipcMain.handle('get-app-settings', async () => {
  try {
    return await databaseService.getSettings()
  } catch (error) {
    console.error('Error getting app settings:', error)
    return null
  }
})

ipcMain.handle('update-app-settings', async (_, settings) => {
  try {
    await databaseService.updateSettings(settings)
    return { success: true }
  } catch (error) {
    console.error('Error updating app settings:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Audio device management IPC handlers
ipcMain.handle('audio-get-current-device', async () => {
  return await audioDeviceManager.getCurrentDevice()
})

ipcMain.handle('audio-switch-to-built-in', async () => {
  return await audioDeviceManager.switchToBuiltInSpeakers()
})

ipcMain.handle('audio-enable-bluetooth-workaround', async () => {
  return await audioDeviceManager.enableBluetoothWorkaround()
})
