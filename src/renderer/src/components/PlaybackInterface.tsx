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
  // transcript: TranscriptLine[] // Removed
  // activeLineIndex: number // Removed
  onTogglePlayback: () => Promise<void>
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void
  // onTranscriptLineClick: (line: TranscriptLine, index: number) => void // Removed
  onAudioPlayerRef: (ref: HTMLAudioElement | null) => void
}

const PlaybackInterface: React.FC<PlaybackInterfaceProps> = ({
  isPlaying,
  currentTime,
  totalTime,
  recordedAudioUrl,
  // transcript, // Removed
  // activeLineIndex, // Removed
  onTogglePlayback,
  onSeek,
  // onTranscriptLineClick, // Removed
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
  // const hasTranscript = transcript && transcript.length > 0 // Removed

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

      {/* Transcript Content removed as BlockNoteEditor in parent now handles transcript display */}
    </>
  )
}

export default PlaybackInterface 