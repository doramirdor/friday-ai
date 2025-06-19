export interface Meeting {
  id?: number
  recordingPath: string | string[] // Support both single path and array of paths for chunks
  transcript: TranscriptLine[]
  title: string
  description: string
  tags: string[]
  actionItems: ActionItem[]
  context: string
  context_files: string[]
  notes: string
  summary: string
  chatMessages: ChatMessage[]
  createdAt: string
  updatedAt: string
  duration: string
}

export interface TranscriptLine {
  time: string
  text: string
}

export interface ActionItem {
  id: number
  text: string
  completed: boolean
}

export interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'action'
  content: string
  timestamp: string
  action?: string
}

export interface Settings {
  id?: number
  defaultSaveLocation: string
  launchAtLogin: boolean
  theme: 'auto' | 'light' | 'dark'
  showInMenuBar: boolean
  autoSaveRecordings: boolean
  realtimeTranscription: boolean
  transcriptionLanguage: string
  geminiApiKey: string
  autoGenerateActionItems: boolean
  autoSuggestTags: boolean
  globalContext: string
  enableGlobalContext: boolean
  includeContextInTranscriptions: boolean
  includeContextInActionItems: boolean
  // AI Model Configuration
  aiProvider: 'gemini' | 'ollama'
  ollamaModel: 'mistral:7b' | 'qwen2.5:1.5b' | 'qwen2.5:0.5b' | 'gemma2:2b'
  ollamaApiUrl: string
}

// API interface for the main world
export interface DatabaseAPI {
  createMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<number>
  getMeeting: (id: number) => Promise<Meeting | null>
  getAllMeetings: () => Promise<Meeting[]>
  updateMeeting: (id: number, meeting: Partial<Meeting>) => Promise<void>
  deleteMeeting: (id: number) => Promise<void>
  getSettings: () => Promise<Settings>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
}

export interface TranscriptionAPI {
  startService: () => Promise<void>
  stopService: () => Promise<void>
  isReady: () => Promise<boolean>
  processChunk: (audioBuffer: ArrayBuffer) => Promise<any>
  ping: () => Promise<any>
  saveRecording: (audioBuffer: ArrayBuffer, meetingId: number) => Promise<{ success: boolean; filePath?: string; error?: string }>
  loadRecording: (filePath: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>
  onResult: (callback: (result: any) => void) => void
  removeAllListeners: () => void
}

export interface GeminiAPI {
  generateContent: (options: any) => Promise<any>
  generateSummary: (options: any) => Promise<any>
  generateMessage: (options: any) => Promise<{ success: boolean; message?: string; error?: string }>
  generateFollowupQuestions: (options: any) => Promise<any>
  askQuestion: (options: any) => Promise<{ success: boolean; response?: string; error?: string }>
}

export interface OllamaAPI {
  generateContent: (options: any) => Promise<any>
  generateSummary: (options: any) => Promise<any>
  generateMessage: (options: any) => Promise<{ success: boolean; message?: string; error?: string }>
  generateFollowupQuestions: (options: any) => Promise<any>
  askQuestion: (options: any) => Promise<{ success: boolean; response?: string; error?: string }>
  setModel: (model: string) => Promise<{ success: boolean; error?: string }>
  setApiUrl: (url: string) => Promise<{ success: boolean; error?: string }>
}

export interface AlertsAPI {
  checkKeywords: (options: { transcript: string; keywords: any[] }) => Promise<{ success: boolean; matches?: any[]; error?: string }>
}

export interface SwiftRecorderAPI {
  checkAvailability: () => Promise<boolean>
  startCombinedRecording: (recordingPath: string, filename?: string) => Promise<any>
  stopCombinedRecording: () => Promise<any>
  onRecordingStarted: (callback: (result: any) => void) => void
  onRecordingStopped: (callback: (result: any) => void) => void
  onRecordingFailed: (callback: (result: any) => void) => void
  removeAllListeners: () => void
}

export interface ChunkedRecordingAPI {
  start: (meetingId: number) => Promise<any>
  addChunk: (meetingId: number, audioBuffer: ArrayBuffer) => Promise<any>
  stop: (meetingId: number) => Promise<any>
  loadChunks: (chunkPaths: string[]) => Promise<any>
}

export interface SystemAPI {
  getShortcuts: () => Promise<Record<string, string>>
  updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
  toggleMenuBar: (show: boolean) => Promise<void>
}

export interface AudioAPI {
  getCurrentDevice: () => Promise<any>
  switchToBuiltInSpeakers: () => Promise<any>
  enableBluetoothWorkaround: () => Promise<any>
}

declare global {
  interface Window {
    api: {
      db: DatabaseAPI
      transcription: TranscriptionAPI
      gemini: GeminiAPI
      ollama: OllamaAPI
      alerts: AlertsAPI
      swiftRecorder: SwiftRecorderAPI
      chunkedRecording: ChunkedRecordingAPI
      system: SystemAPI
      electron: {
        dialog: {
          showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<any>
        }
      }
      audio: AudioAPI
    }
  }
}
