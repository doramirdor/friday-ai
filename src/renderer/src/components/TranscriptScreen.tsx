import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Meeting } from '../types/database'
import { AlertKeyword, AlertMatch } from '../types/electron'
import RecordingInterface from './RecordingInterface'
import LiveRecordingInterface from './LiveRecordingInterface'
import PlaybackInterface from './PlaybackInterface'
import SidebarContent from './SidebarContent'
import { useRecordingService } from './RecordingService'

/// <reference path="../../preload/index.d.ts" />

interface TranscriptLine {
  time: string
  text: string
}

interface TranscriptScreenProps {
  meeting: Meeting | null
}

interface TranscriptionResult {
  type: 'transcript' | 'error' | 'pong' | 'shutdown'
  text?: string
  message?: string
  chunk_id?: number
  language?: string
  language_probability?: number
  duration?: number
  words?: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
}

interface RecordingResult {
  success?: boolean
  error?: string
  code?: string
  warning?: string
  recommendation?: string
  path?: string
  timestamp?: string
  device?: string
  screen_permission?: boolean
}

interface EnhancedAIOptions {
  type: 'slack' | 'email'
  title?: string
  description?: string
  contextText?: string
  notes?: string
  summary?: string
  transcript?: TranscriptLine[]
  actionItems?: Array<{ id: number; text: string; completed: boolean }>
  questionHistory?: Array<any>
  followupQuestions?: Array<any>
  followupRisks?: Array<any>
  followupComments?: Array<any>
}

