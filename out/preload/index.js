"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  // Database API
  db: {
    // Meeting operations
    createMeeting: (meeting) => electron.ipcRenderer.invoke("db:createMeeting", meeting),
    getMeeting: (id) => electron.ipcRenderer.invoke("db:getMeeting", id),
    getAllMeetings: () => electron.ipcRenderer.invoke("db:getAllMeetings"),
    updateMeeting: (id, meeting) => electron.ipcRenderer.invoke("db:updateMeeting", id, meeting),
    deleteMeeting: (id) => electron.ipcRenderer.invoke("db:deleteMeeting", id),
    // Settings operations
    getSettings: () => electron.ipcRenderer.invoke("db:getSettings"),
    updateSettings: (settings) => electron.ipcRenderer.invoke("db:updateSettings", settings)
  },
  // Transcription API
  transcription: {
    // Service management
    startService: () => electron.ipcRenderer.invoke("transcription:start-service"),
    stopService: () => electron.ipcRenderer.invoke("transcription:stop-service"),
    isReady: () => electron.ipcRenderer.invoke("transcription:is-ready"),
    // Audio processing
    processChunk: (audioBuffer) => electron.ipcRenderer.invoke("transcription:process-chunk", audioBuffer),
    ping: () => electron.ipcRenderer.invoke("transcription:ping"),
    saveRecording: (audioBuffer, meetingId) => electron.ipcRenderer.invoke("transcription:save-recording", audioBuffer, meetingId),
    loadRecording: (filePath) => electron.ipcRenderer.invoke("transcription:load-recording", filePath),
    // Event listeners for transcription results
    onResult: (callback) => {
      electron.ipcRenderer.on("transcription-result", (_, result) => callback(result));
    },
    // Remove listeners
    removeAllListeners: () => {
      electron.ipcRenderer.removeAllListeners("transcription-result");
    }
  },
  // Alerts API
  alerts: {
    checkKeywords: (options) => electron.ipcRenderer.invoke("alerts:check-keywords", options)
  },
  // Swift Recorder API for combined audio recording
  swiftRecorder: {
    // Check if Swift recorder is available
    checkAvailability: () => electron.ipcRenderer.invoke("swift-recorder:check-availability"),
    // Start combined recording (system + microphone)
    startCombinedRecording: (recordingPath, filename) => electron.ipcRenderer.invoke("swift-recorder:start-combined-recording", recordingPath, filename),
    // Stop combined recording
    stopCombinedRecording: () => electron.ipcRenderer.invoke("swift-recorder:stop-combined-recording"),
    // Event listeners for recording events
    onRecordingStarted: (callback) => {
      electron.ipcRenderer.on("combined-recording-started", (_, result) => callback(result));
    },
    onRecordingStopped: (callback) => {
      electron.ipcRenderer.on("combined-recording-stopped", (_, result) => callback(result));
    },
    onRecordingFailed: (callback) => {
      electron.ipcRenderer.on("combined-recording-failed", (_, result) => callback(result));
    },
    // Remove listeners
    removeAllListeners: () => {
      electron.ipcRenderer.removeAllListeners("combined-recording-started");
      electron.ipcRenderer.removeAllListeners("combined-recording-stopped");
      electron.ipcRenderer.removeAllListeners("combined-recording-failed");
    }
  },
  // Chunked Recording API for large recordings
  chunkedRecording: {
    // Start chunked recording for a meeting
    start: (meetingId) => electron.ipcRenderer.invoke("chunked-recording:start", meetingId),
    // Add a chunk to the recording
    addChunk: (meetingId, audioBuffer) => electron.ipcRenderer.invoke("chunked-recording:add-chunk", meetingId, audioBuffer),
    // Stop chunked recording
    stop: (meetingId) => electron.ipcRenderer.invoke("chunked-recording:stop", meetingId),
    // Load chunks for playback
    loadChunks: (chunkPaths) => electron.ipcRenderer.invoke("chunked-recording:load-chunks", chunkPaths)
  },
  // Gemini AI API
  gemini: {
    // Generate comprehensive meeting content (summary, description, action items, tags)
    generateContent: (options) => electron.ipcRenderer.invoke("gemini:generate-content", options),
    // Generate summary only
    generateSummary: (options) => electron.ipcRenderer.invoke("gemini:generate-summary", options),
    // Generate Slack or Email messages
    generateMessage: (options) => electron.ipcRenderer.invoke("gemini:generate-message", options),
    // Generate followup questions, risks, and comments
    generateFollowupQuestions: (options) => electron.ipcRenderer.invoke("gemini:generate-followup-questions", options),
    // Ask a question about the meeting
    askQuestion: (options) => electron.ipcRenderer.invoke("gemini:ask-question", options)
  },
  // System APIs for shortcuts and menu bar
  system: {
    // Get current shortcuts
    getShortcuts: () => electron.ipcRenderer.invoke("system:get-shortcuts"),
    // Update shortcuts
    updateShortcuts: (shortcuts) => electron.ipcRenderer.invoke("system:update-shortcuts", shortcuts),
    // Toggle menu bar tray
    toggleMenuBar: (show) => electron.ipcRenderer.invoke("system:toggle-menu-bar", show)
  },
  electron: {
    dialog: {
      showOpenDialog: (options) => electron.ipcRenderer.invoke("dialog:showOpenDialog", options)
    }
  },
  audio: {
    // Audio device management
    getCurrentDevice: () => electron.ipcRenderer.invoke("audio-get-current-device"),
    switchToBuiltInSpeakers: () => electron.ipcRenderer.invoke("audio-switch-to-built-in"),
    enableBluetoothWorkaround: () => electron.ipcRenderer.invoke("audio-enable-bluetooth-workaround")
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
