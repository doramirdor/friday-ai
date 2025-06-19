import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, systemPreferences } from 'electron'
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
import * as child_process from 'child_process'

// Import services
import { geminiService } from './gemini'

let mainWindow: BrowserWindow | null = null
// let tray: Tray | null = null
let transcriptionProcess: ChildProcess | null = null
let transcriptionSocket: net.Socket | null = null
let isTranscriptionReady = false
let isTranscriptionStarting = false
let actualTranscriptionPort = 9001 // Will be updated based on Python server output

// Swift recorder process management
let swiftRecorderProcess: ChildProcess | null = null
let isSwiftRecorderAvailable = false
let currentRecordingPath: string | null = null
let currentRecordingFilename: string | null = null
let isStoppingRecording = false

// Current shortcuts state
let currentShortcuts: Record<string, string> = {
  'toggleRecording': 'CmdOrCtrl+Alt+R',
  'quickNote': 'CmdOrCtrl+Alt+N',
  'showHide': 'CmdOrCtrl+Shift+H',
  'pauseResume': 'CmdOrCtrl+Alt+P'
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

// Add process monitoring variables


// Add this function to request microphone permissions
async function requestMicrophonePermission(): Promise<boolean> {
  try {
    // Check if we already have permission
    const hasPermission = systemPreferences.getMediaAccessStatus('microphone')
    console.log('🎤 Current microphone permission status:', hasPermission)
    
    if (hasPermission === 'granted') {
      console.log('✅ Microphone permission already granted')
      return true
    }
    
    if (hasPermission === 'denied') {
      console.log('❌ Microphone permission denied - please enable in System Preferences')
      return false
    }
    
    // Request permission if not determined
    if (hasPermission === 'not-determined') {
      console.log('🔐 Requesting microphone permission...')
      const granted = await systemPreferences.askForMediaAccess('microphone')
      console.log(granted ? '✅ Permission granted!' : '❌ Permission denied')
      return granted
    }
    
    return false
  } catch (error) {
    console.error('❌ Error requesting microphone permission:', error)
    return false
  }
}

// Add this function to request screen capture permissions
async function requestScreenCapturePermission(): Promise<boolean> {
  try {
    // Check if we already have permission
    const hasPermission = systemPreferences.getMediaAccessStatus('screen')
    console.log('🖥️ Current screen capture permission status:', hasPermission)
    
    if (hasPermission === 'granted') {
      console.log('✅ Screen capture permission already granted')
      return true
    }
    
    if (hasPermission === 'denied') {
      console.log('❌ Screen capture permission denied - please enable in System Preferences')
      return false
    }
    
    // Request permission if not determined
    if (hasPermission === 'not-determined') {
      console.log('🔐 Requesting screen capture permission...')
      // On macOS, we need to show a dialog explaining why we need screen capture
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Screen Recording Permission Required',
        message: 'Friday needs screen recording permission to capture system audio.',
        detail: 'You will be prompted to grant screen recording permission. Please enable it in System Preferences.',
        buttons: ['Continue'],
        defaultId: 0
      })
      
      // Open System Preferences to Screen Recording privacy settings
      // Note: openSystemPreferences is deprecated, but there's no direct replacement yet
      // @ts-ignore - systemPreferences.openSystemPreferences is not in the type definitions
      systemPreferences.openSystemPreferences('security', 'Privacy_ScreenCapture')
      
      // Wait for user to grant permission
      return new Promise<boolean>((resolve) => {
        const checkPermission = (): void => {
          const currentStatus = systemPreferences.getMediaAccessStatus('screen')
          if (currentStatus === 'granted') {
            console.log('✅ Screen capture permission granted!')
            resolve(true)
          } else if (currentStatus === 'denied') {
            console.log('❌ Screen capture permission denied')
            resolve(false)
          } else {
            setTimeout(checkPermission, 1000) // Check again in 1 second
          }
        }
        checkPermission()
      })
    }
    
    return false
  } catch (error) {
    console.error('❌ Error requesting screen capture permission:', error)
    return false
  }
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 1000,
    minHeight: 800,
    maxWidth: 1000,
    maxHeight: 800,
    resizable: false,
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

  // Allow fullscreen toggle with F11 or Cmd+Ctrl+F
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' || (input.key === 'f' && input.control && input.meta)) {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
    }
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

// Function to get appropriate tray icon based on platform - currently unused
/*
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
*/

