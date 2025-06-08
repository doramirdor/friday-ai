import React, { useState, useEffect } from 'react'
import { SettingsIcon, HelpCircleIcon, SunIcon, MoonIcon, PlusIcon } from 'lucide-react'
import LibraryScreen from './components/LibraryScreen'
import TranscriptScreen from './components/TranscriptScreen'
import SettingsScreen from './components/SettingsScreen'
import NewMeetingDialog from './components/NewMeetingDialog'
import { Meeting } from './types/database'

type Screen = 'library' | 'transcript' | 'settings'
type Theme = 'light' | 'dark'

function App(): React.JSX.Element {
  const [currentScreen, setCurrentScreen] = useState<Screen>('library')
  const [currentMeeting, setCurrentMeeting] = useState<Meeting | null>(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false)

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('friday-theme') as Theme | null
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initialTheme = savedTheme || systemTheme

    setTheme(initialTheme)
    document.documentElement.setAttribute('data-theme', initialTheme)
  }, [])

  // Handle theme toggle
  const toggleTheme = (): void => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('friday-theme', newTheme)
  }

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleShortcuts = {
      'shortcut:toggle-recording': () => {
        console.log('🎙️ Global shortcut: Toggle Recording')
        if (currentScreen === 'transcript') {
          // Send a custom event to the transcript screen to handle recording toggle
          window.dispatchEvent(new CustomEvent('friday-toggle-recording'))
        } else {
          // Create a new meeting and start recording
          handleCreateAndStartRecording()
        }
      },
      'shortcut:quick-note': () => {
        console.log('📝 Global shortcut: Quick Note')
        if (currentScreen === 'transcript') {
          // Send a custom event to the transcript screen to handle quick note
          window.dispatchEvent(new CustomEvent('friday-quick-note'))
        } else {
          console.log('ℹ️ Quick note is only available during recording')
        }
      },
      'shortcut:pause-resume': () => {
        console.log('⏸️ Global shortcut: Pause/Resume Recording')
        if (currentScreen === 'transcript') {
          // Send a custom event to the transcript screen to handle pause/resume
          window.dispatchEvent(new CustomEvent('friday-pause-resume'))
        } else {
          console.log('ℹ️ Pause/resume is only available during recording')
        }
      },
      'navigate-to-settings': () => {
        console.log('⚙️ Navigate to settings from tray')
        setCurrentScreen('settings')
      }
    }

    // Add listeners for all shortcuts
    Object.entries(handleShortcuts).forEach(([event, handler]) => {
      window.electron?.ipcRenderer.on(event, handler)
    })

    // Cleanup function
    return () => {
      Object.keys(handleShortcuts).forEach(event => {
        window.electron?.ipcRenderer.removeAllListeners(event)
      })
    }
  }, [currentScreen])

  const handleCreateAndStartRecording = async (): Promise<void> => {
    try {
      // Create a new meeting with default values
      const timestamp = new Date().toISOString()
      const defaultMeeting: Omit<Meeting, 'id'> = {
        title: `Recording ${new Date().toLocaleString()}`,
        description: 'Quick recording started with global shortcut',
        transcript: [],
        summary: '',
        actionItems: [],
        tags: [],
        context: '',
        context_files: [],
        notes: '',
        recordingPath: '',
        duration: '00:00',
        createdAt: timestamp,
        updatedAt: timestamp
      }

      const meetingId = await window.api.db.createMeeting(defaultMeeting)
      const createdMeeting = await window.api.db.getMeeting(meetingId)
      
      if (createdMeeting) {
        setCurrentMeeting(createdMeeting)
        setCurrentScreen('transcript')
        setRefreshTrigger((prev) => prev + 1)
        
        console.log('✅ Created meeting for global recording shortcut:', createdMeeting.title)
        
        // After switching to transcript screen, trigger recording start
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('friday-auto-start-recording'))
        }, 100)
      } else {
        console.error('Failed to retrieve created meeting')
      }
    } catch (error) {
      console.error('Failed to create meeting for global recording:', error)
    }
  }

  const handleOpenTranscript = (meeting: Meeting): void => {
    setCurrentMeeting(meeting)
    setCurrentScreen('transcript')
  }

  const handleBackToLibrary = (): void => {
    setCurrentMeeting(null)
    setCurrentScreen('library')
  }

  const handleNewMeeting = (): void => {
    setShowNewMeetingDialog(true)
  }

  const handleSaveNewMeeting = async (meeting: Omit<Meeting, 'id'>): Promise<void> => {
    try {
      const meetingId = await window.api.db.createMeeting(meeting)
      console.log('Meeting created with ID:', meetingId)

      // Get the created meeting and navigate to transcript screen
      const createdMeeting = await window.api.db.getMeeting(meetingId)
      if (createdMeeting) {
        setCurrentMeeting(createdMeeting)
        setCurrentScreen('transcript')
        setRefreshTrigger((prev) => prev + 1)
      }
    } catch (error) {
      console.error('Failed to create meeting:', error)
      throw error
    }
  }

  const renderScreen = (): React.ReactNode => {
    switch (currentScreen) {
      case 'library':
        return (
          <LibraryScreen
            onOpenTranscript={handleOpenTranscript}
            onNewMeeting={handleNewMeeting}
            key={refreshTrigger}
          />
        )
      case 'transcript':
        return (
          <TranscriptScreen 
            meeting={currentMeeting} 
          />
        )
      case 'settings':
        return <SettingsScreen />
      default:
        return (
          <LibraryScreen
            onOpenTranscript={handleOpenTranscript}
            onNewMeeting={handleNewMeeting}
            key={refreshTrigger}
          />
        )
    }
  }

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={`btn btn-ghost btn-sm ${currentScreen === 'library' ? 'text-primary' : ''}`}
            onClick={() => setCurrentScreen('library')}
          >
            <h1 className="toolbar-title">Friday</h1>
          </button>
          <nav className="flex gap-md"></nav>
        </div>

        <div className="toolbar-right">
          <button className="btn btn-secondary" onClick={handleNewMeeting}>
            <PlusIcon size={18} />
            New Meeting
          </button>

          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle theme">
            {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
          </button>

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setCurrentScreen('settings')}
            title="Settings"
          >
            <SettingsIcon size={18} />
          </button>

          <button className="btn btn-ghost btn-icon" title="Help">
            <HelpCircleIcon size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">{renderScreen()}</div>

      {/* New Meeting Dialog */}
      <NewMeetingDialog
        isOpen={showNewMeetingDialog}
        onClose={() => setShowNewMeetingDialog(false)}
        onSave={handleSaveNewMeeting}
      />
    </div>
  )
}

export default App
