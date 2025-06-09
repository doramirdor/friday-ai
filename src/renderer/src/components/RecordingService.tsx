import { useRef, useCallback, useEffect } from 'react'

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

interface TranscriptLine {
  time: string
  text: string
}

interface RecordingServiceProps {
  onTranscriptionResult: (result: TranscriptionResult) => void
  onCombinedRecordingStarted: (result: RecordingResult) => void
  onCombinedRecordingStopped: (result: RecordingResult) => void
  onCombinedRecordingFailed: (result: RecordingResult) => void
  onTranscriptionStatusChange: (status: string) => void
  onSwiftRecorderAvailabilityChange: (available: boolean) => void
}

interface RecordingServiceState {
  transcriptionStatus: string
  isSwiftRecorderAvailable: boolean
  isRecording: boolean
  isCombinedRecording: boolean
  currentTime: number
  transcript: TranscriptLine[]
  liveText: string
  recordingWarning: string | null
  combinedRecordingPath: string | null
  recordedAudioBlob: Blob | null
}

interface RecordingServiceAPI {
  startRecording: (mode: 'microphone' | 'combined') => Promise<void>
  stopRecording: () => Promise<void>
  getState: () => RecordingServiceState
  initializeService: () => Promise<void>
}

export const useRecordingService = ({
  onTranscriptionResult,
  onCombinedRecordingStarted,
  onCombinedRecordingStopped,
  onCombinedRecordingFailed,
  onTranscriptionStatusChange,
  onSwiftRecorderAvailabilityChange
}: RecordingServiceProps): RecordingServiceAPI => {
  // State refs
  const transcriptionStatusRef = useRef<string>('idle')
  const isSwiftRecorderAvailableRef = useRef<boolean>(false)
  const isRecordingRef = useRef<boolean>(false)
  const isCombinedRecordingRef = useRef<boolean>(false)
  const currentTimeRef = useRef<number>(0)
  const transcriptRef = useRef<TranscriptLine[]>([])
  const liveTextRef = useRef<string>('')
  const recordingWarningRef = useRef<string | null>(null)
  const combinedRecordingPathRef = useRef<string | null>(null)
  const recordedAudioBlobRef = useRef<Blob | null>(null)

  // Recording control refs
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)
  const chunkCounter = useRef<number>(0)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStartTime = useRef<number>(0)

  // Format time utility
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  // Initialize transcription service
  const initializeTranscription = useCallback(async (): Promise<void> => {
    try {
      transcriptionStatusRef.current = 'initializing'
      onTranscriptionStatusChange('initializing')
      
      const result = await (window.api as any).transcription.startService()
      if (result.success) {
        transcriptionStatusRef.current = 'ready'
        onTranscriptionStatusChange('ready')
        console.log('✅ Transcription service initialized')
      } else {
        transcriptionStatusRef.current = 'error'
        onTranscriptionStatusChange('error')
        console.error('Failed to initialize transcription:', result.error)
      }
    } catch (error) {
      transcriptionStatusRef.current = 'error'
      onTranscriptionStatusChange('error')
      console.error('Transcription initialization error:', error)
    }
  }, [onTranscriptionStatusChange])

  // Check Swift recorder availability
  const checkSwiftRecorderAvailability = useCallback(async (): Promise<void> => {
    try {
      const result = await (window.api as any).swiftRecorder.checkAvailability()
      isSwiftRecorderAvailableRef.current = result.available
      onSwiftRecorderAvailabilityChange(result.available)
      console.log('🎙️ Swift recorder availability:', result.available)
    } catch (error) {
      console.error('Failed to check Swift recorder availability:', error)
      isSwiftRecorderAvailableRef.current = false
      onSwiftRecorderAvailabilityChange(false)
    }
  }, [onSwiftRecorderAvailabilityChange])

  // Handle transcription results
  const handleTranscriptionResult = useCallback((result: TranscriptionResult): void => {
    console.log('📝 Received transcription:', result)

    if (result.type === 'transcript' && result.text && result.text !== 'undefined') {
      // Calculate proper timestamp based on recording start time
      const recordingElapsed = Date.now() - recordingStartTime.current
      const recordingSeconds = Math.floor(recordingElapsed / 1000)
      const currentTimestamp = formatTime(recordingSeconds)

      // Add to live text for immediate feedback
      liveTextRef.current = liveTextRef.current + ' ' + result.text

      // Add to transcript lines immediately during recording
      const newLine: TranscriptLine = {
        time: currentTimestamp,
        text: result.text.trim()
      }

      const updatedTranscript = [...transcriptRef.current, newLine]
      transcriptRef.current = updatedTranscript
      
      console.log('📝 Added transcript line:', newLine, 'Total lines:', updatedTranscript.length)
      
      onTranscriptionResult(result)
    } else if (result.type === 'error') {
      console.error('Transcription error:', result.message)
      transcriptionStatusRef.current = 'error'
      onTranscriptionStatusChange('error')
    }
  }, [formatTime, onTranscriptionResult, onTranscriptionStatusChange])

  // Start combined recording
  const startCombinedRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🎙️ Starting combined audio recording (system + microphone)...')

      // Generate recording path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const recordingPath = '~/Friday Recordings'
      const filename = `combined-recording-${timestamp}.mp3`

      // Start combined recording via Swift recorder
      const result = await (window.api as any).swiftRecorder.startCombinedRecording(
        recordingPath,
        filename
      )

      if (result.success) {
        isRecordingRef.current = true
        isCombinedRecordingRef.current = true
        currentTimeRef.current = 0
        liveTextRef.current = ''
        transcriptionStatusRef.current = 'recording'
        onTranscriptionStatusChange('recording')

        // Set recording start time for proper timestamps
        recordingStartTime.current = Date.now()

        // Clear any previous recording data
        recordedAudioBlobRef.current = null
        combinedRecordingPathRef.current = null

        // Start timer
        recordingInterval.current = setInterval(() => {
          currentTimeRef.current += 1
        }, 1000)

        // Also start parallel microphone recording for real-time transcription
        await startParallelTranscriptionRecording()

        console.log('✅ Combined recording started successfully')
      } else {
        console.error('Failed to start combined recording:', result.error)
        transcriptionStatusRef.current = 'error'
        onTranscriptionStatusChange('error')
      }
    } catch (error) {
      console.error('Failed to start combined recording:', error)
      transcriptionStatusRef.current = 'error'
      onTranscriptionStatusChange('error')
    }
  }, [onTranscriptionStatusChange])

  // Start parallel transcription recording
  const startParallelTranscriptionRecording = useCallback(async (): Promise<void> => {
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

      // Start the transcription loop
      transcriptionLoop()

      console.log('✅ Parallel transcription recording started (with queue resilience)')
    } catch (error) {
      console.error('Failed to start parallel transcription recording:', error)
    }
  }, [])

  // Start microphone recording
  const startMicrophoneRecording = useCallback(async (): Promise<void> => {
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
      isRecordingRef.current = true
      isCombinedRecordingRef.current = false
      currentTimeRef.current = 0
      liveTextRef.current = ''
      transcriptionStatusRef.current = 'recording'
      onTranscriptionStatusChange('recording')
      chunkCounter.current = 0
      recordingChunksRef.current = []

      // Clear any previous recording
      recordedAudioBlobRef.current = null

      // Start timer
      recordingInterval.current = setInterval(() => {
        currentTimeRef.current += 1
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
            transcriptionStatusRef.current = 'error'
            onTranscriptionStatusChange('error')
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

      // Start the recording loop
      recordingLoop()
      
      // Set recording start time for proper timestamps
      recordingStartTime.current = Date.now()

      console.log('✅ Microphone recording started (4-second complete segments)')
    } catch (error) {
      console.error('Failed to start microphone recording:', error)
      transcriptionStatusRef.current = 'error'
      onTranscriptionStatusChange('error')
    }
  }, [onTranscriptionStatusChange])

  // Stop combined recording
  const stopCombinedRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🛑 Stopping combined recording with transcript length:', transcriptRef.current.length)
      
      const result = await (window.api as any).swiftRecorder.stopCombinedRecording()

      if (result.success) {
        console.log('✅ Combined recording stopped successfully')
        
        // Set the recording path if available
        if (result.path) {
          console.log('📁 RecordingService: Setting combined recording path:', result.path)
          combinedRecordingPathRef.current = result.path
        }
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

    // Clean up common recording state but preserve transcript and recording path
    isCombinedRecordingRef.current = false
    transcriptionStatusRef.current = 'ready'
    onTranscriptionStatusChange('ready')

    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }

    console.log('✅ Combined recording cleanup completed. Duration:', formatTime(currentTimeRef.current), 'Transcript lines preserved:', transcriptRef.current.length, 'Recording path:', combinedRecordingPathRef.current)
  }, [formatTime, onTranscriptionStatusChange])

  // Stop microphone recording
  const stopMicrophoneRecording = useCallback((): void => {
    // Stop the recording loop
    isRecordingRef.current = false
    isCombinedRecordingRef.current = false
    transcriptionStatusRef.current = 'ready'
    onTranscriptionStatusChange('ready')

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

      recordedAudioBlobRef.current = completeRecording
    }

    console.log('✅ Microphone recording stopped. Duration:', formatTime(currentTimeRef.current))
  }, [formatTime, onTranscriptionStatusChange])

  // Main start recording function
  const startRecording = useCallback(async (mode: 'microphone' | 'combined'): Promise<void> => {
    if (mode === 'combined' && isSwiftRecorderAvailableRef.current) {
      await startCombinedRecording()
    } else {
      await startMicrophoneRecording()
    }
  }, [startCombinedRecording, startMicrophoneRecording])

  // Main stop recording function
  const stopRecording = useCallback(async (): Promise<void> => {
    console.log('🛑 Stopping recording...')

    if (isCombinedRecordingRef.current) {
      await stopCombinedRecording()
    } else {
      stopMicrophoneRecording()
    }
  }, [stopCombinedRecording, stopMicrophoneRecording])

  // Get current state
  const getState = useCallback((): RecordingServiceState => ({
    transcriptionStatus: transcriptionStatusRef.current,
    isSwiftRecorderAvailable: isSwiftRecorderAvailableRef.current,
    isRecording: isRecordingRef.current,
    isCombinedRecording: isCombinedRecordingRef.current,
    currentTime: currentTimeRef.current,
    transcript: transcriptRef.current,
    liveText: liveTextRef.current,
    recordingWarning: recordingWarningRef.current,
    combinedRecordingPath: combinedRecordingPathRef.current,
    recordedAudioBlob: recordedAudioBlobRef.current
  }), [])

  // Force save transcript function for manual triggering
  const forceTranscriptSave = useCallback(() => {
    console.log('🔄 Force saving transcript with', transcriptRef.current.length, 'lines')
    return transcriptRef.current
  }, [])

  // Initialize service
  const initializeService = useCallback(async (): Promise<void> => {
    await initializeTranscription()
    await checkSwiftRecorderAvailability()
  }, [initializeTranscription, checkSwiftRecorderAvailability])

  // Setup event listeners
  useEffect(() => {
    // Setup transcription result listener
    if ((window.api as any).transcription) {
      (window.api as any).transcription.onResult(handleTranscriptionResult)
    }

    // Setup Swift recorder event listeners
    if (isSwiftRecorderAvailableRef.current && (window.api as any).swiftRecorder) {
      (window.api as any).swiftRecorder.onRecordingStarted(onCombinedRecordingStarted)
      ;(window.api as any).swiftRecorder.onRecordingStopped(onCombinedRecordingStopped)
      ;(window.api as any).swiftRecorder.onRecordingFailed(onCombinedRecordingFailed)
    }

    return () => {
      // Cleanup event listeners
      if ((window.api as any).transcription) {
        (window.api as any).transcription.removeAllListeners()
      }
      if ((window.api as any).swiftRecorder) {
        (window.api as any).swiftRecorder.removeAllListeners()
      }
    }
  }, [handleTranscriptionResult, onCombinedRecordingStarted, onCombinedRecordingStopped, onCombinedRecordingFailed])

  return {
    startRecording,
    stopRecording,
    getState,
    initializeService
  }
}

export default useRecordingService 