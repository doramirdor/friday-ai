import React, { useState, useEffect } from 'react'
import { MicIcon, AlertTriangleIcon, SettingsIcon, SpeakerIcon, BluetoothIcon } from 'lucide-react'

interface RecordingInterfaceProps {
  transcriptionStatus: string
  isSwiftRecorderAvailable: boolean
  recordingMode: 'microphone' | 'combined'
  onRecordingModeChange: (mode: 'microphone' | 'combined') => void
  onStartRecording: () => void
}

const RecordingInterface: React.FC<RecordingInterfaceProps> = ({
  transcriptionStatus,
  isSwiftRecorderAvailable,
  recordingMode,
  onRecordingModeChange,
  onStartRecording
}) => {
  const [showDeviceManager, setShowDeviceManager] = useState(false)
  const [currentAudioDevice, setCurrentAudioDevice] = useState<string>('')
  const [isBluetoothDevice, setIsBluetoothDevice] = useState(false)
  const [availableDevices, setAvailableDevices] = useState<string[]>([])

  // Check current audio device on mount
  useEffect(() => {
    checkCurrentAudioDevice()
  }, [])

  const checkCurrentAudioDevice = async (): Promise<void> => {
    try {
      const result = await (window.api as any).audio?.getCurrentDevice()
      if (result?.success) {
        setCurrentAudioDevice(result.deviceName || 'Unknown')
        setIsBluetoothDevice(result.isBluetooth || false)
        setAvailableDevices(result.availableDevices || [])
      }
    } catch (error) {
      console.error('Failed to check audio device:', error)
    }
  }

  const switchToBuiltInSpeakers = async (): Promise<void> => {
    try {
      const result = await (window.api as any).audio?.switchToBuiltInSpeakers()
      if (result?.success) {
        console.log('✅ Switched to built-in speakers')
        await checkCurrentAudioDevice()
        setShowDeviceManager(false)
      } else {
        console.error('Failed to switch to built-in speakers:', result?.error)
      }
    } catch (error) {
      console.error('Error switching to built-in speakers:', error)
    }
  }

  const enableBluetoothWorkaround = async (): Promise<void> => {
    try {
      const result = await (window.api as any).audio?.enableBluetoothWorkaround()
      if (result?.success) {
        console.log('✅ Bluetooth workaround enabled')
        setShowDeviceManager(false)
      } else {
        console.error('Failed to enable Bluetooth workaround:', result?.error)
      }
    } catch (error) {
      console.error('Error enabling Bluetooth workaround:', error)
    }
  }

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

      {/* Device Manager for Bluetooth Issues */}
      {isBluetoothDevice && (
        <div className="bluetooth-warning">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <BluetoothIcon size={16} color="#f59e0b" />
            <span style={{ fontWeight: '600', color: '#f59e0b' }}>
              Bluetooth Audio Detected: {currentAudioDevice}
            </span>
          </div>
          <p style={{ fontSize: '14px', marginBottom: '12px', color: '#6b7280' }}>
            System audio capture may be limited with Bluetooth devices. For best results:
          </p>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={switchToBuiltInSpeakers}
              className="device-option-btn"
              style={{
                padding: '8px 12px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <SpeakerIcon size={14} />
              Switch to Built-in Speakers
            </button>
            
            <button
              onClick={enableBluetoothWorkaround}
              className="device-option-btn"
              style={{
                padding: '8px 12px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <SettingsIcon size={14} />
              Try Auto-Workaround
            </button>
            
            <button
              onClick={() => setShowDeviceManager(!showDeviceManager)}
              style={{
                padding: '8px 12px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <AlertTriangleIcon size={14} />
              {showDeviceManager ? 'Hide Options' : 'More Options'}
            </button>
          </div>
          
          {showDeviceManager && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>Device Management</h4>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                Current device: <strong>{currentAudioDevice}</strong>
              </div>
              {availableDevices.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', marginBottom: '4px' }}>Available devices:</div>
                  <ul style={{ fontSize: '12px', color: '#6b7280', paddingLeft: '16px', margin: 0 }}>
                    {availableDevices.map((device, index) => (
                      <li key={index}>{device}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RecordingInterface 