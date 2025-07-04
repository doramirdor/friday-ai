import { ElectronAPI } from '@electron-toolkit/preload'
import { Meeting } from '../renderer/src/types/database'

interface TranscriptionResult {
  type: 'transcript' | 'error' | 'pong' | 'shutdown'
  text?: string
  message?: string
  chunk_id?: number
  language?: string
  language_probability?: number
  duration?: number
  words?: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
}

interface TranscriptionAPI {
  startService: () => Promise<{ success: boolean; error?: string }>
  stopService: () => Promise<{ success: boolean }>
  isReady: () => Promise<{ ready: boolean }>
  processChunk: (buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
  ping: () => Promise<{ success: boolean; error?: string }>
  saveRecording: (
    buffer: ArrayBuffer,
    meetingId: number
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>
  loadRecording: (
    filePath: string
  ) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>
  onResult: (callback: (result: TranscriptionResult) => void) => void
  onLiveTranscriptionData: (callback: (data: { text: string; stream_type?: string }) => void) => void
  removeAllListeners: () => void
}

interface DatabaseAPI {
  createMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<number>
  getMeeting: (id: number) => Promise<Meeting | null>
  getAllMeetings: () => Promise<Meeting[]>
  updateMeeting: (id: number, meeting: Partial<Meeting>) => Promise<void>
  deleteMeeting: (id: number) => Promise<void>
  getSettings: () => Promise<unknown>
  updateSettings: (settings: unknown) => Promise<unknown>
}

interface CustomAPI {
  db: DatabaseAPI
  transcription: TranscriptionAPI
}

interface SwiftRecorderAPI {
  checkAvailability: () => Promise<{ available: boolean }>
  startCombinedRecording: (
    recordingPath: string,
    filename?: string
  ) => Promise<{ success: boolean; error?: string }>
  stopCombinedRecording: () => Promise<{ success: boolean; error?: string }>
}

interface ChunkedRecordingAPI {
  start: (meetingId: number) => Promise<{ success: boolean; recording?: unknown; error?: string }>
  addChunk: (
    meetingId: number, 
    audioBuffer: ArrayBuffer
  ) => Promise<{ success: boolean; error?: string }>
  stop: (meetingId: number) => Promise<{ success: boolean; chunkPaths?: string[]; error?: string }>
  loadChunks: (chunkPaths: string[]) => Promise<{ success: boolean; chunks?: ArrayBuffer[]; error?: string }>
}

interface GeminiAPI {
  generateContent: (options: any) => Promise<{ success: boolean; data?: any; error?: string }>
  generateSummary: (options: any) => Promise<{ success: boolean; summary?: string; error?: string }>
  generateMessage: (options: any) => Promise<{ success: boolean; message?: string; error?: string }>
  generateFollowupQuestions: (options: any) => Promise<{ success: boolean; data?: any; error?: string }>
  askQuestion: (options: any) => Promise<{ success: boolean; answer?: string; error?: string }>
}

interface AlertsAPI {
  checkKeywords: (options: { transcript: string; keywords: any[] }) => Promise<{ success: boolean; matches?: any[]; error?: string }>
}

interface SystemAPI {
  getShortcuts: () => Promise<Record<string, string>>
  updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
  toggleMenuBar: (show: boolean) => Promise<{ success: boolean; message?: string; error?: string }>
}

interface AudioAPI {
  getCurrentDevice: () => Promise<{ success: boolean; deviceName?: string; isBluetooth?: boolean; availableDevices?: string[]; error?: string }>
  switchToBuiltInSpeakers: () => Promise<{ success: boolean; message?: string; error?: string }>
  enableBluetoothWorkaround: () => Promise<{ success: boolean; message?: string; error?: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: DatabaseAPI
      transcription: TranscriptionAPI
      swiftRecorder: SwiftRecorderAPI
      chunkedRecording: ChunkedRecordingAPI
      gemini: GeminiAPI
      alerts: AlertsAPI
      system: SystemAPI
      audio: AudioAPI
      electron: {
        dialog: {
          showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
        }
      }
    }
  }
}