const TranscriptScreen: React.FC<TranscriptScreenProps> = ({ meeting }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [contextText, setContextText] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [isSummaryAIGenerated, setIsSummaryAIGenerated] = useState(false)
  const [actionItems, setActionItems] = useState<
    Array<{ id: number; text: string; completed: boolean }>
  >([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [needsAutoSave, setNeedsAutoSave] = useState(false)
  const [alertKeywords, setAlertKeywords] = useState<AlertKeyword[]>([])
  const [showAlertIndicator, setShowAlertIndicator] = useState(false)
  const [currentAlert, setCurrentAlert] = useState<AlertMatch | null>(null)

  // AI generation loading states
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isGeneratingAllContent, setIsGeneratingAllContent] = useState(false)
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false)
  const [aiLoadingMessage, setAiLoadingMessage] = useState('')

  // Combined loading state for full-screen overlay
  const isAIGenerating = isGeneratingSummary || isGeneratingAllContent || isGeneratingMessage

  // Recording service state
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('idle')
  const [isSwiftRecorderAvailable, setIsSwiftRecorderAvailable] = useState(false)
  const [recordingMode, setRecordingMode] = useState<'microphone' | 'combined'>('microphone')
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null)
  const [combinedRecordingPath, setCombinedRecordingPath] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [liveText, setLiveText] = useState('')

  const playbackInterval = useRef<NodeJS.Timeout | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Function to load existing recording file
  const loadExistingRecording = useCallback(async (filePath: string): Promise<void> => {
    try {
      console.log('🔄 Loading recording file via IPC...')

      const result = await (window.api as any).transcription?.loadRecording(filePath)

      if (result?.success && result.buffer) {
        const isMP3 = filePath.toLowerCase().endsWith('.mp3')
        const mimeType = isMP3 ? 'audio/mpeg' : 'audio/webm'

        const blob = new Blob([result.buffer], { type: mimeType })
        const audioUrl = URL.createObjectURL(blob)
        setRecordedAudioUrl(audioUrl)
        console.log(`✅ Recording loaded for playback via IPC (${mimeType})`)
      } else {
        console.error('Failed to load recording file:', result?.error || 'No transcription API available')
      }
    } catch (error) {
      console.error('Failed to load existing recording:', error)
    }
  }, [])

  // Helper function to load recording (single file or chunks)
  const loadRecording = useCallback(async (recordingPath: string | string[]): Promise<void> => {
    try {
      if (Array.isArray(recordingPath)) {
          console.log('⚠️ Chunked recording playback not yet implemented')
      } else {
        await loadExistingRecording(recordingPath)
      }
    } catch (error) {
      console.error('Failed to load recording:', error)
    }
  }, [loadExistingRecording])

  // Function to check for keyword matches in transcript
  const checkForAlerts = useCallback(async (transcriptText: string): Promise<void> => {
    if (alertKeywords.length === 0) return

    const enabledKeywords = alertKeywords.filter(kw => kw.enabled)
    if (enabledKeywords.length === 0) return

    try {
      const result = await (window.api as any).alerts?.checkKeywords({
        transcript: transcriptText,
        keywords: enabledKeywords
      })

      if (result?.success && result.matches && result.matches.length > 0) {
        // Show visual alert for the first match
        if (result.matches.length > 0) {
          setCurrentAlert(result.matches[0])
          setShowAlertIndicator(true)
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setShowAlertIndicator(false)
            setCurrentAlert(null)
          }, 5000)
        }
        
        // Log alerts
        result.matches.forEach((match: any) => {
          console.log(`🚨 ALERT: Keyword "${match.keyword}" detected (${(match.similarity * 100).toFixed(1)}% match)`)
          console.log(`   Text: "${match.text}"`)
        })
        }
      } catch (error) {
      console.error('Failed to check for alerts:', error)
    }
  }, [alertKeywords])

  // Recording service callbacks
  const handleTranscriptionResult = useCallback((result: TranscriptionResult): void => {
      if (result.type === 'transcript' && result.text && result.text !== 'undefined') {
        setLiveText((prev) => prev + ' ' + result.text)

      // Check for alerts on new transcript text
      checkForAlerts(result.text)
      
      // This will be handled by the recording service itself
      // The transcript state is managed by the service
      } else if (result.type === 'error') {
        console.error('Transcription error:', result.message)
    }
  }, [checkForAlerts])

  const handleCombinedRecordingStarted = useCallback((result: RecordingResult): void => {
      console.log('🎙️ Combined recording started:', result)
    setIsRecording(true)
      
      if (result.code === 'BLUETOOTH_LIMITATION') {
        console.warn('⚠️ Bluetooth audio detected:', result.warning)
        const bluetoothWarning = `⚠️ ${result.warning}\n💡 ${result.recommendation}\n\n🔧 **Quick Fix Options:**\n1. Switch to built-in speakers for full system audio capture\n2. Continue with microphone-only recording\n3. Try the automatic Bluetooth workaround (if available)`
        setRecordingWarning(bluetoothWarning)
        setTranscriptionStatus('recording-mic-only')
      } else if (result.code === 'SCREEN_PERMISSION_REQUIRED') {
        console.warn('⚠️ Screen recording permission required:', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}\n💡 ${result.recommendation}\n\nPlease grant screen recording permission in System Settings > Privacy & Security > Screen Recording`)
        setTranscriptionStatus('recording-mic-only')
      } else if (result.code === 'SYSTEM_AUDIO_UNAVAILABLE') {
        console.warn('⚠️ System audio unavailable:', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}\n💡 ${result.recommendation}`)
        setTranscriptionStatus('recording-mic-only')
      } else if (result.code === 'RECORDING_STARTED_MIC_ONLY') {
        console.warn('⚠️ System audio capture failed (legacy):', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}`)
        setTranscriptionStatus('recording-mic-only')
      } else if (result.code === 'RECORDING_FAILED' || result.code === 'SYSTEM_AUDIO_FAILED') {
        console.error('❌ Recording failed:', result.error)
        setRecordingWarning(`❌ Recording failed: ${result.error}`)
        setTranscriptionStatus('error')
      setIsRecording(false)
      } else if (result.code === 'RECORDING_STARTED') {
        setRecordingWarning(null)
        setTranscriptionStatus('recording')
        
        if (result.warning) {
          console.warn('⚠️ Recording quality warning:', result.warning)
          setRecordingWarning(`ℹ️ ${result.warning}`)
        }
      } else {
        console.warn('⚠️ Unknown recording result code:', result.code)
        setRecordingWarning(null)
      }
  }, [])

  const handleCombinedRecordingStopped = useCallback((result: RecordingResult): void => {
      console.log('🎙️ Combined recording stopped:', result)
    setIsRecording(false)
    setRecordingWarning(null)

      if (result.path) {
        console.log('📁 Setting combined recording path from result:', result.path)
        setCombinedRecordingPath(result.path)
        console.log('📁 Stored combined recording path:', result.path)
        
        // Load the recording for immediate playback with proper timing
        console.log('🎵 Loading recording for playback:', result.path)
        setTimeout(async () => {
          try {
            if (result.path) {
              await loadRecording(result.path)
              console.log('✅ Recording loaded successfully for playback')
              
              // Set total time if not already set
              if (totalTime === 0 && currentTime > 0) {
                setTotalTime(currentTime)
                const mins = Math.floor(currentTime / 60)
                const secs = currentTime % 60
                const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
                console.log('⏱️ Set total time to:', timeStr)
              }
            }
          } catch (error) {
            console.error('❌ Failed to load recording for playback:', error)
          }
        }, 1000) // Wait 1 second to ensure file is fully written
        
        // Force auto-save trigger since we have a new recording path
        console.log('🔄 Forcing auto-save due to new recording path')
        setTimeout(() => setNeedsAutoSave(true), 1500) // Wait a bit longer for file operations
      } else {
        console.warn('⚠️ No recording path in combined recording result:', result)
      }
  }, [loadRecording, currentTime, totalTime])

  const handleCombinedRecordingFailed = useCallback((result: RecordingResult): void => {
      console.error('❌ Recording failed during operation:', result.error)
      
      setIsRecording(false)
      setTranscriptionStatus('error')
      setRecordingWarning(`❌ Recording failed: ${result.error}`)
  }, [])

  // Memoize recording service props to prevent re-creation
  const recordingServiceProps = useMemo(() => ({
    onTranscriptionResult: handleTranscriptionResult,
    onCombinedRecordingStarted: handleCombinedRecordingStarted,
    onCombinedRecordingStopped: handleCombinedRecordingStopped,
    onCombinedRecordingFailed: handleCombinedRecordingFailed,
    onTranscriptionStatusChange: setTranscriptionStatus,
    onSwiftRecorderAvailabilityChange: setIsSwiftRecorderAvailable
  }), [
    handleTranscriptionResult,
    handleCombinedRecordingStarted,
    handleCombinedRecordingStopped,
    handleCombinedRecordingFailed
  ])

  // Initialize recording service with memoized props
  const recordingService = useRecordingService(recordingServiceProps)

  // Initialize data from meeting prop
  useEffect(() => {
    if (meeting) {
      console.log('🎵 Meeting data:', meeting)
      console.log('📝 Transcript data from meeting:', meeting.transcript)
      console.log('📝 Transcript length:', meeting.transcript?.length || 0)
      setTitle(meeting.title)
      setDescription(meeting.description)
      setTags(meeting.tags)
      setContextText(meeting.context)
      setActionItems(meeting.actionItems)
      setTranscript(meeting.transcript || [])
      setUploadedFiles(meeting.context_files || [])
      setNotes(meeting.notes || '')
      setSummary(meeting.summary || '')
      setIsSummaryAIGenerated(!!meeting.summary)

      // Parse duration to seconds
      if (meeting.duration && meeting.duration !== '00:00') {
        const [minutes, seconds] = meeting.duration.split(':').map(Number)
        const totalSeconds = (minutes || 0) * 60 + (seconds || 0)
        setTotalTime(totalSeconds)
        console.log('⏱️ Loaded duration:', meeting.duration, `(${totalSeconds} seconds)`)
    } else {
        console.log('⚠️ No valid duration found in meeting data')
      }

      // Load existing recording if available
      if (meeting.recordingPath) {
        console.log('🎵 Loading existing recording from:', meeting.recordingPath)
        loadRecording(meeting.recordingPath)
      }
    }
  }, [meeting, loadRecording])

  // Initialize recording service on mount
  useEffect(() => {
    recordingService.initializeService()
  }, [])

  // Handle global shortcut events
  useEffect(() => {
    const handleToggleRecording = (): void => {
      console.log('📱 TranscriptScreen: Toggle recording event received')
      const state = recordingService.getState()
      if (state.isRecording) {
        recordingService.stopRecording()
              } else {
        recordingService.startRecording(recordingMode)
      }
    }

    const handleQuickNote = (): void => {
      console.log('📱 TranscriptScreen: Quick note event received')
      const state = recordingService.getState()
      if (state.isRecording && state.currentTime > 0) {
        const minutes = Math.floor(state.currentTime / 60)
        const seconds = Math.floor(state.currentTime % 60)
        const timestamp = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        setNotes(prev => prev ? `${prev}\n[${timestamp}] ` : `[${timestamp}] `)
      }
    }

    const handlePauseResume = (): void => {
      console.log('📱 TranscriptScreen: Pause/resume event received')
      const state = recordingService.getState()
      if (state.isRecording) {
        console.log('⏸️ Recording is active - pause functionality not yet implemented')
                  } else {
        console.log('▶️ No active recording to pause/resume')
      }
    }

    const handleAutoStartRecording = (): void => {
      console.log('📱 TranscriptScreen: Auto-start recording event received')
      const state = recordingService.getState()
      if (!state.isRecording && (state.transcriptionStatus === 'ready' || state.isSwiftRecorderAvailable)) {
        recordingService.startRecording(recordingMode)
      }
    }

    // Add event listeners
    window.addEventListener('friday-toggle-recording', handleToggleRecording)
    window.addEventListener('friday-quick-note', handleQuickNote)
    window.addEventListener('friday-pause-resume', handlePauseResume)
    window.addEventListener('friday-auto-start-recording', handleAutoStartRecording)

    return () => {
      window.removeEventListener('friday-toggle-recording', handleToggleRecording)
      window.removeEventListener('friday-quick-note', handleQuickNote)
      window.removeEventListener('friday-pause-resume', handlePauseResume)
      window.removeEventListener('friday-auto-start-recording', handleAutoStartRecording)
    }
  }, [recordingService, recordingMode])

  // Sync recording service state with local state
  useEffect(() => {
    const updateState = (): void => {
      const state = recordingService.getState()
      const wasRecording = isRecording
      const previousTranscriptLength = transcript.length
      const previousCombinedPath = combinedRecordingPath
      
      setIsRecording(state.isRecording)
      setCurrentTime(state.currentTime)
      
      // Always sync transcript from recording service if it has more data
      if (state.transcript.length > transcript.length) {
        console.log('📝 Syncing transcript from recording service:', state.transcript.length, 'lines (previous:', transcript.length, ')')
        setTranscript(state.transcript)
      }
      
      // Sync other state
      setLiveText(state.liveText)
      setRecordingWarning(state.recordingWarning)
      
      // Update combined recording path
      if (state.combinedRecordingPath && state.combinedRecordingPath !== combinedRecordingPath) {
        console.log('📁 New combined recording path:', state.combinedRecordingPath)
        setCombinedRecordingPath(state.combinedRecordingPath)
      }
      
      setRecordedAudioBlob(state.recordedAudioBlob)
      
      // Set total time when recording stops
      if (!state.isRecording && state.currentTime > 0) {
        setTotalTime(Math.max(state.currentTime, 1))
      }
      
      // Trigger auto-save when any of these conditions are met:
      // 1. Recording just stopped AND we have transcript data
      // 2. Recording just stopped AND we have a new recording path
      // 3. Recording just stopped AND we have recorded audio
      const recordingJustStopped = wasRecording && !state.isRecording
      const hasNewTranscript = state.transcript.length > previousTranscriptLength
      const hasNewRecordingPath = state.combinedRecordingPath && state.combinedRecordingPath !== previousCombinedPath
      const hasRecordedAudio = !!state.recordedAudioBlob
      
      if (recordingJustStopped && (hasNewTranscript || hasNewRecordingPath || hasRecordedAudio || state.currentTime > 0)) {
        console.log('🔄 Recording stopped, triggering auto-save with:', {
          transcriptLength: state.transcript.length,
          hasNewTranscript,
          hasNewRecordingPath,
          hasRecordedAudio,
          currentTime: state.currentTime,
          combinedPath: state.combinedRecordingPath
        })
        setNeedsAutoSave(true)
      }
    }

    const interval = setInterval(updateState, 100)
    return () => clearInterval(interval)
  }, [recordingService, isRecording, transcript.length, combinedRecordingPath])

  // Auto-save effect - enhanced for better reliability
  useEffect(() => {
    if (needsAutoSave && meeting?.id) {
      console.log('🔄 Auto-save triggered with meeting ID:', meeting.id, {
        transcriptLength: transcript.length,
        totalTime,
        hasRecordedAudioBlob: !!recordedAudioBlob,
        hasCombinedRecordingPath: !!combinedRecordingPath,
        combinedRecordingPath
      })
      setNeedsAutoSave(false)
      handleSaveMeeting()
    }
  }, [needsAutoSave, meeting?.id, transcript, totalTime, recordedAudioBlob, combinedRecordingPath])

  // Enhanced debug logging for transcript changes
  useEffect(() => {
    console.log('📝 Transcript state updated:', {
      length: transcript.length,
      lastItem: transcript[transcript.length - 1],
      meetingId: meeting?.id,
      savingMeeting
    })
  }, [transcript, meeting?.id, savingMeeting])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const timeToSeconds = (timeString: string): number => {
    const [mins, secs] = timeString.split(':').map(Number)
    return mins * 60 + secs
  }

  const startRecording = async (): Promise<void> => {
    await recordingService.startRecording(recordingMode)
  }

  const stopRecording = async (): Promise<void> => {
    await recordingService.stopRecording()
  }

  const togglePlayback = async (): Promise<void> => {
    if (!audioPlayerRef.current || !recordedAudioUrl) {
      console.log('No audio available for playback')
      return
    }

    try {
      if (isPlaying) {
        audioPlayerRef.current.pause()
        if (playbackInterval.current) {
          clearInterval(playbackInterval.current)
          playbackInterval.current = null
        }
      } else {
        if (audioPlayerRef.current.readyState < 2) {
          console.log('⏳ Loading audio...')
          await new Promise<void>((resolve, reject) => {
            const handleCanPlay = (): void => {
              audioPlayerRef.current?.removeEventListener('canplay', handleCanPlay)
              audioPlayerRef.current?.removeEventListener('error', handleError)
              resolve()
            }
            const handleError = (e: Event): void => {
              audioPlayerRef.current?.removeEventListener('canplay', handleCanPlay)
              audioPlayerRef.current?.removeEventListener('error', handleError)
              console.error('Audio loading error:', e)
              reject(new Error('Failed to load audio'))
            }

            audioPlayerRef.current?.addEventListener('canplay', handleCanPlay)
            audioPlayerRef.current?.addEventListener('error', handleError)
            audioPlayerRef.current?.load()
          })
        }

        audioPlayerRef.current.currentTime = currentTime
        await audioPlayerRef.current.play()

        playbackInterval.current = setInterval(() => {
          if (audioPlayerRef.current) {
            const newTime = Math.floor(audioPlayerRef.current.currentTime)
            setCurrentTime(newTime)

            if (transcript && transcript.length > 0) {
              const timeInMinutes = newTime / 60
              const lineIndex = Math.floor(timeInMinutes * 4)
              setActiveLineIndex(Math.min(lineIndex, transcript.length - 1))
            }

            if (newTime >= totalTime) {
              setIsPlaying(false)
              if (playbackInterval.current) {
                clearInterval(playbackInterval.current)
                playbackInterval.current = null
              }
            }
          }
        }, 100)
      }
      setIsPlaying(!isPlaying)
    } catch (error) {
      console.error('Playback error:', error)
      setIsPlaying(false)
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current)
        playbackInterval.current = null
      }
    }
  }

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (totalTime === 0 || !audioPlayerRef.current) return

    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const percentage = clickX / rect.width
    const newTime = Math.floor(percentage * totalTime)

    setCurrentTime(newTime)
    audioPlayerRef.current.currentTime = newTime

    if (transcript && transcript.length > 0) {
      const timeInMinutes = newTime / 60
      const lineIndex = Math.floor(timeInMinutes * 4)
      setActiveLineIndex(Math.min(lineIndex, transcript.length - 1))
    }
  }

  const handleTranscriptLineClick = (line: TranscriptLine, index: number): void => {
    const newTime = timeToSeconds(line.time)
    setCurrentTime(newTime)
    setActiveLineIndex(index)
  }

  const handleAudioPlayerRef = (ref: HTMLAudioElement | null): void => {
    audioPlayerRef.current = ref
  }

  const handleSaveMeeting = async (): Promise<void> => {
    if (!meeting?.id) {
      console.error('No meeting ID available for saving')
      return
    }

    if (savingMeeting) {
      console.log('Save already in progress, skipping...')
      return
    }

    try {
      setSavingMeeting(true)
      console.log('💾 Saving meeting data...', {
        meetingId: meeting.id,
        transcriptLength: transcript.length,
        currentCombinedPath: combinedRecordingPath,
        existingRecordingPath: meeting.recordingPath,
        hasRecordedAudioBlob: !!recordedAudioBlob,
        totalTime
      })

      let recordingPath = meeting.recordingPath || ''

      // Priority 1: Use combined recording path if available (most recent)
      if (combinedRecordingPath) {
        recordingPath = combinedRecordingPath
        console.log('📁 Using combined recording path:', recordingPath)
      } 
      // Priority 2: Save new audio blob if no existing path
      else if (recordedAudioBlob && !recordingPath) {
        console.log('💾 Saving new audio recording...')
        try {
          const arrayBuffer = await recordedAudioBlob.arrayBuffer()
          const result = await (window.api as any).transcription?.saveRecording(
            arrayBuffer,
            meeting.id
          )

          if (result?.success && result.filePath) {
            recordingPath = result.filePath
            console.log('✅ Audio recording saved to:', recordingPath)
            await loadRecording(recordingPath)
          } else {
            console.error('Failed to save audio recording:', result?.error || 'No transcription API available')
          }
        } catch (error) {
          console.error('Error saving audio recording:', error)
        }
      }

      const updatedMeetingData: Partial<Meeting> = {
        title,
        description,
        tags,
        context: contextText,
        context_files: uploadedFiles.slice(0, 5),
        actionItems,
        transcript, // Ensure transcript is included
        duration: formatTime(totalTime),
        recordingPath, // Ensure recording path is included
        notes,
        summary,
        updatedAt: new Date().toISOString()
      }

      console.log('💾 Saving meeting data:', {
        transcriptLines: updatedMeetingData.transcript?.length || 0,
        recordingPath: updatedMeetingData.recordingPath,
        duration: updatedMeetingData.duration,
        title: updatedMeetingData.title
      })

      await window.api.db.updateMeeting(meeting.id, updatedMeetingData)
      console.log('✅ Meeting data saved successfully')
      
      // Verify the save by logging the key data
      console.log('✅ Saved meeting with:', {
        transcriptLines: transcript.length,
        recordingPath,
        duration: formatTime(totalTime)
      })
    } catch (error) {
      console.error('Error saving meeting data:', error)
    } finally {
      setSavingMeeting(false)
    }
  }

  // AI generation functions
  const generateSummary = async (): Promise<void> => {
    if (transcript.length === 0) {
      alert('No transcript available to generate summary from')
      return
    }

    if (isGeneratingSummary) {
      console.log('Summary generation already in progress')
      return
    }

    try {
      setIsGeneratingSummary(true)
      setAiLoadingMessage('Analyzing transcript and generating summary...')
      console.log('🤖 Generating summary with Gemini...')
      const settings = await window.api.db.getSettings()
      
      const options = {
        transcript,
        globalContext: settings.globalContext || '',
        meetingContext: contextText,
        notes,
        existingTitle: title
      }

      const result = await window.api.gemini.generateSummary(options)
      
      if (result.success && result.summary) {
        setSummary(result.summary)
        setIsSummaryAIGenerated(true)
        console.log('✅ Summary generated successfully')
      } else {
        console.error('Failed to generate summary:', result.error)
        alert(`Failed to generate summary: ${result.error}`)
      }
    } catch (error) {
      console.error('Error generating summary:', error)
      alert('Failed to generate summary. Please check your Gemini API key in settings.')
    } finally {
      setIsGeneratingSummary(false)
      setAiLoadingMessage('')
    }
  }

  const generateAllContent = async (): Promise<void> => {
    if (transcript.length === 0) {
      alert('No transcript available to generate content from')
      return
    }

    if (isGeneratingAllContent) {
      console.log('Content generation already in progress')
      return
    }

    try {
      setIsGeneratingAllContent(true)
      setAiLoadingMessage(`Generating comprehensive content from your ${transcript.length} transcript lines...`)
      console.log('🤖 Generating all content with Gemini...')
      const settings = await window.api.db.getSettings()
      
      const options = {
        transcript,
        globalContext: settings.globalContext || '',
        meetingContext: contextText,
        notes,
        existingTitle: title
      }

      const result = await window.api.gemini.generateContent(options)
      
      if (result.success && result.data) {
        const { summary: newSummary, description: newDescription, actionItems: newActionItems, tags: newTags } = result.data
        
        setSummary(newSummary)
        setIsSummaryAIGenerated(true)
        setDescription(newDescription)
        setActionItems(newActionItems)
        setTags(newTags)
        
        console.log('✅ All content generated successfully')
      } else {
        console.error('Failed to generate content:', result.error)
        alert(`Failed to generate content: ${result.error}`)
      }
    } catch (error) {
      console.error('Error generating content:', error)
      alert('Failed to generate content. Please check your Gemini API key in settings.')
    } finally {
      setIsGeneratingAllContent(false)
      setAiLoadingMessage('')
    }
  }

  const generateAIMessage = async (type: 'slack' | 'email', enhancedOptions?: EnhancedAIOptions): Promise<string | void> => {
    if (!meeting?.id) {
      alert('No meeting data available for AI generation')
      return
    }

    try {
      setAiLoadingMessage(`Crafting your ${type === 'slack' ? 'Slack' : 'email'} message...`)
      console.log(`🤖 Generating ${type} message with Gemini...`)
      
      const settings = await window.api.db.getSettings()
      
      // Use enhanced options if provided, otherwise fall back to legacy data
      let selectedData
      if (enhancedOptions) {
        selectedData = {
          globalContext: settings.globalContext || '',
          meetingContext: enhancedOptions.contextText || '',
          title: enhancedOptions.title || '',
          description: enhancedOptions.description || '',
          notes: enhancedOptions.notes || '',
          summary: enhancedOptions.summary || '',
          transcript: enhancedOptions.transcript?.map((line: TranscriptLine) => `[${line.time}] ${line.text}`).join('\n') || '',
          actionItems: enhancedOptions.actionItems || [],
          questionHistory: enhancedOptions.questionHistory || [],
          followupQuestions: enhancedOptions.followupQuestions || [],
          followupRisks: enhancedOptions.followupRisks || [],
          followupComments: enhancedOptions.followupComments || []
        }
      } else {
        // Legacy fallback
        selectedData = {
          globalContext: settings.globalContext || '',
          meetingContext: contextText,
          title,
          description,
          notes,
          summary,
          transcript: transcript.map(line => `[${line.time}] ${line.text}`).join('\n')
        }
      }

      const result = await (window.api as any).gemini?.generateMessage({
        type,
        data: selectedData,
        model: 'gemini-2.5-pro-preview-06-05'
      })
      
      if (result?.success && result.message) {
        console.log(`✅ ${type} message generated successfully`)
        return result.message
      } else {
        console.error(`Failed to generate ${type} message:`, result?.error || 'No Gemini API available')
        alert(`Failed to generate ${type} message: ${result?.error || 'No Gemini API available'}`)
      }
    } catch (error) {
      console.error(`Error generating ${type} message:`, error)
      alert(`Failed to generate ${type} message. Please check your Gemini API key in settings.`)
    }
  }

  const handleSetGeneratingMessage = (isGenerating: boolean): void => {
    setIsGeneratingMessage(isGenerating)
    if (!isGenerating) {
      setAiLoadingMessage('')
    }
  }

  useEffect(() => {
    return () => {
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current)
      }
    }
  }, [])

  // Show recording interface if no recording is available
  const hasRecording = totalTime > 0 && recordedAudioUrl

  return (
    <div className="transcript-layout">
      {/* Visual Alert Indicator */}
      {showAlertIndicator && currentAlert && (
        <div 
          className={`alert-indicator ${showAlertIndicator ? '' : 'alert-dismissing'}`}
          onClick={() => {
            setShowAlertIndicator(false)
            setCurrentAlert(null)
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              background: 'white', 
                    borderRadius: '50%',
              animation: 'pulse 1s infinite'
            }} />
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>
                Alert: {currentAlert.keyword}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                {(currentAlert.similarity * 100).toFixed(1)}% match
            </div>
                </div>
              </div>
                  </div>
                )}

      {/* Main Content (Left 50%) */}
      <div className="transcript-main">
        {!hasRecording && !isRecording ? (
          <RecordingInterface
            transcriptionStatus={transcriptionStatus}
            isSwiftRecorderAvailable={isSwiftRecorderAvailable}
            recordingMode={recordingMode}
            onRecordingModeChange={setRecordingMode}
            onStartRecording={startRecording}
          />
        ) : isRecording ? (
          <LiveRecordingInterface
            currentTime={currentTime}
            transcriptionStatus={transcriptionStatus}
            recordingWarning={recordingWarning}
            transcript={transcript}
            liveText={liveText}
            onStopRecording={stopRecording}
          />
        ) : (
          <PlaybackInterface
            isPlaying={isPlaying}
            currentTime={currentTime}
            totalTime={totalTime}
            recordedAudioUrl={recordedAudioUrl}
            transcript={transcript}
            activeLineIndex={activeLineIndex}
            onTogglePlayback={togglePlayback}
            onSeek={handleSeek}
            onTranscriptLineClick={handleTranscriptLineClick}
            onAudioPlayerRef={handleAudioPlayerRef}
          />
        )}
              </div>

      {/* Sidebar (Right 50%) */}
      <SidebarContent
        meeting={meeting}
        title={title}
        description={description}
        tags={tags}
        contextText={contextText}
        uploadedFiles={uploadedFiles}
        actionItems={actionItems}
        notes={notes}
        summary={summary}
        isSummaryAIGenerated={isSummaryAIGenerated}
        savingMeeting={savingMeeting}
        isGeneratingSummary={isGeneratingSummary}
        isGeneratingAllContent={isGeneratingAllContent}
        alertKeywords={alertKeywords}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onTagsChange={setTags}
        onContextTextChange={setContextText}
        onUploadedFilesChange={setUploadedFiles}
        onActionItemsChange={setActionItems}
        onNotesChange={setNotes}
        onSummaryChange={setSummary}
        onSaveMeeting={handleSaveMeeting}
        onGenerateSummary={generateSummary}
        onGenerateAllContent={generateAllContent}
        onGenerateAIMessage={generateAIMessage}
        transcript={transcript}
        isGeneratingMessage={isGeneratingMessage}
        onSetGeneratingMessage={handleSetGeneratingMessage}
        onAlertKeywordsChange={setAlertKeywords}
      />

      {/* Full-Screen AI Loading Overlay */}
      {isAIGenerating && (
        <div className="ai-loading-overlay">
          <div className="ai-loading-content">
            <div className="ai-loading-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: 'pulse 2s infinite' }}
              >
                <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" />
              </svg>
                      </div>
            <h2 className="ai-loading-title">AI is thinking...</h2>
            <p className="ai-loading-message">{aiLoadingMessage}</p>
            <div className="ai-loading-progress">
              <div className="ai-loading-progress-bar"></div>
                    </div>
                  </div>
              </div>
      )}
    </div>
  )
}

export default TranscriptScreen