// Check if Swift recorder is available - Used by app initialization
async function checkSwiftRecorderAvailability(): Promise<boolean> {
  return new Promise((resolve) => {
    const recorderPath = path.join(process.cwd(), 'Recorder')

    if (!fs.existsSync(recorderPath)) {
      console.log('❌ Swift recorder binary not found at:', recorderPath)
      resolve(false)
      return
    }

    console.log('✅ Swift recorder binary found at:', recorderPath)
    resolve(true)
  })
}

// Helper function to verify and create recording directory
function ensureRecordingDirectory(dirPath: string): { success: boolean; path?: string; error?: string } {
  try {
    // Resolve home directory if path starts with ~
    const resolvedPath = dirPath.startsWith('~/') 
      ? path.join(os.homedir(), dirPath.slice(2))
      : dirPath

    console.log('📂 Ensuring recording directory exists:', resolvedPath)
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true })
      console.log('✅ Created recording directory:', resolvedPath)
    }
    
    // Test write permissions
    const testFile = path.join(resolvedPath, '.test-write-permissions')
    try {
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      console.log('✅ Recording directory has write permissions')
    } catch (permError) {
      console.error('❌ No write permissions for recording directory:', permError)
      return { success: false, error: 'No write permissions for recording directory' }
    }
    
    return { success: true, path: resolvedPath }
  } catch (error) {
    console.error('❌ Failed to ensure recording directory:', error)
    return { success: false, error: `Failed to create recording directory: ${error}` }
  }
}

