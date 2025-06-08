import React, { useRef, useEffect } from 'react'
import { PlayIcon, PauseIcon } from 'lucide-react'

interface TranscriptLine {
  time: string
  text: string
}

interface PlaybackInterfaceProps {
  isPlaying: boolean
  currentTime: number
  totalTime: number
  recordedAudioUrl: string | null
  transcript: TranscriptLine[]
  activeLineIndex: number
  onTogglePlayback: () => Promise<void>
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void
  onTranscriptLineClick: (line: TranscriptLine, index: number) => void
  onAudioPlayerRef: (ref: HTMLAudioElement | null) => void
}

const PlaybackInterface: React.FC<PlaybackInterfaceProps> = ({
  isPlaying,
  currentTime,
  totalTime,
  recordedAudioUrl,
  transcript,
  activeLineIndex,
  onTogglePlayback,
  onSeek,
  onTranscriptLineClick,
  onAudioPlayerRef
}) => {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (audioPlayerRef.current) {
      onAudioPlayerRef(audioPlayerRef.current)
    }
  }, [onAudioPlayerRef])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercentage = totalTime > 0 ? (currentTime / totalTime) * 100 : 0
  const hasTranscript = transcript && transcript.length > 0

  return (
    <>
      {/* Hidden audio element for playback */}
      {recordedAudioUrl && (
        <audio
          ref={audioPlayerRef}
          src={recordedAudioUrl}
          onLoadedMetadata={() => {
            if (audioPlayerRef.current && !isNaN(audioPlayerRef.current.duration)) {
              const duration = Math.floor(audioPlayerRef.current.duration)
              console.log(
                `🎵 Audio metadata loaded - Duration: ${duration}s (was ${totalTime}s)`
              )
            }
          }}
          onCanPlay={() => {
            console.log('🎵 Audio can start playing')
          }}
          onLoadStart={() => {
            console.log('🎵 Audio load started')
          }}
          onLoadedData={() => {
            console.log('🎵 Audio data loaded')
            if (audioPlayerRef.current && !isNaN(audioPlayerRef.current.duration)) {
              const duration = Math.floor(audioPlayerRef.current.duration)
              if (duration > 0) {
                console.log(`📐 Audio duration from metadata: ${duration}s`)
              }
            }
          }}
          onError={(e) => {
            const audio = e.currentTarget
            const error = audio.error
            console.error('🚫 Audio error:', {
              code: error?.code,
              message: error?.message,
              src: audio.src,
              networkState: audio.networkState,
              readyState: audio.readyState
            })
          }}
          onEnded={() => {
            console.log('🎵 Audio playback ended')
          }}
          style={{ display: 'none' }}
          preload="metadata"
        />
      )}

      <div className="waveform-player">
        <div className="waveform-controls">
          <button
            className="btn btn-ghost btn-icon"
            onClick={onTogglePlayback}
            disabled={!recordedAudioUrl}
          >
            {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <div className="waveform-time">
            <span>{formatTime(currentTime)}</span> / <span>{formatTime(totalTime)}</span>
          </div>
        </div>

        <div className="waveform-track" onClick={onSeek}>
          <div className="waveform-progress" style={{ width: `${progressPercentage}%` }} />
          <div className="waveform-handle" style={{ left: `${progressPercentage}%` }} />
        </div>
      </div>

      {/* Transcript Content */}
      <div className="transcript-content">
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Transcript</h3>
        <div className="transcript-lines">
          {hasTranscript ? (
            transcript.map((line, index) => (
              <div
                key={index}
                className={`transcript-line ${index === activeLineIndex ? 'active' : ''}`}
                onClick={() => onTranscriptLineClick(line, index)}
              >
                <div className="transcript-time">{line.time}</div>
                <div
                  className="transcript-text"
                  contentEditable
                  suppressContentEditableWarning
                >
                  {line.text}
                </div>
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
              <p>No transcript available.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default PlaybackInterface 