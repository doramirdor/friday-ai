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
          include_context_in_action_items BOOLEAN DEFAULT 1
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
        if (migrations.length === 0) {
          resolve();
        } else {
          Promise.all(migrations).then(() => resolve()).catch(reject);
        }
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
            include_context_in_action_items: 1
          };
          const sql = `
            INSERT INTO settings (
              default_save_location, launch_at_login, theme, show_in_menu_bar,
              auto_save_recordings, realtime_transcription, transcription_language,
              gemini_api_key, auto_generate_action_items, auto_suggest_tags,
              global_context, enable_global_context, include_context_in_transcriptions,
              include_context_in_action_items
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          action_items, context, context_files, notes, summary, created_at, updated_at, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      includeContextInActionItems: Boolean(row.include_context_in_action_items)
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
  async makeGeminiRequest(prompt, model = "gemini-2.5-pro-preview-06-05") {
    if (!this.apiKey) {
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
          }
        })
      });
      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Gemini API error: ${response.status} - ${errorData}` };
      }
      const data = await response.json();
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        const content = data.candidates[0].content.parts[0].text;
        return { success: true, content };
      } else {
        return { success: false, error: "No content generated by Gemini" };
      }
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
      const prompt = `Please provide a concise 2-3 sentence summary of this meeting:

CONTEXT: ${options.globalContext}
MEETING CONTEXT: ${options.meetingContext}
TRANSCRIPT:
${transcriptText}
NOTES:
${options.notes}

Please respond with only the summary, no additional formatting or explanations.`;
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
      const model = options.model || "gemini-2.5-pro-preview-06-05";
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
      const contextText = contextSections.join("\n\n");
      let prompt = "";
      if (type === "slack") {
        prompt = `You are an AI assistant helping to create a Slack message about a meeting. Please generate a professional Slack message based on the following information:

${contextText}

Please create a well-formatted Slack message that:
- Is professional yet conversational for team communication
- Highlights key points and outcomes
- Includes action items if any
- Uses appropriate Slack formatting (bold for emphasis, bullet points for lists)
- Is concise but informative
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
}
const geminiService = new GeminiService();
let mainWindow = null;
let tray = null;
let transcriptionProcess = null;
let transcriptionSocket = null;
let isTranscriptionReady = false;
let isTranscriptionStarting = false;
let actualTranscriptionPort = 9001;
let swiftRecorderProcess = null;
let isSwiftRecorderAvailable = false;
const currentShortcuts = {
  "toggle-recording": "CmdOrCtrl+L",
  "quick-note": "CmdOrCtrl+Shift+N",
  "show-hide": "CmdOrCtrl+Shift+F",
  "pause-resume": "CmdOrCtrl+P"
};
const activeChunkedRecordings = /* @__PURE__ */ new Map();
const CHUNK_DURATION_MS = 5 * 60 * 1e3;
const CHUNK_SIZE_LIMIT = 50 * 1024 * 1024;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
      // Allow blob URLs for audio playback
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
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
async function checkSwiftRecorderAvailability() {
  return new Promise((resolve) => {
    const recorderPath = path__namespace.join(process.cwd(), "Recorder");
    if (!fs__namespace.existsSync(recorderPath)) {
      console.log("❌ Swift recorder not found at:", recorderPath);
      resolve(false);
      return;
    }
    const testProcess = child_process.spawn(recorderPath, ["--check-permissions"], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    testProcess.stdout?.on("data", (data) => {
      output += data.toString();
    });
    testProcess.on("close", (code) => {
      try {
        const result = JSON.parse(output.trim().split("\n").pop() || "{}");
        const available = code === 0 && (result.code === "PERMISSION_GRANTED" || result.code === "PERMISSION_DENIED");
        console.log(available ? "✅ Swift recorder is available" : "❌ Swift recorder test failed");
        resolve(available);
      } catch (error) {
        console.log("❌ Swift recorder test failed:", error);
        resolve(false);
      }
    });
    testProcess.on("error", (error) => {
      console.log("❌ Swift recorder error:", error);
      resolve(false);
    });
  });
}
async function startCombinedRecording(recordingPath, filename) {
  return new Promise((resolve) => {
    if (!isSwiftRecorderAvailable) {
      resolve({ success: false, error: "Swift recorder not available" });
      return;
    }
    databaseService.getSettings().then((settings) => {
      const finalPath = recordingPath || settings.defaultSaveLocation || path__namespace.join(os__namespace.homedir(), "Friday Recordings");
      const resolvedPath = finalPath.startsWith("~/") ? path__namespace.join(os__namespace.homedir(), finalPath.slice(2)) : finalPath;
      if (!fs__namespace.existsSync(resolvedPath)) {
        fs__namespace.mkdirSync(resolvedPath, { recursive: true });
      }
      const recorderPath = path__namespace.join(process.cwd(), "Recorder");
      const args = ["--record", resolvedPath, "--source", "both"];
      if (filename) {
        args.push("--filename", filename);
      }
      console.log("🎙️ Starting combined recording with Swift recorder...");
      console.log("Command:", recorderPath, args.join(" "));
      swiftRecorderProcess = child_process.spawn(recorderPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NSUnbufferedIO: "YES" }
        // Force unbuffered output
      });
      let hasStarted = false;
      let outputReceived = false;
      let lastOutputTime = Date.now();
      const outputTimeoutId = setTimeout(() => {
        if (!outputReceived) {
          console.log("❌ HANG DETECTION: No output received from Swift recorder after 10 seconds");
          console.log("   Process may be hanging in Electron app context vs manual terminal execution");
          if (swiftRecorderProcess) {
            console.log("   Process PID:", swiftRecorderProcess.pid);
            console.log("   Process killed status:", swiftRecorderProcess.killed);
            console.log("   Terminating hanging process...");
            swiftRecorderProcess.kill("SIGKILL");
          }
          if (!hasStarted) {
            resolve({
              success: false,
              error: "Swift recorder process hanging - no output received after 10 seconds",
              cause: "Process spawned but appears to be stuck in initialization",
              solution: "This may indicate permission issues or Swift recorder compatibility problems in app context"
            });
          }
        }
      }, 1e4);
      const hangDetectionInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastOutput = now - lastOutputTime;
        if (outputReceived && timeSinceLastOutput > 15e3 && !hasStarted) {
          console.log("❌ HANG DETECTION: Output stopped flowing for 15+ seconds during initialization");
          console.log(`   Last output was ${timeSinceLastOutput}ms ago`);
          if (swiftRecorderProcess && !swiftRecorderProcess.killed) {
            console.log("   Terminating stalled process...");
            swiftRecorderProcess.kill("SIGKILL");
          }
          clearInterval(hangDetectionInterval);
          if (!hasStarted) {
            resolve({
              success: false,
              error: "Swift recorder initialization stalled - output stopped during startup",
              cause: "Process started but became unresponsive during initialization phase",
              solution: "This may indicate Core Audio device conflicts or system audio routing issues"
            });
          }
        }
      }, 5e3);
      swiftRecorderProcess.stdout?.on("data", (data) => {
        outputReceived = true;
        lastOutputTime = Date.now();
        clearTimeout(outputTimeoutId);
        console.log("📥 Raw Swift recorder stdout:", data.toString());
        const lines = data.toString().split("\n").filter((line) => line.trim());
        for (const line of lines) {
          try {
            const result = JSON.parse(line);
            console.log("📝 Swift recorder output:", result);
            if (result.code === "RECORDING_STARTED" && !hasStarted) {
              hasStarted = true;
              clearInterval(hangDetectionInterval);
              resolve({ success: true, path: result.path });
              if (mainWindow) {
                mainWindow.webContents.send("combined-recording-started", result);
              }
            } else if ((result.code === "BLUETOOTH_LIMITATION" || result.code === "SCREEN_PERMISSION_REQUIRED" || result.code === "SYSTEM_AUDIO_UNAVAILABLE" || result.code === "RECORDING_STARTED_MIC_ONLY") && !hasStarted) {
              hasStarted = true;
              clearInterval(hangDetectionInterval);
              resolve({
                success: true,
                path: result.path,
                warning: result.warning,
                recommendation: result.recommendation
              });
              if (mainWindow) {
                mainWindow.webContents.send("combined-recording-started", result);
              }
              console.log("✅ Microphone-only recording started, process still tracked for stopping");
            } else if (result.code === "SYSTEM_AUDIO_FAILED" && !hasStarted) {
              hasStarted = true;
              clearInterval(hangDetectionInterval);
              resolve({
                success: false,
                error: result.error,
                cause: result.cause,
                solution: result.solution
              });
            } else if (result.code === "RECORDING_STOPPED") {
              if (mainWindow) {
                mainWindow.webContents.send("combined-recording-stopped", result);
              }
            } else if (result.code === "RECORDING_ERROR" && !hasStarted) {
              clearInterval(hangDetectionInterval);
              resolve({ success: false, error: result.error });
            } else if (result.code === "RECORDING_FAILED") {
              console.error("❌ Recording failed after start:", result.error);
              if (mainWindow) {
                mainWindow.webContents.send("combined-recording-failed", result);
              }
              if (hasStarted) {
                swiftRecorderProcess = null;
              } else {
                hasStarted = true;
                clearInterval(hangDetectionInterval);
                resolve({ success: false, error: result.error });
              }
            }
          } catch {
            console.log("Swift recorder log:", line);
          }
        }
      });
      swiftRecorderProcess.stderr?.on("data", (data) => {
        outputReceived = true;
        lastOutputTime = Date.now();
        clearTimeout(outputTimeoutId);
        console.log("📥 Swift recorder stderr:", data.toString());
      });
      swiftRecorderProcess.on("spawn", () => {
        console.log("🚀 Swift recorder process spawned successfully (PID: " + swiftRecorderProcess?.pid + ")");
      });
      swiftRecorderProcess.on("close", (code, signal) => {
        console.log(`Swift recorder process exited with code ${code}, signal: ${signal}`);
        clearTimeout(outputTimeoutId);
        clearInterval(hangDetectionInterval);
        swiftRecorderProcess = null;
        if (!hasStarted) {
          resolve({
            success: false,
            error: `Recorder exited unexpectedly with code ${code}`,
            cause: signal ? `Process terminated by signal: ${signal}` : `Exit code: ${code}`,
            solution: "Check console logs for detailed error information"
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
}
async function stopCombinedRecording() {
  return new Promise((resolve) => {
    if (!swiftRecorderProcess) {
      console.log("⚠️ No tracked Swift recorder process found");
      resolve({ success: false, error: "No active recording" });
      return;
    }
    console.log("🛑 Stopping combined recording...");
    let hasFinished = false;
    const handleOutput = (data) => {
      const lines = data.toString().split("\n").filter((line) => line.trim());
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.code === "RECORDING_STOPPED" && !hasFinished) {
            hasFinished = true;
            resolve({ success: true, path: result.path });
          }
        } catch {
        }
      }
    };
    swiftRecorderProcess.stdout?.on("data", handleOutput);
    swiftRecorderProcess.kill("SIGINT");
    setTimeout(() => {
      if (!hasFinished) {
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill("SIGTERM");
          swiftRecorderProcess = null;
        }
        resolve({ success: false, error: "Stop timeout" });
      }
    }, 3e4);
  });
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
function saveAudioChunk(audioBuffer) {
  const tempDir = os__namespace.tmpdir();
  const fileName = `audio_chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webm`;
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
  electron.ipcMain.handle("transcription:load-recording", async (_, filePath) => {
    try {
      if (!fs__namespace.existsSync(filePath)) {
        return { success: false, error: "Recording file not found" };
      }
      const buffer = fs__namespace.readFileSync(filePath);
      return {
        success: true,
        buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      };
    } catch (error) {
      console.error("Failed to load recording file:", error);
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
}
electron.ipcMain.handle("dialog:showOpenDialog", async (_, options) => {
  return electron.dialog.showOpenDialog(options);
});
function registerGlobalShortcuts() {
  electron.globalShortcut.unregisterAll();
  electron.globalShortcut.register(currentShortcuts["toggle-recording"], () => {
    console.log("🎙️ Global shortcut: Start/Stop Recording");
    if (mainWindow) {
      mainWindow.webContents.send("shortcut:toggle-recording");
    }
  });
  electron.globalShortcut.register(currentShortcuts["quick-note"], () => {
    console.log("📝 Global shortcut: Quick Note");
    if (mainWindow) {
      mainWindow.webContents.send("shortcut:quick-note");
    }
  });
  electron.globalShortcut.register(currentShortcuts["show-hide"], () => {
    console.log("👁️ Global shortcut: Show/Hide Window");
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  electron.globalShortcut.register(currentShortcuts["pause-resume"], () => {
    console.log("⏸️ Global shortcut: Pause/Resume Recording");
    if (mainWindow) {
      mainWindow.webContents.send("shortcut:pause-resume");
    }
  });
  console.log("✅ Global shortcuts registered:", currentShortcuts);
}
function unregisterGlobalShortcuts() {
  electron.globalShortcut.unregisterAll();
  console.log("🗑️ Global shortcuts unregistered");
}
function createTray() {
  try {
    tray = new electron.Tray(icon);
    tray.setToolTip("Friday - Meeting Recorder");
    const contextMenu = electron.Menu.buildFromTemplate([
      {
        label: "Show Friday",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: "Start Recording",
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send("shortcut:toggle-recording");
          }
        }
      },
      { type: "separator" },
      {
        label: "Settings",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("navigate-to-settings");
          }
        }
      },
      { type: "separator" },
      {
        label: "Quit Friday",
        click: () => {
          electron.app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    console.log("✅ System tray created");
  } catch (error) {
    console.error("❌ Failed to create system tray:", error);
  }
}
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    console.log("🗑️ System tray destroyed");
  }
}
function updateShortcuts(newShortcuts) {
  try {
    for (const [key, shortcut] of Object.entries(newShortcuts)) {
      if (!shortcut || shortcut.trim() === "") {
        console.error(`❌ Invalid shortcut for ${key}: empty`);
        return false;
      }
    }
    const testResults = [];
    for (const [key, shortcut] of Object.entries(newShortcuts)) {
      try {
        const success = electron.globalShortcut.register(shortcut, () => {
        });
        testResults.push({ key, shortcut, success });
        if (success) {
          electron.globalShortcut.unregister(shortcut);
        }
      } catch (error) {
        console.error(`❌ Failed to test shortcut ${shortcut} for ${key}:`, error);
        testResults.push({ key, shortcut, success: false });
      }
    }
    const failedTests = testResults.filter((test) => !test.success);
    if (failedTests.length > 0) {
      console.error("❌ Some shortcut registrations failed:", failedTests);
      return false;
    }
    Object.assign(currentShortcuts, newShortcuts);
    registerGlobalShortcuts();
    console.log("✅ Shortcuts updated successfully:", currentShortcuts);
    return true;
  } catch (error) {
    console.error("❌ Failed to update shortcuts:", error);
    return false;
  }
}
function setupSystemHandlers() {
  electron.ipcMain.handle("system:get-shortcuts", () => {
    return currentShortcuts;
  });
  electron.ipcMain.handle("system:update-shortcuts", (_, shortcuts) => {
    return updateShortcuts(shortcuts);
  });
  electron.ipcMain.handle("system:toggle-menu-bar", async (_, show) => {
    try {
      if (show && !tray) {
        createTray();
        return { success: true };
      } else if (!show && tray) {
        destroyTray();
        return { success: true };
      }
      return { success: true, message: `Tray already ${show ? "visible" : "hidden"}` };
    } catch (error) {
      console.error("❌ Failed to toggle menu bar:", error);
      return { success: false, error: String(error) };
    }
  });
  databaseService.getSettings().then((settings) => {
    if (settings.showInMenuBar && !tray) {
      createTray();
    }
  }).catch((error) => {
    console.error("Failed to load menu bar setting:", error);
  });
}
function cleanupHangingRecorderProcesses() {
  console.log("🧹 Checking for hanging Swift recorder processes...");
  const ps = child_process.spawn("ps", ["aux"]);
  let output = "";
  ps.stdout.on("data", (data) => {
    output += data.toString();
  });
  ps.on("close", () => {
    const lines = output.split("\n");
    const recorderProcesses = lines.filter(
      (line) => line.includes("Recorder") && line.includes("--record") && !line.includes("grep")
    );
    if (recorderProcesses.length > 0) {
      console.log(`🔍 Found ${recorderProcesses.length} hanging recorder process(es):`);
      recorderProcesses.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid = parts[1];
          console.log(`   PID ${pid}: ${line.substring(line.indexOf("Recorder"))}`);
          try {
            process.kill(parseInt(pid), "SIGKILL");
            console.log(`   ✅ Killed hanging process ${pid}`);
          } catch (error) {
            console.log(`   ⚠️ Could not kill process ${pid}: ${error}`);
          }
        }
      });
    } else {
      console.log("✅ No hanging recorder processes found");
    }
  });
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
    } catch (error) {
      console.error("Failed to initialize Gemini API key:", error);
    }
  } catch (error) {
    console.error("Failed to initialize database:", error);
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
