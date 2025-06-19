"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const sqlite3 = require("sqlite3");
const fs = require("fs");
const child_process = require("child_process");
const os = require("os");
const net = require("net");
const ffmpeg = require("fluent-ffmpeg");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const child_process__namespace = /* @__PURE__ */ _interopNamespaceDefault(child_process);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
const net__namespace = /* @__PURE__ */ _interopNamespaceDefault(net);
const icon = path.join(__dirname, "../../resources/icon.png");
class DatabaseService {
  db = null;
  dbPath;
  constructor() {
    const userDataPath = electron.app.getPath("userData");
    this.dbPath = path__namespace.join(userDataPath, "friday.db");
  }
  async initialize() {
    return new Promise((resolve, reject) => {
      const dir = path__namespace.dirname(this.dbPath);
      if (!fs__namespace.existsSync(dir)) {
        fs__namespace.mkdirSync(dir, { recursive: true });
      }
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.createTables().then(() => this.initializeDefaultSettings()).then(() => resolve()).catch(reject);
      });
    });
  }
  createTables() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
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
      `;
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
          include_context_in_action_items BOOLEAN DEFAULT 1,
          ai_provider TEXT DEFAULT 'gemini',
          ollama_model TEXT DEFAULT 'mistral:7b',
          ollama_api_url TEXT DEFAULT 'http://localhost:11434'
        )
      `;
      this.db.serialize(() => {
        this.db.run(createMeetingsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });
        this.db.run(createSettingsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
          this.migrateDatabase().then(() => {
            resolve();
          }).catch((migrationErr) => {
            reject(migrationErr);
          });
        });
      });
    });
  }
  async migrateDatabase() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.all("PRAGMA table_info(meetings)", (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const hasContextFiles = rows.some((row) => row.name === "context_files");
        const hasNotes = rows.some((row) => row.name === "notes");
        const hasChatMessages = rows.some((row) => row.name === "chat_messages");
        const migrations = [];
        if (!hasContextFiles) {
          console.log("Adding context_files column to meetings table...");
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db.run("ALTER TABLE meetings ADD COLUMN context_files TEXT DEFAULT '[]'", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr);
                return;
              }
              console.log("Successfully added context_files column");
              resolveInner();
            });
          }));
        }
        if (!hasNotes) {
          console.log("Adding notes column to meetings table...");
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db.run("ALTER TABLE meetings ADD COLUMN notes TEXT DEFAULT ''", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr);
                return;
              }
              console.log("Successfully added notes column");
              resolveInner();
            });
          }));
        }
        if (!hasChatMessages) {
          console.log("Adding chat_messages column to meetings table...");
          migrations.push(new Promise((resolveInner, rejectInner) => {
            this.db.run("ALTER TABLE meetings ADD COLUMN chat_messages TEXT DEFAULT '[]'", (alterErr) => {
              if (alterErr) {
                rejectInner(alterErr);
                return;
              }
              console.log("Successfully added chat_messages column");
              resolveInner();
            });
          }));
        }
        this.db.all("PRAGMA table_info(settings)", (settingsErr, settingsRows) => {
          if (settingsErr) {
            reject(settingsErr);
            return;
          }
          const hasAiProvider = settingsRows.some((row) => row.name === "ai_provider");
          const hasOllamaModel = settingsRows.some((row) => row.name === "ollama_model");
          const hasOllamaApiUrl = settingsRows.some((row) => row.name === "ollama_api_url");
          if (!hasAiProvider) {
            console.log("Adding ai_provider column to settings table...");
            migrations.push(new Promise((resolveInner, rejectInner) => {
              this.db.run("ALTER TABLE settings ADD COLUMN ai_provider TEXT DEFAULT 'gemini'", (alterErr) => {
                if (alterErr) {
                  rejectInner(alterErr);
                  return;
                }
                console.log("Successfully added ai_provider column");
                resolveInner();
              });
            }));
          }
          if (!hasOllamaModel) {
            console.log("Adding ollama_model column to settings table...");
            migrations.push(new Promise((resolveInner, rejectInner) => {
              this.db.run("ALTER TABLE settings ADD COLUMN ollama_model TEXT DEFAULT 'mistral:7b'", (alterErr) => {
                if (alterErr) {
                  rejectInner(alterErr);
                  return;
                }
                console.log("Successfully added ollama_model column");
                resolveInner();
              });
            }));
          }
          if (!hasOllamaApiUrl) {
            console.log("Adding ollama_api_url column to settings table...");
            migrations.push(new Promise((resolveInner, rejectInner) => {
              this.db.run("ALTER TABLE settings ADD COLUMN ollama_api_url TEXT DEFAULT 'http://localhost:11434'", (alterErr) => {
                if (alterErr) {
                  rejectInner(alterErr);
                  return;
                }
                console.log("Successfully added ollama_api_url column");
                resolveInner();
              });
            }));
          }
          if (migrations.length === 0) {
            resolve();
          } else {
            Promise.all(migrations).then(() => resolve()).catch(reject);
          }
        });
      });
    });
  }
  initializeDefaultSettings() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (row.count === 0) {
          const defaultSaveLocation = path__namespace.join(electron.app.getPath("documents"), "Friday Recordings");
          const defaultSettings = {
            default_save_location: defaultSaveLocation,
            launch_at_login: 1,
            theme: "auto",
            show_in_menu_bar: 1,
            auto_save_recordings: 1,
            realtime_transcription: 1,
            transcription_language: "en-US",
            gemini_api_key: "",
            auto_generate_action_items: 1,
            auto_suggest_tags: 1,
            global_context: "I am a product manager at a tech startup. We're building a mobile app for productivity. Our team includes developers, designers, and data analysts. We use agile methodology with weekly sprints.",
            enable_global_context: 1,
            include_context_in_transcriptions: 1,
            include_context_in_action_items: 1,
            ai_provider: "gemini",
            ollama_model: "mistral:7b",
            ollama_api_url: "http://localhost:11434"
          };
          const sql = `
            INSERT INTO settings (
              default_save_location, launch_at_login, theme, show_in_menu_bar,
              auto_save_recordings, realtime_transcription, transcription_language,
              gemini_api_key, auto_generate_action_items, auto_suggest_tags,
              global_context, enable_global_context, include_context_in_transcriptions,
              include_context_in_action_items, ai_provider, ollama_model, ollama_api_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          this.db.run(sql, Object.values(defaultSettings), (err2) => {
            if (err2) {
              reject(err2);
              return;
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }
  // Meeting CRUD operations
  async createMeeting(meeting) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const sql = `
        INSERT INTO meetings (
          recording_path, transcript, title, description, tags,
          action_items, context, context_files, notes, summary, chat_messages, created_at, updated_at, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const recordingPathValue = Array.isArray(meeting.recordingPath) ? JSON.stringify(meeting.recordingPath) : meeting.recordingPath;
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
      ];
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
  }
  async getMeeting(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.get("SELECT * FROM meetings WHERE id = ?", [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        resolve(this.rowToMeeting(row));
      });
    });
  }
  async getAllMeetings() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.all("SELECT * FROM meetings ORDER BY created_at DESC", (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const meetings = rows.map((row) => this.rowToMeeting(row));
        resolve(meetings);
      });
    });
  }
  async updateMeeting(id, meeting) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const fields = [];
      const values = [];
      if (meeting.recordingPath !== void 0) {
        fields.push("recording_path = ?");
        const recordingPathValue = Array.isArray(meeting.recordingPath) ? JSON.stringify(meeting.recordingPath) : meeting.recordingPath;
        values.push(recordingPathValue);
      }
      if (meeting.transcript !== void 0) {
        fields.push("transcript = ?");
        values.push(JSON.stringify(meeting.transcript));
      }
      if (meeting.title !== void 0) {
        fields.push("title = ?");
        values.push(meeting.title);
      }
      if (meeting.description !== void 0) {
        fields.push("description = ?");
        values.push(meeting.description);
      }
      if (meeting.tags !== void 0) {
        fields.push("tags = ?");
        values.push(JSON.stringify(meeting.tags));
      }
      if (meeting.actionItems !== void 0) {
        fields.push("action_items = ?");
        values.push(JSON.stringify(meeting.actionItems));
      }
      if (meeting.context !== void 0) {
        fields.push("context = ?");
        values.push(meeting.context);
      }
      if (meeting.context_files !== void 0) {
        fields.push("context_files = ?");
        values.push(JSON.stringify(meeting.context_files));
      }
      if (meeting.notes !== void 0) {
        fields.push("notes = ?");
        values.push(meeting.notes);
      }
      if (meeting.summary !== void 0) {
        fields.push("summary = ?");
        values.push(meeting.summary);
      }
      if (meeting.chatMessages !== void 0) {
        fields.push("chat_messages = ?");
        values.push(JSON.stringify(meeting.chatMessages));
      }
      if (meeting.updatedAt !== void 0) {
        fields.push("updated_at = ?");
        values.push(meeting.updatedAt);
      }
      if (meeting.duration !== void 0) {
        fields.push("duration = ?");
        values.push(meeting.duration);
      }
      if (fields.length === 0) {
        resolve();
        return;
      }
      values.push(id);
      const sql = `UPDATE meetings SET ${fields.join(", ")} WHERE id = ?`;
      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  async deleteMeeting(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.run("DELETE FROM meetings WHERE id = ?", [id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  // Settings operations
  async getSettings() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      this.db.get("SELECT * FROM settings LIMIT 1", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          reject(new Error("No settings found"));
          return;
        }
        resolve(this.rowToSettings(row));
      });
    });
  }
  async updateSettings(settings) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }
      const fields = [];
      const values = [];
      Object.entries(settings).forEach(([key, value]) => {
        if (key !== "id" && value !== void 0) {
          const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
          fields.push(`${dbKey} = ?`);
          values.push(value);
        }
      });
      if (fields.length === 0) {
        resolve();
        return;
      }
      const sql = `UPDATE settings SET ${fields.join(", ")} WHERE id = 1`;
      this.db.run(sql, values, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  rowToMeeting(row) {
    const parseRecordingPath = (pathData) => {
      if (!pathData) return "";
      try {
        const parsed = JSON.parse(pathData);
        return Array.isArray(parsed) ? parsed : pathData;
      } catch {
        return pathData;
      }
    };
    return {
      id: row.id,
      recordingPath: parseRecordingPath(row.recording_path),
      transcript: JSON.parse(row.transcript),
      title: row.title,
      description: row.description,
      tags: JSON.parse(row.tags),
      actionItems: JSON.parse(row.action_items),
      context: row.context,
      context_files: row.context_files ? JSON.parse(row.context_files) : [],
      notes: row.notes,
      summary: row.summary,
      chatMessages: row.chat_messages ? JSON.parse(row.chat_messages) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      duration: row.duration
    };
  }
  rowToSettings(row) {
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
      includeContextInActionItems: Boolean(row.include_context_in_action_items),
      aiProvider: row.ai_provider,
      ollamaModel: row.ollama_model,
      ollamaApiUrl: row.ollama_api_url
    };
  }
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
const databaseService = new DatabaseService();
async function seedDatabase() {
  try {
    const existingMeetings = await databaseService.getAllMeetings();
    if (existingMeetings.length === 0) {
      console.log("Database initialized successfully");
    } else {
      console.log("Database already contains meetings, skipping seed");
    }
  } catch (error) {
    console.error("Failed to check database status:", error);
  }
}
class GeminiService {
  apiKey = null;
  setApiKey(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || null;
  }
  async makeGeminiRequest(prompt, model = "gemini-1.5-pro-latest") {
    console.log("🔑 Gemini API Key check:", { hasKey: !!this.apiKey, keyLength: this.apiKey?.length || 0 });
    if (!this.apiKey) {
      console.error("❌ Gemini API key not configured");
      return { success: false, error: "Gemini API key not configured" };
    }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_ONLY_HIGH"
            }
          ]
        })
      });
      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Gemini API error: ${response.status} - ${errorData}` };
      }
      const data = await response.json();
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        return { success: false, error: `Content blocked by safety filters: ${data.promptFeedback.blockReason}` };
      }
      if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        if (candidate.finishReason === "SAFETY") {
          return { success: false, error: "Response blocked by safety filters" };
        }
        if (candidate && candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts) && candidate.content.parts.length > 0) {
          const content = candidate.content.parts[0].text;
          return { success: true, content };
        }
      }
      console.error("Unexpected Gemini API response structure:", JSON.stringify(data, null, 2));
      console.error("Response keys:", Object.keys(data));
      if (data.candidates) {
        console.error("Candidates length:", data.candidates.length);
        if (data.candidates.length > 0) {
          console.error("First candidate:", JSON.stringify(data.candidates[0], null, 2));
        }
      }
      return { success: false, error: "No content generated by Gemini - unexpected response structure" };
    } catch (error) {
      return { success: false, error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateMeetingContent(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `You are an AI assistant helping to analyze a meeting recording. Please generate a comprehensive analysis based on the following information:

