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

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      if (event.metaKey && event.key === 'l') {
        event.preventDefault()
        // Handle recording toggle - could emit to main process
        console.log('Recording toggle shortcut pressed')
      }
    }

    document.addEventListener('keydown', handleKeyboard)
    return () => document.removeEventListener('keydown', handleKeyboard)
  }, [])

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
      setCurrentMeeting(createdMeeting)
      setCurrentScreen('transcript')
      setRefreshTrigger((prev) => prev + 1)
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
        return <TranscriptScreen meeting={currentMeeting} onBack={handleBackToLibrary} />
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
