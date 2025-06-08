import React from 'react'
import { MicIcon } from 'lucide-react'

interface RecordingInterfaceProps {
  transcriptionStatus: string
  isSwiftRecorderAvailable: boolean
  recordingMode: 'microphone' | 'combined'
  onRecordingModeChange: (mode: 'microphone' | 'combined') => void
  onStartRecording: () => Promise<void>
}

const RecordingInterface: React.FC<RecordingInterfaceProps> = ({
  transcriptionStatus,
  isSwiftRecorderAvailable,
  recordingMode,
  onRecordingModeChange,
  onStartRecording
}) => {
  const getRecordingStatusColor = (): string => {
    switch (transcriptionStatus) {
      case 'recording':
        return 'var(--status-error)'
      case 'ready':
        return 'var(--status-success)'
      case 'error':
        return 'var(--status-error)'
      case 'initializing':
        return 'var(--status-warning)'
      default:
        return 'var(--text-secondary)'
    }
  }

  const getRecordingStatusText = (): string => {
    switch (transcriptionStatus) {
      case 'initializing':
        return 'Initializing transcription service...'
      case 'ready':
        return 'Ready to record'
      case 'recording':
        return 'Recording live...'
      case 'recording-mic-only':
        return 'Recording (Microphone Only)...'
      case 'processing':
        return 'Processing audio...'
      case 'error':
        return 'Transcription service error'
      default:
        return 'Ready to record'
    }
  }

  return (
    <div
      className="recording-interface"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        textAlign: 'center'
      }}
    >
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <MicIcon size={64} color={getRecordingStatusColor()} />
      </div>
      <h2 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-primary)' }}>
        Ready to Record
      </h2>
      <p
        style={{
          marginBottom: 'var(--spacing-md)',
          color: 'var(--text-secondary)',
          maxWidth: '400px'
        }}
      >
        {getRecordingStatusText()}
      </p>

      {/* Recording Mode Selector */}
      {isSwiftRecorderAvailable && (
        <div
          style={{
            marginBottom: 'var(--spacing-lg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--spacing-sm)'
          }}
        >
          <label style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Recording Mode
          </label>
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              background: 'var(--surface-secondary)',
              padding: '4px',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <button
              className={`btn btn-sm ${recordingMode === 'microphone' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onRecordingModeChange('microphone')}
              style={{ minWidth: '120px' }}
            >
              🎤 Microphone Only
            </button>
            <button
              className={`btn btn-sm ${recordingMode === 'combined' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onRecordingModeChange('combined')}
              style={{ minWidth: '120px' }}
            >
              🎵 System + Mic
            </button>
          </div>
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              maxWidth: '300px',
              textAlign: 'center'
            }}
          >
            {recordingMode === 'combined'
              ? 'Records both system audio and microphone for complete meeting capture'
              : 'Records microphone input only'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
        <button
          className="btn btn-primary btn-lg"
          onClick={onStartRecording}
          disabled={transcriptionStatus !== 'ready'}
        >
          <MicIcon size={20} />
          {recordingMode === 'combined' && isSwiftRecorderAvailable
            ? 'Start Combined Recording'
            : 'Start Recording'}
        </button>
      </div>
    </div>
  )
}

export default RecordingInterface 