MEETING CONTEXT:
Title: ${options.existingTitle}
Global Context: ${options.globalContext}
Meeting-Specific Context: ${options.meetingContext}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes}

DEBUG INFO:
- Global Context Length: ${options.globalContext?.length || 0} characters
- Meeting Context Length: ${options.meetingContext?.length || 0} characters
- Transcript Lines: ${options.transcript?.length || 0}
- Notes Length: ${options.notes?.length || 0} characters

Please provide your response in the following JSON format (ensure it's valid JSON with escaped quotes):
{
  "summary": "A concise 2-3 sentence summary of the meeting's main points and outcomes",
  "description": "A more detailed description of what was discussed and accomplished (2-3 paragraphs)",
  "actionItems": [
    {
      "id": 1,
      "text": "Action item description",
      "completed": false
    }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Guidelines:
- Summary: Keep it concise but capture the essence of the meeting
- Description: Provide context about the meeting type, participants, and key discussions
- Action Items: Extract clear, actionable tasks mentioned or implied in the discussion
- Tags: Generate 3-5 relevant tags for categorization (lowercase, single words or short phrases)
- Ensure the JSON is properly formatted and escaped`;
      const result = await this.makeGeminiRequest(prompt);
      if (!result.success || !result.content) {
        return { success: false, error: result.error || "Failed to generate content" };
      }
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return { success: false, error: "No valid JSON found in Gemini response" };
        }
        const parsedData = JSON.parse(jsonMatch[0]);
        if (!parsedData.summary || !parsedData.description || !parsedData.actionItems || !parsedData.tags) {
          return { success: false, error: "Invalid response structure from Gemini" };
        }
        const actionItems = parsedData.actionItems.map((item, index) => ({
          id: item.id || Date.now() + index,
          text: item.text || "",
          completed: item.completed || false
        }));
        return {
          success: true,
          data: {
            summary: parsedData.summary,
            description: parsedData.description,
            actionItems,
            tags: Array.isArray(parsedData.tags) ? parsedData.tags : []
          }
        };
      } catch (parseError) {
        return { success: false, error: `Failed to parse Gemini response: ${parseError instanceof Error ? parseError.message : "Unknown error"}` };
      }
    } catch (error) {
      return { success: false, error: `Generation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateSummaryOnly(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `Please provide a comprehensive, well-structured summary of this meeting using proper HTML formatting:

CONTEXT: ${options.globalContext}
MEETING CONTEXT: ${options.meetingContext}
TRANSCRIPT:
${transcriptText}
NOTES:
${options.notes}

Please create a detailed summary that includes:
- **Key Discussion Points**: Main topics and important discussions
- **Decisions Made**: Any decisions or conclusions reached
- **Action Items**: Tasks or next steps identified
- **Important Details**: Relevant specifics, numbers, dates, or commitments mentioned

Format your response using proper HTML with:
- <h3> tags for section headings
- <p> tags for paragraphs
- <ul> and <li> tags for lists
- <strong> tags for emphasis
- <em> tags for important details

Make it comprehensive but well-organized and easy to read. Focus on actionable insights and key takeaways.`;
      const result = await this.makeGeminiRequest(prompt);
      if (!result.success || !result.content) {
        return { success: false, error: result.error || "Failed to generate summary" };
      }
      return { success: true, summary: result.content.trim() };
    } catch (error) {
      return { success: false, error: `Summary generation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateMessage(options) {
    try {
      const { type, data } = options;
      const model = options.model || "gemini-1.5-pro-latest";
      const contextSections = [];
      if (data.globalContext) {
        contextSections.push(`GLOBAL CONTEXT:
${data.globalContext}`);
      }
      if (data.meetingContext) {
        contextSections.push(`MEETING CONTEXT:
${data.meetingContext}`);
      }
      if (data.title) {
        contextSections.push(`TITLE:
${data.title}`);
      }
      if (data.description) {
        contextSections.push(`DESCRIPTION:
${data.description}`);
      }
      if (data.summary) {
        contextSections.push(`SUMMARY:
${data.summary}`);
      }
      if (data.notes) {
        contextSections.push(`NOTES:
${data.notes}`);
      }
      if (data.transcript) {
        contextSections.push(`TRANSCRIPT:
${data.transcript}`);
      }
      if (data.actionItems && data.actionItems.length > 0) {
        const actionItemsText = data.actionItems.map((item) => `- ${item.text}${item.completed ? " (completed)" : ""}`).join("\n");
        contextSections.push(`ACTION ITEMS:
${actionItemsText}`);
      }
      if (data.questionHistory && data.questionHistory.length > 0) {
        const qaText = data.questionHistory.slice(-5).map((qa) => `Q: ${qa.question}
A: ${qa.answer}`).join("\n\n");
        contextSections.push(`QUESTIONS & ANSWERS:
${qaText}`);
      }
      const followupSections = [];
      if (data.followupQuestions && data.followupQuestions.length > 0) {
        followupSections.push(`Suggested Questions:
${data.followupQuestions.map((q) => `- ${q}`).join("\n")}`);
      }
      if (data.followupRisks && data.followupRisks.length > 0) {
        followupSections.push(`Identified Risks:
${data.followupRisks.map((r) => `- ${r}`).join("\n")}`);
      }
      if (data.followupComments && data.followupComments.length > 0) {
        followupSections.push(`AI Comments:
${data.followupComments.map((c) => `- ${c}`).join("\n")}`);
      }
      if (followupSections.length > 0) {
        contextSections.push(`FOLLOW-UP INSIGHTS:
${followupSections.join("\n\n")}`);
      }
      const contextText = contextSections.join("\n\n");
      let prompt = "";
      if (type === "slack") {
        prompt = `You are an AI assistant helping to create a Slack message about a meeting. Please generate a professional Slack message based on the following information:

${contextText}

Please create a well-formatted Slack message that:
- Is professional yet conversational for team communication
- Highlights key points and outcomes
- Includes action items if any
- References important Q&A points if available
- Mentions follow-up insights or risks if relevant
- Uses appropriate Slack formatting (bold for emphasis, bullet points for lists)
- Is concise but informative (aim for under 500 words)
- Suitable for posting in a team channel

Generate only the message content in rich text format, no additional explanations.`;
      } else {
        prompt = `You are an AI assistant helping to create an email about a meeting. Please generate a professional email based on the following information:

${contextText}

Please create a well-formatted email message that:
- Has a professional tone suitable for business communication
- Includes a clear structure with paragraphs
- Highlights key points and outcomes
- Includes action items if any
- References important Q&A discussions if available
- Mentions follow-up insights, risks, or suggestions if relevant
- Uses appropriate formatting for email (headings, bullet points)
- Is comprehensive but well-organized
- Suitable for sending to stakeholders or team members

Generate only the email body content in rich text format, no subject line or additional explanations.`;
      }
      const result = await this.makeGeminiRequest(prompt, model);
      if (!result.success || !result.content) {
        return { success: false, error: result.error || "Failed to generate message" };
      }
      return { success: true, message: result.content.trim() };
    } catch (error) {
      return { success: false, error: `Message generation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateFollowupQuestions(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `You are an AI assistant analyzing an ongoing meeting transcript. Based on the current transcript and context, please provide a summary of the latest information and predict what the next sentence in the transcript might be.

MEETING CONTEXT:
Title: ${options.title || "Meeting"}
Context: ${options.context || "No specific context"}
Description: ${options.description || "No description"}

CURRENT TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes || "No notes"}

SUMMARY SO FAR:
${options.summary || "No summary yet"}

Please provide your response in the following JSON format:
{
  "transcriptSummary": "A concise summary of the latest and most important information from the transcript",
  "predictedNextSentence": "A realistic prediction of what might be said next based on the conversation flow and context"
}

Guidelines:
- Transcript Summary: Summarize the most recent and relevant information from the conversation, focusing on the current topic and key points
- Predicted Next Sentence: Analyze the conversation flow, context, and patterns to predict what someone might realistically say next. Consider:
  - The current speaker and topic
  - Natural conversation patterns
  - Unresolved questions or incomplete thoughts
  - Meeting dynamics and typical responses
- Make predictions realistic and contextually appropriate
- Ensure the JSON is properly formatted`;
      const result = await this.makeGeminiRequest(prompt);
      if (!result.success || !result.content) {
        return { success: false, error: result.error || "Failed to generate transcript prediction" };
      }
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return { success: false, error: "No valid JSON found in Gemini response" };
        }
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            transcriptSummary: parsedData.transcriptSummary || "No summary available",
            predictedNextSentence: parsedData.predictedNextSentence || "Unable to predict next sentence"
          }
        };
      } catch (parseError) {
        return { success: false, error: `Failed to parse Gemini response: ${parseError instanceof Error ? parseError.message : "Unknown error"}` };
      }
    } catch (error) {
      return { success: false, error: `Transcript prediction generation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async askQuestion(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `You are an AI assistant with access to both meeting information and general knowledge. Please answer the user's question using:
1. The available meeting data (primary source when relevant)
2. Your general knowledge to provide comprehensive context and insights
3. Best practices and expertise relevant to the topic

MEETING CONTEXT:
Title: ${options.title || "Meeting"}
Description: ${options.description || "No description"}
Context: ${options.context || "No specific context"}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes || "No notes"}

SUMMARY:
${options.summary || "No summary"}

USER QUESTION:
${options.question}

Instructions:
- If the question relates to specific meeting content, reference the transcript, notes, or summary directly
- If the question requires general knowledge or expertise, provide comprehensive insights from your knowledge base
- Combine meeting-specific information with general knowledge for a complete answer
- If you're making connections or providing context beyond the meeting data, make it clear what's from the meeting vs. your general knowledge
- Be helpful, accurate, and thorough
- Use specific examples from the meeting when available
- Provide actionable insights and recommendations when appropriate

Respond with a well-structured, informative answer that combines both sources appropriately.`;
      const result = await this.makeGeminiRequest(prompt, "gemini-2.0-flash-exp");
      if (!result.success || !result.content) {
        return { success: false, error: result.error || "Failed to get answer" };
      }
      return { success: true, answer: result.content.trim() };
    } catch (error) {
      return { success: false, error: `Question answering failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
}
const geminiService = new GeminiService();
class OllamaService {
  apiUrl = "http://localhost:11434";
  model = "mistral:7b";
  ollamaProcess = null;
  isOllamaRunning = false;
  setApiUrl(url) {
    this.apiUrl = url;
  }
  setModel(model) {
    this.model = model;
  }
  async ensureOllamaRunning() {
    if (this.isOllamaRunning) {
      return true;
    }
    try {
      const response = await fetch(`${this.apiUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5e3)
      });
      if (response.ok) {
        this.isOllamaRunning = true;
        return true;
      }
    } catch (error) {
      console.log("Ollama not running, attempting to start...");
    }
    return this.startOllama();
  }
  async startOllama() {
    return new Promise((resolve) => {
      try {
        this.ollamaProcess = child_process.spawn("ollama", ["serve"], {
          stdio: "pipe",
          detached: false
        });
        this.ollamaProcess.on("spawn", () => {
          console.log("🦙 Ollama process started");
          setTimeout(async () => {
            try {
              const response = await fetch(`${this.apiUrl}/api/tags`, {
                method: "GET",
                signal: AbortSignal.timeout(1e4)
              });
              if (response.ok) {
                this.isOllamaRunning = true;
                console.log("✅ Ollama is running and responding");
                resolve(true);
              } else {
                console.log("❌ Ollama started but not responding properly");
                resolve(false);
              }
            } catch (error) {
              console.log("❌ Failed to connect to Ollama after starting:", error);
              resolve(false);
            }
          }, 3e3);
        });
        this.ollamaProcess.on("error", (error) => {
          console.error("❌ Failed to start Ollama:", error);
          resolve(false);
        });
        this.ollamaProcess.on("exit", (code) => {
          console.log(`🦙 Ollama process exited with code ${code}`);
          this.isOllamaRunning = false;
          this.ollamaProcess = null;
        });
      } catch (error) {
        console.error("❌ Error spawning Ollama process:", error);
        resolve(false);
      }
    });
  }
  async ensureModelAvailable() {
    try {
      const response = await fetch(`${this.apiUrl}/api/show`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: this.model }),
        signal: AbortSignal.timeout(1e4)
      });
      if (response.ok) {
        return true;
      }
      console.log(`📥 Model ${this.model} not found, attempting to pull...`);
      const pullResponse = await fetch(`${this.apiUrl}/api/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: this.model }),
        signal: AbortSignal.timeout(3e5)
        // 5 minutes timeout for model download
      });
      return pullResponse.ok;
    } catch (error) {
      console.error(`❌ Failed to ensure model ${this.model} is available:`, error);
      return false;
    }
  }
  async makeOllamaRequest(prompt) {
    console.log(`🦙 Making Ollama request with model: ${this.model}`);
    const isRunning = await this.ensureOllamaRunning();
    if (!isRunning) {
      return { success: false, error: "Failed to start Ollama service" };
    }
    const modelAvailable = await this.ensureModelAvailable();
    if (!modelAvailable) {
      return { success: false, error: `Model ${this.model} is not available and could not be downloaded` };
    }
    try {
      const response = await fetch(`${this.apiUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_k: 40,
            top_p: 0.95,
            num_predict: 2048
          }
        }),
        signal: AbortSignal.timeout(12e4)
        // 2 minutes timeout
      });
      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Ollama API error: ${response.status} - ${errorData}` };
      }
      const data = await response.json();
      if (data.response) {
        return { success: true, content: data.response };
      }
      return { success: false, error: "No response generated by Ollama" };
    } catch (error) {
      return { success: false, error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateMeetingContent(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `You are an AI assistant helping to analyze a meeting recording. Please generate a comprehensive analysis based on the following information:

MEETING CONTEXT:
Title: ${options.existingTitle}
Global Context: ${options.globalContext}
Meeting-Specific Context: ${options.meetingContext}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes}

Please provide your response in the following JSON format (ensure it's valid JSON with escaped quotes):
{
  "summary": "A comprehensive summary of the meeting (3-4 sentences)",
  "description": "A detailed description covering key topics, decisions, and outcomes",
  "actionItems": [
    {
      "id": 1,
      "text": "Action item description",
      "completed": false
    }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Response:`;
      const result = await this.makeOllamaRequest(prompt);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      try {
        const content = result.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            summary: parsedData.summary || "",
            actionItems: parsedData.actionItems || [],
            description: parsedData.description || "",
            tags: parsedData.tags || []
          }
        };
      } catch (parseError) {
        console.error("Failed to parse Ollama response:", parseError);
        return { success: false, error: "Failed to parse AI response as JSON" };
      }
    } catch (error) {
      return { success: false, error: `Error generating content: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateSummaryOnly(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `Please provide a concise summary of this meeting transcript:

CONTEXT: ${options.globalContext}
MEETING CONTEXT: ${options.meetingContext}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes}

Please provide a 2-3 sentence summary focusing on key decisions, outcomes, and next steps:`;
      const result = await this.makeOllamaRequest(prompt);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        summary: result.content || ""
      };
    } catch (error) {
      return { success: false, error: `Error generating summary: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateMessage(options) {
    try {
      const messageType = options.type === "slack" ? "Slack message" : "professional email";
      const prompt = `Generate a ${messageType} based on the following meeting information:

Global Context: ${options.data.globalContext}
Meeting Context: ${options.data.meetingContext}
Title: ${options.data.title || "Meeting"}
Description: ${options.data.description || ""}
Summary: ${options.data.summary || ""}
Notes: ${options.data.notes || ""}

${options.data.actionItems && options.data.actionItems.length > 0 ? `Action Items:
${options.data.actionItems.map((item) => `- ${item.text}`).join("\n")}` : ""}

Please write a ${messageType} that summarizes the key points and next steps. 
${options.type === "slack" ? "Keep it conversational and concise." : "Use professional email format with proper greeting and signature."}

Message:`;
      const result = await this.makeOllamaRequest(prompt);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        message: result.content || ""
      };
    } catch (error) {
      return { success: false, error: `Error generating message: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async generateFollowupQuestions(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `Based on this meeting transcript, provide a summary and predict what might be discussed next:

Title: ${options.title || "Meeting"}
Description: ${options.description || ""}
Context: ${options.context || ""}
Notes: ${options.notes || ""}

TRANSCRIPT:
${transcriptText}

Please provide:
1. A brief summary of what was discussed
2. A prediction of what might be discussed next

Format as JSON:
{
  "transcriptSummary": "Brief summary here",
  "predictedNextSentence": "Prediction of next discussion topic"
}

Response:`;
      const result = await this.makeOllamaRequest(prompt);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      try {
        const content = result.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            transcriptSummary: parsedData.transcriptSummary || "",
            predictedNextSentence: parsedData.predictedNextSentence || ""
          }
        };
      } catch (parseError) {
        return { success: false, error: "Failed to parse AI response as JSON" };
      }
    } catch (error) {
      return { success: false, error: `Error generating followup questions: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async askQuestion(options) {
    try {
      const transcriptText = options.transcript.map((line) => `[${line.time}] ${line.text}`).join("\n");
      const prompt = `You are an AI assistant with access to a meeting transcript. Please answer the user's question based on the information provided.

MEETING INFORMATION:
Title: ${options.title || "Meeting"}
Description: ${options.description || ""}
Context: ${options.context || ""}
Notes: ${options.notes || ""}
Summary: ${options.summary || ""}

TRANSCRIPT:
${transcriptText}

USER QUESTION: ${options.question}

Please provide a helpful and accurate answer based on the meeting information. If the information isn't available in the transcript, please say so.

Answer:`;
      const result = await this.makeOllamaRequest(prompt);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        answer: result.content || ""
      };
    } catch (error) {
      return { success: false, error: `Error answering question: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  }
  async cleanup() {
    if (this.ollamaProcess && !this.ollamaProcess.killed) {
      console.log("🦙 Stopping Ollama process...");
      this.ollamaProcess.kill("SIGTERM");
      this.ollamaProcess = null;
      this.isOllamaRunning = false;
    }
  }
}
const ollamaService = new OllamaService();
class FirstRunSetupService {
  setupWindow = null;
  setupProcess = null;
  progressCallback = null;
  constructor() {
    this.checkFirstRun();
  }
  checkFirstRun() {
    const userDataPath = electron.app.getPath("userData");
    const setupCompleteFlag = path__namespace.join(userDataPath, ".friday-setup-complete");
    if (!fs__namespace.existsSync(setupCompleteFlag)) {
      console.log("🚀 First run detected, setup required");
    } else {
      console.log("✅ Setup already completed");
    }
  }
  async isFirstRun() {
    const userDataPath = electron.app.getPath("userData");
    const setupCompleteFlag = path__namespace.join(userDataPath, ".friday-setup-complete");
    return !fs__namespace.existsSync(setupCompleteFlag);
  }
  markSetupComplete() {
    const userDataPath = electron.app.getPath("userData");
    const setupCompleteFlag = path__namespace.join(userDataPath, ".friday-setup-complete");
    try {
      fs__namespace.writeFileSync(setupCompleteFlag, JSON.stringify({
        setupDate: (/* @__PURE__ */ new Date()).toISOString(),
        version: electron.app.getVersion()
      }));
      console.log("✅ Setup marked as complete");
    } catch (error) {
      console.error("Failed to mark setup as complete:", error);
    }
  }
  getBundledExecutablePath() {
    const isDev = process.env.NODE_ENV === "development";
    const resourcesPath = isDev ? path__namespace.join(process.cwd(), "resources") : path__namespace.join(process.resourcesPath, "resources");
    return path__namespace.join(resourcesPath, "friday_ollama");
  }
  updateProgress(step, progress, message) {
    const progressData = { step, progress, message };
    console.log(`📦 Setup Progress: ${step} (${progress}%) - ${message}`);
    if (this.progressCallback) {
      this.progressCallback(progressData);
    }
    if (this.setupWindow && !this.setupWindow.isDestroyed()) {
      this.setupWindow.webContents.send("setup-progress", progressData);
    }
  }
  async checkDependencies() {
    const bundledExecutablePath = this.getBundledExecutablePath();
    return {
      python: await this.checkPythonInstallation(),
      ollama: await this.checkOllamaInstallation(),
      bundledExecutable: fs__namespace.existsSync(bundledExecutablePath)
    };
  }
  async checkPythonInstallation() {
    return new Promise((resolve) => {
      const pythonCheck = child_process.spawn("python3", ["--version"]);
      pythonCheck.on("close", (code) => {
        resolve(code === 0);
      });
      pythonCheck.on("error", () => {
        resolve(false);
      });
    });
  }
  async checkOllamaInstallation() {
    return new Promise((resolve) => {
      const ollamaCheck = child_process.spawn("which", ["ollama"]);
      ollamaCheck.on("close", (code) => {
        resolve(code === 0);
      });
      ollamaCheck.on("error", () => {
        resolve(false);
      });
    });
  }
  async runSetup(progressCallback) {
    this.progressCallback = progressCallback || null;
    try {
      this.updateProgress("starting", 0, "Initializing setup...");
      const deps = await this.checkDependencies();
      this.updateProgress("checking", 10, "Checking dependencies...");
      const result = {
        success: false,
        installed: {
          python: deps.python || deps.bundledExecutable,
          ollama: false,
          models: []
        }
      };
      if (!deps.python && !deps.bundledExecutable) {
        this.updateProgress("python", 20, "Python not found. Please install Python 3.8+ or use bundled version.");
        const response = await electron.dialog.showMessageBox({
          type: "warning",
          title: "Python Required",
          message: "Friday requires Python for local AI features.",
          detail: "You can install Python from python.org or continue without local AI features.",
          buttons: ["Install Python", "Continue without local AI", "Cancel"],
          defaultId: 0,
          cancelId: 2
        });
        if (response.response === 2) {
          throw new Error("Setup cancelled by user");
        } else if (response.response === 1) {
          this.updateProgress("python", 30, "Continuing without local AI features...");
          result.installed.python = false;
        } else {
          electron.shell.openExternal("https://www.python.org/downloads/");
          throw new Error("Please install Python and restart Friday");
        }
      } else {
        this.updateProgress("python", 30, "Python available ✅");
        result.installed.python = true;
      }
      if (result.installed.python) {
        this.updateProgress("ollama", 40, "Checking Ollama installation...");
        const bundledExecutablePath = this.getBundledExecutablePath();
        if (fs__namespace.existsSync(bundledExecutablePath)) {
          this.updateProgress("ollama", 50, "Setting up Ollama...");
          const setupSuccess = await this.runBundledSetup(bundledExecutablePath);
          if (setupSuccess) {
            this.updateProgress("ollama", 80, "Ollama setup complete ✅");
            result.installed.ollama = true;
            result.installed.models = ["mistral:7b", "qwen2.5:1.5b"];
          } else {
            this.updateProgress("ollama", 60, "Ollama setup failed - will use cloud AI only");
            result.installed.ollama = false;
          }
        } else {
          this.updateProgress("ollama", 60, "Bundled executable not found - will use cloud AI only");
          result.installed.ollama = false;
        }
      }
      this.updateProgress("verifying", 90, "Verifying installation...");
      const finalCheck = await this.checkDependencies();
      if (finalCheck.ollama || finalCheck.bundledExecutable) {
        this.updateProgress("complete", 100, "Setup complete! Friday is ready to use.");
        this.markSetupComplete();
        result.success = true;
      } else {
        this.updateProgress("complete", 100, "Setup complete! Using cloud AI only.");
        this.markSetupComplete();
        result.success = true;
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.updateProgress("error", 0, `Setup failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        installed: {
          python: false,
          ollama: false,
          models: []
        }
      };
    }
  }
  async runBundledSetup(executablePath) {
    return new Promise((resolve) => {
      this.updateProgress("ollama", 55, "Running Ollama setup...");
      const setupProcess = child_process.spawn(executablePath, ["--setup"], {
        stdio: "pipe"
      });
      let output = "";
      setupProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;
        if (text.includes("Installing")) {
          this.updateProgress("ollama", 60, "Installing Ollama...");
        } else if (text.includes("Downloading")) {
          this.updateProgress("ollama", 70, "Downloading AI models...");
        } else if (text.includes("ready")) {
          this.updateProgress("ollama", 75, "Models ready");
        }
      });
      setupProcess.stderr?.on("data", (data) => {
        console.error("Setup stderr:", data.toString());
      });
      setupProcess.on("close", (code) => {
        if (code === 0) {
          this.updateProgress("ollama", 80, "Ollama setup completed successfully");
          resolve(true);
        } else {
          console.error("Setup failed with code:", code);
          console.error("Setup output:", output);
          resolve(false);
        }
      });
      setupProcess.on("error", (error) => {
        console.error("Setup process error:", error);
        resolve(false);
      });
      setTimeout(() => {
        if (!setupProcess.killed) {
          setupProcess.kill();
          resolve(false);
        }
      }, 10 * 60 * 1e3);
    });
  }
  async showSetupDialog() {
    const response = await electron.dialog.showMessageBox({
      type: "info",
      title: "Welcome to Friday!",
      message: "First-time setup required",
      detail: "Friday can set up local AI features for enhanced privacy. This will download and install Ollama and AI models (~2GB). You can also skip this and use cloud AI only.",
      buttons: ["Setup Local AI (Recommended)", "Use Cloud AI Only", "Cancel"],
      defaultId: 0,
      cancelId: 2
    });
    if (response.response === 2) {
      return false;
    } else if (response.response === 1) {
      this.markSetupComplete();
      return true;
    } else {
      const setupResult = await this.runSetup();
      return setupResult.success;
    }
  }
  createSetupWindow() {
    this.setupWindow = new electron.BrowserWindow({
      width: 600,
      height: 400,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path__namespace.join(__dirname, "../preload/index.js")
      }
    });
    const setupHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Friday Setup</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; text-align: center; }
        .progress { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; margin: 20px 0; }
        .progress-bar { height: 100%; background: #007AFF; border-radius: 10px; transition: width 0.3s; }
        .step { margin: 20px 0; font-size: 18px; }
        .message { color: #666; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>🎉 Welcome to Friday!</h1>
    <div class="step" id="step">Initializing...</div>
    <div class="progress">
        <div class="progress-bar" id="progress-bar" style="width: 0%"></div>
    </div>
    <div class="message" id="message">Setting up Friday for you...</div>
    
    <script>
        window.api?.on?.('setup-progress', (progress) => {
            document.getElementById('step').textContent = progress.step
            document.getElementById('progress-bar').style.width = progress.progress + '%'
            document.getElementById('message').textContent = progress.message
        })
    <\/script>
</body>
</html>`;
    this.setupWindow.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(setupHtml));
    return this.setupWindow;
  }
  cleanup() {
    if (this.setupProcess && !this.setupProcess.killed) {
      this.setupProcess.kill();
    }
    if (this.setupWindow && !this.setupWindow.isDestroyed()) {
      this.setupWindow.close();
    }
  }
}
const firstRunSetupService = new FirstRunSetupService();
let mainWindow = null;
let transcriptionProcess = null;
let transcriptionSocket = null;
let isTranscriptionReady = false;
let isTranscriptionStarting = false;
let actualTranscriptionPort = 9001;
let swiftRecorderProcess = null;
let isSwiftRecorderAvailable = false;
let currentRecordingPath = null;
let currentRecordingFilename = null;
let isStoppingRecording = false;
let currentShortcuts = {
  "toggleRecording": "CmdOrCtrl+Alt+R",
  "quickNote": "CmdOrCtrl+Alt+N",
  "showHide": "CmdOrCtrl+Shift+H",
  "pauseResume": "CmdOrCtrl+Alt+P"
};
const activeChunkedRecordings = /* @__PURE__ */ new Map();
const CHUNK_DURATION_MS = 5 * 60 * 1e3;
const CHUNK_SIZE_LIMIT = 50 * 1024 * 1024;
async function requestMicrophonePermission() {
  try {
    const hasPermission = electron.systemPreferences.getMediaAccessStatus("microphone");
    console.log("🎤 Current microphone permission status:", hasPermission);
    if (hasPermission === "granted") {
      console.log("✅ Microphone permission already granted");
      return true;
    }
    if (hasPermission === "denied") {
      console.log("❌ Microphone permission denied - please enable in System Preferences");
      return false;
    }
    if (hasPermission === "not-determined") {
      console.log("🔐 Requesting microphone permission...");
      const granted = await electron.systemPreferences.askForMediaAccess("microphone");
      console.log(granted ? "✅ Permission granted!" : "❌ Permission denied");
      return granted;
    }
    return false;
  } catch (error) {
    console.error("❌ Error requesting microphone permission:", error);
    return false;
  }
}
async function requestScreenCapturePermission() {
  try {
    const hasPermission = electron.systemPreferences.getMediaAccessStatus("screen");
    console.log("🖥️ Current screen capture permission status:", hasPermission);
    if (hasPermission === "granted") {
      console.log("✅ Screen capture permission already granted");
      return true;
    }
    if (hasPermission === "denied") {
      console.log("❌ Screen capture permission denied - please enable in System Preferences");
      return false;
    }
    if (hasPermission === "not-determined") {
      console.log("🔐 Requesting screen capture permission...");
      electron.dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Screen Recording Permission Required",
        message: "Friday needs screen recording permission to capture system audio.",
        detail: "You will be prompted to grant screen recording permission. Please enable it in System Preferences.",
        buttons: ["Continue"],
        defaultId: 0
      });
      electron.systemPreferences.openSystemPreferences("security", "Privacy_ScreenCapture");
      return new Promise((resolve) => {
        const checkPermission = () => {
          const currentStatus = electron.systemPreferences.getMediaAccessStatus("screen");
          if (currentStatus === "granted") {
            console.log("✅ Screen capture permission granted!");
            resolve(true);
          } else if (currentStatus === "denied") {
            console.log("❌ Screen capture permission denied");
            resolve(false);
          } else {
            setTimeout(checkPermission, 1e3);
          }
        };
        checkPermission();
      });
    }
    return false;
  } catch (error) {
    console.error("❌ Error requesting screen capture permission:", error);
    return false;
  }
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1e3,
    height: 800,
    minWidth: 1e3,
    minHeight: 800,
    maxWidth: 1e3,
    maxHeight: 800,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIcon(),
    // Use proper icon resolution function
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
      // Allow blob URLs for audio playback
    }
  });
  mainWindow.on("ready-to-show", async () => {
    const isFirstRun = await firstRunSetupService.isFirstRun();
    if (isFirstRun) {
      console.log("🚀 First run detected, showing setup dialog");
      const setupSuccess = await firstRunSetupService.showSetupDialog();
      if (!setupSuccess) {
        console.log("❌ Setup cancelled, exiting");
        electron.app.quit();
        return;
      }
    }
    mainWindow?.show();
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" || input.key === "f" && input.control && input.meta) {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function getAppIcon() {
  console.log("🔍 Resolving app icon for platform:", process.platform);
  if (process.platform === "darwin") {
    const icnsPath = path__namespace.join(__dirname, "../../build/icon.icns");
    console.log("🔍 Checking for macOS icon at:", icnsPath);
    if (fs__namespace.existsSync(icnsPath)) {
      console.log("✅ Using macOS .icns icon:", icnsPath);
      return icnsPath;
    }
  } else if (process.platform === "win32") {
    const icoPath = path__namespace.join(__dirname, "../../build/icon.ico");
    console.log("🔍 Checking for Windows icon at:", icoPath);
    if (fs__namespace.existsSync(icoPath)) {
      console.log("✅ Using Windows .ico icon:", icoPath);
      return icoPath;
    }
  }
  const pngPath = path__namespace.join(__dirname, "../../build/icon.png");
  console.log("🔍 Checking for PNG icon at:", pngPath);
  if (fs__namespace.existsSync(pngPath)) {
    console.log("✅ Using PNG icon:", pngPath);
    return pngPath;
  }
  const resourcesPath = path__namespace.join(__dirname, "../../resources/FridayLogoOnly.png");
  console.log("🔍 Checking for resources icon at:", resourcesPath);
  if (fs__namespace.existsSync(resourcesPath)) {
    console.log("✅ Using resources icon:", resourcesPath);
    return resourcesPath;
  }
  console.log("⚠️ Using bundled fallback icon:", icon);
  return icon;
}
async function checkSwiftRecorderAvailability() {
  return new Promise((resolve) => {
    const recorderPath = path__namespace.join(process.cwd(), "Recorder");
    if (!fs__namespace.existsSync(recorderPath)) {
      console.log("❌ Swift recorder binary not found at:", recorderPath);
      resolve(false);
      return;
    }
    console.log("✅ Swift recorder binary found at:", recorderPath);
    resolve(true);
  });
}
function ensureRecordingDirectory(dirPath) {
  try {
    const resolvedPath = dirPath.startsWith("~/") ? path__namespace.join(os__namespace.homedir(), dirPath.slice(2)) : dirPath;
    console.log("📂 Ensuring recording directory exists:", resolvedPath);
    if (!fs__namespace.existsSync(resolvedPath)) {
      fs__namespace.mkdirSync(resolvedPath, { recursive: true });
      console.log("✅ Created recording directory:", resolvedPath);
    }
    const testFile = path__namespace.join(resolvedPath, ".test-write-permissions");
    try {
      fs__namespace.writeFileSync(testFile, "test");
      fs__namespace.unlinkSync(testFile);
      console.log("✅ Recording directory has write permissions");
    } catch (permError) {
      console.error("❌ No write permissions for recording directory:", permError);
      return { success: false, error: "No write permissions for recording directory" };
    }
    return { success: true, path: resolvedPath };
  } catch (error) {
    console.error("❌ Failed to ensure recording directory:", error);
    return { success: false, error: `Failed to create recording directory: ${error}` };
  }
}
const audioDeviceManager = {
  async getCurrentDevice() {
    try {
      console.log("🔊 Getting current audio device...");
      const result = await new Promise((resolve) => {
        const { spawn: spawn2 } = require("child_process");
        const swift = spawn2("swift", [path__namespace.join(process.cwd(), "fix-bluetooth-audio.swift")]);
        let output = "";
        swift.stdout.on("data", (data) => {
          output += data.toString();
        });
        swift.on("close", (code) => {
          if (code === 0) {
            const lines = output.split("\n");
            const deviceLine = lines.find((line) => line.includes("Current audio device:"));
            const bluetoothLine = lines.find((line) => line.includes("Is Bluetooth:"));
            if (deviceLine && bluetoothLine) {
              const deviceName = deviceLine.split("'")[1] || "Unknown";
              const isBluetooth = bluetoothLine.includes("true");
              resolve({
                success: true,
                deviceName,
                isBluetooth
              });
            } else {
              resolve({
                success: false,
                error: "Could not parse device information"
              });
            }
          } else {
            resolve({
              success: false,
              error: "Audio device check failed"
            });
          }
        });
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
  async switchToBuiltInSpeakers() {
    try {
      console.log("🔊 Switching to built-in speakers for recording...");
      return {
        success: true,
        message: "Audio will be temporarily switched during recording and automatically restored after"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
  async enableBluetoothWorkaround() {
    try {
      console.log("🔧 Running Bluetooth audio restoration...");
      const { spawn: spawn2 } = require("child_process");
      const result = await new Promise((resolve) => {
        const swift = spawn2("swift", [path__namespace.join(process.cwd(), "fix-bluetooth-audio.swift")]);
        let output = "";
        swift.stdout.on("data", (data) => {
          output += data.toString();
        });
        swift.on("close", (code) => {
          if (code === 0) {
            if (output.includes("Successfully switched audio to:")) {
              resolve({
                success: true,
                message: "Bluetooth audio restored successfully"
              });
            } else if (output.includes("already using a Bluetooth device")) {
              resolve({
                success: true,
                message: "Audio is already configured correctly"
              });
            } else {
              resolve({
                success: false,
                error: "Could not restore Bluetooth audio"
              });
            }
          } else {
            resolve({
              success: false,
              error: "Audio restoration failed"
            });
          }
        });
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
  async prepareForRecording() {
    try {
      console.log("🎙️ Preparing audio devices for recording...");
      const currentDevices = {
        input: await this.getCurrentInputDevice(),
        output: await this.getCurrentOutputDevice()
      };
      const hasBluetoothDevice = await this.hasConnectedBluetoothDevice();
      if (hasBluetoothDevice) {
        console.log("🎧 Bluetooth audio device detected");
      }
      await this.validateAudioRouting();
      return {
        success: true,
        previousDevices: currentDevices,
        message: "Audio devices prepared for recording"
      };
    } catch (error) {
      console.error("❌ Failed to prepare audio devices:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
  async validateAudioRouting() {
    try {
      const inputDevice = await this.getCurrentInputDevice();
      if (!inputDevice) {
        throw new Error("No audio input device found");
      }
      const deviceInfo = await this.getDeviceInfo();
      if (deviceInfo.sampleRate !== 44100) {
        console.warn(`⚠️ Input device sample rate (${deviceInfo.sampleRate}Hz) differs from recording rate (44100Hz)`);
      }
      return true;
    } catch (error) {
      console.error("❌ Audio routing validation failed:", error);
      throw error;
    }
  },
  async hasConnectedBluetoothDevice() {
    try {
      const devices = await this.getAudioDevices();
      return devices.some(
        (device) => device.name.toLowerCase().includes("bluetooth") || device.name.toLowerCase().includes("airpods") || device.name.toLowerCase().includes("headphones") || device.name.toLowerCase().includes("headset")
      );
    } catch (error) {
      console.error("❌ Failed to check for Bluetooth devices:", error);
      return false;
    }
  },
  async getCurrentInputDevice() {
    const device = await this.getCurrentDevice();
    return device.success ? device.deviceName : null;
  },
  async getCurrentOutputDevice() {
    return null;
  },
  async getDeviceInfo() {
    return {
      sampleRate: 44100,
      channels: 2,
      format: "PCM"
    };
  },
  async getAudioDevices() {
    try {
      const result = await this.getCurrentDevice();
      return result.success && result.deviceName ? [{ name: result.deviceName }] : [];
    } catch (error) {
      console.error("Failed to get audio devices:", error);
      return [];
    }
  },
  async switchToBuiltInDevices() {
    return this.switchToBuiltInSpeakers();
  }
};
async function startCombinedRecording(recordingPath, filename) {
  try {
    const devicePrep = await audioDeviceManager.prepareForRecording();
    if (!devicePrep.success) {
      return {
        success: false,
        error: "Failed to prepare audio devices",
        cause: devicePrep.error,
        solution: "Try disconnecting and reconnecting your audio devices, or restart the application"
      };
    }
    const hasScreenPermission = await requestScreenCapturePermission();
    if (!hasScreenPermission) {
      return {
        success: false,
        error: "Screen recording permission required for system audio capture",
        solution: "Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording"
      };
    }
    return new Promise((resolve) => {
      databaseService.getSettings().then((settings) => {
        const finalPath = recordingPath || settings.defaultSaveLocation || path__namespace.join(os__namespace.homedir(), "Friday Recordings");
        const dirResult = ensureRecordingDirectory(finalPath);
        if (!dirResult.success) {
          resolve({
            success: false,
            error: dirResult.error || "Failed to create recording directory"
          });
          return;
        }
        const resolvedPath = dirResult.path;
        const recorderPath = path__namespace.join(process.cwd(), "Recorder");
        currentRecordingPath = resolvedPath;
        let baseFilename;
        if (filename) {
          baseFilename = filename.replace(/\.(wav|mp3|flac)$/, "");
          currentRecordingFilename = `${baseFilename}.flac`;
        } else {
          const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          baseFilename = `combined-${timestamp}`;
          currentRecordingFilename = `${baseFilename}.flac`;
        }
        const outputPath = path__namespace.join(currentRecordingPath, currentRecordingFilename);
        console.log("📁 Recording will be saved to:", outputPath);
        console.log("🎯 Current recording path:", currentRecordingPath);
        console.log("📄 Current recording filename:", currentRecordingFilename);
        console.log("🎙️ Starting ScreenCaptureKit recording...");
        const args = [
          "--record",
          resolvedPath,
          "--filename",
          baseFilename,
          "--live-transcription"
          // Enable live transcription chunks
        ];
        console.log("Command:", recorderPath, args.join(" "));
        swiftRecorderProcess = child_process.spawn(recorderPath, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env }
        });
        let hasStarted = false;
        let outputReceived = false;
        let lastOutputTime = Date.now();
        const outputTimeoutId = setTimeout(() => {
          if (!outputReceived) {
            console.log("❌ No output received from Swift recorder within 10 seconds");
            if (swiftRecorderProcess) {
              swiftRecorderProcess.kill("SIGTERM");
              swiftRecorderProcess = null;
            }
            resolve({
              success: false,
              error: "Swift recorder failed to start - no output received",
              cause: "The recorder process may have crashed or failed to initialize",
              solution: "Check that screen recording permissions are granted and try restarting the app"
            });
          }
        }, 1e4);
        const hangDetectionInterval = setInterval(() => {
          const timeSinceLastOutput = Date.now() - lastOutputTime;
          if (timeSinceLastOutput > 15e3 && !hasStarted) {
            console.log("❌ Swift recorder appears to be hanging");
            clearInterval(hangDetectionInterval);
            clearTimeout(outputTimeoutId);
            if (swiftRecorderProcess) {
              console.log("🛑 Terminating hanging Swift recorder process");
              swiftRecorderProcess.kill("SIGKILL");
              swiftRecorderProcess = null;
            }
            if (!hasStarted) {
              resolve({
                success: false,
                error: "Recording process hung during initialization",
                cause: "The Swift recorder process stopped responding",
                solution: "This may indicate permission issues or system conflicts. Try restarting the app."
              });
            }
          }
        }, 5e3);
        swiftRecorderProcess.stdout?.on("data", (data) => {
          outputReceived = true;
          lastOutputTime = Date.now();
          const output = data.toString().trim();
          console.log("📤 Swift recorder output:", output);
          try {
            const response = JSON.parse(output);
            if (response.code === "RECORDING_STARTED") {
              hasStarted = true;
              clearTimeout(outputTimeoutId);
              clearInterval(hangDetectionInterval);
              console.log("✅ ScreenCaptureKit recording started successfully");
              console.log("📝 Output file:", response.path);
              currentRecordingPath = path__namespace.dirname(response.path);
              currentRecordingFilename = path__namespace.basename(response.path);
              resolve({
                success: true,
                path: response.path,
                warning: "Recording in FLAC format - will be converted to MP3 when stopped"
              });
            } else if (response.code === "TRANSCRIPTION_CHUNK") {
              console.log("🎵 Received system audio transcription chunk:", {
                path: response.path,
                stream_type: response.stream_type,
                socket_available: !!(transcriptionSocket && !transcriptionSocket.destroyed)
              });
              if (transcriptionSocket && !transcriptionSocket.destroyed) {
                const request = {
                  type: "dual_stream_chunk",
                  audio_path: response.path,
                  stream_type: response.stream_type || "system"
                };
                console.log("📤 Sending system audio chunk request:", request);
                try {
                  transcriptionSocket.write(JSON.stringify(request) + "\n");
                  console.log("✅ Successfully sent system audio chunk for transcription");
                } catch (error) {
                  console.error("❌ Failed to send system audio chunk:", error);
                }
              } else {
                console.warn("⚠️ Transcription socket not available for system audio chunk:", {
                  socket_exists: !!transcriptionSocket,
                  socket_destroyed: transcriptionSocket?.destroyed
                });
              }
            } else if (response.code === "DEBUG") {
              console.log("🔍 Swift recorder debug:", response.message);
            } else if (response.code === "PERMISSION_DENIED") {
              clearTimeout(outputTimeoutId);
              clearInterval(hangDetectionInterval);
              resolve({
                success: false,
                error: "Screen recording permission denied",
                solution: "Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording"
              });
            } else if (response.code === "NO_DISPLAY_FOUND") {
              clearTimeout(outputTimeoutId);
              clearInterval(hangDetectionInterval);
              resolve({
                success: false,
                error: "No display found for recording",
                solution: "Ensure your display is connected and try again"
              });
            } else if (response.code === "CAPTURE_FAILED") {
              clearTimeout(outputTimeoutId);
              clearInterval(hangDetectionInterval);
              resolve({
                success: false,
                error: "Failed to start screen capture",
                solution: "Check screen recording permissions and try again"
              });
            }
          } catch {
            console.log("📝 Non-JSON output from Swift recorder:", output);
          }
        });
        swiftRecorderProcess.stderr?.on("data", (data) => {
          outputReceived = true;
          lastOutputTime = Date.now();
          const error = data.toString().trim();
          console.error("❌ Swift recorder error:", error);
        });
        swiftRecorderProcess.on("close", (code) => {
          clearTimeout(outputTimeoutId);
          clearInterval(hangDetectionInterval);
          console.log(`🔚 Swift recorder process exited with code: ${code}`);
          if (!hasStarted) {
            resolve({
              success: false,
              error: `Swift recorder exited with code ${code}`,
              solution: "Check the console for error details and ensure all permissions are granted"
            });
          }
        });
        swiftRecorderProcess.on("error", (error) => {
          console.error("Swift recorder error:", error);
          clearTimeout(outputTimeoutId);
          clearInterval(hangDetectionInterval);
          if (!hasStarted) {
            resolve({ success: false, error: error.message });
          }
        });
        setTimeout(() => {
          if (!hasStarted) {
            clearInterval(hangDetectionInterval);
            if (swiftRecorderProcess) {
              console.log("❌ TIMEOUT: Force terminating Swift recorder after 30 seconds");
              swiftRecorderProcess.kill("SIGKILL");
              swiftRecorderProcess = null;
            }
            resolve({
              success: false,
              error: "Recording start timeout after 30 seconds",
              cause: "Swift recorder failed to initialize within timeout period",
              solution: "This may indicate system audio routing conflicts or permission issues. Try restarting the app or switching audio devices."
            });
          }
        }, 3e4);
      }).catch((error) => {
        console.error("Failed to get settings:", error);
        resolve({ success: false, error: "Failed to get settings" });
      });
    });
  } catch (error) {
    console.error("❌ Failed to start recording:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      solution: "Please check your audio device connections and permissions"
    };
  }
}
async function stopCombinedRecording() {
  return new Promise((resolve) => {
    if (!swiftRecorderProcess) {
      resolve({ success: false, error: "No recording in progress" });
      return;
    }
    if (isStoppingRecording) {
      resolve({ success: false, error: "Recording is already being stopped" });
      return;
    }
    isStoppingRecording = true;
    console.log("🛑 Stopping ScreenCaptureKit recording...");
    let hasResponded = false;
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        console.log("❌ Timeout waiting for recording to stop, force killing process");
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill("SIGKILL");
          swiftRecorderProcess = null;
        }
        isStoppingRecording = false;
        resolve({
          success: false,
          error: "Timeout stopping recording",
          warning: "Recording may have been saved but conversion failed"
        });
      }
    }, 15e3);
    const handleStopOutput = (data) => {
      const output = data.toString().trim();
      console.log("📤 Stop output:", output);
      try {
        const response = JSON.parse(output);
        if (response.code === "RECORDING_STOPPED") {
          hasResponded = true;
          clearTimeout(timeout);
          console.log("✅ ScreenCaptureKit recording stopped");
          const flacPath = response.path || (currentRecordingPath && currentRecordingFilename ? path__namespace.join(currentRecordingPath, currentRecordingFilename) : null);
          if (flacPath && fs__namespace.existsSync(flacPath)) {
            console.log("🔄 Converting FLAC to MP3...");
            convertFlacToMp3(flacPath).then(async (mp3Path) => {
              console.log("✅ Conversion completed:", mp3Path);
              try {
                fs__namespace.unlinkSync(flacPath);
                console.log("🗑️ Cleaned up FLAC file");
              } catch (cleanupError) {
                console.warn("⚠️ Failed to clean up FLAC file:", cleanupError);
              }
              console.log("📝 Starting transcription of recording...");
              const transcriptionResult = await transcribeRecording(mp3Path);
              swiftRecorderProcess = null;
              isStoppingRecording = false;
              if (transcriptionResult.success) {
                resolve({
                  success: true,
                  path: mp3Path,
                  warning: "Recording converted from FLAC to MP3",
                  transcript: transcriptionResult.transcript
                });
              } else {
                resolve({
                  success: true,
                  path: mp3Path,
                  warning: `Recording converted from FLAC to MP3. Transcription failed: ${transcriptionResult.error}`
                });
              }
            }).catch((conversionError) => {
              console.error("❌ FLAC to MP3 conversion failed:", conversionError);
              swiftRecorderProcess = null;
              isStoppingRecording = false;
              resolve({
                success: true,
                path: flacPath,
                warning: "Recording saved as FLAC (MP3 conversion failed)"
              });
            });
          } else {
            console.warn("⚠️ Recording file not found:", flacPath);
            swiftRecorderProcess = null;
            isStoppingRecording = false;
            resolve({
              success: false,
              error: "Recording file not found after stopping"
            });
          }
        }
      } catch {
        console.log("📝 Non-JSON stop output:", output);
      }
    };
    swiftRecorderProcess.stdout?.on("data", handleStopOutput);
    swiftRecorderProcess.stderr?.on("data", handleStopOutput);
    swiftRecorderProcess.kill("SIGINT");
    swiftRecorderProcess.on("close", (code) => {
      console.log(`🔚 Swift recorder stopped with code: ${code}`);
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        const possibleFlacPath = currentRecordingPath && currentRecordingFilename ? path__namespace.join(currentRecordingPath, currentRecordingFilename) : null;
        if (possibleFlacPath && fs__namespace.existsSync(possibleFlacPath)) {
          console.log("🔄 Converting FLAC to MP3 (fallback)...");
          convertFlacToMp3(possibleFlacPath).then(async (mp3Path) => {
            console.log("✅ Fallback conversion completed:", mp3Path);
            try {
              fs__namespace.unlinkSync(possibleFlacPath);
              console.log("🗑️ Cleaned up FLAC file");
            } catch (cleanupError) {
              console.warn("⚠️ Failed to clean up FLAC file:", cleanupError);
            }
            console.log("📝 Starting transcription of recording (fallback)...");
            const transcriptionResult = await transcribeRecording(mp3Path);
            swiftRecorderProcess = null;
            isStoppingRecording = false;
            if (transcriptionResult.success) {
              resolve({
                success: true,
                path: mp3Path,
                warning: "Recording converted from FLAC to MP3 (fallback)",
                transcript: transcriptionResult.transcript
              });
            } else {
              resolve({
                success: true,
                path: mp3Path,
                warning: `Recording converted from FLAC to MP3 (fallback). Transcription failed: ${transcriptionResult.error}`
              });
            }
          }).catch((conversionError) => {
            console.error("❌ Fallback FLAC to MP3 conversion failed:", conversionError);
            swiftRecorderProcess = null;
            isStoppingRecording = false;
            resolve({
              success: true,
              path: possibleFlacPath,
              warning: "Recording saved as FLAC (MP3 conversion failed)"
            });
          });
        } else {
          swiftRecorderProcess = null;
          isStoppingRecording = false;
          resolve({
            success: false,
            error: "Recording stopped but file not found"
          });
        }
      }
    });
  });
}
async function convertFlacToMp3(flacPath) {
  return new Promise((resolve, reject) => {
    const mp3Path = flacPath.replace(".flac", ".mp3");
    console.log(`🔄 Converting: ${flacPath} -> ${mp3Path}`);
    const ffmpeg2 = child_process__namespace.spawn("ffmpeg", [
      "-i",
      flacPath,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-y",
      // Overwrite output file
      mp3Path
    ], { stdio: "pipe" });
    let errorOutput = "";
    ffmpeg2.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    ffmpeg2.on("close", (code) => {
      if (code === 0 && fs__namespace.existsSync(mp3Path)) {
        const stats = fs__namespace.statSync(mp3Path);
        if (stats.size > 1e3) {
          console.log(`✅ FLAC to MP3 conversion successful: ${stats.size} bytes`);
          resolve(mp3Path);
        } else {
          console.error("❌ MP3 file too small, conversion may have failed");
          reject(new Error("MP3 file too small"));
        }
      } else {
        console.error(`❌ FFmpeg conversion failed with code: ${code}`);
        console.error("FFmpeg error output:", errorOutput);
        reject(new Error(`FFmpeg conversion failed: ${code}`));
      }
    });
    ffmpeg2.on("error", (error) => {
      console.error("❌ FFmpeg process error:", error);
      reject(error);
    });
  });
}
async function transcribeRecording(audioPath) {
  try {
    console.log("📝 Sending recording to transcription service...");
    if (!isTranscriptionReady) {
      console.log("⚠️ Transcription service not ready, skipping transcription");
      return {
        success: false,
        error: "Transcription service not ready"
      };
    }
    if (!fs__namespace.existsSync(audioPath)) {
      console.error("❌ Audio file not found:", audioPath);
      return {
        success: false,
        error: "Audio file not found"
      };
    }
    const audioBuffer = fs__namespace.readFileSync(audioPath);
    console.log(`📁 Read audio file: ${audioBuffer.length} bytes`);
    return new Promise((resolve) => {
      if (!transcriptionSocket) {
        resolve({
          success: false,
          error: "Transcription socket not connected"
        });
        return;
      }
      const handleTranscriptionData = (data) => {
        try {
          const lines = data.toString().split("\n").filter((line) => line.trim());
          for (const line of lines) {
            const result = JSON.parse(line);
            if (result.type === "transcript") {
              console.log("✅ Recording transcription completed");
              console.log("📝 Transcript:", result.text);
              transcriptionSocket?.off("data", handleTranscriptionData);
              clearTimeout(timeout);
              resolve({
                success: true,
                transcript: result.text
              });
              return;
            } else if (result.type === "error") {
              console.error("❌ Transcription error:", result.message);
              transcriptionSocket?.off("data", handleTranscriptionData);
              clearTimeout(timeout);
              resolve({
                success: false,
                error: result.message
              });
              return;
            }
          }
        } catch (error) {
          console.error("❌ Error parsing transcription response:", error);
        }
      };
      const timeout = setTimeout(() => {
        console.log("⏰ Transcription timeout");
        transcriptionSocket?.off("data", handleTranscriptionData);
        resolve({
          success: false,
          error: "Transcription timeout"
        });
      }, 6e4);
      transcriptionSocket.on("data", handleTranscriptionData);
      try {
        transcriptionSocket.write(audioPath + "\n");
        console.log(`📤 Sent recording path for transcription: ${audioPath}`);
      } catch (error) {
        clearTimeout(timeout);
        transcriptionSocket?.off("data", handleTranscriptionData);
        console.error("❌ Error sending audio path for transcription:", error);
        resolve({
          success: false,
          error: "Failed to send audio path for transcription"
        });
      }
    });
  } catch (error) {
    console.error("❌ Error in transcribeRecording:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
function startTranscriptionService() {
  return new Promise((resolve, reject) => {
    console.log("🎤 Starting transcription socket server...");
    const pythonPath = path__namespace.join(process.cwd(), "venv", "bin", "python");
    const scriptPath = path__namespace.join(process.cwd(), "transcribe.py");
    if (!fs__namespace.existsSync(pythonPath)) {
      console.error("Python virtual environment not found at:", pythonPath);
      reject(new Error("Python virtual environment not found"));
      return;
    }
    if (!fs__namespace.existsSync(scriptPath)) {
      console.error("Transcription script not found at:", scriptPath);
      reject(new Error("Transcription script not found"));
      return;
    }
    transcriptionProcess = child_process.spawn(pythonPath, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    transcriptionProcess.on("error", (error) => {
      console.error("Failed to start transcription process:", error);
      reject(error);
    });
    transcriptionProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      const portMatch = output.match(/Socket server listening on port (\d+)/);
      if (portMatch) {
        actualTranscriptionPort = parseInt(portMatch[1]);
        console.log(`📍 Transcription server using port: ${actualTranscriptionPort}`);
        return;
      }
      if (output === "READY") {
        console.log("📞 Connecting to transcription socket...");
        connectToTranscriptionSocket().then(() => {
          isTranscriptionReady = true;
          isTranscriptionStarting = false;
          console.log("✅ Transcription service ready");
          resolve();
        }).catch((error) => {
          isTranscriptionStarting = false;
          reject(error);
        });
        return;
      }
      console.log("Transcription output:", output);
    });
    transcriptionProcess.stderr?.on("data", (data) => {
      console.log("Transcription stderr:", data.toString());
    });
    transcriptionProcess.on("close", (code) => {
      console.log(`Transcription process exited with code ${code}`);
      isTranscriptionReady = false;
      transcriptionProcess = null;
      if (transcriptionSocket) {
        transcriptionSocket.destroy();
        transcriptionSocket = null;
      }
    });
    setTimeout(() => {
      if (!isTranscriptionReady) {
        isTranscriptionStarting = false;
        reject(new Error("Transcription service startup timeout"));
      }
    }, 3e4);
  });
}
function connectToTranscriptionSocket() {
  return new Promise((resolve, reject) => {
    if (transcriptionSocket) {
      transcriptionSocket.destroy();
    }
    transcriptionSocket = new net__namespace.Socket();
    transcriptionSocket.setKeepAlive(true, 6e4);
    transcriptionSocket.connect(actualTranscriptionPort, "localhost", () => {
      console.log(`🔌 Connected to transcription socket server on port ${actualTranscriptionPort}`);
      resolve();
    });
    transcriptionSocket.on("data", (data) => {
      try {
        const lines = data.toString().split("\n").filter((line) => line.trim());
        for (const line of lines) {
          const result = JSON.parse(line);
          if (mainWindow) {
            mainWindow.webContents.send("transcription-result", result);
          }
          console.log(
            "📝 Transcription result:",
            result.type,
            result.text?.substring(0, 50) || result.message
          );
        }
      } catch (error) {
        console.error("Failed to parse transcription result:", error);
      }
    });
    transcriptionSocket.on("error", (error) => {
      console.error("Socket error:", error);
      if (!isTranscriptionReady) {
        reject(error);
      }
    });
    transcriptionSocket.on("close", () => {
      console.log("📞 Socket connection closed - keeping service ready for reconnection");
      transcriptionSocket = null;
      if (transcriptionProcess && !transcriptionProcess.killed) {
        console.log("🔄 Attempting to reconnect to transcription service in 3 seconds...");
        setTimeout(() => {
          if (transcriptionProcess && !transcriptionProcess.killed && !transcriptionSocket && isTranscriptionReady) {
            connectToTranscriptionSocket().then(() => {
              console.log("✅ Reconnected to transcription service");
            }).catch((error) => {
              console.error("Failed to reconnect to transcription service:", error);
              isTranscriptionReady = false;
            });
          }
        }, 3e3);
      } else {
        isTranscriptionReady = false;
      }
    });
  });
}
function stopTranscriptionService() {
  if (transcriptionSocket) {
    console.log("🛑 Closing socket connection...");
    transcriptionSocket.destroy();
    transcriptionSocket = null;
  }
  if (transcriptionProcess) {
    console.log("🛑 Stopping transcription service...");
    transcriptionProcess.kill("SIGTERM");
    transcriptionProcess = null;
  }
  isTranscriptionReady = false;
  isTranscriptionStarting = false;
}
function saveAudioChunk(audioBuffer, streamType = "microphone") {
  const tempDir = os__namespace.tmpdir();
  const fileName = `audio_chunk_${streamType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webm`;
  const filePath = path__namespace.join(tempDir, fileName);
  fs__namespace.writeFileSync(filePath, audioBuffer);
  return filePath;
}
function saveCompleteRecording(audioBuffer, meetingId) {
  return new Promise((resolve, reject) => {
    databaseService.getSettings().then((settings) => {
      const recordingsDir = settings.defaultSaveLocation || path__namespace.join(os__namespace.homedir(), "Friday Recordings");
      if (!fs__namespace.existsSync(recordingsDir)) {
        fs__namespace.mkdirSync(recordingsDir, { recursive: true });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const webmFileName = `meeting_${meetingId}_${timestamp}.webm`;
      const mp3FileName = `meeting_${meetingId}_${timestamp}.mp3`;
      const webmFilePath = path__namespace.join(recordingsDir, webmFileName);
      const mp3FilePath = path__namespace.join(recordingsDir, mp3FileName);
      try {
        fs__namespace.writeFileSync(webmFilePath, audioBuffer);
        console.log(`💾 WebM recording saved to: ${webmFilePath}`);
        ffmpeg(webmFilePath).noVideo().audioBitrate("192k").audioFrequency(44100).save(mp3FilePath).on("end", () => {
          console.log(`🎵 Conversion finished: ${mp3FilePath}`);
          try {
            fs__namespace.unlinkSync(webmFilePath);
            console.log(`🗑️ Cleaned up temporary WebM file`);
          } catch (cleanupError) {
            console.warn("Failed to clean up WebM file:", cleanupError);
          }
          resolve(mp3FilePath);
        }).on("error", (err) => {
          console.error(`❌ FFmpeg conversion error: ${err.message}`);
          console.log("📁 Falling back to WebM file");
          resolve(webmFilePath);
        });
      } catch (error) {
        console.error("Failed to save recording:", error);
        reject(error);
      }
    }).catch((error) => {
      console.error("Failed to get settings:", error);
      reject(error);
    });
  });
}
function createRecordingChunk(meetingId, audioBuffer, chunkIndex) {
  return new Promise((resolve, reject) => {
    const recordingsDir = path__namespace.join(os__namespace.homedir(), "Friday Recordings", `meeting_${meetingId}_chunks`);
    if (!fs__namespace.existsSync(recordingsDir)) {
      fs__namespace.mkdirSync(recordingsDir, { recursive: true });
    }
    const timestamp = Date.now();
    const chunkId = `chunk_${chunkIndex}_${timestamp}`;
    const webmFileName = `${chunkId}.webm`;
    const mp3FileName = `${chunkId}.mp3`;
    const webmFilePath = path__namespace.join(recordingsDir, webmFileName);
    const mp3FilePath = path__namespace.join(recordingsDir, mp3FileName);
    try {
      fs__namespace.writeFileSync(webmFilePath, audioBuffer);
      console.log(`💾 Chunk ${chunkIndex} saved: ${webmFilePath} (${audioBuffer.length} bytes)`);
      ffmpeg(webmFilePath).noVideo().audioBitrate("128k").audioFrequency(44100).save(mp3FilePath).on("end", () => {
        console.log(`🎵 Chunk ${chunkIndex} converted: ${mp3FilePath}`);
        const stats = fs__namespace.statSync(mp3FilePath);
        const chunk = {
          id: chunkId,
          path: mp3FilePath,
          startTime: timestamp,
          endTime: timestamp + CHUNK_DURATION_MS,
          size: stats.size
        };
        try {
          fs__namespace.unlinkSync(webmFilePath);
        } catch (cleanupError) {
          console.warn("Failed to clean up WebM chunk:", cleanupError);
        }
        resolve(chunk);
      }).on("error", (err) => {
        console.error(`❌ Chunk ${chunkIndex} conversion error: ${err.message}`);
        const stats = fs__namespace.statSync(webmFilePath);
        const chunk = {
          id: chunkId,
          path: webmFilePath,
          startTime: timestamp,
          endTime: timestamp + CHUNK_DURATION_MS,
          size: stats.size
        };
        resolve(chunk);
      });
    } catch (error) {
      console.error("Failed to create recording chunk:", error);
      reject(error);
    }
  });
}
function startChunkedRecording(meetingId) {
  const chunkedRecording = {
    meetingId,
    chunks: [],
    isActive: true,
    totalDuration: 0
  };
  activeChunkedRecordings.set(meetingId, chunkedRecording);
  console.log(`🎬 Started chunked recording for meeting ${meetingId}`);
  return chunkedRecording;
}
async function addChunkToRecording(meetingId, audioBuffer) {
  const recording = activeChunkedRecordings.get(meetingId);
  if (!recording || !recording.isActive) {
    return false;
  }
  try {
    const chunkIndex = recording.chunks.length;
    const chunk = await createRecordingChunk(meetingId, audioBuffer, chunkIndex);
    recording.chunks.push(chunk);
    console.log(`✅ Added chunk ${chunkIndex} to meeting ${meetingId} (${chunk.size} bytes)`);
    updateMeetingChunks(meetingId, recording.chunks).catch((error) => {
      console.error("Background chunk save failed:", error);
    });
    return true;
  } catch (error) {
    console.error("Failed to add chunk to recording:", error);
    return false;
  }
}
async function updateMeetingChunks(meetingId, chunks) {
  try {
    const meeting = await databaseService.getMeeting(meetingId);
    if (!meeting) return;
    const chunkPaths = chunks.map((chunk) => chunk.path);
    await databaseService.updateMeeting(meetingId, {
      recordingPath: chunkPaths,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log(`💾 Background saved ${chunks.length} chunks for meeting ${meetingId}`);
  } catch (error) {
    console.error("Failed to update meeting chunks:", error);
  }
}
async function stopChunkedRecording(meetingId) {
  const recording = activeChunkedRecordings.get(meetingId);
  if (!recording) {
    return [];
  }
  recording.isActive = false;
  const chunkPaths = recording.chunks.map((chunk) => chunk.path);
  await updateMeetingChunks(meetingId, recording.chunks);
  activeChunkedRecordings.delete(meetingId);
  console.log(`🏁 Stopped chunked recording for meeting ${meetingId} (${recording.chunks.length} chunks)`);
  return chunkPaths;
}
function setupTranscriptionHandlers() {
  electron.ipcMain.handle("transcription:start-service", async () => {
    try {
      if (isTranscriptionReady) {
        console.log("✅ Transcription service already ready, skipping start");
        return { success: true };
      }
      if (isTranscriptionStarting) {
        console.log("⏳ Transcription service already starting, waiting...");
        return { success: true };
      }
      console.log("🎤 Starting transcription service (not ready)...");
      isTranscriptionStarting = true;
      await startTranscriptionService();
      return { success: true };
    } catch (error) {
      console.error("Failed to start transcription service:", error);
      isTranscriptionStarting = false;
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("transcription:stop-service", () => {
    stopTranscriptionService();
    return { success: true };
  });
  electron.ipcMain.handle("transcription:is-ready", () => {
    const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed;
    const serviceReady = isTranscriptionReady && !isTranscriptionStarting;
    const processRunning = transcriptionProcess && !transcriptionProcess.killed;
    return {
      ready: serviceReady && socketConnected && processRunning,
      details: {
        serviceReady,
        socketConnected,
        processRunning,
        isStarting: isTranscriptionStarting
      }
    };
  });
  electron.ipcMain.handle("transcription:process-chunk", async (_, audioBuffer) => {
    const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed;
    const serviceReady = isTranscriptionReady && !isTranscriptionStarting;
    const processRunning = transcriptionProcess && !transcriptionProcess.killed;
    if (!serviceReady) {
      return { success: false, error: "Transcription service not ready or still starting" };
    }
    if (!socketConnected) {
      return { success: false, error: "Socket connection not available" };
    }
    if (!processRunning) {
      return { success: false, error: "Transcription process not running" };
    }
    try {
      const buffer = Buffer.from(audioBuffer);
      const filePath = saveAudioChunk(buffer);
      transcriptionSocket.write(filePath + "\n");
      return { success: true };
    } catch (error) {
      console.error("Failed to process audio chunk:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("transcription:process-dual-stream-chunk", async (_, audioBuffer, streamType) => {
    const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed;
    const serviceReady = isTranscriptionReady && !isTranscriptionStarting;
    const processRunning = transcriptionProcess && !transcriptionProcess.killed;
    if (!serviceReady) {
      return { success: false, error: "Transcription service not ready or still starting" };
    }
    if (!socketConnected) {
      return { success: false, error: "Socket connection not available" };
    }
    if (!processRunning) {
      return { success: false, error: "Transcription process not running" };
    }
    try {
      const buffer = Buffer.from(audioBuffer);
      const filePath = saveAudioChunk(buffer, streamType);
      const request = {
        type: "dual_stream_chunk",
        audio_path: filePath,
        stream_type: streamType
      };
      transcriptionSocket.write(JSON.stringify(request) + "\n");
      return { success: true };
    } catch (error) {
      console.error(`Failed to process ${streamType} audio chunk:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("transcription:ping", () => {
    return { ready: isTranscriptionReady };
  });
  electron.ipcMain.handle(
    "transcription:save-recording",
    async (_, audioBuffer, meetingId) => {
      try {
        const buffer = Buffer.from(audioBuffer);
        const filePath = await saveCompleteRecording(buffer, meetingId);
        return { success: true, filePath };
      } catch (error) {
        console.error("Failed to save complete recording:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
  electron.ipcMain.handle(
    "transcription:load-recording",
    async (_, filePath) => {
      try {
        const resolvedPath = path__namespace.resolve(filePath);
        if (!fs__namespace.existsSync(resolvedPath)) {
          return { success: false, error: "Recording file not found" };
        }
        const buffer = fs__namespace.readFileSync(resolvedPath);
        return { success: true, buffer: buffer.buffer };
      } catch (error) {
        console.error("Failed to load recording:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
  electron.ipcMain.handle("alerts:check-keywords", async (_, options) => {
    try {
      const socketConnected = transcriptionSocket && !transcriptionSocket.destroyed;
      const serviceReady = isTranscriptionReady && !isTranscriptionStarting;
      if (!serviceReady || !socketConnected) {
        return { success: false, error: "Transcription service not ready for alerts" };
      }
      return new Promise((resolve) => {
        const handleAlertResponse = (data) => {
          try {
            const lines = data.toString().split("\n").filter((line) => line.trim());
            for (const line of lines) {
              const response = JSON.parse(line);
              if (response.hasOwnProperty("success") && response.hasOwnProperty("matches")) {
                transcriptionSocket.removeListener("data", handleAlertResponse);
                resolve(response);
                return;
              }
            }
          } catch (error) {
            console.error("Failed to parse alert response:", error);
            transcriptionSocket.removeListener("data", handleAlertResponse);
            resolve({ success: false, error: "Failed to parse alert response" });
          }
        };
        transcriptionSocket.on("data", handleAlertResponse);
        const alertRequest = JSON.stringify({
          type: "check_alerts",
          transcript: options.transcript,
          keywords: options.keywords
        });
        transcriptionSocket.write(alertRequest);
        setTimeout(() => {
          transcriptionSocket.removeListener("data", handleAlertResponse);
          resolve({ success: false, error: "Alert check timeout" });
        }, 1e4);
      });
    } catch (error) {
      console.error("Failed to check alerts:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("swift-recorder:check-availability", async () => {
    return { available: isSwiftRecorderAvailable };
  });
  electron.ipcMain.handle(
    "swift-recorder:start-combined-recording",
    async (_, recordingPath, filename) => {
      try {
        const result = await startCombinedRecording(recordingPath, filename);
        return result;
      } catch (error) {
        console.error("Failed to start combined recording:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
  electron.ipcMain.handle("swift-recorder:stop-combined-recording", async () => {
    try {
      const result = await stopCombinedRecording();
      return result;
    } catch (error) {
      console.error("Failed to stop combined recording:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("chunked-recording:start", async (_, meetingId) => {
    try {
      const recording = startChunkedRecording(meetingId);
      return { success: true, recording };
    } catch (error) {
      console.error("Failed to start chunked recording:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("chunked-recording:add-chunk", async (_, meetingId, audioBuffer) => {
    try {
      const buffer = Buffer.from(audioBuffer);
      if (buffer.length > CHUNK_SIZE_LIMIT) {
        console.warn(`⚠️ Chunk size ${buffer.length} exceeds limit ${CHUNK_SIZE_LIMIT}, splitting...`);
      }
      const success = await addChunkToRecording(meetingId, buffer);
      return { success };
    } catch (error) {
      console.error("Failed to add chunk to recording:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("chunked-recording:stop", async (_, meetingId) => {
    try {
      const chunkPaths = await stopChunkedRecording(meetingId);
      return { success: true, chunkPaths };
    } catch (error) {
      console.error("Failed to stop chunked recording:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("chunked-recording:load-chunks", async (_, chunkPaths) => {
    try {
      const chunks = [];
      for (const chunkPath of chunkPaths) {
        if (fs__namespace.existsSync(chunkPath)) {
          const buffer = fs__namespace.readFileSync(chunkPath);
          chunks.push(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        }
      }
      return { success: true, chunks };
    } catch (error) {
      console.error("Failed to load recording chunks:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
function setupDatabaseHandlers() {
  electron.ipcMain.handle("db:createMeeting", async (_, meeting) => {
    return await databaseService.createMeeting(meeting);
  });
  electron.ipcMain.handle("db:getMeeting", async (_, id) => {
    return await databaseService.getMeeting(id);
  });
  electron.ipcMain.handle("db:getAllMeetings", async () => {
    return await databaseService.getAllMeetings();
  });
  electron.ipcMain.handle("db:updateMeeting", async (_, id, meeting) => {
    return await databaseService.updateMeeting(id, meeting);
  });
  electron.ipcMain.handle("db:deleteMeeting", async (_, id) => {
    return await databaseService.deleteMeeting(id);
  });
  electron.ipcMain.handle("db:getSettings", async () => {
    return await databaseService.getSettings();
  });
  electron.ipcMain.handle("db:updateSettings", async (_, settings) => {
    const result = await databaseService.updateSettings(settings);
    if (settings.geminiApiKey !== void 0) {
      geminiService.setApiKey(settings.geminiApiKey);
    }
    return result;
  });
}
function setupGeminiHandlers() {
  electron.ipcMain.handle("gemini:generate-content", async (_, options) => {
    try {
      const result = await geminiService.generateMeetingContent(options);
      return result;
    } catch (error) {
      console.error("Failed to generate content with Gemini:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("gemini:generate-summary", async (_, options) => {
    try {
      const result = await geminiService.generateSummaryOnly(options);
      return result;
    } catch (error) {
      console.error("Failed to generate summary with Gemini:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("gemini:generate-message", async (_, options) => {
    try {
      const result = await geminiService.generateMessage(options);
      return result;
    } catch (error) {
      console.error("Failed to generate message with Gemini:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("gemini:generate-followup-questions", async (_, options) => {
    try {
      const result = await geminiService.generateFollowupQuestions(options);
      return result;
    } catch (error) {
      console.error("Failed to generate followup questions with Gemini:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("gemini:ask-question", async (_, options) => {
    try {
      const result = await geminiService.askQuestion(options);
      return result;
    } catch (error) {
      console.error("Failed to ask question with Gemini:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
function setupOllamaHandlers() {
  electron.ipcMain.handle("ollama:generate-content", async (_, options) => {
    try {
      const result = await ollamaService.generateMeetingContent(options);
      return result;
    } catch (error) {
      console.error("Failed to generate content with Ollama:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:generate-summary", async (_, options) => {
    try {
      const result = await ollamaService.generateSummaryOnly(options);
      return result;
    } catch (error) {
      console.error("Failed to generate summary with Ollama:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:generate-message", async (_, options) => {
    try {
      const result = await ollamaService.generateMessage(options);
      return result;
    } catch (error) {
      console.error("Failed to generate message with Ollama:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:generate-followup-questions", async (_, options) => {
    try {
      const result = await ollamaService.generateFollowupQuestions(options);
      return result;
    } catch (error) {
      console.error("Failed to generate followup questions with Ollama:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:ask-question", async (_, options) => {
    try {
      const result = await ollamaService.askQuestion(options);
      return result;
    } catch (error) {
      console.error("Failed to ask question with Ollama:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:set-model", async (_, model) => {
    try {
      ollamaService.setModel(model);
      return { success: true };
    } catch (error) {
      console.error("Failed to set Ollama model:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("ollama:set-api-url", async (_, url) => {
    try {
      ollamaService.setApiUrl(url);
      return { success: true };
    } catch (error) {
      console.error("Failed to set Ollama API URL:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
electron.ipcMain.handle("dialog:showOpenDialog", async (_, options) => {
  return electron.dialog.showOpenDialog(options);
});
function registerGlobalShortcuts() {
  electron.globalShortcut.unregisterAll();
  const registrationResults = [];
  const tryRegisterShortcut = (key, handler) => {
    const primaryShortcut = currentShortcuts[key];
    try {
      if (electron.globalShortcut.register(primaryShortcut, handler)) {
        registrationResults.push({ key, shortcut: primaryShortcut, success: true });
        return;
      }
    } catch (error) {
      console.log(`Failed to register shortcut ${primaryShortcut}:`, error);
    }
    registrationResults.push({ key, shortcut: primaryShortcut, success: false });
  };
  tryRegisterShortcut("toggleRecording", () => {
    if (mainWindow) {
      mainWindow.webContents.send("global-shortcut", "toggleRecording");
    }
  });
  tryRegisterShortcut("quickNote", () => {
    if (mainWindow) {
      mainWindow.webContents.send("global-shortcut", "quickNote");
    }
  });
  tryRegisterShortcut("pauseResume", () => {
    if (mainWindow) {
      mainWindow.webContents.send("global-shortcut", "pauseResume");
    }
  });
  const successCount = registrationResults.filter((r) => r.success).length;
  const totalCount = registrationResults.length;
  console.log(`📌 Global shortcuts registered: ${successCount}/${totalCount}`);
  if (successCount < totalCount) {
    console.log("⚠️ Some shortcuts failed to register:");
    registrationResults.filter((r) => !r.success).forEach((r) => {
      console.log(`  - ${r.key}: ${r.shortcut}`);
    });
  }
}
function unregisterGlobalShortcuts() {
  electron.globalShortcut.unregisterAll();
  console.log("🗑️ Global shortcuts unregistered");
}
function updateShortcuts(newShortcuts) {
  try {
    currentShortcuts = { ...currentShortcuts, ...newShortcuts };
    registerGlobalShortcuts();
    return true;
  } catch (error) {
    console.error("Failed to update shortcuts:", error);
    return false;
  }
}
function setupSystemHandlers() {
  electron.ipcMain.handle("system:updateShortcuts", async (_, shortcuts) => {
    const success = updateShortcuts(shortcuts);
    return { success };
  });
  electron.ipcMain.handle("system:getInfo", async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron
    };
  });
}
function cleanupHangingRecorderProcesses() {
  try {
    if (process.platform === "darwin") {
      const { execSync } = require("child_process");
      try {
        execSync('pkill -f "recorder"', { stdio: "ignore" });
        console.log("🧹 Cleaned up hanging recorder processes");
      } catch (error) {
      }
    }
  } catch (error) {
    console.error("Failed to cleanup hanging processes:", error);
  }
}
electron.app.whenReady().then(async () => {
  try {
    await databaseService.initialize();
    console.log("Database initialized successfully");
    await seedDatabase();
    try {
      const settings = await databaseService.getSettings();
      if (settings.geminiApiKey) {
        geminiService.setApiKey(settings.geminiApiKey);
        console.log("Gemini API key initialized from settings");
      }
      const recordingDirectory = settings.defaultSaveLocation || path__namespace.join(os__namespace.homedir(), "Friday Recordings");
      cleanupDoubleExtensionFiles(recordingDirectory);
    } catch (error) {
      console.error("Failed to initialize Gemini API key:", error);
    }
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
  try {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      console.log("⚠️ Microphone permission not granted - recording may not work");
    }
  } catch (error) {
    console.error("Failed to request microphone permission:", error);
  }
  try {
    cleanupHangingRecorderProcesses();
    isSwiftRecorderAvailable = await checkSwiftRecorderAvailability();
    console.log(`Swift recorder availability: ${isSwiftRecorderAvailable}`);
  } catch (error) {
    console.error("Failed to check Swift recorder availability:", error);
    isSwiftRecorderAvailable = false;
  }
  utils.electronApp.setAppUserModelId("com.electron");
  setupDatabaseHandlers();
  setupTranscriptionHandlers();
  setupGeminiHandlers();
  setupOllamaHandlers();
  setupSystemHandlers();
  registerGlobalShortcuts();
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.on("ping", () => console.log("pong"));
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", async () => {
  stopTranscriptionService();
  unregisterGlobalShortcuts();
  await databaseService.close();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", async () => {
  stopTranscriptionService();
  unregisterGlobalShortcuts();
  await databaseService.close();
});
electron.ipcMain.handle("get-app-settings", async () => {
  try {
    return await databaseService.getSettings();
  } catch (error) {
    console.error("Error getting app settings:", error);
    return null;
  }
});
electron.ipcMain.handle("update-app-settings", async (_, settings) => {
  try {
    await databaseService.updateSettings(settings);
    return { success: true };
  } catch (error) {
    console.error("Error updating app settings:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});
electron.ipcMain.handle("audio-get-current-device", async () => {
  return await audioDeviceManager.getCurrentDevice();
});
electron.ipcMain.handle("audio-switch-to-built-in", async () => {
  return await audioDeviceManager.switchToBuiltInSpeakers();
});
electron.ipcMain.handle("audio-enable-bluetooth-workaround", async () => {
  return await audioDeviceManager.enableBluetoothWorkaround();
});
function cleanupDoubleExtensionFiles(recordingDirectory) {
  try {
    if (!fs__namespace.existsSync(recordingDirectory)) {
      return;
    }
    const files = fs__namespace.readdirSync(recordingDirectory);
    const doubleExtensionFiles = files.filter((f) => f.endsWith(".mp3.mp3"));
    if (doubleExtensionFiles.length > 0) {
      console.log(`🧹 Found ${doubleExtensionFiles.length} files with double .mp3 extensions, fixing...`);
      for (const file of doubleExtensionFiles) {
        const oldPath = path__namespace.join(recordingDirectory, file);
        const newPath = path__namespace.join(recordingDirectory, file.replace(".mp3.mp3", ".mp3"));
        try {
          if (fs__namespace.existsSync(newPath)) {
            console.log(`⚠️ Target file already exists, removing duplicate: ${file}`);
            fs__namespace.unlinkSync(oldPath);
          } else {
            console.log(`🔧 Renaming: ${file} → ${file.replace(".mp3.mp3", ".mp3")}`);
            fs__namespace.renameSync(oldPath, newPath);
          }
        } catch (error) {
          console.error(`❌ Failed to fix file ${file}:`, error);
        }
      }
      console.log("✅ Cleanup completed");
    }
  } catch (error) {
    console.error("❌ Failed to cleanup double extension files:", error);
  }
}
