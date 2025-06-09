import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Database API
  db: {
    // Meeting operations
    createMeeting: (meeting: any) => ipcRenderer.invoke('db:createMeeting', meeting),
    getMeeting: (id: number) => ipcRenderer.invoke('db:getMeeting', id),
    getAllMeetings: () => ipcRenderer.invoke('db:getAllMeetings'),
    updateMeeting: (id: number, meeting: any) =>
      ipcRenderer.invoke('db:updateMeeting', id, meeting),
    deleteMeeting: (id: number) => ipcRenderer.invoke('db:deleteMeeting', id),

    // Settings operations
    getSettings: () => ipcRenderer.invoke('db:getSettings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('db:updateSettings', settings)
  },

  // Transcription API
  transcription: {
    // Service management
    startService: () => ipcRenderer.invoke('transcription:start-service'),
    stopService: () => ipcRenderer.invoke('transcription:stop-service'),
    isReady: () => ipcRenderer.invoke('transcription:is-ready'),

    // Audio processing
    processChunk: (audioBuffer: ArrayBuffer) =>
      ipcRenderer.invoke('transcription:process-chunk', audioBuffer),
    ping: () => ipcRenderer.invoke('transcription:ping'),
    saveRecording: (audioBuffer: ArrayBuffer, meetingId: number) =>
      ipcRenderer.invoke('transcription:save-recording', audioBuffer, meetingId),
    loadRecording: (filePath: string) =>
      ipcRenderer.invoke('transcription:load-recording', filePath),

    // Event listeners for transcription results
    onResult: (callback: (result: any) => void) => {
      ipcRenderer.on('transcription-result', (_, result) => callback(result))
    },

    // Remove listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('transcription-result')
    }
  },

  // Alerts API
  alerts: {
    checkKeywords: (options: { transcript: string; keywords: any[] }) =>
      ipcRenderer.invoke('alerts:check-keywords', options)
  },

  // Swift Recorder API for combined audio recording
  swiftRecorder: {
    // Check if Swift recorder is available
    checkAvailability: () => ipcRenderer.invoke('swift-recorder:check-availability'),

    // Start combined recording (system + microphone)
    startCombinedRecording: (recordingPath: string, filename?: string) =>
      ipcRenderer.invoke('swift-recorder:start-combined-recording', recordingPath, filename),

    // Stop combined recording
    stopCombinedRecording: () => ipcRenderer.invoke('swift-recorder:stop-combined-recording'),

    // Event listeners for recording events
    onRecordingStarted: (callback: (result: any) => void) => {
      ipcRenderer.on('combined-recording-started', (_, result) => callback(result))
    },

    onRecordingStopped: (callback: (result: any) => void) => {
      ipcRenderer.on('combined-recording-stopped', (_, result) => callback(result))
    },

    onRecordingFailed: (callback: (result: any) => void) => {
      ipcRenderer.on('combined-recording-failed', (_, result) => callback(result))
    },

    // Remove listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('combined-recording-started')
      ipcRenderer.removeAllListeners('combined-recording-stopped')
      ipcRenderer.removeAllListeners('combined-recording-failed')
    }
  },

  // Chunked Recording API for large recordings
  chunkedRecording: {
    // Start chunked recording for a meeting
    start: (meetingId: number) => ipcRenderer.invoke('chunked-recording:start', meetingId),
    
    // Add a chunk to the recording
    addChunk: (meetingId: number, audioBuffer: ArrayBuffer) => 
      ipcRenderer.invoke('chunked-recording:add-chunk', meetingId, audioBuffer),
    
    // Stop chunked recording
    stop: (meetingId: number) => ipcRenderer.invoke('chunked-recording:stop', meetingId),
    
    // Load chunks for playback
    loadChunks: (chunkPaths: string[]) => 
      ipcRenderer.invoke('chunked-recording:load-chunks', chunkPaths)
  },

  // Gemini AI API
  gemini: {
    // Generate comprehensive meeting content (summary, description, action items, tags)
    generateContent: (options: any) => ipcRenderer.invoke('gemini:generate-content', options),

    // Generate summary only
    generateSummary: (options: any) => ipcRenderer.invoke('gemini:generate-summary', options),

    // Generate Slack or Email messages
    generateMessage: (options: any) => ipcRenderer.invoke('gemini:generate-message', options),

    // Generate followup questions, risks, and comments
    generateFollowupQuestions: (options: any) => ipcRenderer.invoke('gemini:generate-followup-questions', options),

    // Ask a question about the meeting
    askQuestion: (options: any) => ipcRenderer.invoke('gemini:ask-question', options)
  },

  // System APIs for shortcuts and menu bar
  system: {
    // Get current shortcuts
    getShortcuts: () => ipcRenderer.invoke('system:get-shortcuts'),

    // Update shortcuts
    updateShortcuts: (shortcuts: Record<string, string>) => 
      ipcRenderer.invoke('system:update-shortcuts', shortcuts),

    // Toggle menu bar tray
    toggleMenuBar: (show: boolean) => ipcRenderer.invoke('system:toggle-menu-bar', show)
  },

  electron: {
    dialog: {
      showOpenDialog: (options: Electron.OpenDialogOptions) => 
        ipcRenderer.invoke('dialog:showOpenDialog', options)
    }
  },

  audio: {
    // Audio device management
    getCurrentDevice: () => ipcRenderer.invoke('audio-get-current-device'),
    switchToBuiltInSpeakers: () => ipcRenderer.invoke('audio-switch-to-built-in'),
    enableBluetoothWorkaround: () => ipcRenderer.invoke('audio-enable-bluetooth-workaround')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
