import { DatabaseAPI } from '../../../main/database'

declare global {
  interface Window {
    api: {
      db: DatabaseAPI
      transcription: {
        startService: () => Promise<{ success: boolean; error?: string }>
        stopService: () => Promise<{ success: boolean }>
        isReady: () => Promise<{ ready: boolean; details?: any }>
        processChunk: (buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
        ping: () => Promise<{ success: boolean; error?: string }>
        onResult: (callback: (result: any) => void) => void
        removeAllListeners: () => void
        loadRecording: (filePath: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>
        saveRecording: (arrayBuffer: ArrayBuffer, meetingId: number) => Promise<{ success: boolean; filePath?: string; error?: string }>
      }
      swiftRecorder: {
        checkAvailability: () => Promise<{ available: boolean }>
        startCombinedRecording: (path: string, filename: string) => Promise<{ success: boolean; error?: string }>
        stopCombinedRecording: () => Promise<{ success: boolean; error?: string }>
        onRecordingStarted: (callback: (result: any) => void) => void
        onRecordingStopped: (callback: (result: any) => void) => void
        onRecordingFailed: (callback: (result: any) => void) => void
        removeAllListeners: () => void
      }
      chunkedRecording: {
        start: (meetingId: number) => Promise<any>
        addChunk: (meetingId: number, audioBuffer: ArrayBuffer) => Promise<any>
        stop: (meetingId: number) => Promise<any>
        loadChunks: (chunkPaths: string[]) => Promise<any>
      }
      gemini: {
        generateContent: (options: any) => Promise<{ success: boolean; data?: any; error?: string }>
        generateSummary: (options: any) => Promise<{ success: boolean; summary?: string; error?: string }>
        generateMessage: (options: any) => Promise<{ success: boolean; message?: string; error?: string }>
      }
      system: {
        getShortcuts: () => Promise<Record<string, string>>
        updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
        toggleMenuBar: (show: boolean) => Promise<{ success: boolean; error?: string; message?: string }>
      }
      electron: {
        dialog: {
          showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
        }
      }
    }
    electron: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void
        removeAllListeners: (channel: string) => void
      }
    }
  }
} 