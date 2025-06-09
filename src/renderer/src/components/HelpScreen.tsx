import React from 'react'
import {
  HelpCircleIcon,
  BookOpenIcon,
  KeyIcon,
  MicIcon,
  BotIcon,
  MailIcon
} from 'lucide-react'

const HelpScreen: React.FC = () => {
  const handleContactSupport = (): void => {
    window.open('mailto:support@friday-app.com?subject=Friday Support Request', '_blank')
  }

  const handleViewDocumentation = (): void => {
    window.open('https://docs.friday-app.com', '_blank')
  }

  return (
    <div className="library-container" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-lg)' }}>
      <div style={{ maxWidth: '800px', width: '100%' }}>
        {/* Header */}
        <div style={{ 
          textAlign: 'center',
          marginBottom: 'var(--spacing-xl)' 
        }}>
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
            <HelpCircleIcon size={40} color="white" />
          </div>
          <h2 style={{ 
            margin: 0,
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            Help & Support
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            Get the most out of Friday with these helpful resources
          </p>
        </div>

        {/* Quick Start */}
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <h3 className="card-title">🚀 Quick Start Guide</h3>
          </div>
          <div className="card-body">
            <div className="help-steps">
              <div className="help-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Create a New Meeting</h4>
                  <p>Click &ldquo;New Meeting&rdquo; in the toolbar or use the global shortcut <kbd>⌘+Alt+R</kbd></p>
                </div>
              </div>
              <div className="help-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>Start Recording</h4>
                  <p>Click the record button and Friday will capture both your microphone and system audio</p>
                </div>
              </div>
              <div className="help-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>Real-time AI Features</h4>
                  <p>Watch as Friday transcribes speech, generates summaries, and creates action items automatically</p>
                </div>
              </div>
              <div className="help-step">
                <div className="step-number">4</div>
                <div className="step-content">
                  <h4>Review & Share</h4>
                  <p>Edit your transcript, generate professional messages, and export your meeting insights</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
          {/* Recording Features */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <MicIcon size={20} />
                <h3 className="card-title">Recording Features</h3>
              </div>
            </div>
            <div className="card-body">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Dual Audio Capture:</strong> Records both microphone and system audio
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Real-time Transcription:</strong> Live speech-to-text using advanced AI
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Smart Alerts:</strong> Keyword monitoring with semantic matching
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Pause & Resume:</strong> Full control over your recording session
                </li>
              </ul>
            </div>
          </div>

          {/* AI Features */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <BotIcon size={20} />
                <h3 className="card-title">AI-Powered Analysis</h3>
              </div>
            </div>
            <div className="card-body">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Auto Summary:</strong> Intelligent meeting summaries with key points
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Action Items:</strong> Automatically extracted tasks and follow-ups
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Message Generator:</strong> Create professional Slack/email updates
                </li>
                <li style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <strong>Q&A Assistant:</strong> Ask questions about your meeting content
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <KeyIcon size={20} />
              <h3 className="card-title">Keyboard Shortcuts</h3>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--spacing-md)' }}>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>⌘</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd>
                </div>
                <div className="shortcut-description">Start/Stop Recording</div>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>⌘</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd>
                </div>
                <div className="shortcut-description">Quick Note</div>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>
                </div>
                <div className="shortcut-description">Show/Hide Window</div>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>⌘</kbd> + <kbd>Alt</kbd> + <kbd>P</kbd>
                </div>
                <div className="shortcut-description">Pause/Resume</div>
              </div>
            </div>
          </div>
        </div>

        {/* Support Options */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Need More Help?</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-md)' }}>
              <button 
                className="btn btn-secondary w-full"
                onClick={handleViewDocumentation}
                style={{ padding: 'var(--spacing-md)', height: 'auto' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <BookOpenIcon size={24} />
                  <div>
                    <div style={{ fontWeight: '500' }}>Documentation</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.7 }}>Detailed guides & tutorials</div>
                  </div>
                </div>
              </button>

              <button 
                className="btn btn-secondary w-full"
                onClick={handleContactSupport}
                style={{ padding: 'var(--spacing-md)', height: 'auto' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <MailIcon size={24} />
                  <div>
                    <div style={{ fontWeight: '500' }}>Contact Support</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.7 }}>Get personalized help</div>
                  </div>
                </div>
              </button>
            </div>

            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                background: 'var(--surface-secondary)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center'
              }}
            >
              <div style={{ marginBottom: '8px', fontWeight: '500' }}>Friday v1.0.0</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Built with ❤️ for better meetings and productivity
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HelpScreen 