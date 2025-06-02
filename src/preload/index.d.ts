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

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
