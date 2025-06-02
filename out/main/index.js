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
          resolve();
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
          action_items, context, summary, created_at, updated_at, duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
        meeting.recordingPath,
        JSON.stringify(meeting.transcript),
        meeting.title,
        meeting.description,
        JSON.stringify(meeting.tags),
        JSON.stringify(meeting.actionItems),
        meeting.context,
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
        values.push(meeting.recordingPath);
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
    return {
      id: row.id,
      recordingPath: row.recording_path,
      transcript: JSON.parse(row.transcript),
      title: row.title,
      description: row.description,
      tags: JSON.parse(row.tags),
      actionItems: JSON.parse(row.action_items),
      context: row.context,
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
const sampleMeetings = [
  {
    recordingPath: "/path/to/recording1.m4a",
    transcript: [
      {
        time: "00:15",
        text: "Okay, let's start today's standup meeting. We have several important topics to cover."
      },
      {
        time: "00:28",
        text: "First, let me go over what we accomplished yesterday and what we're planning for today."
      },
      {
        time: "00:42",
        text: "John, would you like to share your updates on the authentication system?"
      },
      {
        time: "01:05",
        text: "Sure! Yesterday I finished implementing the OAuth integration with Google and GitHub."
      },
      {
        time: "01:18",
        text: "Today I'm planning to work on the password reset functionality and write some tests."
      },
      { time: "01:32", text: "Great work! Any blockers or challenges you're facing?" },
      {
        time: "01:45",
        text: "Not really, everything is going smoothly. The API documentation was really helpful."
      },
      {
        time: "02:02",
        text: "Perfect. Sarah, what about the UI components you've been working on?"
      },
      {
        time: "02:15",
        text: "I've completed the design system foundation and implemented the core button components."
      },
      {
        time: "02:28",
        text: "The focus states and accessibility features are all working as expected."
      }
    ],
    title: "Team Standup Meeting",
    description: "Weekly team standup to discuss progress, blockers, and upcoming tasks. Covered authentication system updates and UI component progress.",
    tags: ["meeting", "standup", "team"],
    actionItems: [
      { id: 1, text: "Implement password reset functionality", completed: false },
      { id: 2, text: "Complete OAuth integration with Google and GitHub", completed: true },
      { id: 3, text: "Write tests for authentication system", completed: false },
      { id: 4, text: "Review UI component accessibility features", completed: false }
    ],
    context: "This is our weekly standup meeting. We discuss what we completed yesterday, what we're working on today, and any blockers. Key participants: John (Backend Developer), Sarah (UI Designer), Mike (Frontend Developer).",
    summary: "Team discussed progress on authentication system and UI components. OAuth integration completed, password reset functionality in progress.",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-15T10:15:32Z",
    duration: "15:32"
  },
  {
    recordingPath: "/path/to/recording2.m4a",
    transcript: [
      { time: "00:00", text: "Welcome everyone to our product strategy discussion." },
      {
        time: "00:10",
        text: "Today we'll be reviewing our roadmap for Q2 and discussing priorities."
      },
      { time: "00:25", text: "Let's start with our current market position and user feedback." }
    ],
    title: "Product Strategy Discussion",
    description: "Quarterly product strategy meeting to align on roadmap and priorities for Q2.",
    tags: ["strategy", "product", "planning"],
    actionItems: [
      { id: 1, text: "Finalize Q2 roadmap priorities", completed: false },
      { id: 2, text: "Schedule user research sessions", completed: false },
      { id: 3, text: "Update product requirements document", completed: false }
    ],
    context: "Quarterly strategy session with product team to review market position and plan Q2 initiatives.",
    summary: "Discussed Q2 roadmap priorities, user feedback insights, and upcoming product initiatives.",
    createdAt: "2024-01-14T14:00:00Z",
    updatedAt: "2024-01-14T14:32:18Z",
    duration: "32:18"
  },
  {
    recordingPath: "/path/to/recording3.m4a",
    transcript: [
      { time: "00:00", text: "Thank you for joining our feedback session today." },
      { time: "00:12", text: "We're excited to share our latest designs and get your thoughts." }
    ],
    title: "Client Feedback Session",
    description: "Design review session with client to gather feedback on latest mockups and prototypes.",
    tags: ["client", "feedback", "design"],
    actionItems: [
      { id: 1, text: "Incorporate client feedback into designs", completed: false },
      { id: 2, text: "Update prototypes based on discussion", completed: false },
      { id: 3, text: "Schedule follow-up review", completed: false }
    ],
    context: "Client review session for mobile app design iterations. Focus on user experience and visual design feedback.",
    summary: "Client provided valuable feedback on design direction. Several UI improvements requested.",
    createdAt: "2024-01-12T16:00:00Z",
    updatedAt: "2024-01-12T16:28:45Z",
    duration: "28:45"
  }
];
async function seedDatabase() {
  try {
    const existingMeetings = await databaseService.getAllMeetings();
    if (existingMeetings.length === 0) {
      console.log("Seeding database with sample meetings...");
      for (const meeting of sampleMeetings) {
        await databaseService.createMeeting(meeting);
        console.log(`Created meeting: ${meeting.title}`);
      }
      console.log("Database seeding completed successfully");
    } else {
      console.log("Database already contains meetings, skipping seed");
    }
  } catch (error) {
    console.error("Failed to seed database:", error);
  }
}
let mainWindow = null;
let transcriptionProcess = null;
let transcriptionSocket = null;
let isTranscriptionReady = false;
let actualTranscriptionPort = 9001;
let swiftRecorderProcess = null;
let isSwiftRecorderAvailable = false;
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
    const resolvedPath = recordingPath.startsWith("~/") ? path__namespace.join(os__namespace.homedir(), recordingPath.slice(2)) : recordingPath;
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
      stdio: ["pipe", "pipe", "pipe"]
    });
    let hasStarted = false;
    swiftRecorderProcess.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((line) => line.trim());
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          console.log("📝 Swift recorder output:", result);
          if (result.code === "RECORDING_STARTED" && !hasStarted) {
            hasStarted = true;
            resolve({ success: true, path: result.path });
            if (mainWindow) {
              mainWindow.webContents.send("combined-recording-started", result);
            }
          } else if (result.code === "RECORDING_STOPPED") {
            if (mainWindow) {
              mainWindow.webContents.send("combined-recording-stopped", result);
            }
          } else if (result.code === "RECORDING_ERROR" && !hasStarted) {
            resolve({ success: false, error: result.error });
          }
        } catch {
          console.log("Swift recorder log:", line);
        }
      }
    });
    swiftRecorderProcess.stderr?.on("data", (data) => {
      console.log("Swift recorder stderr:", data.toString());
    });
    swiftRecorderProcess.on("close", (code) => {
      console.log(`Swift recorder process exited with code ${code}`);
      swiftRecorderProcess = null;
      if (!hasStarted) {
        resolve({ success: false, error: `Recorder exited with code ${code}` });
      }
    });
    swiftRecorderProcess.on("error", (error) => {
      console.error("Swift recorder error:", error);
      if (!hasStarted) {
        resolve({ success: false, error: error.message });
      }
    });
    setTimeout(() => {
      if (!hasStarted) {
        if (swiftRecorderProcess) {
          swiftRecorderProcess.kill("SIGTERM");
          swiftRecorderProcess = null;
        }
        resolve({ success: false, error: "Recording start timeout" });
      }
    }, 1e4);
  });
}
async function stopCombinedRecording() {
  return new Promise((resolve) => {
    if (!swiftRecorderProcess) {
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
          console.log("✅ Transcription service ready");
          resolve();
        }).catch(reject);
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
    transcriptionSocket.setTimeout(3e4);
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
      reject(error);
    });
    transcriptionSocket.on("timeout", () => {
      console.log("Socket timeout - closing connection");
      transcriptionSocket?.destroy();
    });
    transcriptionSocket.on("close", () => {
      console.log("📞 Socket connection closed - keeping service ready for reconnection");
      transcriptionSocket = null;
      if (transcriptionProcess && !transcriptionProcess.killed) {
        console.log("🔄 Attempting to reconnect to transcription service in 5 seconds...");
        setTimeout(() => {
          if (transcriptionProcess && !transcriptionProcess.killed && !transcriptionSocket) {
            connectToTranscriptionSocket().then(() => {
              console.log("✅ Reconnected to transcription service");
            }).catch((error) => {
              console.error("Failed to reconnect to transcription service:", error);
              isTranscriptionReady = false;
            });
          }
        }, 5e3);
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
    const recordingsDir = path__namespace.join(os__namespace.homedir(), "Friday Recordings");
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
  });
}
function setupTranscriptionHandlers() {
  electron.ipcMain.handle("transcription:start-service", async () => {
    try {
      if (!isTranscriptionReady) {
        console.log("🎤 Starting transcription service (not ready)...");
        await startTranscriptionService();
      } else {
        console.log("✅ Transcription service already ready, skipping start");
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to start transcription service:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  electron.ipcMain.handle("transcription:stop-service", () => {
    stopTranscriptionService();
    return { success: true };
  });
  electron.ipcMain.handle("transcription:is-ready", () => {
    return { ready: isTranscriptionReady };
  });
  electron.ipcMain.handle("transcription:process-chunk", async (_, audioBuffer) => {
    if (!transcriptionSocket || !isTranscriptionReady) {
      return { success: false, error: "Transcription service not ready" };
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
    return await databaseService.updateSettings(settings);
  });
}
electron.app.whenReady().then(async () => {
  try {
    await databaseService.initialize();
    console.log("Database initialized successfully");
    await seedDatabase();
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
  try {
    isSwiftRecorderAvailable = await checkSwiftRecorderAvailability();
    console.log(`Swift recorder availability: ${isSwiftRecorderAvailable}`);
  } catch (error) {
    console.error("Failed to check Swift recorder availability:", error);
    isSwiftRecorderAvailable = false;
  }
  utils.electronApp.setAppUserModelId("com.electron");
  setupDatabaseHandlers();
  setupTranscriptionHandlers();
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
  await databaseService.close();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", async () => {
  stopTranscriptionService();
  await databaseService.close();
});