// Audio device management
const audioDeviceManager = {
  async getCurrentDevice() {
    try {
      console.log('🔊 Getting current audio device...')
      
      // Use the Swift script to check current device
      const result = await new Promise<{ success: boolean; deviceName?: string; isBluetooth?: boolean; error?: string }>((resolve) => {
        const { spawn } = require('child_process')
        const swift = spawn('swift', [path.join(process.cwd(), 'fix-bluetooth-audio.swift')])
        
        let output = ''
        swift.stdout.on('data', (data: Buffer) => {
          output += data.toString()
        })
        
        swift.on('close', (code) => {
          if (code === 0) {
            // Parse the output to extract device info
            const lines = output.split('\n')
            const deviceLine = lines.find(line => line.includes('Current audio device:'))
            const bluetoothLine = lines.find(line => line.includes('Is Bluetooth:'))
            
            if (deviceLine && bluetoothLine) {
              const deviceName = deviceLine.split("'")[1] || 'Unknown'
              const isBluetooth = bluetoothLine.includes('true')
              
              resolve({
                success: true,
                deviceName,
                isBluetooth
              })
            } else {
              resolve({
                success: false,
                error: 'Could not parse device information'
              })
            }
          } else {
            resolve({
              success: false,
              error: 'Audio device check failed'
            })
          }
        })
      })
      
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  async switchToBuiltInSpeakers() {
    try {
      console.log('🔊 Switching to built-in speakers for recording...')
      
      // Note: The actual switching happens in the Swift recorder
      // This is just a notification to the frontend
      return {
        success: true,
        message: 'Audio will be temporarily switched during recording and automatically restored after'
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
      console.log('🔧 Running Bluetooth audio restoration...')
      
      // Run the restoration script
      const { spawn } = require('child_process')
      const result = await new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
        const swift = spawn('swift', [path.join(process.cwd(), 'fix-bluetooth-audio.swift')])
        
        let output = ''
        swift.stdout.on('data', (data: Buffer) => {
          output += data.toString()
        })
        
        swift.on('close', (code) => {
          if (code === 0) {
            if (output.includes('Successfully switched audio to:')) {
              resolve({
                success: true,
                message: 'Bluetooth audio restored successfully'
              })
            } else if (output.includes('already using a Bluetooth device')) {
              resolve({
                success: true,
                message: 'Audio is already configured correctly'
              })
            } else {
              resolve({
                success: false,
                error: 'Could not restore Bluetooth audio'
              })
            }
          } else {
            resolve({
              success: false,
              error: 'Audio restoration failed'
            })
          }
        })
      })
      
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  async prepareForRecording() {
    try {
      console.log('🎙️ Preparing audio devices for recording...')
      
      // Store current audio device state
      const currentDevices = {
        input: await this.getCurrentInputDevice(),
        output: await this.getCurrentOutputDevice()
      }
      
      // Check for Bluetooth devices
      const hasBluetoothDevice = await this.hasConnectedBluetoothDevice()
      
      if (hasBluetoothDevice) {
        console.log('🎧 Bluetooth audio device detected')
        // Future: Could add logic to switch to built-in devices if needed
      }
      
      // Ensure audio routing is set up correctly
      await this.validateAudioRouting()
      
      return {
        success: true,
        previousDevices: currentDevices,
        message: 'Audio devices prepared for recording'
      }
    } catch (error) {
      console.error('❌ Failed to prepare audio devices:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  async validateAudioRouting() {
    try {
      // Check if audio routing is working correctly
      const inputDevice = await this.getCurrentInputDevice()
      if (!inputDevice) {
        throw new Error('No audio input device found')
      }

      // Validate sample rate and format compatibility
      const deviceInfo = await this.getDeviceInfo()
      if (deviceInfo.sampleRate !== 44100) {
        console.warn(`⚠️ Input device sample rate (${deviceInfo.sampleRate}Hz) differs from recording rate (44100Hz)`)
      }

      return true
    } catch (error) {
      console.error('❌ Audio routing validation failed:', error)
      throw error
    }
  },

  async hasConnectedBluetoothDevice(): Promise<boolean> {
    try {
      const devices = await this.getAudioDevices()
      return devices.some(device => 
        device.name.toLowerCase().includes('bluetooth') ||
        device.name.toLowerCase().includes('airpods') ||
        device.name.toLowerCase().includes('headphones') ||
        device.name.toLowerCase().includes('headset')
      )
    } catch (error) {
      console.error('❌ Failed to check for Bluetooth devices:', error)
      return false
    }
  },

  async getCurrentInputDevice() {
    const device = await this.getCurrentDevice()
    return device.success ? device.deviceName : null
  },

  async getCurrentOutputDevice() {
    // For now, we only track input devices
    return null
  },

  async getDeviceInfo() {
    // Default to standard recording settings if we can't get actual device info
    return {
      sampleRate: 44100,
      channels: 2,
      format: 'PCM'
    }
  },

  async getAudioDevices() {
    try {
      const result = await this.getCurrentDevice()
      return result.success && result.deviceName ? [{ name: result.deviceName }] : []
    } catch (error) {
      console.error('Failed to get audio devices:', error)
      return []
    }
  },

  async switchToBuiltInDevices() {
    return this.switchToBuiltInSpeakers()
  }
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
  try {
    // Prepare audio devices before starting recording
    const devicePrep = await audioDeviceManager.prepareForRecording()
    if (!devicePrep.success) {
      return {
        success: false,
        error: 'Failed to prepare audio devices',
        cause: devicePrep.error,
        solution: 'Try disconnecting and reconnecting your audio devices, or restart the application'
      }
    }

    // Check screen capture permission first
    const hasScreenPermission = await requestScreenCapturePermission()
    if (!hasScreenPermission) {
      return {
        success: false,
        error: 'Screen recording permission required for system audio capture',
        solution: 'Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording'
      }
    }

    return new Promise((resolve) => {
      // Get settings to use default save location if none provided
      databaseService.getSettings()
        .then(settings => {
          // Use provided path or default from settings
          const finalPath = recordingPath || settings.defaultSaveLocation || path.join(os.homedir(), 'Friday Recordings')
          
          // Ensure the recording directory exists and has proper permissions
          const dirResult = ensureRecordingDirectory(finalPath)
          if (!dirResult.success) {
            resolve({ 
              success: false, 
              error: dirResult.error || 'Failed to create recording directory'
            })
            return
          }
          
          const resolvedPath = dirResult.path!

          // Use the Swift recorder binary
          const recorderPath = path.join(process.cwd(), 'Recorder')
          
          // Store recording info for later use in stop function
          currentRecordingPath = resolvedPath
          
          let baseFilename: string
          if (filename) {
            baseFilename = filename.replace(/\.(wav|mp3|flac)$/, '') // Remove extension if provided
            currentRecordingFilename = `${baseFilename}.flac` // Use FLAC format
          } else {
            // Generate default filename if none provided
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            baseFilename = `combined-${timestamp}`
            currentRecordingFilename = `${baseFilename}.flac`
          }

          const outputPath = path.join(currentRecordingPath, currentRecordingFilename)

          console.log('📁 Recording will be saved to:', outputPath)
          console.log('🎯 Current recording path:', currentRecordingPath)
          console.log('📄 Current recording filename:', currentRecordingFilename)

          console.log('🎙️ Starting ScreenCaptureKit recording...')
          
          // Swift recorder arguments for ScreenCaptureKit recording
          const args = [
            '--record', resolvedPath,
            '--filename', baseFilename,
            '--live-transcription'  // Enable live transcription chunks
          ]

          console.log('Command:', recorderPath, args.join(' '))

          swiftRecorderProcess = spawn(recorderPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
          })

          let hasStarted = false
          let outputReceived = false
          let lastOutputTime = Date.now()

          // Set up output monitoring
          const outputTimeoutId = setTimeout(() => {
            if (!outputReceived) {
              console.log('❌ No output received from Swift recorder within 10 seconds')
              if (swiftRecorderProcess) {
                swiftRecorderProcess.kill('SIGTERM')
                swiftRecorderProcess = null
              }
              resolve({
                success: false,
                error: 'Swift recorder failed to start - no output received',
                cause: 'The recorder process may have crashed or failed to initialize',
                solution: 'Check that screen recording permissions are granted and try restarting the app'
              })
            }
          }, 10000)

          // Monitor for hanging process
          const hangDetectionInterval = setInterval(() => {
            const timeSinceLastOutput = Date.now() - lastOutputTime
            if (timeSinceLastOutput > 15000 && !hasStarted) { // 15 seconds without output
              console.log('❌ Swift recorder appears to be hanging')
              clearInterval(hangDetectionInterval)
              clearTimeout(outputTimeoutId)
              
              if (swiftRecorderProcess) {
                console.log('🛑 Terminating hanging Swift recorder process')
                swiftRecorderProcess.kill('SIGKILL')
                swiftRecorderProcess = null
              }
              
              if (!hasStarted) {
                resolve({
                  success: false,
                  error: 'Recording process hung during initialization',
                  cause: 'The Swift recorder process stopped responding',
                  solution: 'This may indicate permission issues or system conflicts. Try restarting the app.'
                })
              }
            }
          }, 5000)

          swiftRecorderProcess.stdout?.on('data', (data: Buffer) => {
            outputReceived = true
            lastOutputTime = Date.now()
            const output = data.toString().trim()
            console.log('📤 Swift recorder output:', output)

            try {
              const response = JSON.parse(output)
              
              if (response.code === 'RECORDING_STARTED') {
                hasStarted = true
                clearTimeout(outputTimeoutId)
                clearInterval(hangDetectionInterval)
                
                console.log('✅ ScreenCaptureKit recording started successfully')
                console.log('📝 Output file:', response.path)
                
                // Store the actual recording path
                currentRecordingPath = path.dirname(response.path)
                currentRecordingFilename = path.basename(response.path)
                
                resolve({
                  success: true,
                  path: response.path,
                  warning: 'Recording in FLAC format - will be converted to MP3 when stopped'
                })
              } else if (response.code === 'TRANSCRIPTION_CHUNK') {
                // Handle live transcription chunks from system audio
                console.log('🎵 Received system audio transcription chunk:', {
                  path: response.path,
                  stream_type: response.stream_type,
                  socket_available: !!(transcriptionSocket && !transcriptionSocket.destroyed)
                })
                
                if (transcriptionSocket && !transcriptionSocket.destroyed) {
                  // Send the chunk to transcription service with stream type
                  const request = {
                    type: 'dual_stream_chunk',
                    audio_path: response.path,
                    stream_type: response.stream_type || 'system'
                  }
                  
                  console.log('📤 Sending system audio chunk request:', request)
                  
                  try {
                    transcriptionSocket.write(JSON.stringify(request) + '\n')
                    console.log('✅ Successfully sent system audio chunk for transcription')
                  } catch (error) {
                    console.error('❌ Failed to send system audio chunk:', error)
                  }
                } else {
                  console.warn('⚠️ Transcription socket not available for system audio chunk:', {
                    socket_exists: !!transcriptionSocket,
                    socket_destroyed: transcriptionSocket?.destroyed
                  })
                }
              } else if (response.code === 'DEBUG') {
                // Handle debug messages from Swift recorder
                console.log('🔍 Swift recorder debug:', response.message)
              } else if (response.code === 'PERMISSION_DENIED') {
                clearTimeout(outputTimeoutId)
                clearInterval(hangDetectionInterval)
                resolve({
                  success: false,
                  error: 'Screen recording permission denied',
                  solution: 'Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording'
                })
              } else if (response.code === 'NO_DISPLAY_FOUND') {
                clearTimeout(outputTimeoutId)
                clearInterval(hangDetectionInterval)
                resolve({
                  success: false,
                  error: 'No display found for recording',
                  solution: 'Ensure your display is connected and try again'
                })
              } else if (response.code === 'CAPTURE_FAILED') {
                clearTimeout(outputTimeoutId)
                clearInterval(hangDetectionInterval)
                resolve({
                  success: false,
                  error: 'Failed to start screen capture',
                  solution: 'Check screen recording permissions and try again'
                })
              }
            } catch {
              console.log('📝 Non-JSON output from Swift recorder:', output)
            }
          })

          swiftRecorderProcess.stderr?.on('data', (data: Buffer) => {
            outputReceived = true
            lastOutputTime = Date.now()
            const error = data.toString().trim()
            console.error('❌ Swift recorder error:', error)
          })

          swiftRecorderProcess.on('close', (code) => {
            clearTimeout(outputTimeoutId)
            clearInterval(hangDetectionInterval)
            console.log(`🔚 Swift recorder process exited with code: ${code}`)
            
            if (!hasStarted) {
              resolve({
                success: false,
                error: `Swift recorder exited with code ${code}`,
                solution: 'Check the console for error details and ensure all permissions are granted'
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

          // Timeout for overall process
          setTimeout(() => {
            if (!hasStarted) {
              clearInterval(hangDetectionInterval)
              if (swiftRecorderProcess) {
                console.log('❌ TIMEOUT: Force terminating Swift recorder after 30 seconds')
                swiftRecorderProcess.kill('SIGKILL')
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
        .catch((error) => {
          console.error('Failed to get settings:', error)
          resolve({ success: false, error: 'Failed to get settings' })
        })
    })
  } catch (error) {
    console.error('❌ Failed to start recording:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      solution: 'Please check your audio device connections and permissions'
    }
  }
}

// Stop combined recording
async function stopCombinedRecording(): Promise<{
  success: boolean
  path?: string
  error?: string
  warning?: string
  transcript?: string
}> {
  return new Promise((resolve) => {
    if (!swiftRecorderProcess) {
      resolve({ success: false, error: 'No recording in progress' })
      return
    }

    if (isStoppingRecording) {
      resolve({ success: false, error: 'Recording is already being stopped' })
      return
    }

    isStoppingRecording = true
    console.log('🛑 Stopping ScreenCaptureKit recording...')

    let hasResponded = false
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        console.log('❌ Timeout waiting for recording to stop, force killing process')
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill('SIGKILL')
          swiftRecorderProcess = null
        }
        isStoppingRecording = false
        resolve({ 
          success: false, 
          error: 'Timeout stopping recording',
          warning: 'Recording may have been saved but conversion failed'
        })
      }
    }, 15000)

    // Listen for the stop response
    const handleStopOutput = (data: Buffer): void => {
      const output = data.toString().trim()
      console.log('📤 Stop output:', output)

      try {
        const response = JSON.parse(output)
        if (response.code === 'RECORDING_STOPPED') {
          hasResponded = true
          clearTimeout(timeout)
          
          console.log('✅ ScreenCaptureKit recording stopped')
          
          // The recording is in FLAC format, convert to MP3
          const flacPath = response.path || (currentRecordingPath && currentRecordingFilename ? 
            path.join(currentRecordingPath, currentRecordingFilename) : null)
          
          if (flacPath && fs.existsSync(flacPath)) {
            console.log('🔄 Converting FLAC to MP3...')
            convertFlacToMp3(flacPath)
              .then(async (mp3Path) => {
                console.log('✅ Conversion completed:', mp3Path)
                
                // Clean up FLAC file
                try {
                  fs.unlinkSync(flacPath)
                  console.log('🗑️ Cleaned up FLAC file')
                } catch (cleanupError) {
                  console.warn('⚠️ Failed to clean up FLAC file:', cleanupError)
                }
                
                // Send to transcription
                console.log('📝 Starting transcription of recording...')
                const transcriptionResult = await transcribeRecording(mp3Path)
                
                swiftRecorderProcess = null
                isStoppingRecording = false
                
                if (transcriptionResult.success) {
                  resolve({ 
                    success: true, 
                    path: mp3Path,
                    warning: 'Recording converted from FLAC to MP3',
                    transcript: transcriptionResult.transcript
                  })
                } else {
                  resolve({ 
                    success: true, 
                    path: mp3Path,
                    warning: `Recording converted from FLAC to MP3. Transcription failed: ${transcriptionResult.error}`
                  })
                }
              })
              .catch((conversionError) => {
                console.error('❌ FLAC to MP3 conversion failed:', conversionError)
                swiftRecorderProcess = null
                isStoppingRecording = false
                resolve({ 
                  success: true, 
                  path: flacPath,
                  warning: 'Recording saved as FLAC (MP3 conversion failed)'
                })
              })
          } else {
            console.warn('⚠️ Recording file not found:', flacPath)
            swiftRecorderProcess = null
            isStoppingRecording = false
            resolve({ 
              success: false, 
              error: 'Recording file not found after stopping'
            })
          }
        }
      } catch {
        console.log('📝 Non-JSON stop output:', output)
      }
    }

    // Set up listeners for stop response
    swiftRecorderProcess.stdout?.on('data', handleStopOutput)
    swiftRecorderProcess.stderr?.on('data', handleStopOutput)

    // Send SIGINT to stop recording
    swiftRecorderProcess.kill('SIGINT')

    swiftRecorderProcess.on('close', (code) => {
      console.log(`🔚 Swift recorder stopped with code: ${code}`)
      if (!hasResponded) {
        hasResponded = true
        clearTimeout(timeout)
        
        // Try to find the recording file even if we didn't get a proper response
        const possibleFlacPath = currentRecordingPath && currentRecordingFilename ? 
          path.join(currentRecordingPath, currentRecordingFilename) : null
        
        if (possibleFlacPath && fs.existsSync(possibleFlacPath)) {
          console.log('🔄 Converting FLAC to MP3 (fallback)...')
          convertFlacToMp3(possibleFlacPath)
            .then(async (mp3Path) => {
              console.log('✅ Fallback conversion completed:', mp3Path)
              
              // Clean up FLAC file
              try {
                fs.unlinkSync(possibleFlacPath)
                console.log('🗑️ Cleaned up FLAC file')
              } catch (cleanupError) {
                console.warn('⚠️ Failed to clean up FLAC file:', cleanupError)
              }
              
              // Send to transcription
              console.log('📝 Starting transcription of recording (fallback)...')
              const transcriptionResult = await transcribeRecording(mp3Path)
              
              swiftRecorderProcess = null
              isStoppingRecording = false
              
              if (transcriptionResult.success) {
                resolve({ 
                  success: true, 
                  path: mp3Path,
                  warning: 'Recording converted from FLAC to MP3 (fallback)',
                  transcript: transcriptionResult.transcript
                })
              } else {
                resolve({ 
                  success: true, 
                  path: mp3Path,
                  warning: `Recording converted from FLAC to MP3 (fallback). Transcription failed: ${transcriptionResult.error}`
                })
              }
            })
            .catch((conversionError) => {
              console.error('❌ Fallback FLAC to MP3 conversion failed:', conversionError)
              swiftRecorderProcess = null
              isStoppingRecording = false
              resolve({ 
                success: true, 
                path: possibleFlacPath,
                warning: 'Recording saved as FLAC (MP3 conversion failed)'
              })
            })
        } else {
          swiftRecorderProcess = null
          isStoppingRecording = false
          resolve({ 
            success: false, 
            error: 'Recording stopped but file not found'
          })
        }
      }
    })
  })
}

// Helper function to convert FLAC to MP3
async function convertFlacToMp3(flacPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mp3Path = flacPath.replace('.flac', '.mp3')
    
    console.log(`🔄 Converting: ${flacPath} -> ${mp3Path}`)
    
    const ffmpeg = child_process.spawn('ffmpeg', [
      '-i', flacPath,
      '-codec:a', 'libmp3lame',
      '-b:a', '192k',
      '-y', // Overwrite output file
      mp3Path
    ], { stdio: 'pipe' })

    let errorOutput = ''
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(mp3Path)) {
        const stats = fs.statSync(mp3Path)
        if (stats.size > 1000) { // Check if file has reasonable size
          console.log(`✅ FLAC to MP3 conversion successful: ${stats.size} bytes`)
          resolve(mp3Path)
        } else {
          console.error('❌ MP3 file too small, conversion may have failed')
          reject(new Error('MP3 file too small'))
        }
      } else {
        console.error(`❌ FFmpeg conversion failed with code: ${code}`)
        console.error('FFmpeg error output:', errorOutput)
        reject(new Error(`FFmpeg conversion failed: ${code}`))
      }
    })

    ffmpeg.on('error', (error) => {
      console.error('❌ FFmpeg process error:', error)
      reject(error)
    })
  })
}

// Helper function to send recording to transcription
async function transcribeRecording(audioPath: string): Promise<{
  success: boolean
  transcript?: string
  error?: string
}> {
  try {
    console.log('📝 Sending recording to transcription service...')
    
    // Check if transcription service is ready
    if (!isTranscriptionReady) {
      console.log('⚠️ Transcription service not ready, skipping transcription')
      return {
        success: false,
        error: 'Transcription service not ready'
      }
    }

    // Read the audio file
    if (!fs.existsSync(audioPath)) {
      console.error('❌ Audio file not found:', audioPath)
      return {
        success: false,
        error: 'Audio file not found'
      }
    }

    const audioBuffer = fs.readFileSync(audioPath)
    console.log(`📁 Read audio file: ${audioBuffer.length} bytes`)

    // Send to transcription service via socket (using existing protocol)
    return new Promise((resolve) => {
      if (!transcriptionSocket) {
        resolve({
          success: false,
          error: 'Transcription socket not connected'
        })
        return
      }

      // Set up response handler for transcription result
      const handleTranscriptionData = (data: Buffer): void => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim())
          for (const line of lines) {
            const result = JSON.parse(line)
            
            if (result.type === 'transcript') {
              console.log('✅ Recording transcription completed')
              console.log('📝 Transcript:', result.text)
              
              // Remove the listener
              transcriptionSocket?.off('data', handleTranscriptionData)
              clearTimeout(timeout)
              
              resolve({
                success: true,
                transcript: result.text
              })
              return
            } else if (result.type === 'error') {
              console.error('❌ Transcription error:', result.message)
              
              // Remove the listener
              transcriptionSocket?.off('data', handleTranscriptionData)
              clearTimeout(timeout)
              
              resolve({
                success: false,
                error: result.message
              })
              return
            }
          }
        } catch (error) {
          console.error('❌ Error parsing transcription response:', error)
          // Don't resolve here, wait for timeout or valid response
        }
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        console.log('⏰ Transcription timeout')
        transcriptionSocket?.off('data', handleTranscriptionData)
        resolve({
          success: false,
          error: 'Transcription timeout'
        })
      }, 60000) // 60 second timeout

      // Add response handler
      transcriptionSocket.on('data', handleTranscriptionData)

      // Send the audio file path for transcription (existing protocol)
      try {
        transcriptionSocket.write(audioPath + '\n')
        console.log(`📤 Sent recording path for transcription: ${audioPath}`)
        
      } catch (error) {
        clearTimeout(timeout)
        transcriptionSocket?.off('data', handleTranscriptionData)
        console.error('❌ Error sending audio path for transcription:', error)
        resolve({
          success: false,
          error: 'Failed to send audio path for transcription'
        })
      }
    })

  } catch (error) {
    console.error('❌ Error in transcribeRecording:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
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
function saveAudioChunk(audioBuffer: Buffer, streamType: string = 'microphone'): string {
  const tempDir = os.tmpdir()
  const fileName = `audio_chunk_${streamType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webm`
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

  // New handler for dual stream processing with stream type identification
  ipcMain.handle('transcription:process-dual-stream-chunk', async (_, audioBuffer: ArrayBuffer, streamType: 'microphone' | 'system') => {
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
      const filePath = saveAudioChunk(buffer, streamType)

      // Send dual stream request via socket
      const request = {
        type: 'dual_stream_chunk',
        audio_path: filePath,
        stream_type: streamType
      }
      
      transcriptionSocket!.write(JSON.stringify(request) + '\n')

      return { success: true }
    } catch (error) {
      console.error(`Failed to process ${streamType} audio chunk:`, error)
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
      console.log(`Failed to register shortcut ${primaryShortcut}:`, error)
    }
    
    // Mark as failed
    registrationResults.push({ key, shortcut: primaryShortcut, success: false })
  }

  // Register shortcuts with handlers
  tryRegisterShortcut('toggleRecording', () => {
    if (mainWindow) {
      mainWindow.webContents.send('global-shortcut', 'toggleRecording')
    }
  })

  tryRegisterShortcut('quickNote', () => {
    if (mainWindow) {
      mainWindow.webContents.send('global-shortcut', 'quickNote')
    }
  })

  tryRegisterShortcut('pauseResume', () => {
    if (mainWindow) {
      mainWindow.webContents.send('global-shortcut', 'pauseResume')
    }
  })

  // Log registration results
  const successCount = registrationResults.filter(r => r.success).length
  const totalCount = registrationResults.length
  console.log(`📌 Global shortcuts registered: ${successCount}/${totalCount}`)
  
  if (successCount < totalCount) {
    console.log('⚠️ Some shortcuts failed to register:')
    registrationResults.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.key}: ${r.shortcut}`)
    })
  }
}

function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  console.log('🗑️ Global shortcuts unregistered')
}

// Tray functionality - currently not used but available for future implementation
// function createTray(): void {
//   tray = new Tray(getTrayIcon())
//   
//   const contextMenu = Menu.buildFromTemplate([
//     {
//       label: 'Show Friday',
//       click: () => {
//         if (mainWindow) {
//           if (mainWindow.isMinimized()) mainWindow.restore()
//           mainWindow.show()
//           mainWindow.focus()
//         }
//       }
//     },
//     {
//       label: 'Hide Friday',
//       click: () => {
//         if (mainWindow) {
//           mainWindow.hide()
//         }
//       }
//     },
//     { type: 'separator' },
//     {
//       label: 'Quit',
//       click: () => {
//         app.quit()
//       }
//     }
//   ])
//   
//   tray.setContextMenu(contextMenu)
//   tray.setToolTip('Friday - AI Meeting Assistant')
//   
//   // Handle tray click
//   tray.on('click', () => {
//     if (mainWindow) {
//       if (mainWindow.isVisible()) {
//         mainWindow.hide()
//       } else {
//         if (mainWindow.isMinimized()) mainWindow.restore()
//         mainWindow.show()
//         mainWindow.focus()
//       }
//     }
//   })
// }

// function destroyTray(): void {
//   if (tray) {
//     tray.destroy()
//     tray = null
//   }
// }

function updateShortcuts(newShortcuts: Record<string, string>): boolean {
  try {
    // Update current shortcuts
    currentShortcuts = { ...currentShortcuts, ...newShortcuts }
    
    // Re-register all shortcuts with new values
    registerGlobalShortcuts()
    
    return true
  } catch (error) {
    console.error('Failed to update shortcuts:', error)
    return false
  }
}

// System handlers
function setupSystemHandlers(): void {
  // Shortcut management
  ipcMain.handle('system:updateShortcuts', async (_, shortcuts: Record<string, string>) => {
    const success = updateShortcuts(shortcuts)
    return { success }
  })

  // System info
  ipcMain.handle('system:getInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron
    }
  })
}

// Process cleanup
function cleanupHangingRecorderProcesses(): void {
  try {
    if (process.platform === 'darwin') {
      // Kill any hanging recorder processes
      const { execSync } = require('child_process')
      try {
        execSync('pkill -f "recorder"', { stdio: 'ignore' })
        console.log('🧹 Cleaned up hanging recorder processes')
      } catch (error) {
        // Ignore errors - likely means no processes were found
      }
    }
  } catch (error) {
    console.error('Failed to cleanup hanging processes:', error)
  }
}

// Helper function to safely cleanup recording state




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
      
      // Clean up any existing files with double extensions
      const recordingDirectory = settings.defaultSaveLocation || path.join(os.homedir(), 'Friday Recordings')
      cleanupDoubleExtensionFiles(recordingDirectory)
    } catch (error) {
      console.error('Failed to initialize Gemini API key:', error)
    }
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // Request microphone permissions first
  try {
    const hasPermission = await requestMicrophonePermission()
    if (!hasPermission) {
      console.log('⚠️ Microphone permission not granted - recording may not work')
    }
  } catch (error) {
    console.error('Failed to request microphone permission:', error)
  }

  // Check Swift recorder availability
  try {
    // Clean up any hanging processes first
    cleanupHangingRecorderProcesses()
    
    // Properly check Swift recorder availability
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

// Cleanup utility to fix existing files with double extensions
function cleanupDoubleExtensionFiles(recordingDirectory: string): void {
  try {
    if (!fs.existsSync(recordingDirectory)) {
      return
    }

    const files = fs.readdirSync(recordingDirectory)
    const doubleExtensionFiles = files.filter(f => f.endsWith('.mp3.mp3'))
    
    if (doubleExtensionFiles.length > 0) {
      console.log(`🧹 Found ${doubleExtensionFiles.length} files with double .mp3 extensions, fixing...`)
      
      for (const file of doubleExtensionFiles) {
        const oldPath = path.join(recordingDirectory, file)
        const newPath = path.join(recordingDirectory, file.replace('.mp3.mp3', '.mp3'))
        
        try {
          // Check if a file with the correct name already exists
          if (fs.existsSync(newPath)) {
            console.log(`⚠️ Target file already exists, removing duplicate: ${file}`)
            fs.unlinkSync(oldPath)
          } else {
            console.log(`🔧 Renaming: ${file} → ${file.replace('.mp3.mp3', '.mp3')}`)
            fs.renameSync(oldPath, newPath)
          }
        } catch (error) {
          console.error(`❌ Failed to fix file ${file}:`, error)
        }
      }
      console.log('✅ Cleanup completed')
    }
  } catch (error) {
    console.error('❌ Failed to cleanup double extension files:', error)
  }
}