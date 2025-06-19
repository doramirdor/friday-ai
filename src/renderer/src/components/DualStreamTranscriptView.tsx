import React from 'react'
import { MicIcon, SpeakerIcon } from 'lucide-react'

interface TranscriptLine {
  time: string
  text: string
}

interface DualStreamTranscriptViewProps {
  isRecording: boolean
  microphoneTranscript: TranscriptLine[]
  systemAudioTranscript: TranscriptLine[]
  liveTextMicrophone: string
  liveTextSystemAudio: string
  currentTime: number
}

const DualStreamTranscriptView: React.FC<DualStreamTranscriptViewProps> = ({
  isRecording,
  microphoneTranscript,
  systemAudioTranscript,
  liveTextMicrophone,
  liveTextSystemAudio,
  currentTime
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const TranscriptPanel: React.FC<{
    title: string
    icon: React.ReactNode
    transcript: TranscriptLine[]
    liveText: string
    color: string
  }> = ({ title, icon, transcript, liveText, color }) => (
    <div className="transcript-panel" style={{ flex: 1, border: `2px solid ${color}`, borderRadius: '8px', margin: '4px' }}>
      <div className="transcript-header" style={{ 
        padding: '12px', 
        borderBottom: `1px solid ${color}`, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        backgroundColor: `${color}15`
      }}>
        {icon}
        <h3 style={{ margin: 0, color }}>{title}</h3>
        {isRecording && (
          <div style={{ 
            marginLeft: 'auto', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px' 
          }}>
            <div 
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: color,
                animation: 'pulse 2s infinite'
              }}
            />
            <span style={{ fontSize: '14px', color: '#666' }}>Live</span>
          </div>
        )}
      </div>
      
      <div className="transcript-content" style={{ 
        padding: '12px', 
        maxHeight: '300px', 
        overflowY: 'auto',
        minHeight: '200px'
      }}>
        {transcript.length > 0 ? (
          <div className="transcript-lines">
            {transcript.map((line, index) => (
              <div
                key={index}
                className="transcript-line"
                style={{
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${color}`
                }}
              >
                <div style={{ 
                  fontSize: '12px', 
                  color: '#666', 
                  marginBottom: '4px' 
                }}>{line.time}</div>
                <div style={{ 
                  fontSize: '14px', 
                  lineHeight: '1.4' 
                }}>{line.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#999'
          }}>
            <p>No {title.toLowerCase()} transcript yet...</p>
            {isRecording && <p>Start speaking or playing audio to see live transcription.</p>}
          </div>
        )}

        {/* Live text preview */}
        {isRecording && liveText && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: `${color}20`,
            borderRadius: '4px',
            border: `1px dashed ${color}`,
            fontStyle: 'italic',
            color: '#666',
            animation: 'fadeIn 0.3s ease-in-out'
          }}>
            <div style={{ 
              fontSize: '12px', 
              color, 
              marginBottom: '4px',
              fontWeight: '500'
            }}>
              Live: {formatTime(currentTime)}
            </div>
                         <div>&ldquo;{liveText}&rdquo;</div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="dual-stream-transcript-view" style={{ height: '100%' }}>
      <div className="transcript-header" style={{ 
        padding: '16px', 
        borderBottom: '1px solid #e1e5e9',
        backgroundColor: '#f8f9fa'
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
          Live Transcription
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
          Real-time transcription of microphone and system audio
        </p>
      </div>

      <div className="transcript-panels" style={{ 
        display: 'flex', 
        padding: '16px',
        height: 'calc(100% - 80px)',
        gap: '8px'
      }}>
        <TranscriptPanel
          title="Microphone"
          icon={<MicIcon size={18} />}
          transcript={microphoneTranscript}
          liveText={liveTextMicrophone}
          color="#3b82f6"
        />
        
        <TranscriptPanel
          title="System Audio"
          icon={<SpeakerIcon size={18} />}
          transcript={systemAudioTranscript}
          liveText={liveTextSystemAudio}
          color="#10b981"
        />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .transcript-panel::-webkit-scrollbar {
          width: 4px;
        }
        
        .transcript-panel::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 2px;
        }
        
        .transcript-panel::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 2px;
        }
        
        .transcript-panel::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      `}</style>
    </div>
  )
}

export default DualStreamTranscriptView 