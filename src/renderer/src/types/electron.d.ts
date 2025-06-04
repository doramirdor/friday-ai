import { DatabaseAPI } from '../../../main/database'

declare global {
  interface Window {
    api: {
      db: DatabaseAPI
      electron: {
        dialog: {
          showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
        }
      }
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
    electron: {
      ipcRenderer: {
        on: (channel: string, listener: () => void) => void
        removeAllListeners: (channel: string) => void
      }
    }
  }
} 