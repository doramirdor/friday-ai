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

declare global {
  interface Window {
    api: {
      db: DatabaseAPI
    }
  }
}
