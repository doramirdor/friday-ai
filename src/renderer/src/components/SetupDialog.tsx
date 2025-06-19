import React, { useState, useEffect } from 'react'
import { CheckIcon, DownloadIcon, AlertCircleIcon } from 'lucide-react'

interface SetupProgress {
  step: string
  progress: number
  message: string
  success?: boolean
  error?: string
}

interface SetupDialogProps {
  isOpen: boolean
  onComplete: () => void
  onCancel: () => void
}

const SetupDialog: React.FC<SetupDialogProps> = ({ isOpen, onComplete, onCancel }) => {
  const [progress, setProgress] = useState<SetupProgress>({
    step: 'starting',
    progress: 0,
    message: 'Initializing setup...'
  })
  const [isSetupRunning, setIsSetupRunning] = useState(false)
  const [setupComplete, setSetupComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Listen for setup progress updates
      const handleProgress = (progressData: SetupProgress) => {
        setProgress(progressData)
        
        if (progressData.error) {
          setError(progressData.error)
          setIsSetupRunning(false)
        } else if (progressData.progress >= 100) {
          setSetupComplete(true)
          setIsSetupRunning(false)
        }
      }

      // Add event listener for setup progress
      window.addEventListener('setup-progress', handleProgress as EventListener)

      return () => {
        window.removeEventListener('setup-progress', handleProgress as EventListener)
      }
    }
  }, [isOpen])

  const handleStartSetup = async () => {
    setIsSetupRunning(true)
    setError(null)
    setSetupComplete(false)
    
    try {
      // Trigger setup through IPC
      await window.api.system?.runFirstTimeSetup?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
      setIsSetupRunning(false)
    }
  }

  const handleSkipSetup = () => {
    // Mark setup as skipped
    window.api.system?.skipFirstTimeSetup?.()
    onComplete()
  }

  const handleComplete = () => {
    if (setupComplete) {
      onComplete()
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--surface-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        width: '500px',
        maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: '600', 
            marginBottom: '8px',
            color: 'var(--text-primary)'
          }}>
            🎉 Welcome to Friday!
          </h1>
          <p style={{ 
            color: 'var(--text-secondary)', 
            lineHeight: '1.5',
            fontSize: '16px'
          }}>
            First-time setup required
          </p>
        </div>

        {!isSetupRunning && !setupComplete && !error && (
          <div>
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--surface-secondary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px'
            }}>
              <p style={{ 
                marginBottom: '12px',
                color: 'var(--text-primary)',
                fontWeight: '500'
              }}>
                Friday can set up local AI features for enhanced privacy:
              </p>
              <ul style={{ 
                color: 'var(--text-secondary)',
                paddingLeft: '20px',
                margin: 0,
                lineHeight: '1.6'
              }}>
                <li>Complete privacy - your data never leaves your device</li>
                <li>No internet required after setup</li>
                <li>Free to use with no API costs</li>
                <li>Downloads ~2GB of AI models</li>
              </ul>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                className="btn btn-primary"
                onClick={handleStartSetup}
                style={{ minWidth: '160px' }}
              >
                <DownloadIcon size={16} />
                Setup Local AI
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSkipSetup}
                style={{ minWidth: '160px' }}
              >
                Use Cloud AI Only
              </button>
            </div>
            
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                marginTop: '16px',
                width: '100%',
                textAlign: 'center'
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {isSetupRunning && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '18px',
                fontWeight: '500',
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                {progress.step.charAt(0).toUpperCase() + progress.step.slice(1)}
              </div>
              
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--surface-tertiary)',
                borderRadius: '4px',
                marginBottom: '8px'
              }}>
                <div style={{
                  width: `${progress.progress}%`,
                  height: '100%',
                  backgroundColor: 'var(--interactive-primary)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              
              <div style={{
                color: 'var(--text-secondary)',
                fontSize: '14px'
              }}>
                {progress.message}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                width: '32px',
                height: '32px',
                border: '3px solid var(--surface-tertiary)',
                borderTop: '3px solid var(--interactive-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          </div>
        )}

        {setupComplete && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: 'var(--status-success)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <CheckIcon size={32} color="white" />
            </div>
            
            <h3 style={{ 
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Setup Complete!
            </h3>
            
            <p style={{ 
              color: 'var(--text-secondary)',
              marginBottom: '24px'
            }}>
              Friday is ready to use with local AI features.
            </p>

            <button
              className="btn btn-primary"
              onClick={handleComplete}
              style={{ minWidth: '120px' }}
            >
              Get Started
            </button>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: 'var(--status-error)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <AlertCircleIcon size={32} color="white" />
            </div>
            
            <h3 style={{ 
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Setup Failed
            </h3>
            
            <p style={{ 
              color: 'var(--text-secondary)',
              marginBottom: '24px'
            }}>
              {error}
            </p>

            <div style={{ 
              display: 'flex', 
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setError(null)
                  setIsSetupRunning(false)
                }}
              >
                Try Again
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSkipSetup}
              >
                Skip Setup
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default SetupDialog 