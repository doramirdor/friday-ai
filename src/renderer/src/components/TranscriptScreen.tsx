import React, { useState, useRef, useEffect } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import {
  PlayIcon,
  PauseIcon,
  XIcon,
  PlusIcon,
  CheckIcon,
  FileTextIcon,
  ClipboardListIcon,
  InfoIcon,
  UploadIcon,
  MicIcon,
  SaveIcon,
  SparklesIcon,
  BookOpenIcon
} from 'lucide-react'
import { Meeting } from '../types/database'

/// <reference path="../../preload/index.d.ts" />

interface TranscriptLine {
  time: string
  text: string
}

interface TranscriptScreenProps {
  meeting: Meeting | null
  onBack: () => void
}

type SidebarTab = 'details' | 'context' | 'actions' | 'notes' | 'summary'

// Local interface definition to fix TypeScript errors
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

/*
interface TranscriptionAPI {
  startService: () => Promise<{ success: boolean; error?: string }>
  stopService: () => Promise<{ success: boolean }>
  isReady: () => Promise<{ ready: boolean }>
  processChunk: (buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
  ping: () => Promise<{ success: boolean; error?: string }>
  onResult: (callback: (result: TranscriptionResult) => void) => void
  removeAllListeners: () => void
}

interface DatabaseAPI {
  createMeeting: (meeting: any) => Promise<any>
  getMeeting: (id: number) => Promise<any>
  getAllMeetings: () => Promise<any>
  updateMeeting: (id: number, meeting: any) => Promise<any>
  deleteMeeting: (id: number) => Promise<any>
  getSettings: () => Promise<any>
  updateSettings: (settings: any) => Promise<any>
}

interface ElectronAPI {
  db: DatabaseAPI
  transcription: TranscriptionAPI
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
*/

