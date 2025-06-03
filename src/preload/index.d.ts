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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: DatabaseAPI
      transcription: TranscriptionAPI
      swiftRecorder: SwiftRecorderAPI
      chunkedRecording: ChunkedRecordingAPI
      gemini: {
        generateSummaryOnly: (input: {
          transcript: string
          context: string
          meetingContext: string
          notes: string
          title: string
        }) => Promise<{ success: boolean; summary?: string; error?: string }>
        generateMeetingContent: (input: {
          transcript: string
          context: string
          meetingContext: string
          notes: string
          title: string
        }) => Promise<{
          success: boolean
          summary?: string
          description?: string
          actionItems?: Array<{ id: number; text: string; completed: boolean }>
          tags?: string[]
          error?: string
        }>
      }
    }
  }
}
