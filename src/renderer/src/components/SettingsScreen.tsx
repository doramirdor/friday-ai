import React, { useState, useEffect } from 'react'
import {
  FolderIcon,
  MicIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  Edit2Icon,
  FileTextIcon,
  SaveIcon,
  CheckIcon
} from 'lucide-react'
import { Settings } from '../types/database'

type TabType = 'general' | 'shortcuts' | 'transcription' | 'context' | 'about'

const SettingsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null)

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async (): Promise<void> => {
      try {
        const loadedSettings = await window.api.db.getSettings()
        setSettings(loadedSettings)
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Save settings to database
  const handleSaveSettings = async (): Promise<void> => {
    if (!settings) return

    try {
      setSaving(true)
      await window.api.db.updateSettings(settings)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  // Update settings state
  const updateSetting = (key: keyof Settings, value: unknown): void => {
    if (!settings) return
    setSettings(prev => prev ? { ...prev, [key]: value } : null)
  }

  // Handle browse button click for default save location
  const handleBrowseSaveLocation = async (): Promise<void> => {
    if (!settings) return

    try {
      const result = await window.api.electron.dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Default Save Location',
        defaultPath: settings.defaultSaveLocation
      })

      if (!result.canceled && result.filePaths.length > 0) {
        updateSetting('defaultSaveLocation', result.filePaths[0])
      }
    } catch (error) {
      console.error('Failed to open directory picker:', error)
    }
  }

  // Test Gemini API connection
  const handleTestConnection = async (): Promise<void> => {
    if (!settings?.geminiApiKey) {
      setConnectionResult({ success: false, message: 'Please enter an API key first' })
      return
    }

    setTestingConnection(true)
    setConnectionResult(null)

    try {
      // Test with a simple prompt
      const result = await window.api.gemini.generateSummaryOnly({
        transcript: 'This is a test message.',
        context: '',
        meetingContext: '',
        notes: '',
        title: 'Test'
      })

      if (result.success) {
        setConnectionResult({ success: true, message: 'Connection successful! API key is valid.' })
      } else {
        setConnectionResult({ success: false, message: result.error || 'Connection failed' })
      }
    } catch (error) {
      setConnectionResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      })
    } finally {
      setTestingConnection(false)
    }
  }

  // Apply settings in real-time (for toggles that should work immediately)
  useEffect(() => {
    if (!settings) return

    // Apply theme changes immediately
    if (settings.theme === 'auto') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', systemTheme)
    } else {
      document.documentElement.setAttribute('data-theme', settings.theme)
    }
  }, [settings?.theme])

  if (loading) {
    return (
      <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
        <p>Loading settings...</p>
      </div>
    )
  }

  if (!settings) {
    return (
      <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
        <p>Failed to load settings</p>
      </div>
    )
  }

  const renderTabContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">General Settings</h3>
            </div>
            <div className="card-body">
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Default Save Location</h4>
                    <p>Choose where recordings are saved by default</p>
                  </div>
                  <div className="settings-control">
                    <div className="flex gap-sm">
                      <input
                        type="text"
                        className="input"
                        value={settings.defaultSaveLocation}
                        onChange={(e) => updateSetting('defaultSaveLocation', e.target.value)}
                        style={{ minWidth: '200px' }}
                      />
                      <button 
                        className="btn btn-secondary"
                        onClick={handleBrowseSaveLocation}
                      >
                        <FolderIcon size={16} />
                        Browse
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Launch at Login</h4>
                    <p>Automatically start Friday when you log in to your Mac</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.launchAtLogin}
                        onChange={(e) => updateSetting('launchAtLogin', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Theme</h4>
                    <p>Choose your preferred appearance</p>
                  </div>
                  <div className="settings-control">
                    <select 
                      className="input" 
                      style={{ minWidth: '150px' }}
                      value={settings.theme}
                      onChange={(e) => updateSetting('theme', e.target.value as 'auto' | 'light' | 'dark')}
                    >
                      <option value="auto">Auto (System)</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Show in Menu Bar</h4>
                    <p>Display Friday icon in the macOS menu bar</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.showInMenuBar}
                        onChange={(e) => updateSetting('showInMenuBar', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Auto-save Recordings</h4>
                    <p>Automatically save recordings when they stop</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.autoSaveRecordings}
                        onChange={(e) => updateSetting('autoSaveRecordings', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'shortcuts':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Keyboard Shortcuts</h3>
            </div>
            <div className="card-body">
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Start/Stop Recording</h4>
                    <p>Global hotkey to start or stop recording</p>
                  </div>
                  <div className="settings-control">
                    <div className="shortcut-input">
                      <kbd>⌘</kbd> + <kbd>L</kbd>
                      <button className="btn btn-ghost btn-sm">
                        <Edit2Icon size={14} />
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Quick Note</h4>
                    <p>Quickly add a note during recording</p>
                  </div>
                  <div className="settings-control">
                    <div className="shortcut-input">
                      <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>
                      <button className="btn btn-ghost btn-sm">
                        <Edit2Icon size={14} />
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Show/Hide Window</h4>
                    <p>Toggle Friday window visibility</p>
                  </div>
                  <div className="settings-control">
                    <div className="shortcut-input">
                      <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
                      <button className="btn btn-ghost btn-sm">
                        <Edit2Icon size={14} />
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Pause/Resume Recording</h4>
                    <p>Temporarily pause active recording</p>
                  </div>
                  <div className="settings-control">
                    <div className="shortcut-input">
                      <kbd>⌘</kbd> + <kbd>P</kbd>
                      <button className="btn btn-ghost btn-sm">
                        <Edit2Icon size={14} />
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '24px',
                  padding: '16px',
                  background: 'var(--green-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--green-dark)'
                }}
              >
                <div className="flex gap-sm items-center">
                  <HelpCircleIcon size={16} />
                  <span className="text-sm font-medium">
                    Tip: Global shortcuts work from any application
                  </span>
                </div>
              </div>
            </div>
          </div>
        )

      case 'transcription':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Transcription Settings</h3>
            </div>
            <div className="card-body">
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Real-time Transcription</h4>
                    <p>Generate transcript while recording (requires internet)</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.realtimeTranscription}
                        onChange={(e) => updateSetting('realtimeTranscription', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Transcription Language</h4>
                    <p>Primary language for speech recognition</p>
                  </div>
                  <div className="settings-control">
                    <select 
                      className="input" 
                      style={{ minWidth: '150px' }}
                      value={settings.transcriptionLanguage}
                      onChange={(e) => updateSetting('transcriptionLanguage', e.target.value)}
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="ja-JP">Japanese</option>
                      <option value="zh-CN">Chinese (Simplified)</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Gemini API Key</h4>
                    <p>Required for AI-powered transcription and analysis</p>
                  </div>
                  <div className="settings-control">
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <input
                        type="password"
                        className="input input-floating"
                        placeholder=" "
                        value={settings.geminiApiKey}
                        onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                      />
                      <label className="input-label">API Key</label>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <a
                        href="https://makersuite.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm"
                        style={{
                          color: 'var(--interactive-primary)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <ExternalLinkIcon size={12} />
                        Get your Gemini API key
                      </a>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Auto-generate Action Items</h4>
                    <p>Automatically extract action items from transcripts</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.autoGenerateActionItems}
                        onChange={(e) => updateSetting('autoGenerateActionItems', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Auto-suggest Tags</h4>
                    <p>Suggest relevant tags based on transcript content</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.autoSuggestTags}
                        onChange={(e) => updateSetting('autoSuggestTags', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleTestConnection}
                  disabled={testingConnection || !settings.geminiApiKey}
                >
                  <DownloadIcon size={16} />
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                
                {connectionResult && (
                  <div 
                    style={{ 
                      marginTop: '12px',
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      background: connectionResult.success ? 'var(--green-light)' : 'rgba(255, 59, 48, 0.1)',
                      color: connectionResult.success ? 'var(--green-dark)' : 'var(--status-error)',
                      fontSize: 'var(--font-size-sm)'
                    }}
                  >
                    {connectionResult.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'context':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Global Context Settings</h3>
            </div>
            <div className="card-body">
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Enable Global Context</h4>
                    <p>Add persistent context information to all recordings</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.enableGlobalContext}
                        onChange={(e) => updateSetting('enableGlobalContext', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="input-group">
                  <textarea
                    className="input textarea input-floating"
                    placeholder=" "
                    style={{ minHeight: '120px' }}
                    value={settings.globalContext}
                    onChange={(e) => updateSetting('globalContext', e.target.value)}
                  />
                  <label className="input-label">Global Context</label>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Context Files Library</h4>
                    <p>Upload files to use as context in recordings</p>
                  </div>
                  <div className="settings-control">
                    <input
                      type="file"
                      id="global-context-files"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.md"
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="global-context-files" className="btn btn-secondary">
                      <FolderIcon size={16} />
                      Add Files
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Include in Transcriptions</h4>
                    <p>Automatically include context when generating transcripts</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.includeContextInTranscriptions}
                        onChange={(e) => updateSetting('includeContextInTranscriptions', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Include in Action Items</h4>
                    <p>Use context when extracting action items from recordings</p>
                  </div>
                  <div className="settings-control">
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.includeContextInActionItems}
                        onChange={(e) => updateSetting('includeContextInActionItems', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '24px',
                  padding: '16px',
                  background: 'var(--green-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--green-dark)'
                }}
              >
                <div className="flex gap-sm items-center">
                  <FileTextIcon size={16} />
                  <span className="text-sm font-medium">
                    Context helps AI better understand your recordings and generate more relevant
                    insights
                  </span>
                </div>
              </div>
            </div>
          </div>
        )

      case 'about':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">About Friday</h3>
            </div>
            <div className="card-body">
              <div className="text-center mb-xl">
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    background: 'var(--green-primary)',
                    borderRadius: 'var(--radius-xl)',
                    margin: '0 auto var(--spacing-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <MicIcon size={40} color="white" />
                </div>
                <h2 style={{ margin: '0 0 var(--spacing-sm) 0' }}>Friday</h2>
                <p className="text-secondary">Version 1.0.0 (Build 2024.01.15)</p>
              </div>

              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Check for Updates</h4>
                    <p>Automatically check for new versions</p>
                  </div>
                  <div className="settings-control">
                    <button className="btn btn-secondary">
                      <DownloadIcon size={16} />
                      Check Now
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Privacy Policy</h4>
                    <p>Learn how we protect your data</p>
                  </div>
                  <div className="settings-control">
                    <button className="btn btn-ghost">
                      <ExternalLinkIcon size={16} />
                      View Policy
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Terms of Service</h4>
                    <p>Review our terms and conditions</p>
                  </div>
                  <div className="settings-control">
                    <button className="btn btn-ghost">
                      <ExternalLinkIcon size={16} />
                      View Terms
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-label">
                    <h4>Support</h4>
                    <p>Get help and send feedback</p>
                  </div>
                  <div className="settings-control">
                    <button className="btn btn-ghost">
                      <HelpCircleIcon size={16} />
                      Contact Support
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '24px',
                  padding: '16px',
                  background: 'var(--gray-light)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  textAlign: 'center'
                }}
              >
                © 2024 Friday. All rights reserved.
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ padding: 'var(--spacing-xl)' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 'var(--spacing-xl)' 
      }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <button
          className="btn btn-primary"
          onClick={handleSaveSettings}
          disabled={saving}
        >
          {saving ? (
            'Saving...'
          ) : saveSuccess ? (
            <>
              <CheckIcon size={16} />
              Saved
            </>
          ) : (
            <>
              <SaveIcon size={16} />
              Save Settings
            </>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shortcuts')}
        >
          Shortcuts
        </button>
        <button
          className={`tab ${activeTab === 'transcription' ? 'active' : ''}`}
          onClick={() => setActiveTab('transcription')}
        >
          Transcription
        </button>
        <button
          className={`tab ${activeTab === 'context' ? 'active' : ''}`}
          onClick={() => setActiveTab('context')}
        >
          Context
        </button>
        <button
          className={`tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  )
}

export default SettingsScreen