const TranscriptScreen: React.FC<TranscriptScreenProps> = ({ meeting }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('details')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
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
  const [transcriptionStatus, setTranscriptionStatus] = useState<string>('idle')
  const [liveText, setLiveText] = useState<string>('')
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [needsAutoSave, setNeedsAutoSave] = useState(false)

  // Swift recorder state
  const [isSwiftRecorderAvailable, setIsSwiftRecorderAvailable] = useState(false)
  const [recordingMode, setRecordingMode] = useState<'microphone' | 'combined'>('microphone')
  const [isCombinedRecording, setIsCombinedRecording] = useState(false)
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null)
  const [combinedRecordingPath, setCombinedRecordingPath] = useState<string | null>(null)

  // Add state for chunked recording
  const [isChunkedRecording, setIsChunkedRecording] = useState(false)
  const [recordingChunks, setRecordingChunks] = useState<string[]>([])
  const [chunkIndex, setChunkIndex] = useState(0)
  const chunkBuffers = useRef<Blob[]>([])
  const chunkInterval = useRef<NodeJS.Timeout | null>(null)
  const CHUNK_DURATION = 5 * 60 * 1000 // 5 minutes

  const playbackInterval = useRef<NodeJS.Timeout | null>(null)
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)
  const chunkCounter = useRef<number>(0)
  const isRecordingRef = useRef<boolean>(false)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const recordingStartTime = useRef<number>(0) // Track when recording actually started

  // Initialize data from meeting prop
  useEffect(() => {
    if (meeting) {
      console.log('🎵 Meeting data:', meeting)
      setTitle(meeting.title)
      setDescription(meeting.description)
      setTags(meeting.tags)
      setContextText(meeting.context)
      setActionItems(meeting.actionItems)
      setTranscript(meeting.transcript || [])
      setUploadedFiles(meeting.context_files || [])
      setNotes(meeting.notes || '')
      setSummary(meeting.summary || '')
      setIsSummaryAIGenerated(!!meeting.summary) // If there's already a summary, consider it AI-generated

      // Parse duration to seconds
      if (meeting.duration && meeting.duration !== '00:00') {
        const [minutes, seconds] = meeting.duration.split(':').map(Number)
        const totalSeconds = (minutes || 0) * 60 + (seconds || 0)
        setTotalTime(totalSeconds)
        console.log('⏱️ Loaded duration:', meeting.duration, `(${totalSeconds} seconds)`)
      } else {
        console.log('⚠️ No valid duration found in meeting data')
      }

      // Load existing recording if available (handles both single and chunked)
      if (meeting.recordingPath) {
        console.log('🎵 Loading existing recording from:', meeting.recordingPath)
        loadRecording(meeting.recordingPath)
      }
    }
  }, [meeting])

  // Function to load existing recording file
  const loadExistingRecording = async (filePath: string): Promise<void> => {
    try {
      console.log('🔄 Loading recording file via IPC...')

      // Use IPC to load the file (avoids CSP issues with file:// URLs)
      const result = await (window.api as any).transcription.loadRecording(filePath)

      if (result.success && result.buffer) {
        // Convert ArrayBuffer to Blob with correct MIME type
        // Detect file type from extension
        const isMP3 = filePath.toLowerCase().endsWith('.mp3')
        const mimeType = isMP3 ? 'audio/mpeg' : 'audio/webm'

        const blob = new Blob([result.buffer], { type: mimeType })
        const audioUrl = URL.createObjectURL(blob)
        setRecordedAudioUrl(audioUrl)
        console.log(`✅ Recording loaded for playback via IPC (${mimeType})`)
      } else {
        console.error('Failed to load recording file:', result.error)
      }
    } catch (error) {
      console.error('Failed to load existing recording:', error)
    }
  }

  // Helper function to load recording (single file or chunks)
  const loadRecording = async (recordingPath: string | string[]): Promise<void> => {
    try {
      if (Array.isArray(recordingPath)) {
        console.log('🔄 Loading chunked recording...')
        setRecordingChunks(recordingPath)
        
        // Load first chunk for immediate playback
        if (recordingPath.length > 0) {
          const result = await window.api.chunkedRecording.loadChunks([recordingPath[0]])
          if (result.success && result.chunks && result.chunks.length > 0) {
            const blob = new Blob([result.chunks[0]], { type: 'audio/mpeg' })
            const audioUrl = URL.createObjectURL(blob)
            setRecordedAudioUrl(audioUrl)
            console.log('✅ First chunk loaded for playback')
          }
        }
      } else {
        // Single file recording
        await loadExistingRecording(recordingPath)
      }
    } catch (error) {
      console.error('Failed to load recording:', error)
    }
  }

  // Setup transcription service on component mount
  useEffect((): (() => void) => {
    console.log('🔧 TranscriptScreen component initializing...')
    
    const initializeTranscription = async (): Promise<void> => {
      try {
        setTranscriptionStatus('initializing')
        const result = await (window.api as any).transcription.startService()
        if (result.success) {
          setTranscriptionStatus('ready')
          console.log('✅ Transcription service initialized')
        } else {
          setTranscriptionStatus('error')
          console.error('Failed to initialize transcription:', result.error)
        }
      } catch (error) {
        setTranscriptionStatus('error')
        console.error('Transcription initialization error:', error)
      }
    }

    const checkSwiftRecorderAvailability = async (): Promise<void> => {
      try {
        const result = await (window.api as any).swiftRecorder.checkAvailability()
        setIsSwiftRecorderAvailable(result.available)
        console.log('🎙️ Swift recorder availability:', result.available)

        // Set default recording mode based on availability
        if (result.available) {
          setRecordingMode('combined')
        }
      } catch (error) {
        console.error('Failed to check Swift recorder availability:', error)
        setIsSwiftRecorderAvailable(false)
      }
    }

    // Setup transcription result listener (currentTime is captured when called)
    const handleTranscriptionResult = (result: TranscriptionResult): void => {
      console.log('📝 Received transcription:', result)

      if (result.type === 'transcript' && result.text && result.text !== 'undefined') {
        // Calculate proper timestamp based on recording start time
        const recordingElapsed = Date.now() - recordingStartTime.current
        const recordingSeconds = Math.floor(recordingElapsed / 1000)
        const currentTimestamp = formatTime(recordingSeconds)

        // Add to live text for immediate feedback
        setLiveText((prev) => prev + ' ' + result.text)

        // Add to transcript lines immediately during recording
        const newLine: TranscriptLine = {
          time: currentTimestamp,
          text: result.text.trim()
        }

        setTranscript((prev) => [...prev, newLine])
      } else if (result.type === 'error') {
        console.error('Transcription error:', result.message)
        setTranscriptionStatus('error')
      }
    }

    initializeTranscription()
    checkSwiftRecorderAvailability()
    
    // Setup transcription result listener once
    ;(window.api as any).transcription.onResult(handleTranscriptionResult)

    return (): void => {
      // Cleanup transcription service listeners
      ;(window.api as any).transcription.removeAllListeners()
    }
  }, []) // Run only once on mount

  // Separate effect for Swift recorder event listeners
  useEffect(() => {
    // Setup Swift recorder event listeners
    const handleCombinedRecordingStarted = (result: RecordingResult): void => {
      console.log('🎙️ Combined recording started:', result)
      setIsCombinedRecording(true)
      
      // Handle different recording start types and error conditions
      if (result.code === 'BLUETOOTH_LIMITATION') {
        // Show warning about Bluetooth audio limitation
        console.warn('⚠️ Bluetooth audio detected:', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}\n💡 ${result.recommendation}`)
        setTranscriptionStatus('recording-mic-only')
        
        // Log device details if available
        if (result.device) {
          console.log(`🔊 Audio device: ${result.device}`)
        }
        
      } else if (result.code === 'SCREEN_PERMISSION_REQUIRED') {
        // Show warning about missing screen recording permission
        console.warn('⚠️ Screen recording permission required:', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}\n💡 ${result.recommendation}\n\nPlease grant screen recording permission in System Settings > Privacy & Security > Screen Recording`)
        setTranscriptionStatus('recording-mic-only')
        
      } else if (result.code === 'SYSTEM_AUDIO_UNAVAILABLE') {
        // Show warning about general system audio unavailability
        console.warn('⚠️ System audio unavailable:', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}\n💡 ${result.recommendation}`)
        setTranscriptionStatus('recording-mic-only')
        
        // Log technical details if available
        if (result.device && result.screen_permission !== undefined) {
          console.log(`🔍 Debug info - Device: ${result.device}, Screen permission: ${result.screen_permission}`)
        }
        
      } else if (result.code === 'RECORDING_STARTED_MIC_ONLY') {
        // Legacy fallback case
        console.warn('⚠️ System audio capture failed (legacy):', result.warning)
        setRecordingWarning(`⚠️ ${result.warning}`)
        setTranscriptionStatus('recording-mic-only')
        
      } else if (result.code === 'RECORDING_FAILED' || result.code === 'SYSTEM_AUDIO_FAILED') {
        // Handle complete recording failure
        console.error('❌ Recording failed:', result.error)
        setRecordingWarning(`❌ Recording failed: ${result.error}`)
        setTranscriptionStatus('error')
        setIsCombinedRecording(false)
        
      } else if (result.code === 'RECORDING_STARTED') {
        // Success case - clear any previous warnings
        setRecordingWarning(null)
        setTranscriptionStatus('recording')
        
        // Log any warnings about audio quality if present
        if (result.warning) {
          console.warn('⚠️ Recording quality warning:', result.warning)
          // Show non-blocking warning for quality issues
          setRecordingWarning(`ℹ️ ${result.warning}`)
        }
        
      } else {
        // Unknown result code
        console.warn('⚠️ Unknown recording result code:', result.code)
        setRecordingWarning(null)
      }
    }

    const handleCombinedRecordingStopped = (result: RecordingResult): void => {
      console.log('🎙️ Combined recording stopped:', result)
      setIsCombinedRecording(false)
      setRecordingWarning(null) // Clear warning when recording stops

      // Store the recording path for saving to database
      if (result.path) {
        setCombinedRecordingPath(result.path)
        console.log('📁 Stored combined recording path:', result.path)
        
        // Load the combined recording for playback
        loadRecording(result.path)
      }
    }

    const handleCombinedRecordingFailed = (result: RecordingResult): void => {
      console.error('❌ Recording failed during operation:', result.error)
      
      // Clean up recording state
      setIsCombinedRecording(false)
      setIsRecording(false)
      setTranscriptionStatus('error')
      setRecordingWarning(`❌ Recording failed: ${result.error}`)
      
      // Stop parallel transcription recording
      isRecordingRef.current = false
      
      // Stop audio stream
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null
      }
      
      // Clear timer
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
        recordingInterval.current = null
      }
    }

    if (isSwiftRecorderAvailable) {
      ;(window.api as any).swiftRecorder.onRecordingStarted(handleCombinedRecordingStarted)
      ;(window.api as any).swiftRecorder.onRecordingStopped(handleCombinedRecordingStopped)
      ;(window.api as any).swiftRecorder.onRecordingFailed(handleCombinedRecordingFailed)
    }

    return (): void => {
      if (isSwiftRecorderAvailable) {
        ;(window.api as any).swiftRecorder.removeAllListeners()
      }
    }
  }, [isSwiftRecorderAvailable]) // Only isSwiftRecorderAvailable dependency

  const contextTemplates = {
    custom: 'Add your custom context here...',
    standup:
      "This is our daily standup meeting. We discuss what we completed yesterday, what we're working on today, and any blockers. Team members share progress updates and coordinate on shared tasks.",
    planning:
      'Sprint planning session where we review the product backlog, estimate story points, and plan work for the upcoming sprint. We discuss priorities, dependencies, and resource allocation.',
    review:
      'Code review session where we examine recent changes, discuss implementation approaches, identify potential issues, and ensure code quality standards are met.',
    client:
      'Client meeting to discuss project progress, gather feedback, review deliverables, and align on next steps. We present updates and address any concerns or questions.',
    interview:
      'Interview session for evaluating candidate qualifications, cultural fit, and technical skills. We assess experience, problem-solving abilities, and alignment with role requirements.',
    retrospective:
      'Sprint retrospective to reflect on what went well, what could be improved, and action items for the next sprint. Team discussion on process improvements.'
  }

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
    if (recordingMode === 'combined' && isSwiftRecorderAvailable) {
      await startCombinedRecording()
    } else {
      await startMicrophoneRecording()
    }
  }

  const startCombinedRecording = async (): Promise<void> => {
    try {
      console.log('🎙️ Starting combined audio recording (system + microphone)...')

      // Note: Combined recording doesn't need transcription service to be ready
      // It uses the Swift recorder directly and can be transcribed later
      
      // Generate recording path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const recordingPath = '~/Friday Recordings' // Will be resolved by the main process
      const filename = `combined-recording-${timestamp}.mp3`

      // Start combined recording via Swift recorder
      const result = await (window.api as any).swiftRecorder.startCombinedRecording(
        recordingPath,
        filename
      )

      if (result.success) {
        setIsRecording(true)
        setCurrentTime(0)
        setLiveText('')
        setTranscriptionStatus('recording')
        
        // Set recording start time for proper timestamps
        recordingStartTime.current = Date.now()

        // Clear any previous recording
        if (recordedAudioUrl) {
          URL.revokeObjectURL(recordedAudioUrl)
          setRecordedAudioUrl(null)
        }
        setRecordedAudioBlob(null)
        setCombinedRecordingPath(null)

        // Start timer
        recordingInterval.current = setInterval(() => {
          setCurrentTime((prev) => prev + 1)
        }, 1000)

        // Also start parallel microphone recording for real-time transcription
        // This won't interfere with the Swift recorder's microphone capture
        await startParallelTranscriptionRecording()

        console.log('✅ Combined recording started successfully')
      } else {
        console.error('Failed to start combined recording:', result.error)
        setTranscriptionStatus('error')
      }
    } catch (error) {
      console.error('Failed to start combined recording:', error)
      setTranscriptionStatus('error')
    }
  }

  const startParallelTranscriptionRecording = async (): Promise<void> => {
    try {
      console.log('🎤 Starting parallel microphone recording for transcription...')

      // Get user media with optimal settings for transcription
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      })

      // Store stream reference for cleanup
      audioStreamRef.current = stream

      // Reset transcription state
      chunkCounter.current = 0

      // Queue for pending transcription chunks when service is unavailable
      const transcriptionQueue: ArrayBuffer[] = []
      let isProcessingQueue = false

      // Function to process queued chunks when service becomes available
      const processQueuedChunks = async (): Promise<void> => {
        if (isProcessingQueue || transcriptionQueue.length === 0) return
        
        isProcessingQueue = true
        while (transcriptionQueue.length > 0) {
          const statusResult = await (window.api as any).transcription.isReady()
          
          if (!statusResult.ready) {
            const details = statusResult.details || {}
            console.log('⏳ Waiting for transcription service to be ready...', {
              serviceReady: details.serviceReady,
              socketConnected: details.socketConnected,
              processRunning: details.processRunning,
              isStarting: details.isStarting
            })
            
            // Wait longer if service is starting, shorter for socket reconnection
            const waitTime = details.isStarting ? 2000 : 1000
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }

          const chunk = transcriptionQueue.shift()
          if (chunk) {
            try {
              const result = await (window.api as any).transcription.processChunk(chunk)
              if (result.success) {
                console.log('✅ Queued transcription chunk processed successfully')
              } else {
                console.error('Failed to process queued transcription chunk:', result.error)
                // Don't retry indefinitely - just log and continue
              }
            } catch (error) {
              console.error('Error processing queued transcription chunk:', error)
            }
          }
        }
        isProcessingQueue = false
      }

      // Function to create and process transcription segments
      const processTranscriptionSegment = async (): Promise<void> => {
        if (!isRecordingRef.current) return

        return new Promise<void>((resolve) => {
          // Use compatible audio format for transcription
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : 'audio/wav'

          const recorder = new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 32000
          })

          const chunks: Blob[] = []

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data)
            }
          }

          recorder.onstop = async () => {
            try {
              if (chunks.length > 0) {
                const completeBlob = new Blob(chunks, { type: mimeType })

                if (completeBlob.size > 1000) {
                  console.log(`🎵 Processing transcription segment: ${completeBlob.size} bytes`)

                  const arrayBuffer = await completeBlob.arrayBuffer()
                  
                  // Check if service is ready, if not, queue the chunk
                  const statusResult = await (window.api as any).transcription.isReady()
                  if (!statusResult.ready) {
                    const details = statusResult.details || {}
                    console.log('⏳ Transcription service busy, queuing chunk for later processing', {
                      serviceReady: details.serviceReady,
                      socketConnected: details.socketConnected,
                      processRunning: details.processRunning,
                      isStarting: details.isStarting
                    })
                    transcriptionQueue.push(arrayBuffer)
                    // Trigger queue processing in background
                    setTimeout(processQueuedChunks, 500)
                  } else {
                    // Try to process immediately
                    try {
                      const result = await (window.api as any).transcription.processChunk(arrayBuffer)
                      if (!result.success) {
                        console.log('⏳ Processing failed, queuing chunk for retry. Error:', result.error)
                        transcriptionQueue.push(arrayBuffer)
                        setTimeout(processQueuedChunks, 500)
                      } else {
                        console.log('✅ Transcription segment sent successfully')
                      }
                    } catch (error) {
                      console.log('⏳ Processing error, queuing chunk for retry. Error:', error)
                      transcriptionQueue.push(arrayBuffer)
                      setTimeout(processQueuedChunks, 500)
                    }
                  }

                  chunkCounter.current++
                }
              }
            } catch (error) {
              console.error('Error processing transcription segment:', error)
            }

            resolve()
          }

          recorder.onerror = (event) => {
            console.error('Transcription MediaRecorder error:', event)
            resolve()
          }

          // Record for 4 seconds to get complete segments
          recorder.start()

          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop()
            }
          }, 4000)
        })
      }

      // Process transcription segments in a loop
      const transcriptionLoop = async (): Promise<void> => {
        while (isRecordingRef.current) {
          await processTranscriptionSegment()

          // Small gap between segments
          if (isRecordingRef.current) {
            await new Promise<void>((resolve) => setTimeout(resolve, 200))
          }
        }
        
        // Process any remaining queued chunks when recording stops
        if (transcriptionQueue.length > 0) {
          console.log(`🔄 Processing ${transcriptionQueue.length} remaining queued transcription chunks...`)
          await processQueuedChunks()
        }
      }

      // Update refs for loop control
      isRecordingRef.current = true

      // Start the transcription loop
      transcriptionLoop()

      console.log('✅ Parallel transcription recording started (with queue resilience)')
    } catch (error) {
      console.error('Failed to start parallel transcription recording:', error)
    }
  }

  const startMicrophoneRecording = async (): Promise<void> => {
    try {
      console.log('🎤 Starting microphone-only recording...')

      // Check transcription service status
      const statusResult = await (window.api as any).transcription.isReady()
      if (!statusResult.ready) {
        console.error('Transcription service not ready')
        return
      }

      // Get user media with optimal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      })

      // Store stream reference for cleanup
      audioStreamRef.current = stream

      // Reset recording state
      setIsRecording(true)
      setCurrentTime(0)
      setLiveText('')
      setTranscriptionStatus('recording')
      chunkCounter.current = 0
      recordingChunksRef.current = []

      // Clear any previous recording
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
        setRecordedAudioUrl(null)
      }
      setRecordedAudioBlob(null)

      // Start timer
      recordingInterval.current = setInterval(() => {
        setCurrentTime((prev) => prev + 1)
      }, 1000)

      // Function to create and process a complete recording segment
      const processRecordingSegment = async (): Promise<void> => {
        if (!isRecordingRef.current) return

        return new Promise<void>((resolve) => {
          // Use more compatible audio format
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : 'audio/wav'

          console.log(`🎵 Using recording format: ${mimeType}`)

          const recorder = new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 32000
          })

          const chunks: Blob[] = []

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data)
              // Also save for complete recording
              recordingChunksRef.current.push(event.data)
            }
          }

          recorder.onstop = async () => {
            try {
              if (chunks.length > 0) {
                // Create complete WebM blob from all chunks
                const completeBlob = new Blob(chunks, { type: mimeType })

                if (completeBlob.size > 1000) {
                  // Only process substantial segments
                  console.log(`🎵 Processing complete segment: ${completeBlob.size} bytes`)

                  const arrayBuffer = await completeBlob.arrayBuffer()
                  const result = await (window.api as any).transcription.processChunk(arrayBuffer)

                  if (!result.success) {
                    console.error('Failed to process audio segment:', result.error)
                  } else {
                    console.log('✅ Audio segment sent successfully')
                  }

                  chunkCounter.current++
                } else {
                  console.log(`⏭️ Skipping small segment: ${completeBlob.size} bytes`)
                }
              }
            } catch (error) {
              console.error('Error processing audio segment:', error)
            }

            resolve()
          }

          recorder.onerror = (event) => {
            console.error('MediaRecorder error:', event)
            setTranscriptionStatus('error')
            resolve()
          }

          // Record for 4 seconds to get complete segments
          recorder.start()

          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop()
            }
          }, 4000)
        })
      }

      // Process segments in a loop
      const recordingLoop = async (): Promise<void> => {
        while (isRecordingRef.current) {
          await processRecordingSegment()

          // Small gap between segments to ensure clean boundaries
          if (isRecordingRef.current) {
            await new Promise<void>((resolve) => setTimeout(resolve, 200))
          }
        }
      }

      // Update refs for loop control
      isRecordingRef.current = true

      // Start the recording loop
      recordingLoop()
      
      // Set recording start time for proper timestamps
      recordingStartTime.current = Date.now()

      console.log('✅ Microphone recording started (4-second complete segments)')
    } catch (error) {
      console.error('Failed to start microphone recording:', error)
      setTranscriptionStatus('error')
    }
  }

  const stopRecording = async (): Promise<void> => {
    console.log('🛑 Stopping recording...')

    if (isCombinedRecording) {
      await stopCombinedRecording()
    } else {
      stopMicrophoneRecording()
    }
  }

  const stopCombinedRecording = async (): Promise<void> => {
    try {
      const result = await (window.api as any).swiftRecorder.stopCombinedRecording()

      if (result.success) {
        console.log('✅ Combined recording stopped successfully')

        // The recording stopped event will be handled by the event listener
        // which will load the recording for playback
      } else {
        console.error('Failed to stop combined recording:', result.error)
      }
    } catch (error) {
      console.error('Error stopping combined recording:', error)
    }

    // Stop parallel transcription recording
    isRecordingRef.current = false

    // Stop audio stream used for transcription
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop())
      audioStreamRef.current = null
    }

    // Clean up common recording state
    setIsRecording(false)
    setTranscriptionStatus('ready')

    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }

    // Set total time to current recording time
    const finalDuration = Math.max(currentTime, 1)
    setTotalTime(finalDuration)

    console.log('✅ Combined recording cleanup completed. Duration:', formatTime(finalDuration))
  }

  const stopMicrophoneRecording = (): void => {
    // Stop the recording loop
    isRecordingRef.current = false
    setIsRecording(false)
    setTranscriptionStatus('ready')

    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop())
      audioStreamRef.current = null
    }

    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }

    // Create complete recording file for conversion
    if (recordingChunksRef.current.length > 0) {
      // Use the same compatible format detection as recording
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav'

      const completeRecording = new Blob(recordingChunksRef.current, { type: mimeType })

      console.log(
        `💾 Complete recording created: ${completeRecording.size} bytes, format: ${mimeType}`
      )
      console.log(`⏳ Preparing for MP3 conversion and playback...`)

      // Set total time to current recording time (ensure it's not zero)
      const finalDuration = Math.max(currentTime, 1) // At least 1 second if we recorded anything

      console.log(
        '✅ Microphone recording stopped. Duration:',
        formatTime(finalDuration),
        `(${finalDuration} seconds)`
      )

      // Update state but don't set audio URL yet - wait for MP3 conversion
      setRecordedAudioBlob(completeRecording)
      setTotalTime(finalDuration)

      // Trigger save and MP3 conversion
      setNeedsAutoSave(true)
    }
  }

  // Auto-save effect that triggers when recording is complete
  useEffect(() => {
    if (needsAutoSave && meeting?.id && recordedAudioBlob && totalTime > 0) {
      console.log('🔄 Auto-save triggered with state:', {
        needsAutoSave,
        meetingId: meeting?.id,
        hasRecordedBlob: !!recordedAudioBlob,
        recordedBlobSize: recordedAudioBlob?.size,
        totalTime,
        formattedDuration: formatTime(totalTime),
        transcriptLines: transcript.length
      })
      setNeedsAutoSave(false)
      handleSaveMeeting()
    }
  }, [needsAutoSave, meeting?.id, recordedAudioBlob, totalTime])

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
        // Ensure audio is loaded before playing
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

            // Update active line based on time if transcript exists
            if (transcript && transcript.length > 0) {
              const timeInMinutes = newTime / 60
              const lineIndex = Math.floor(timeInMinutes * 4)
              setActiveLineIndex(Math.min(lineIndex, transcript.length - 1))
            }

            // Auto-pause at end
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

    // Update active line if transcript exists
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

  const addTag = (): void => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string): void => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleTagKeyPress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      addTag()
    }
  }

  const toggleActionItem = (id: number): void => {
    setActionItems((items) =>
      items.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    )
  }

  const addActionItem = (): void => {
    const newItem = {
      id: Date.now(),
      text: 'New action item...',
      completed: false
    }
    setActionItems([...actionItems, newItem])
  }

  const handleContextTemplateChange = (template: string): void => {
    setContextText(contextTemplates[template as keyof typeof contextTemplates])
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files
    if (files) {
      const validExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.json', '.xml']
      const remainingSlots = 5 - uploadedFiles.length
      
      if (remainingSlots <= 0) {
        alert('Maximum of 5 context files allowed')
        return
      }
      
      const filesToProcess = Array.from(files).slice(0, remainingSlots)
      const validFiles = filesToProcess.filter(file => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase()
        return validExtensions.includes(extension)
      })
      
      if (validFiles.length !== filesToProcess.length) {
        alert('Only text format files are supported: PDF, DOC, DOCX, TXT, MD, JSON, XML')
      }
      
      // For now, store file names. In a full implementation, you would:
      // 1. Save files to a dedicated context files directory
      // 2. Store the actual file paths in the database
      // 3. Implement file reading/processing for AI context
      const newFileNames = validFiles.map((file) => file.name)
      setUploadedFiles((prev) => [...prev, ...newFileNames])
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = ''
  }

  const removeFile = (fileName: string): void => {
    setUploadedFiles((prev) => prev.filter((file) => file !== fileName))
  }

  useEffect(() => {
    return () => {
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current)
      }
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
      }
    }
  }, [])

  const renderSidebarContent = (): React.ReactNode => {
    switch (activeSidebarTab) {
      case 'details':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recording Details</h3>
            </div>
            <div className="card-body">
              <div className="input-group">
                <input
                  type="text"
                  className="input input-floating"
                  placeholder=" "
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <label className="input-label">Title</label>
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <label className="input-label">Description</label>
              </div>

              <div className="input-group">
                <label className="demo-label">Tags</label>
                <div className="tag-input-container">
                  {tags.map((tag) => (
                    <span key={tag} className="tag tag-deletable">
                      {tag}
                      <button className="tag-delete" onClick={() => removeTag(tag)}>
                        <XIcon size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="tag-input"
                    placeholder="Add tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={handleTagKeyPress}
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 'context':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Context Information</h3>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label className="demo-label">Context Template</label>
                <select
                  className="input"
                  onChange={(e) => handleContextTemplateChange(e.target.value)}
                  value={contextText === contextTemplates.standup ? 'standup' : 'custom'}
                >
                  <option value="custom">Custom</option>
                  <option value="standup">Daily Standup</option>
                  <option value="planning">Sprint Planning</option>
                  <option value="review">Code Review</option>
                  <option value="client">Client Meeting</option>
                  <option value="interview">Interview</option>
                  <option value="retrospective">Sprint Retrospective</option>
                </select>
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  style={{ minHeight: '120px' }}
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                />
                <label className="input-label">Context</label>
              </div>

              <div className="input-group">
                <label className="demo-label">Context Files</label>
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    id="context-files"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.json,.xml"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="context-files" className="btn btn-secondary btn-sm">
                    <UploadIcon size={16} />
                    Upload Files ({uploadedFiles.length}/5)
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="uploaded-files">
                    {uploadedFiles.map((fileName, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-sm"
                        style={{
                          background: 'var(--surface-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: '8px'
                        }}
                      >
                        <div className="flex items-center gap-sm">
                          <FileTextIcon size={16} color="var(--text-secondary)" />
                          <span className="text-sm">{fileName}</span>
                        </div>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => removeFile(fileName)}
                          style={{ padding: '4px' }}
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'actions':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Action Items</h3>
            </div>
            <div className="card-body">
              <div className="action-items">
                {actionItems.map((item) => (
                  <div key={item.id} className="action-item">
                    <input
                      type="checkbox"
                      id={`action-${item.id}`}
                      checked={item.completed}
                      onChange={() => toggleActionItem(item.id)}
                    />
                    <label
                      htmlFor={`action-${item.id}`}
                      className={`action-item-text ${item.completed ? 'completed' : ''}`}
                    >
                      {item.text}
                    </label>
                  </div>
                ))}
              </div>

              <button
                className="btn btn-ghost btn-sm w-full"
                onClick={addActionItem}
                style={{ marginTop: '12px' }}
              >
                <PlusIcon size={16} />
                Add Action Item
              </button>
            </div>
          </div>
        )

      case 'notes':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Notes</h3>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={generateAllContent}
                  title="Generate all content with AI"
                >
                  <SparklesIcon size={16} />
                  Generate All
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label className="demo-label">Notes (Markdown Editor)</label>
                <div style={{ marginTop: '8px' }}>
                  <MDEditor
                    value={notes}
                    onChange={(val) => setNotes(val || '')}
                    preview="edit"
                    hideToolbar={false}
                    height={250}
                    data-color-mode="light"
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Use the toolbar above for formatting. Switch between edit and preview modes using the toolbar buttons.
              </div>
            </div>
          </div>
        )

      case 'summary':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Summary</h3>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={generateSummary}
                  title="Generate summary with AI"
                >
                  <SparklesIcon size={16} />
                  Generate
                </button>
              </div>
            </div>
            <div className="card-body">
              {!isSummaryAIGenerated && !summary ? (
                <div style={{
                  textAlign: 'center',
                  padding: 'var(--spacing-xl)',
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  border: '2px dashed var(--border-primary)'
                }}>
                  <SparklesIcon size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>No summary yet</p>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    Click "Generate" to create an AI-powered summary based on your transcript, context, and notes.
                  </p>
                </div>
              ) : (
                <div className="input-group">
                  <textarea
                    className="input textarea input-floating"
                    placeholder=" "
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    style={{ minHeight: '150px' }}
                  />
                  <label className="input-label">Meeting Summary</label>
                </div>
              )}
              {summary && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isSummaryAIGenerated ? '🤖 AI-generated summary - you can edit it above' : 'Custom summary'}
                </div>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const progressPercentage = totalTime > 0 ? (currentTime / totalTime) * 100 : 0

  // Show recording interface if no recording is available
  const hasTranscript = transcript && transcript.length > 0
  const hasRecording = totalTime > 0 && recordedAudioUrl

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
        return `Recording live... ${formatTime(currentTime)}`
      case 'recording-mic-only':
        return `Recording (Microphone Only)... ${formatTime(currentTime)}`
      case 'processing':
        return 'Processing audio...'
      case 'error':
        return 'Transcription service error'
      default:
        return 'Ready to record'
    }
  }

  const handleSaveMeeting = async (): Promise<void> => {
    if (!meeting?.id) {
      console.error('No meeting ID available for saving')
      return
    }

    // Prevent multiple simultaneous saves
    if (savingMeeting) {
      console.log('Save already in progress, skipping...')
      return
    }

    try {
      setSavingMeeting(true)
      console.log('💾 Saving meeting data...')
      console.log('📊 Current state before save:', {
        totalTime,
        formattedDuration: formatTime(totalTime),
        transcriptLines: transcript.length,
        hasRecordedBlob: !!recordedAudioBlob,
        recordedBlobSize: recordedAudioBlob?.size || 0,
        currentRecordingPath: meeting.recordingPath || 'none',
        needsAutoSave
      })

      let recordingPath = meeting.recordingPath || ''

      // For combined recordings, use the stored path
      if (combinedRecordingPath) {
        recordingPath = combinedRecordingPath
        console.log('📁 Using combined recording path:', recordingPath)
      }
      // Save the audio file if we have recorded audio and no existing path
      else if (recordedAudioBlob && !recordingPath) {
        console.log('💾 Saving new audio recording...')
        try {
          const arrayBuffer = await recordedAudioBlob.arrayBuffer()
          const result = await (window.api as any).transcription.saveRecording(
            arrayBuffer,
            meeting.id
          )

          if (result.success && result.filePath) {
            recordingPath = result.filePath
            console.log('✅ Audio recording saved to:', recordingPath)

            // Load the converted MP3 file for playback
            console.log('🎵 Loading converted MP3 file for playback...')
            await loadRecording(recordingPath)
          } else {
            console.error('Failed to save audio recording:', result.error)
          }
        } catch (error) {
          console.error('Error saving audio recording:', error)
        }
      } else if (recordingPath) {
        console.log('📁 Using existing recording path:', recordingPath)
      } else {
        console.log('⚠️ No recording data to save')
      }

      const updatedMeetingData: Partial<Meeting> = {
        title,
        description,
        tags,
        context: contextText,
        context_files: uploadedFiles.slice(0, 5), // Limit to 5 files
        actionItems,
        transcript,
        duration: formatTime(totalTime),
        recordingPath,
        notes,
        summary,
        updatedAt: new Date().toISOString()
      }

      console.log(
        '💾 About to save meeting with duration:',
        formatTime(totalTime),
        `(${totalTime} seconds)`
      )
      console.log('💾 Meeting data to save:', updatedMeetingData)

      await window.api.db.updateMeeting(meeting.id, updatedMeetingData)
      console.log('✅ Meeting data saved successfully')

      // Verify what was actually saved
      const savedMeeting = await window.api.db.getMeeting(meeting.id)
      console.log('🔍 Verification - Data actually saved to database:', {
        id: savedMeeting?.id,
        title: savedMeeting?.title,
        duration: savedMeeting?.duration,
        recordingPath: savedMeeting?.recordingPath,
        transcriptLines: savedMeeting?.transcript?.length || 0
      })

      console.log('📊 Saved data:', {
        transcript: transcript.length + ' lines',
        duration: formatTime(totalTime),
        tags: tags.length + ' tags',
        actionItems: actionItems.length + ' action items',
        recordingPath: recordingPath || 'none'
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

    try {
      console.log('🤖 Generating summary with Gemini...')
      const settings = await window.api.db.getSettings()
      
      const options = {
        transcript,
        globalContext: settings.globalContext || '',
        meetingContext: contextText,
        notes,
        existingTitle: title
      }

      const result = await (window.api as any).gemini.generateSummary(options)
      
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
    }
  }

  const generateAllContent = async (): Promise<void> => {
    if (transcript.length === 0) {
      alert('No transcript available to generate content from')
      return
    }

    try {
      console.log('🤖 Generating all content with Gemini...')
      const settings = await window.api.db.getSettings()
      
      const options = {
        transcript,
        globalContext: settings.globalContext || '',
        meetingContext: contextText,
        notes,
        existingTitle: title
      }

      const result = await (window.api as any).gemini.generateContent(options)
      
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
    }
  }

  // Helper function to create a recording chunk
  const createRecordingChunk = async (): Promise<void> => {
    if (chunkBuffers.current.length === 0) return

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const chunkBlob = new Blob(chunkBuffers.current, { type: mimeType })
      const arrayBuffer = await chunkBlob.arrayBuffer()

      if (meeting?.id) {
        console.log(`💾 Saving chunk ${chunkIndex} (${chunkBlob.size} bytes)`)
        
        const result = await window.api.chunkedRecording.addChunk(meeting.id, arrayBuffer)
        if (result.success) {
          console.log(`✅ Chunk ${chunkIndex} saved successfully`)
          setChunkIndex(prev => prev + 1)
        } else {
          console.error('Failed to save chunk:', result.error)
        }
      }

      // Clear buffer for next chunk
      chunkBuffers.current = []
    } catch (error) {
      console.error('Error creating recording chunk:', error)
    }
  }

  // Start chunked recording with automatic chunk creation
  const startChunkedRecordingWithTimer = async (): Promise<void> => {
    if (!meeting?.id) return

    try {
      console.log('🎬 Starting chunked recording...')
      
      // Initialize chunked recording
      const result = await window.api.chunkedRecording.start(meeting.id)
      if (result.success) {
        setIsChunkedRecording(true)
        setChunkIndex(0)
        chunkBuffers.current = []

        // Set up periodic chunk creation
        chunkInterval.current = setInterval(createRecordingChunk, CHUNK_DURATION)
        
        console.log('✅ Chunked recording started with 5-minute intervals')
      } else {
        console.error('Failed to start chunked recording:', result.error)
      }
    } catch (error) {
      console.error('Error starting chunked recording:', error)
    }
  }

  // Stop chunked recording
  const stopChunkedRecordingWithTimer = async (): Promise<void> => {
    if (!meeting?.id) return

    try {
      // Clear chunk timer
      if (chunkInterval.current) {
        clearInterval(chunkInterval.current)
        chunkInterval.current = null
      }

      // Create final chunk if there's data
      await createRecordingChunk()

      // Stop chunked recording
      const result = await window.api.chunkedRecording.stop(meeting.id)
      if (result.success) {
        console.log('🏁 Chunked recording stopped')
        setIsChunkedRecording(false)
        
        if (result.chunkPaths) {
          setRecordingChunks(result.chunkPaths)
          console.log(`📁 Recording saved as ${result.chunkPaths.length} chunks`)
        }
      } else {
        console.error('Failed to stop chunked recording:', result.error)
      }
    } catch (error) {
      console.error('Error stopping chunked recording:', error)
    }
  }

  return (
    <div className="transcript-layout">
      {/* Main Content (Left 50%) */}
      <div className="transcript-main">
        {!hasRecording && !isRecording ? (
          /* Recording Interface */
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
                    onClick={() => setRecordingMode('microphone')}
                    style={{ minWidth: '120px' }}
                  >
                    🎤 Microphone Only
                  </button>
                  <button
                    className={`btn btn-sm ${recordingMode === 'combined' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setRecordingMode('combined')}
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
                onClick={startRecording}
                disabled={transcriptionStatus !== 'ready'}
              >
                <MicIcon size={20} />
                {recordingMode === 'combined' && isSwiftRecorderAvailable
                  ? 'Start Combined Recording'
                  : 'Start Recording'}
              </button>
            </div>
          </div>
        ) : isRecording ? (
          /* Live Recording Interface */
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
                  Recording live... {formatTime(currentTime)}
                </span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={stopRecording}
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
        ) : (
          /* Playback Interface */
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
                    if (duration > 0 && Math.abs(duration - totalTime) > 1) {
                      console.log(`📐 Updating totalTime from ${totalTime}s to ${duration}s`)
                      setTotalTime(duration)
                    }
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
                    if (duration > 0 && Math.abs(duration - totalTime) > 1) {
                      console.log(`📐 Updating totalTime from metadata: ${duration}s`)
                      setTotalTime(duration)
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
                  setIsPlaying(false)
                  if (playbackInterval.current) {
                    clearInterval(playbackInterval.current)
                    playbackInterval.current = null
                  }
                }}
                style={{ display: 'none' }}
                preload="metadata"
              />
            )}

            <div className="waveform-player">
              <div className="waveform-controls">
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={togglePlayback}
                  disabled={!recordedAudioUrl}
                >
                  {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                </button>
                <div className="waveform-time">
                  <span>{formatTime(currentTime)}</span> / <span>{formatTime(totalTime)}</span>
                </div>
              </div>

              <div className="waveform-track" onClick={handleSeek}>
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
                      onClick={() => handleTranscriptLineClick(line, index)}
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
        )}
      </div>

      {/* Sidebar (Right 50%) */}
      <div className="transcript-sidebar">
        {/* Tab Navigation */}
        <div className="tabs">
          <button
            className={`tab ${activeSidebarTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveSidebarTab('details')}
          >
            <InfoIcon size={16} />
            Details
          </button>
          <button
            className={`tab ${activeSidebarTab === 'context' ? 'active' : ''}`}
            onClick={() => setActiveSidebarTab('context')}
          >
            <FileTextIcon size={16} />
            Context
          </button>
          <button
            className={`tab ${activeSidebarTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveSidebarTab('actions')}
          >
            <ClipboardListIcon size={16} />
            Actions
          </button>
          <button
            className={`tab ${activeSidebarTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveSidebarTab('notes')}
          >
            <BookOpenIcon size={16} />
            Notes
          </button>
          <button
            className={`tab ${activeSidebarTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveSidebarTab('summary')}
          >
            <FileTextIcon size={16} />
            Summary
          </button>
        </div>

        {/* Tab Content */}
        {renderSidebarContent()}

        {/* Save Indicator */}
        <div className="save-indicator saved">
          <CheckIcon size={16} />
          <span>All changes saved</span>
          <span className="text-xs text-secondary">⌘ S</span>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: 'var(--spacing-md)' }}>
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              console.log('🔧 Manual save triggered. Current state:')
              console.log('📊 Debug state:', {
                totalTime,
                formattedDuration: formatTime(totalTime),
                transcriptLines: transcript.length,
                hasRecordedBlob: !!recordedAudioBlob,
                recordedBlobSize: recordedAudioBlob?.size || 0,
                currentRecordingPath: meeting?.recordingPath || 'none',
                needsAutoSave
              })
              handleSaveMeeting()
            }}
            disabled={savingMeeting}
          >
            <SaveIcon size={16} />
            {savingMeeting ? 'Saving...' : 'Save Meeting'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TranscriptScreen
