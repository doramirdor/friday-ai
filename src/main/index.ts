import { app, shell, BrowserWindow, ipcMain } from 'electron'
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

let mainWindow: BrowserWindow | null = null
let transcriptionProcess: ChildProcess | null = null
let transcriptionSocket: net.Socket | null = null
let isTranscriptionReady = false
let actualTranscriptionPort = 9001 // Will be updated based on Python server output

// Swift recorder process management
let swiftRecorderProcess: ChildProcess | null = null
let isSwiftRecorderAvailable = false

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
): Promise<{ success: boolean; path?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!isSwiftRecorderAvailable) {
      resolve({ success: false, error: 'Swift recorder not available' })
      return
    }

    // Resolve home directory if path starts with ~
    const resolvedPath = recordingPath.startsWith('~/') 
      ? path.join(os.homedir(), recordingPath.slice(2))
      : recordingPath

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
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let hasStarted = false

    swiftRecorderProcess.stdout?.on('data', (data) => {
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
            resolve({ success: true, path: result.path })

            // Notify renderer about recording start
            if (mainWindow) {
              mainWindow.webContents.send('combined-recording-started', result)
            }
          } else if (result.code === 'RECORDING_STOPPED') {
            // Notify renderer about recording completion
            if (mainWindow) {
              mainWindow.webContents.send('combined-recording-stopped', result)
            }
          } else if (result.code === 'RECORDING_ERROR' && !hasStarted) {
            resolve({ success: false, error: result.error })
          }
        } catch {
          // Non-JSON output, just log it
          console.log('Swift recorder log:', line)
        }
      }
    })

    swiftRecorderProcess.stderr?.on('data', (data) => {
      console.log('Swift recorder stderr:', data.toString())
    })

    swiftRecorderProcess.on('close', (code) => {
      console.log(`Swift recorder process exited with code ${code}`)
      swiftRecorderProcess = null

      if (!hasStarted) {
        resolve({ success: false, error: `Recorder exited with code ${code}` })
      }
    })

    swiftRecorderProcess.on('error', (error) => {
      console.error('Swift recorder error:', error)
      if (!hasStarted) {
        resolve({ success: false, error: error.message })
      }
    })

    // Timeout after 10 seconds if recording doesn't start
    setTimeout(() => {
      if (!hasStarted) {
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill('SIGTERM')
          swiftRecorderProcess = null
        }
        resolve({ success: false, error: 'Recording start timeout' })
      }
    }, 10000)
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
            console.log('✅ Transcription service ready')
            resolve()
          })
          .catch(reject)
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
    transcriptionSocket.setTimeout(30000) // 30 second timeout

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
      reject(error)
    })

    transcriptionSocket.on('timeout', () => {
      console.log('Socket timeout - closing connection')
      transcriptionSocket?.destroy()
    })

    transcriptionSocket.on('close', () => {
      console.log('📞 Socket connection closed - keeping service ready for reconnection')
      transcriptionSocket = null
      // Don't set isTranscriptionReady to false here to allow reconnection
      
      // Attempt to reconnect after a longer delay if the process is still running
      if (transcriptionProcess && !transcriptionProcess.killed) {
        console.log('🔄 Attempting to reconnect to transcription service in 5 seconds...')
        setTimeout(() => {
          if (transcriptionProcess && !transcriptionProcess.killed && !transcriptionSocket) {
            connectToTranscriptionSocket()
              .then(() => {
                console.log('✅ Reconnected to transcription service')
              })
              .catch((error) => {
                console.error('Failed to reconnect to transcription service:', error)
                isTranscriptionReady = false
              })
          }
        }, 5000) // Increased delay to reduce connection churn
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
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(os.homedir(), 'Friday Recordings')
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
}

// Setup transcription IPC handlers
function setupTranscriptionHandlers(): void {
  ipcMain.handle('transcription:start-service', async () => {
    try {
      if (!isTranscriptionReady) {
        console.log('🎤 Starting transcription service (not ready)...')
        await startTranscriptionService()
      } else {
        console.log('✅ Transcription service already ready, skipping start')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to start transcription service:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('transcription:stop-service', () => {
    stopTranscriptionService()
    return { success: true }
  })

  ipcMain.handle('transcription:is-ready', () => {
    return { ready: isTranscriptionReady }
  })

  ipcMain.handle('transcription:process-chunk', async (_, audioBuffer: ArrayBuffer) => {
    if (!transcriptionSocket || !isTranscriptionReady) {
      return { success: false, error: 'Transcription service not ready' }
    }

    try {
      const buffer = Buffer.from(audioBuffer)
      const filePath = saveAudioChunk(buffer)

      // Send the file path via socket
      transcriptionSocket.write(filePath + '\n')

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

  ipcMain.handle('transcription:load-recording', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Recording file not found' }
      }

      const buffer = fs.readFileSync(filePath)
      return {
        success: true,
        buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }
    } catch (error) {
      console.error('Failed to load recording file:', error)
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
    return await databaseService.updateSettings(settings)
  })
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
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // Check Swift recorder availability
  try {
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

  // Close database connection
  await databaseService.close()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app termination
app.on('before-quit', async () => {
  stopTranscriptionService()
  await databaseService.close()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
