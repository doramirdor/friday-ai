import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Meeting } from '../types/database'
import { AlertKeyword } from '../types/electron'
import SidebarContent from './SidebarContent'
import BlockNoteEditor from './BlockNoteEditor'
import { ContextTab } from './ContextTab'
import { ActionItemsTab } from './ActionItemsTab'
import { AISummaryTab } from './AISummaryTab'
import { AlertsTab } from './AlertsTab'
import { useRecordingService } from './RecordingService'
import '../styles/friday-layout.css'
import { 
  MicIcon, 
  StopCircleIcon, 
  PlayIcon, 
  PauseIcon,
  SparklesIcon,
  MessageSquareIcon,
  CheckSquareIcon,
  MailIcon,
  XIcon,
  SendIcon,
  BotIcon,
  HelpCircleIcon,
  FileTextIcon,
  ClipboardListIcon,
  BookOpenIcon,
  AlertTriangleIcon,
  SaveIcon,
  CheckIcon
} from 'lucide-react'

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

const TranscriptScreen: React.FC<TranscriptScreenProps> = ({ meeting }) => {
  // Core state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [contextText, setContextText] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState<Array<{ id: number; text: string; completed: boolean }>>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [needsAutoSave, setNeedsAutoSave] = useState(false)
  const [alertKeywords, setAlertKeywords] = useState<AlertKeyword[]>([])

  // Recording state
  const [recordingMode] = useState<'microphone' | 'combined'>('combined')
  const [combinedRecordingPath, setCombinedRecordingPath] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [liveText, setLiveText] = useState('')

  // UI state
  const [showAskFriday, setShowAskFriday] = useState(false)
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [activeTab, setActiveTab] = useState<'notes' | 'details' | 'context' | 'actions' | 'summary' | 'alerts'>('notes')
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string
    type: 'user' | 'assistant' | 'action'
    content: string
    timestamp: Date
    action?: string
  }>>([])
  const [isAskFridayGenerating, setIsAskFridayGenerating] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isGeneratingAllContent, setIsGeneratingAllContent] = useState(false)
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false)
  const [aiLoadingMessage, setAiLoadingMessage] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [hasStartedConversation, setHasStartedConversation] = useState(false)

  // Refs
  const playbackInterval = useRef<NodeJS.Timeout | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const wasRecording = useRef<boolean>(false)

  // Recording service state (needed for compatibility)
  const [, setTranscriptionStatus] = useState<string>('idle')
  const [, setIsSwiftRecorderAvailable] = useState(false)

  // Combined loading state for full-screen overlay
  const isAIGenerating = isGeneratingSummary || isGeneratingAllContent || isGeneratingMessage

  // Tab configuration
  const tabConfig = {
    notes: { icon: BookOpenIcon, label: 'Notes' },
    // details: { icon: InfoIcon, label: 'Details' },
    context: { icon: FileTextIcon, label: 'Context' },
    actions: { icon: ClipboardListIcon, label: 'Action Items' },
    summary: { icon: BookOpenIcon, label: 'AI Summary' },
    alerts: { icon: AlertTriangleIcon, label: 'Alerts' }
  } as const

  // Ask Friday actions
  const askFridayActions = [
    {
      id: 'email-followup',
      label: 'Email Follow-up',
      icon: MailIcon,
      description: 'Draft a follow-up email'
    },
    {
      id: 'slack-summary',
      label: 'Slack Summary', 
      icon: MessageSquareIcon,
      description: 'Create a Slack update'
    },
    {
      id: 'what-missed',
      label: 'What Did I Miss?',
      icon: HelpCircleIcon,
      description: 'Catch up on key points'
    },
    {
      id: 'action-items',
      label: 'Generate Action Items',
      icon: CheckSquareIcon,
      description: 'Extract next steps'
    },
    {
      id: 'summary',
      label: 'Generate Summary',
      icon: BotIcon,
      description: 'Summarize the meeting'
    }
  ] as const

  // Function to load existing recording file
  const loadExistingRecording = useCallback(async (filePath: string): Promise<void> => {
    try {
      console.log('🔄 Loading recording file via IPC...')

      const result = await (window.api as unknown as { transcription: { loadRecording: (path: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }> } }).transcription?.loadRecording(filePath)

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
      const result = await (window.api as unknown as { alerts: { checkKeywords: (params: { transcript: string; keywords: unknown[] }) => Promise<{ success: boolean; matches?: { keyword: string; similarity: number; text: string }[] }> } }).alerts?.checkKeywords({
        transcript: transcriptText,
        keywords: enabledKeywords
      })

      if (result?.success && result.matches && result.matches.length > 0) {
        // Show visual alert for the first match
        if (result.matches.length > 0) {
          // Alert functionality removed in new interface
          console.log('Alert detected but visual indicator removed')
        
          // Log alerts
          result.matches.forEach((match) => {
            console.log(`🚨 ALERT: Keyword "${match.keyword}" detected (${(match.similarity * 100).toFixed(1)}% match)`)
            console.log(`   Text: "${match.text}"`)
          })
        }
      }
    } catch (error) {
      console.error('Failed to check for alerts:', error)
    }
  }, [alertKeywords])

  // Recording service callbacks
  const handleTranscriptionResult = useCallback((result: TranscriptionResult): void => {
    console.log('🎤 Transcription result:', result)
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
      
      // Note: Combined recording failures are now handled in handleCombinedRecordingFailed
      // No more warning states for Bluetooth - these should be complete failures
      if (result.code === 'RECORDING_FAILED' || result.code === 'SYSTEM_AUDIO_FAILED') {
        console.error('❌ Recording failed:', result.error)
        setTranscriptionStatus('error')
        setIsRecording(false)
      } else if (result.code === 'RECORDING_STARTED') {
        setTranscriptionStatus('recording')
        
        if (result.warning) {
          console.warn('⚠️ Recording quality warning:', result.warning)
        }
      } else {
        console.warn('⚠️ Unknown recording result code:', result.code)
      }
  }, [])

  const handleCombinedRecordingStopped = useCallback((result: RecordingResult): void => {
      console.log('🎙️ Combined recording stopped:', result)
    setIsRecording(false)

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
              
              // Trigger auto-save AFTER recording path is set and loaded
              console.log('🔄 Triggering auto-save with recording path:', result.path)
              setNeedsAutoSave(true)
            }
          } catch (error) {
            console.error('❌ Failed to load recording for playback:', error)
            // Still trigger auto-save even if loading fails
            console.log('🔄 Triggering auto-save despite loading failure')
            setNeedsAutoSave(true)
          }
        }, 1000) // Wait 1 second to ensure file is fully written
      } else {
        console.warn('⚠️ No recording path in combined recording result:', result)
        // Still trigger auto-save to save transcript and other data
        console.log('🔄 Triggering auto-save without recording path')
        setTimeout(() => setNeedsAutoSave(true), 500)
      }
  }, [loadRecording, currentTime, totalTime])

  const handleCombinedRecordingFailed = useCallback((result: RecordingResult): void => {
      console.error('❌ Recording failed during operation:', result.error)
      
      setIsRecording(false)
      setTranscriptionStatus('error')
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
    handleCombinedRecordingFailed,
    setTranscriptionStatus,
    setIsSwiftRecorderAvailable
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

  // Track changes for manual save indication
  useEffect(() => {
    if (meeting?.id && !savingMeeting) {
      setHasUnsavedChanges(true)
    }
  }, [title, description, tags, contextText, actionItems, notes, summary, chatMessages, meeting?.id, savingMeeting])

  // Load existing chat messages when meeting changes
  useEffect(() => {
    if (meeting?.chatMessages && Array.isArray(meeting.chatMessages)) {
      const loadedMessages = meeting.chatMessages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
      setChatMessages(loadedMessages)
      setHasStartedConversation(loadedMessages.length > 0)
      console.log(`📱 Loaded ${loadedMessages.length} existing chat messages`)
    } else {
      setChatMessages([])
      setHasStartedConversation(false)
    }
  }, [meeting?.id])

  // Set default tab to summary when there's existing summary data
  useEffect(() => {
    if (meeting && summary && summary.trim().length > 0) {
      setActiveTab('summary')
    }
  }, [meeting?.id, summary])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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

            // Transcript navigation removed for simplicity

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
          const result = await (window.api as unknown as { transcription: { saveRecording: (buffer: ArrayBuffer, id: number) => Promise<{ success: boolean; filePath?: string; error?: string }> } }).transcription?.saveRecording(
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
        chatMessages: chatMessages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString()
        })),
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
      
      // Update save status
      setHasUnsavedChanges(false)
      
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

      console.log('🔍 Context Debug - generateSummary:', {
        globalContextLength: (settings.globalContext || '').length,
        meetingContextLength: contextText.length,
        meetingContext: contextText,
        transcriptLength: transcript.length
      })

      const result = await (window.api as unknown as { gemini: { generateSummary: (options: unknown) => Promise<{ success: boolean; summary?: string; error?: string }> } }).gemini.generateSummary(options)
      
      if (result.success && result.summary) {
        setSummary(result.summary)
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

      console.log('🔍 Context Debug - generateAllContent:', {
        globalContextLength: (settings.globalContext || '').length,
        meetingContextLength: contextText.length,
        meetingContext: contextText,
        transcriptLength: transcript.length
      })

      const result = await (window.api as unknown as { gemini: { generateContent: (options: unknown) => Promise<{ success: boolean; data?: { summary: string; description: string; actionItems: unknown[]; tags: string[] }; error?: string }> } }).gemini.generateContent(options)
      
      if (result?.success && result.data) {
        const { summary: newSummary, description: newDescription, actionItems: newActionItems, tags: newTags } = result.data
        
        // Validate the data before setting state
        if (newSummary) setSummary(newSummary)
        if (newDescription) setDescription(newDescription)
        if (Array.isArray(newActionItems)) {
          setActionItems(newActionItems as Array<{ id: number; text: string; completed: boolean }>)
        }
        if (Array.isArray(newTags)) setTags(newTags)
        
        console.log('✅ All content generated successfully')
      } else {
        const errorMsg = result?.error || 'Unknown error occurred'
        console.error('Failed to generate content:', errorMsg)
        alert(`Failed to generate content: ${errorMsg}`)
      }
    } catch (error) {
      console.error('Error generating content:', error)
      alert('Failed to generate content. Please check your Gemini API key in settings.')
    } finally {
      setIsGeneratingAllContent(false)
      setAiLoadingMessage('')
    }
  }

  const handleAskFridayAction = async (actionId: string): Promise<void> => {
    const action = askFridayActions.find(a => a.id === actionId)
    if (!action) return

    // Add user action message
    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      content: action.label,
      timestamp: new Date(),
      action: actionId
    }
    
    setChatMessages(prev => [...prev, userMessage])
    setIsAskFridayGenerating(true)
    setHasStartedConversation(true)

    try {
      let result = ''
      
      switch (actionId) {
        case 'email-followup':
          result = await generateAIMessage('email') || 'Generated email follow-up'
          break
        case 'slack-summary':
          result = await generateAIMessage('slack') || 'Generated Slack summary'
          break
        case 'action-items':
          await generateAllContent()
          result = 'Generated action items - check the Action Items tab'
          setActiveTab('actions')
          break
        case 'summary':
          await generateSummary()
          result = 'Generated meeting summary - check the AI Summary tab'
          setActiveTab('summary')
          break
        case 'what-missed': {
          const settings = await window.api.db.getSettings()
          const geminiResult = await window.api.gemini.askQuestion({
            question: 'Please highlight the key points and important information from this meeting that I should be aware of.',
            transcript,
            title,
            description,
            context: settings.globalContext || '',
            notes: noteContent || notes,
            summary
          })
          result = geminiResult?.success && (geminiResult as any).answer ? (geminiResult as any).answer : 'Based on the transcript, here are the key points you might have missed...'
          break
        }
        default:
          result = 'Action completed successfully'
      }

      // Add assistant response
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: result,
        timestamp: new Date()
      }
      
      setChatMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Ask Friday action failed:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date()
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setIsAskFridayGenerating(false)
    }
  }

  const handleChatSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!chatInput.trim() || isAskFridayGenerating) return

    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      content: chatInput.trim(),
      timestamp: new Date()
    }

    setChatMessages(prev => [...prev, userMessage])
    setChatInput('')
    setIsAskFridayGenerating(true)
    setHasStartedConversation(true)

    try {
      const settings = await window.api.db.getSettings()
      
      const result = await window.api.gemini.askQuestion({
        question: chatInput.trim(),
        transcript,
        title,
        description,
        context: settings.globalContext || '',
        notes: noteContent || notes,
        summary
      })

      if (result?.success && (result as any).answer) {
        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant' as const,
          content: (result as any).answer,
          timestamp: new Date()
        }
        setChatMessages(prev => [...prev, assistantMessage])
        console.log('✅ Chat response received from Gemini')
      } else {
        throw new Error(result?.error || 'No response from Gemini')
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: 'Sorry, I encountered an error. Please check your Gemini API key in settings and try again.',
        timestamp: new Date()
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setIsAskFridayGenerating(false)
    }
  }

  const generateAIMessage = async (type: 'slack' | 'email'): Promise<string | void> => {
    if (!meeting?.id) {
      alert('No meeting data available for AI generation')
      return
    }

    try {
      setAiLoadingMessage(`Crafting your ${type === 'slack' ? 'Slack' : 'email'} message...`)
      console.log(`🤖 Generating ${type} message with Gemini...`)
      
      const settings = await window.api.db.getSettings()
      console.log('📋 Settings loaded:', { hasApiKey: !!settings.geminiApiKey, apiKeyLength: settings.geminiApiKey?.length || 0 })
      
      if (!settings.geminiApiKey) {
        alert('Gemini API key is not configured. Please add it in Settings.')
        return
      }
      
      const selectedData = {
        globalContext: settings.globalContext || '',
        meetingContext: contextText,
        title,
        description,
        notes,
        summary,
        transcript: transcript.map(line => `[${line.time}] ${line.text}`).join('\n')
      }

      console.log('📤 Sending request to Gemini with data:', { 
        type, 
        hasTranscript: selectedData.transcript.length > 0,
        hasContext: selectedData.globalContext.length > 0,
        hasNotes: selectedData.notes.length > 0
      })

      const result = await window.api.gemini.generateMessage({
        type,
        data: selectedData,
        model: 'gemini-2.0-flash-exp'
      })
      
      console.log('📨 Gemini response:', { success: result?.success, hasMessage: !!result?.message, error: result?.error })
      
      if (result?.success && result.message) {
        console.log(`✅ ${type} message generated successfully`)
        return result.message
      } else {
        const errorMsg = result?.error || 'No response from Gemini'
        console.error(`❌ Gemini error: ${errorMsg}`)
        throw new Error(errorMsg)
      }
    } catch (error) {
      console.error(`Error generating ${type} message:`, error)
      alert(`Failed to generate ${type} message: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your Gemini API key in settings.`)
    }
  }

  const handleSetGeneratingMessage = (isGenerating: boolean): void => {
    setIsGeneratingMessage(isGenerating)
    if (!isGenerating) {
      setAiLoadingMessage('')
    }
  }

  const renderTabContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'notes':
        return (
          <div className="notes-content">
            <div className="content-section">
  
              
              {/* Live content area for new notes */}
              <div className="notes-editor">
                <BlockNoteEditor
                  value={noteContent || notes}
                  onChange={setNoteContent}
                  placeholder="Add more updates or notes..."
                  height={200}
                />
              </div>
              
              {/* Live Transcription */}
              {isRecording && liveText && (
                <div className="live-transcription">
                  <div className="live-indicator">
                    <div className="recording-pulse"></div>
                    <span>Live transcription</span>
                  </div>
                  <p className="live-text">{liveText}</p>
                </div>
              )}
            </div>
          </div>
        )
      
      case 'context':
        return (
          <ContextTab 
            contextText={contextText}
            onContextTextChange={setContextText}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />
        )
      
      case 'actions':
        return <ActionItemsTab />
      
      case 'summary':
        return (
          <AISummaryTab 
            summary={summary}
            isGenerating={isGeneratingSummary}
            onGenerate={generateSummary}
            onSummaryChange={setSummary}
          />
        )
      
      case 'alerts':
        return <AlertsTab />
      
      case 'details':
        return (
          <div className="tab-content-wrapper">
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
              isSummaryAIGenerated={false}
              savingMeeting={savingMeeting}
              isGeneratingSummary={isGeneratingSummary}
              isGeneratingAllContent={isGeneratingAllContent}
              isGeneratingMessage={isGeneratingMessage}
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
              onSetGeneratingMessage={handleSetGeneratingMessage}
              onAlertKeywordsChange={setAlertKeywords}
              transcript={transcript}
              restrictToTabs={['details']}
            />
          </div>
        )
      
      default:
        return null
    }
  }

  // Stop recording when user clicks stop
  useEffect(() => {
    if (!isRecording && wasRecording.current) {
      console.log('🔄 Recording stopped, triggering auto-save with:', {
        transcriptLength: transcript.length,
        hasNewTranscript: transcript.length > 0,
        hasNewRecordingPath: !!combinedRecordingPath,
        hasRecordedAudio: !!recordedAudioBlob,
        currentTime
      })
      wasRecording.current = false
      // Remove immediate auto-save trigger here - let the recording stopped handler manage it
      // setNeedsAutoSave(true) // REMOVED - this causes race condition
    }

    if (isRecording && !wasRecording.current) {
      wasRecording.current = true
    }
  }, [isRecording, transcript.length, combinedRecordingPath, recordedAudioBlob, currentTime])

  return (
    <div className="friday-layout">
      {/* Main Container */}
      <div className="friday-container">
        {/* Content Area */}
        <div className="friday-content">
          {/* Main Content */}
          <div className="main-content">
            {/* Meeting Header - Moved above tabs */}
            <div className="meeting-header">
              <input
                type="text"
                className="meeting-title"
                placeholder="Meeting title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="meeting-meta">
                <span className="meeting-date">
                  {meeting?.createdAt ? new Date(meeting.createdAt).toLocaleDateString('en-US', { 
                    month: 'numeric', 
                    day: 'numeric', 
                    year: 'numeric' 
                  }) : new Date().toLocaleDateString('en-US', { 
                    month: 'numeric', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })} {new Date().toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
              
              <div className="meeting-badges">

              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="content-tabs">
              <div className="tabs-left">
                {Object.entries(tabConfig).map(([tabKey, config]) => {
                  const Icon = config.icon
                  return (
                    <button
                      key={tabKey}
                      className={`content-tab ${activeTab === tabKey ? 'active' : ''}`}
                      onClick={() => setActiveTab(tabKey as typeof activeTab)}
                    >
                      <Icon size={16} />
                      <span>{config.label}</span>
                    </button>
                  )
                })}
              </div>
              
              <div className="tabs-right">
                <button 
                  className={`save-btn ${savingMeeting ? 'saving' : ''} ${!hasUnsavedChanges ? 'saved' : ''}`}
                  onClick={handleSaveMeeting}
                  disabled={savingMeeting || !meeting?.id}
                  title={savingMeeting ? 'Saving...' : hasUnsavedChanges ? 'Save meeting' : 'All changes saved'}
                >
                  {savingMeeting ? (
                    <div className="save-spinner"></div>
                  ) : hasUnsavedChanges ? (
                    <SaveIcon size={16} />
                  ) : (
                    <CheckIcon size={16} />
                  )}
                  <span className="save-text">
                    {savingMeeting ? 'Saving...' : hasUnsavedChanges ? 'Save' : 'Saved'}
                  </span>
                </button>
                
                {!showAskFriday && (
                  <button 
                    className="copilot-btn" 
                    onClick={() => setShowAskFriday(true)}
                    title="Ask Friday"
                  >
                    <SparklesIcon size={16} />
                    <span>Ask Friday</span>
                  </button>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="main-content-wrapper">
              {/* Tab Content */}
              <div className="tab-content-area">
                {renderTabContent()}
              </div>
            </div>

            {/* Recording Controls */}
            <div className="recording-controls">
              <button 
                className={`record-btn ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? (
                  <StopCircleIcon size={20} />
                ) : (
                  <MicIcon size={20} />
                )}
              </button>
              
              {recordedAudioUrl && (
                <button 
                  className="play-btn"
                  onClick={togglePlayback}
                  title={isPlaying ? 'Pause' : 'Play recording'}
                >
                  {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                </button>
              )}
              
              <button 
                className="transcript-btn"
                onClick={() => setShowTranscriptDrawer(true)}
                title="View transcript"
              >
                <MessageSquareIcon size={20} />
              </button>
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="recording-status">
                <div className="recording-indicator">
                  <div className="recording-dot"></div>
                  <span>Recording • {formatTime(currentTime)}</span>
                </div>
                {liveText && (
                  <div className="live-transcript">
                    <p>{liveText}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ask Friday Sidebar */}
          {showAskFriday && <div className="ask-friday-sidebar">
            <div className="friday-sidebar-header">
              <div className="sidebar-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                Ask Friday
              </div>
              <button 
                className="close-sidebar-btn"
                onClick={() => setShowAskFriday(false)}
                title="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Action Cards - Collapsible */}
            {!hasStartedConversation ? (
              <div className="action-cards">
                <div 
                  className="action-card email"
                  onClick={() => handleAskFridayAction('email-followup')}
                >
                  <div className="action-icon">
                    <MailIcon size={16} />
                  </div>
                  <div className="action-content">
                    <h4>Email Follow-up</h4>
                    <p>Draft a follow-up email</p>
                  </div>
                </div>

                <div 
                  className="action-card slack"
                  onClick={() => handleAskFridayAction('slack-summary')}
                >
                  <div className="action-icon">
                    <MessageSquareIcon size={16} />
                  </div>
                  <div className="action-content">
                    <h4>Slack Summary</h4>
                    <p>Create a Slack update</p>
                  </div>
                </div>

                <div 
                  className="action-card missed"
                  onClick={() => handleAskFridayAction('what-missed')}
                >
                  <div className="action-icon">
                    <HelpCircleIcon size={16} />
                  </div>
                  <div className="action-content">
                    <h4>What Did I Miss?</h4>
                    <p>Catch up on key points</p>
                  </div>
                </div>

                <div 
                  className="action-card actions"
                  onClick={() => handleAskFridayAction('action-items')}
                >
                  <div className="action-icon">
                    <CheckSquareIcon size={16} />
                  </div>
                  <div className="action-content">
                    <h4>Generate Action Items</h4>
                    <p>Extract next steps</p>
                  </div>
                </div>

                <div 
                  className="action-card summary"
                  onClick={() => handleAskFridayAction('summary')}
                >
                  <div className="action-icon">
                    <BotIcon size={16} />
                  </div>
                  <div className="action-content">
                    <h4>Generate Summary</h4>
                    <p>Summarize the meeting</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="action-cards-collapsed">
                <div className="quick-actions-row">
                  <button 
                    className="quick-action-btn email"
                    onClick={() => handleAskFridayAction('email-followup')}
                    title="Email Follow-up"
                  >
                    <MailIcon size={14} />
                  </button>
                  <button 
                    className="quick-action-btn slack"
                    onClick={() => handleAskFridayAction('slack-summary')}
                    title="Slack Summary"
                  >
                    <MessageSquareIcon size={14} />
                  </button>
                  <button 
                    className="quick-action-btn missed"
                    onClick={() => handleAskFridayAction('what-missed')}
                    title="What Did I Miss?"
                  >
                    <HelpCircleIcon size={14} />
                  </button>
                  <button 
                    className="quick-action-btn actions"
                    onClick={() => handleAskFridayAction('action-items')}
                    title="Generate Action Items"
                  >
                    <CheckSquareIcon size={14} />
                  </button>
                  <button 
                    className="quick-action-btn summary"
                    onClick={() => handleAskFridayAction('summary')}
                    title="Generate Summary"
                  >
                    <BotIcon size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {chatMessages.length > 0 && (
              <div className="chat-messages">
                {chatMessages.map((message) => (
                  <div key={message.id} className={`chat-message ${message.type}`}>
                    <div className="message-content">
                      {message.content}
                    </div>
                    <div className="message-time">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                
                {isAskFridayGenerating && (
                  <div className="chat-message assistant loading">
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Chat Input - Always at Bottom */}
            <div className="chat-input-section">
              <form onSubmit={handleChatSubmit} className="chat-form">
                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Friday anything about your meeting..."
                    className="friday-chat-input"
                    disabled={isAskFridayGenerating}
                  />
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={!chatInput.trim() || isAskFridayGenerating}
                  >
                    <SendIcon size={16} />
                  </button>
                </div>
              </form>
            </div>
          </div>}
         </div>
       </div>

      {/* Transcript Drawer */}
      {showTranscriptDrawer && (
        <div className="transcript-drawer-overlay" onClick={() => setShowTranscriptDrawer(false)}>
          <div className="transcript-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="transcript-header">
              <h3>Transcript</h3>
              <div className="transcript-controls">
                <select className="language-selector">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
                <button 
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowTranscriptDrawer(false)}
                >
                  <XIcon size={18} />
                </button>
              </div>
            </div>
            
            <div className="transcript-content">
              {transcript.map((line, index) => (
                <div key={index} className="transcript-bubble">
                  <span className="transcript-time">{line.time}</span>
                  <p className="transcript-text">{line.text}</p>
                </div>
              ))}
              
              {transcript.length === 0 && (
                <div className="transcript-empty">
                  <MessageSquareIcon size={48} />
                  <p>No transcript yet. Start recording to see live transcription.</p>
                </div>
              )}
            </div>
            
            {/* Playback Controls */}
            {recordedAudioUrl && (
              <div className="playback-controls">
                <button 
                  className="btn btn-primary"
                  onClick={togglePlayback}
                >
                  {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span className="playback-time">
                  {formatTime(currentTime)} / {formatTime(totalTime)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Loading Overlay */}
      {isAIGenerating && (
        <div className="ai-loading-overlay">
          <div className="ai-loading-content">
            <div className="ai-loading-spinner">
              <SparklesIcon size={24} />
            </div>
            <h3>AI is working...</h3>
            <p>{aiLoadingMessage || 'Processing your request'}</p>
          </div>
        </div>
      )}

      {/* Hidden audio element for playback */}
      <audio
        ref={audioPlayerRef}
        src={recordedAudioUrl || undefined}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default TranscriptScreen