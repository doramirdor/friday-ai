import { app, dialog, BrowserWindow, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface SetupProgress {
  step: string
  progress: number
  message: string
  success?: boolean
  error?: string
}

interface SetupResult {
  success: boolean
  error?: string
  installed: {
    python: boolean
    ollama: boolean
    models: string[]
  }
}

class FirstRunSetupService {
  private setupWindow: BrowserWindow | null = null
  private setupProcess: ChildProcess | null = null
  private progressCallback: ((progress: SetupProgress) => void) | null = null

  constructor() {
    this.checkFirstRun()
  }

  private checkFirstRun(): void {
    const userDataPath = app.getPath('userData')
    const setupCompleteFlag = path.join(userDataPath, '.friday-setup-complete')
    
    if (!fs.existsSync(setupCompleteFlag)) {
      console.log('🚀 First run detected, setup required')
    } else {
      console.log('✅ Setup already completed')
    }
  }

  async isFirstRun(): Promise<boolean> {
    const userDataPath = app.getPath('userData')
    const setupCompleteFlag = path.join(userDataPath, '.friday-setup-complete')
    return !fs.existsSync(setupCompleteFlag)
  }

  private markSetupComplete(): void {
    const userDataPath = app.getPath('userData')
    const setupCompleteFlag = path.join(userDataPath, '.friday-setup-complete')
    
    try {
      fs.writeFileSync(setupCompleteFlag, JSON.stringify({
        setupDate: new Date().toISOString(),
        version: app.getVersion()
      }))
      console.log('✅ Setup marked as complete')
    } catch (error) {
      console.error('Failed to mark setup as complete:', error)
    }
  }

  private getBundledExecutablePath(): string {
    const isDev = process.env.NODE_ENV === 'development'
    const resourcesPath = isDev 
      ? path.join(process.cwd(), 'resources')
      : path.join(process.resourcesPath, 'resources')
    
    return path.join(resourcesPath, 'friday_ollama')
  }

  private updateProgress(step: string, progress: number, message: string): void {
    const progressData: SetupProgress = { step, progress, message }
    console.log(`📦 Setup Progress: ${step} (${progress}%) - ${message}`)
    
    if (this.progressCallback) {
      this.progressCallback(progressData)
    }

    // Send to setup window if it exists
    if (this.setupWindow && !this.setupWindow.isDestroyed()) {
      this.setupWindow.webContents.send('setup-progress', progressData)
    }
  }

  async checkDependencies(): Promise<{
    python: boolean
    ollama: boolean
    bundledExecutable: boolean
  }> {
    const bundledExecutablePath = this.getBundledExecutablePath()
    
    return {
      python: await this.checkPythonInstallation(),
      ollama: await this.checkOllamaInstallation(),
      bundledExecutable: fs.existsSync(bundledExecutablePath)
    }
  }

  private async checkPythonInstallation(): Promise<boolean> {
    return new Promise((resolve) => {
      const pythonCheck = spawn('python3', ['--version'])
      
      pythonCheck.on('close', (code) => {
        resolve(code === 0)
      })
      
      pythonCheck.on('error', () => {
        resolve(false)
      })
    })
  }

  private async checkOllamaInstallation(): Promise<boolean> {
    return new Promise((resolve) => {
      const ollamaCheck = spawn('which', ['ollama'])
      
      ollamaCheck.on('close', (code) => {
        resolve(code === 0)
      })
      
      ollamaCheck.on('error', () => {
        resolve(false)
      })
    })
  }

  async runSetup(progressCallback?: (progress: SetupProgress) => void): Promise<SetupResult> {
    this.progressCallback = progressCallback || null
    
    try {
      this.updateProgress('starting', 0, 'Initializing setup...')
      
      const deps = await this.checkDependencies()
      this.updateProgress('checking', 10, 'Checking dependencies...')

      const result: SetupResult = {
        success: false,
        installed: {
          python: deps.python || deps.bundledExecutable,
          ollama: false,
          models: []
        }
      }

      // Step 1: Ensure we have Python capability
      if (!deps.python && !deps.bundledExecutable) {
        this.updateProgress('python', 20, 'Python not found. Please install Python 3.8+ or use bundled version.')
        
        // Show dialog asking user to install Python
        const response = await dialog.showMessageBox({
          type: 'warning',
          title: 'Python Required',
          message: 'Friday requires Python for local AI features.',
          detail: 'You can install Python from python.org or continue without local AI features.',
          buttons: ['Install Python', 'Continue without local AI', 'Cancel'],
          defaultId: 0,
          cancelId: 2
        })

        if (response.response === 2) {
          throw new Error('Setup cancelled by user')
        } else if (response.response === 1) {
          // Continue without local AI
          this.updateProgress('python', 30, 'Continuing without local AI features...')
          result.installed.python = false
                 } else {
           // User chose to install Python - open python.org
           shell.openExternal('https://www.python.org/downloads/')
           throw new Error('Please install Python and restart Friday')
         }
      } else {
        this.updateProgress('python', 30, 'Python available ✅')
        result.installed.python = true
      }

      // Step 2: Setup Ollama if Python is available
      if (result.installed.python) {
        this.updateProgress('ollama', 40, 'Checking Ollama installation...')
        
        const bundledExecutablePath = this.getBundledExecutablePath()
        
        if (fs.existsSync(bundledExecutablePath)) {
          // Use bundled executable for setup
          this.updateProgress('ollama', 50, 'Setting up Ollama...')
          
          const setupSuccess = await this.runBundledSetup(bundledExecutablePath)
          
          if (setupSuccess) {
            this.updateProgress('ollama', 80, 'Ollama setup complete ✅')
            result.installed.ollama = true
            result.installed.models = ['mistral:7b', 'qwen2.5:1.5b']
          } else {
            this.updateProgress('ollama', 60, 'Ollama setup failed - will use cloud AI only')
            result.installed.ollama = false
          }
        } else {
          this.updateProgress('ollama', 60, 'Bundled executable not found - will use cloud AI only')
          result.installed.ollama = false
        }
      }

      // Step 3: Final verification
      this.updateProgress('verifying', 90, 'Verifying installation...')
      
      const finalCheck = await this.checkDependencies()
      
      if (finalCheck.ollama || finalCheck.bundledExecutable) {
        this.updateProgress('complete', 100, 'Setup complete! Friday is ready to use.')
        this.markSetupComplete()
        result.success = true
      } else {
        this.updateProgress('complete', 100, 'Setup complete! Using cloud AI only.')
        this.markSetupComplete()
        result.success = true
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateProgress('error', 0, `Setup failed: ${errorMessage}`)
      
      return {
        success: false,
        error: errorMessage,
        installed: {
          python: false,
          ollama: false,
          models: []
        }
      }
    }
  }

  private async runBundledSetup(executablePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.updateProgress('ollama', 55, 'Running Ollama setup...')
      
      const setupProcess = spawn(executablePath, ['--setup'], {
        stdio: 'pipe'
      })

      let output = ''
      
      setupProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        output += text
        
        // Parse progress from output
        if (text.includes('Installing')) {
          this.updateProgress('ollama', 60, 'Installing Ollama...')
        } else if (text.includes('Downloading')) {
          this.updateProgress('ollama', 70, 'Downloading AI models...')
        } else if (text.includes('ready')) {
          this.updateProgress('ollama', 75, 'Models ready')
        }
      })

      setupProcess.stderr?.on('data', (data: Buffer) => {
        console.error('Setup stderr:', data.toString())
      })

      setupProcess.on('close', (code) => {
        if (code === 0) {
          this.updateProgress('ollama', 80, 'Ollama setup completed successfully')
          resolve(true)
        } else {
          console.error('Setup failed with code:', code)
          console.error('Setup output:', output)
          resolve(false)
        }
      })

      setupProcess.on('error', (error) => {
        console.error('Setup process error:', error)
        resolve(false)
      })

      // Timeout after 10 minutes
      setTimeout(() => {
        if (!setupProcess.killed) {
          setupProcess.kill()
          resolve(false)
        }
      }, 10 * 60 * 1000)
    })
  }

  async showSetupDialog(): Promise<boolean> {
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'Welcome to Friday!',
      message: 'First-time setup required',
      detail: 'Friday can set up local AI features for enhanced privacy. This will download and install Ollama and AI models (~2GB). You can also skip this and use cloud AI only.',
      buttons: ['Setup Local AI (Recommended)', 'Use Cloud AI Only', 'Cancel'],
      defaultId: 0,
      cancelId: 2
    })

    if (response.response === 2) {
      return false // User cancelled
    } else if (response.response === 1) {
      // Skip local AI setup, mark as complete
      this.markSetupComplete()
      return true
    } else {
      // Run full setup
      const setupResult = await this.runSetup()
      return setupResult.success
    }
  }

  createSetupWindow(): BrowserWindow {
    this.setupWindow = new BrowserWindow({
      width: 600,
      height: 400,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js')
      }
    })

    // Load setup HTML (you would create this)
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
    </script>
</body>
</html>`

    this.setupWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(setupHtml))
    
    return this.setupWindow
  }

  cleanup(): void {
    if (this.setupProcess && !this.setupProcess.killed) {
      this.setupProcess.kill()
    }
    
    if (this.setupWindow && !this.setupWindow.isDestroyed()) {
      this.setupWindow.close()
    }
  }
}

export const firstRunSetupService = new FirstRunSetupService() 