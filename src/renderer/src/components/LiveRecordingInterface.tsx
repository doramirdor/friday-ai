import React from 'react'
import { PauseIcon } from 'lucide-react'

interface TranscriptLine {
  time: string
  text: string
}

interface LiveRecordingInterfaceProps {
  currentTime: number
  transcriptionStatus: string
  recordingWarning: string | null
  transcript: TranscriptLine[]
  liveText: string
  onStopRecording: () => Promise<void>
}

const LiveRecordingInterface: React.FC<LiveRecordingInterfaceProps> = ({
  currentTime,
  transcriptionStatus,
  recordingWarning,
  transcript,
  liveText,
  onStopRecording
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getRecordingStatusText = (): string => {
    switch (transcriptionStatus) {
      case 'recording':
        return `Recording live... ${formatTime(currentTime)}`
      case 'recording-mic-only':
        return `Recording (Microphone Only)... ${formatTime(currentTime)}`
      default:
        return `Recording... ${formatTime(currentTime)}`
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Recording Status Header */}
      <div
        style={{
          padding: 'var(--spacing-md)',
          background: 'var(--surface-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: 'var(--status-error)',
              animation: 'pulse 2s infinite'
            }}
          />
          <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
            {getRecordingStatusText()}
          </span>
        </div>
        <button
          className="btn btn-secondary"
          onClick={onStopRecording}
          style={{ marginLeft: 'auto' }}
        >
          <PauseIcon size={16} />
          Stop Recording
        </button>
      </div>

      {/* Show warning if system audio capture failed */}
      {recordingWarning && (
        <div
          style={{
            padding: 'var(--spacing-md)',
            background: '#FFF3CD',
            border: '1px solid #FFEAA7',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--spacing-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span style={{ color: '#856404', fontSize: '14px' }}>
              {recordingWarning}
            </span>
          </div>
        </div>
      )}

      {/* Live Transcript */}
      <div className="transcript-content" style={{ flex: 1, overflow: 'auto' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Live Transcript</h3>
        <div className="transcript-lines">
          {transcript.length > 0 ? (
            transcript.map((line, index) => (
              <div
                key={index}
                className={`transcript-line ${index === transcript.length - 1 ? 'active' : ''}`}
              >
                <div className="transcript-time">{line.time}</div>
                <div className="transcript-text">{line.text}</div>
              </div>
            ))
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--spacing-xl)',
                color: 'var(--text-secondary)'
              }}
            >
              <p>Speak to start transcribing...</p>
            </div>
          )}

          {/* Live text preview */}
          {liveText && (
            <div
              style={{
                padding: 'var(--spacing-sm)',
                background: 'var(--surface-tertiary)',
                borderRadius: 'var(--radius-sm)',
                marginTop: 'var(--spacing-sm)',
                fontStyle: 'italic',
                color: 'var(--text-secondary)'
              }}
            >
              Processing: &ldquo;{liveText}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveRecordingInterface 