import { Database } from 'sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

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
}

class DatabaseService {
  private db: Database | null = null
  private dbPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'friday.db')
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      this.db = new Database(this.dbPath, (err) => {
        if (err) {
          reject(err)
          return
        }

        this.createTables()
          .then(() => this.initializeDefaultSettings())
          .then(() => resolve())
          .catch(reject)
      })
    })
  }

  private createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const createMeetingsTable = `
        CREATE TABLE IF NOT EXISTS meetings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recording_path TEXT NOT NULL,
          transcript TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          tags TEXT,
          action_items TEXT,
          context TEXT,
          context_files TEXT,
          notes TEXT,
          summary TEXT,
          chat_messages TEXT DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          duration TEXT NOT NULL
        )
      `

      const createSettingsTable = `
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          default_save_location TEXT NOT NULL,
          launch_at_login BOOLEAN DEFAULT 1,
          theme TEXT DEFAULT 'auto',
          show_in_menu_bar BOOLEAN DEFAULT 1,
          auto_save_recordings BOOLEAN DEFAULT 1,
          realtime_transcription BOOLEAN DEFAULT 1,
          transcription_language TEXT DEFAULT 'en-US',
          gemini_api_key TEXT,
          auto_generate_action_items BOOLEAN DEFAULT 1,
          auto_suggest_tags BOOLEAN DEFAULT 1,
          global_context TEXT,
          enable_global_context BOOLEAN DEFAULT 1,
          include_context_in_transcriptions BOOLEAN DEFAULT 1,
          include_context_in_action_items BOOLEAN DEFAULT 1
        )
      `

      this.db.serialize(() => {
        this.db!.run(createMeetingsTable, (err) => {
          if (err) {
            reject(err)
            return
          }
        })

        this.db!.run(createSettingsTable, (err) => {
          if (err) {
            reject(err)
            return
          }
          
          // Run migration to add context_files column if it doesn't exist
          this.migrateDatabase().then(() => {
            resolve()
          }).catch((migrationErr) => {
            reject(migrationErr)
          })
        })
      })
    })
  }

  private async migrateDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      // Check if context_files column exists
      this.db.all("PRAGMA table_info(meetings)", (err, rows: any[]) => {
        if (err) {
          reject(err)
          return
        }

        const hasContextFiles = rows.some(row => row.name === 'context_files')
        const hasNotes = rows.some(row => row.name === 'notes')
        const hasChatMessages = rows.some(row => row.name === 'chat_messages')
        
        const migrations: Promise<void>[] = []
        
        if (!hasContextFiles) {
          console.log('Adding context_files column to meetings table...')
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db!.run("ALTER TABLE meetings ADD COLUMN context_files TEXT DEFAULT '[]'", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr)
                return
              }
              console.log('Successfully added context_files column')
              resolveInner()
            })
          }))
        }
        
        if (!hasNotes) {
          console.log('Adding notes column to meetings table...')
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db!.run("ALTER TABLE meetings ADD COLUMN notes TEXT DEFAULT ''", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr)
                return
              }
              console.log('Successfully added notes column')
              resolveInner()
            })
          }))
        }
        
        if (!hasChatMessages) {
          console.log('Adding chat_messages column to meetings table...')
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db!.run("ALTER TABLE meetings ADD COLUMN chat_messages TEXT DEFAULT '[]'", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr)
                return
              }
              console.log('Successfully added chat_messages column')
              resolveInner()
            })
          }))
        }
        
        if (migrations.length === 0) {
          resolve()
        } else {
          Promise.all(migrations).then(() => resolve()).catch(reject)
        }
      })
    })
  }

  private initializeDefaultSettings(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      // Check if settings already exist
      this.db.get('SELECT COUNT(*) as count FROM settings', (err, row: any) => {
        if (err) {
          reject(err)
          return
        }

        if (row.count === 0) {
          // Insert default settings
          const defaultSaveLocation = path.join(app.getPath('documents'), 'Friday Recordings')
          const defaultSettings = {
            default_save_location: defaultSaveLocation,
            launch_at_login: 1,
            theme: 'auto',
            show_in_menu_bar: 1,
            auto_save_recordings: 1,
            realtime_transcription: 1,
            transcription_language: 'en-US',
            gemini_api_key: '',
            auto_generate_action_items: 1,
            auto_suggest_tags: 1,
            global_context:
              "I am a product manager at a tech startup. We're building a mobile app for productivity. Our team includes developers, designers, and data analysts. We use agile methodology with weekly sprints.",
            enable_global_context: 1,
            include_context_in_transcriptions: 1,
            include_context_in_action_items: 1
          }

          const sql = `
            INSERT INTO settings (
              default_save_location, launch_at_login, theme, show_in_menu_bar,
              auto_save_recordings, realtime_transcription, transcription_language,
              gemini_api_key, auto_generate_action_items, auto_suggest_tags,
              global_context, enable_global_context, include_context_in_transcriptions,
              include_context_in_action_items
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `

          this.db!.run(sql, Object.values(defaultSettings), (err) => {
            if (err) {
              reject(err)
              return
            }
            resolve()
          })
        } else {
          resolve()
        }
      })
    })
  }

  // Meeting CRUD operations
  async createMeeting(meeting: Omit<Meeting, 'id'>): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const sql = `
        INSERT INTO meetings (
          recording_path, transcript, title, description, tags,
          action_items, context, context_files, notes, summary, chat_messages, created_at, updated_at, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      // Handle recordingPath serialization
      const recordingPathValue = Array.isArray(meeting.recordingPath) 
        ? JSON.stringify(meeting.recordingPath)
        : meeting.recordingPath

      const values = [
        recordingPathValue,
        JSON.stringify(meeting.transcript),
        meeting.title,
        meeting.description,
        JSON.stringify(meeting.tags),
        JSON.stringify(meeting.actionItems),
        meeting.context,
        JSON.stringify(meeting.context_files),
        meeting.notes,
        meeting.summary,
        JSON.stringify(meeting.chatMessages || []),
        meeting.createdAt,
        meeting.updatedAt,
        meeting.duration
      ]

      this.db.run(sql, values, function (err) {
        if (err) {
          reject(err)
          return
        }
        resolve(this.lastID)
      })
    })
  }

  async getMeeting(id: number): Promise<Meeting | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      this.db.get('SELECT * FROM meetings WHERE id = ?', [id], (err, row: any) => {
        if (err) {
          reject(err)
          return
        }

        if (!row) {
          resolve(null)
          return
        }

        resolve(this.rowToMeeting(row))
      })
    })
  }

  async getAllMeetings(): Promise<Meeting[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      this.db.all('SELECT * FROM meetings ORDER BY created_at DESC', (err, rows: any[]) => {
        if (err) {
          reject(err)
          return
        }

        const meetings = rows.map((row) => this.rowToMeeting(row))
        resolve(meetings)
      })
    })
  }

  async updateMeeting(id: number, meeting: Partial<Meeting>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const fields: string[] = []
      const values: any[] = []

      if (meeting.recordingPath !== undefined) {
        fields.push('recording_path = ?')
        const recordingPathValue = Array.isArray(meeting.recordingPath) 
          ? JSON.stringify(meeting.recordingPath)
          : meeting.recordingPath
        values.push(recordingPathValue)
      }
      if (meeting.transcript !== undefined) {
        fields.push('transcript = ?')
        values.push(JSON.stringify(meeting.transcript))
      }
      if (meeting.title !== undefined) {
        fields.push('title = ?')
        values.push(meeting.title)
      }
      if (meeting.description !== undefined) {
        fields.push('description = ?')
        values.push(meeting.description)
      }
      if (meeting.tags !== undefined) {
        fields.push('tags = ?')
        values.push(JSON.stringify(meeting.tags))
      }
      if (meeting.actionItems !== undefined) {
        fields.push('action_items = ?')
        values.push(JSON.stringify(meeting.actionItems))
      }
      if (meeting.context !== undefined) {
        fields.push('context = ?')
        values.push(meeting.context)
      }
      if (meeting.context_files !== undefined) {
        fields.push('context_files = ?')
        values.push(JSON.stringify(meeting.context_files))
      }
      if (meeting.notes !== undefined) {
        fields.push('notes = ?')
        values.push(meeting.notes)
      }
      if (meeting.summary !== undefined) {
        fields.push('summary = ?')
        values.push(meeting.summary)
      }
      if (meeting.chatMessages !== undefined) {
        fields.push('chat_messages = ?')
        values.push(JSON.stringify(meeting.chatMessages))
      }
      if (meeting.updatedAt !== undefined) {
        fields.push('updated_at = ?')
        values.push(meeting.updatedAt)
      }
      if (meeting.duration !== undefined) {
        fields.push('duration = ?')
        values.push(meeting.duration)
      }

      if (fields.length === 0) {
        resolve()
        return
      }

      values.push(id)
      const sql = `UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`

      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  async deleteMeeting(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      this.db.run('DELETE FROM meetings WHERE id = ?', [id], (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  // Settings operations
  async getSettings(): Promise<Settings> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      this.db.get('SELECT * FROM settings LIMIT 1', (err, row: any) => {
        if (err) {
          reject(err)
          return
        }

        if (!row) {
          reject(new Error('No settings found'))
          return
        }

        resolve(this.rowToSettings(row))
      })
    })
  }

  async updateSettings(settings: Partial<Settings>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const fields: string[] = []
      const values: any[] = []

      Object.entries(settings).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          // Convert camelCase to snake_case
          const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
          fields.push(`${dbKey} = ?`)
          values.push(value)
        }
      })

      if (fields.length === 0) {
        resolve()
        return
      }

      const sql = `UPDATE settings SET ${fields.join(', ')} WHERE id = 1`

      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  private rowToMeeting(row: Record<string, unknown>): Meeting {
    // Helper function to parse recordingPath
    const parseRecordingPath = (pathData: string): string | string[] => {
      if (!pathData) return ''
      
      // Try to parse as JSON array, fallback to string
      try {
        const parsed = JSON.parse(pathData)
        return Array.isArray(parsed) ? parsed : pathData
      } catch {
        return pathData
      }
    }

    return {
      id: row.id as number,
      recordingPath: parseRecordingPath(row.recording_path as string),
      transcript: JSON.parse(row.transcript as string),
      title: row.title as string,
      description: row.description as string,
      tags: JSON.parse(row.tags as string),
      actionItems: JSON.parse(row.action_items as string),
      context: row.context as string,
      context_files: row.context_files ? JSON.parse(row.context_files as string) : [],
      notes: row.notes as string,
      summary: row.summary as string,
      chatMessages: row.chat_messages ? JSON.parse(row.chat_messages as string) : [],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      duration: row.duration as string
    }
  }

  private rowToSettings(row: Record<string, any>): Settings {
    return {
      id: row.id,
      defaultSaveLocation: row.default_save_location,
      launchAtLogin: Boolean(row.launch_at_login),
      theme: row.theme,
      showInMenuBar: Boolean(row.show_in_menu_bar),
      autoSaveRecordings: Boolean(row.auto_save_recordings),
      realtimeTranscription: Boolean(row.realtime_transcription),
      transcriptionLanguage: row.transcription_language,
      geminiApiKey: row.gemini_api_key,
      autoGenerateActionItems: Boolean(row.auto_generate_action_items),
      autoSuggestTags: Boolean(row.auto_suggest_tags),
      globalContext: row.global_context,
      enableGlobalContext: Boolean(row.enable_global_context),
      includeContextInTranscriptions: Boolean(row.include_context_in_transcriptions),
      includeContextInActionItems: Boolean(row.include_context_in_action_items)
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

export const databaseService = new DatabaseService()
