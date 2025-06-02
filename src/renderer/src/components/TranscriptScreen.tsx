import React, { useState, useRef, useEffect } from 'react'
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
  SaveIcon
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

type SidebarTab = 'details' | 'context' | 'actions'

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

  const playbackInterval = useRef<NodeJS.Timeout | null>(null)
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)
  const chunkCounter = useRef<number>(0)
  const isRecordingRef = useRef<boolean>(false)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const recordingChunks = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

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
        loadExistingRecording(meeting.recordingPath)
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
        const currentTimestamp = formatTime(currentTime)

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
    const handleCombinedRecordingStarted = (result: any): void => {
      console.log('🎙️ Combined recording started:', result)
      setIsCombinedRecording(true)
    }

    const handleCombinedRecordingStopped = (result: any): void => {
      console.log('🎙️ Combined recording stopped:', result)
      setIsCombinedRecording(false)

      // Load the combined recording for playback
      if (result.path) {
        loadExistingRecording(result.path)
      }
    }

    if (isSwiftRecorderAvailable) {
      ;(window.api as any).swiftRecorder.onRecordingStarted(handleCombinedRecordingStarted)
      ;(window.api as any).swiftRecorder.onRecordingStopped(handleCombinedRecordingStopped)
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
      recordingChunks.current = []

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
              recordingChunks.current.push(event.data)
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
    if (recordingChunks.current.length > 0) {
      // Use the same compatible format detection as recording
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/wav'

      const completeRecording = new Blob(recordingChunks.current, { type: mimeType })

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
      const newFileNames = Array.from(files).map((file) => file.name)
      setUploadedFiles((prev) => [...prev, ...newFileNames])
    }
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
                    accept=".pdf,.doc,.docx,.txt,.md"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="context-files" className="btn btn-secondary btn-sm">
                    <UploadIcon size={16} />
                    Upload Files
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

      // Save the audio file if we have recorded audio and no existing path
      if (recordedAudioBlob && !recordingPath) {
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
            await loadExistingRecording(recordingPath)
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
        actionItems,
        transcript,
        duration: formatTime(totalTime),
        recordingPath,
        summary: '', // Could be generated later
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
