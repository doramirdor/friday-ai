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
  microphoneTranscript: TranscriptLine[]
  systemAudioTranscript: TranscriptLine[]
  liveText: string
  liveTextMicrophone: string
  liveTextSystemAudio: string
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
  const microphoneTranscriptRef = useRef<TranscriptLine[]>([])
  const systemAudioTranscriptRef = useRef<TranscriptLine[]>([])
  const liveTextRef = useRef<string>('')
  const liveTextMicrophoneRef = useRef<string>('')
  const liveTextSystemAudioRef = useRef<string>('')
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
      
      // @ts-ignore - API methods may return different types than defined
      const result = await window.api.transcription.startService()
      // @ts-ignore - Result type checking
      if (result && typeof result === 'object' && result.success) {
        transcriptionStatusRef.current = 'ready'
        onTranscriptionStatusChange('ready')
        console.log('✅ Transcription service initialized')
      } else {
        transcriptionStatusRef.current = 'error'
        onTranscriptionStatusChange('error')
        // @ts-ignore - Result type checking
        console.error('Failed to initialize transcription:', result?.error || 'Unknown error')
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
      const result = await window.api.swiftRecorder.checkAvailability()
      // @ts-ignore - Handle boolean or object result
      const available = typeof result === 'boolean' ? result : result.available
      isSwiftRecorderAvailableRef.current = available
      onSwiftRecorderAvailabilityChange(available)
      console.log('🎙️ Swift recorder availability:', available)
    } catch (error) {
      console.error('Failed to check Swift recorder availability:', error)
      isSwiftRecorderAvailableRef.current = false
      onSwiftRecorderAvailabilityChange(false)
    }
  }, [onSwiftRecorderAvailabilityChange])

  // Handle live transcription data (real-time updates)
  const handleLiveTranscriptionData = useCallback((data: { text: string; stream_type?: string }): void => {
    console.log('📡 TRANSCRIPTION: Received live transcription data:', {
      text: data.text?.substring(0, 50) + (data.text && data.text.length > 50 ? '...' : ''),
      stream_type: data.stream_type,
      has_stream_type: !!data.stream_type
    })

    if (data.text && data.text.trim() !== '') {
      const streamType = data.stream_type || 'microphone'
      
      if (streamType === 'system') {
        // Update system audio live text
        liveTextSystemAudioRef.current = data.text
        console.log('🎵 TRANSCRIPTION: Updated system audio live text:', data.text.substring(0, 50) + '...')
      } else {
        // Update microphone live text
        liveTextMicrophoneRef.current = data.text
        console.log('🎤 TRANSCRIPTION: Updated microphone live text:', data.text.substring(0, 50) + '...')
      }

      // Also update general live text for backward compatibility
      liveTextRef.current = data.text
    }
  }, [])

  // Handle transcription results
  const handleTranscriptionResult = useCallback((result: TranscriptionResult & { stream_type?: string }): void => {
    console.log('📝 COMPLETE Received transcription result:', {
      type: result.type,
      text: result.text?.substring(0, 50) + (result.text && result.text.length > 50 ? '...' : ''),
      stream_type: result.stream_type,
      original_stream_type: result.stream_type,
      has_stream_type: !!result.stream_type,
      language: result.language,
      language_probability: result.language_probability,
      full_result_keys: Object.keys(result)
    })

    if (result.type === 'transcript' && result.text && result.text.trim() !== '' && result.text !== 'undefined') {
      // Calculate proper timestamp based on recording start time
      const recordingElapsed = Date.now() - recordingStartTime.current
      const recordingSeconds = Math.floor(recordingElapsed / 1000)
      const currentTimestamp = formatTime(recordingSeconds)

      // Create transcript line
      const newLine: TranscriptLine = {
        time: currentTimestamp,
        text: result.text.trim()
      }

      // Handle stream-specific transcripts
      const streamType = result.stream_type || 'microphone'
      
      console.log(`📝 Processing transcript with stream_type: ${streamType}, original: ${result.stream_type}`)
      
      if (streamType === 'system') {
        // Add to system audio live text and transcript
        liveTextSystemAudioRef.current = liveTextSystemAudioRef.current + ' ' + result.text
        const updatedSystemTranscript = [...systemAudioTranscriptRef.current, newLine]
        systemAudioTranscriptRef.current = updatedSystemTranscript
        console.log('🎵 SYSTEM_AUDIO_DEBUG: Added system audio transcript line:', newLine, 'Total system lines:', updatedSystemTranscript.length)
        console.log('🎵 SYSTEM_AUDIO_DEBUG: System live text now:', liveTextSystemAudioRef.current.substring(0, 100) + '...')
      } else {
        // Add to microphone live text and transcript
        liveTextMicrophoneRef.current = liveTextMicrophoneRef.current + ' ' + result.text
        const updatedMicTranscript = [...microphoneTranscriptRef.current, newLine]
        microphoneTranscriptRef.current = updatedMicTranscript
        console.log('🎤 Added microphone transcript line:', newLine, 'Total mic lines:', updatedMicTranscript.length)
      }

      // Also add to general live text and transcript for backward compatibility
      liveTextRef.current = liveTextRef.current + ' ' + result.text
      const updatedTranscript = [...transcriptRef.current, newLine]
      transcriptRef.current = updatedTranscript
      
      console.log(`📝 Added ${streamType} transcript line:`, newLine, 'Total combined lines:', updatedTranscript.length)
      
      onTranscriptionResult(result)
    } else if (result.type === 'error') {
      console.error('Transcription error:', result.message)
      transcriptionStatusRef.current = 'error'
      onTranscriptionStatusChange('error')
    } else if (result.type === 'transcript' && (!result.text || result.text.trim() === '')) {
      console.log(`📝 Received empty transcription result for ${result.stream_type || 'unknown'} stream - likely silence or no audio content`)
    }
  }, [formatTime, onTranscriptionResult, onTranscriptionStatusChange])

  // Note: System audio transcription is handled by the Swift recorder with --live-transcription flag
  // The Swift recorder sends TRANSCRIPTION_CHUNK messages that are processed by the main process

  // Start combined recording
  const startCombinedRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🎙️ Starting combined audio recording (system + microphone)...')

      // Generate recording path - use Documents folder instead of ~ to avoid path expansion issues
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const recordingPath = '/Users/amirdor/Documents/Friday Recordings'
      const filename = `combined-recording-${timestamp}.wav`

      // Start combined recording via Swift recorder (this will now create both combined and system-only files)
      const result = await window.api.swiftRecorder.startCombinedRecording(
        recordingPath,
        filename
      )

      if (result.success) {
        isRecordingRef.current = true
        isCombinedRecordingRef.current = true
        currentTimeRef.current = 0
        liveTextRef.current = ''
        liveTextMicrophoneRef.current = ''
        liveTextSystemAudioRef.current = ''
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

        // Start microphone transcription for the microphone stream
        await startMicrophoneOnlyTranscription()
        
        console.log('✅ Combined recording started successfully')
        console.log('📁 System-only file will be created: system_only_' + filename)
        console.log('🎤 Microphone live transcription enabled')
        console.log('🎵 System audio live transcription enabled via Swift recorder')
        console.log('📝 Live transcription from both microphone and system audio streams')
        console.log('🔍 Debug: You will now have separate files to analyze:')
        console.log('   - Combined: ' + filename + ' (system + microphone)')
        console.log('   - System only: system_only_' + filename + ' (system audio only)')
        console.log('   - Transcription chunks: system_audio_chunk_*.wav (for debugging)')
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

  // Start microphone-only transcription for combined recording (avoids system audio conflicts)
  const startMicrophoneOnlyTranscription = useCallback(async (): Promise<void> => {
    try {
      console.log('🎤 Starting microphone-only transcription for combined recording...')

      // Wait for transcription service to be ready with retry mechanism
      let retries = 0
      const maxRetries = 10
      let statusResult = await window.api.transcription.isReady()
      
      // @ts-ignore - Handle boolean or object result
      while (!(typeof statusResult === 'boolean' ? statusResult : statusResult.ready) && retries < maxRetries) {
        console.log(`⏳ Transcription service not ready, waiting... (attempt ${retries + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms
        statusResult = await window.api.transcription.isReady()
        retries++
      }
      
      // @ts-ignore - Handle boolean or object result
      if (!(typeof statusResult === 'boolean' ? statusResult : statusResult.ready)) {
        console.error('Transcription service not ready after retries')
        return
      }
      
      console.log('✅ Transcription service ready, starting microphone transcription')

      // Get microphone access for transcription only (not recording)
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      // Use Bluetooth microphone for transcription (same as recording)
      const bluetoothMic = audioInputs.find(device => 
        device.label.toLowerCase().includes('bluetooth') ||
        device.label.toLowerCase().includes('airpods') ||
        device.label.toLowerCase().includes('headphones') ||
        device.label.toLowerCase().includes('headset')
      )
      
      // Configure audio constraints based on device type with improved Bluetooth settings
      const audioConstraints: MediaTrackConstraints = bluetoothMic && bluetoothMic.deviceId ? {
        deviceId: { exact: bluetoothMic.deviceId },
        channelCount: 1,
        sampleRate: { ideal: 16000, min: 8000, max: 48000 }, // Flexible sample rate for Bluetooth
        echoCancellation: false, // Bluetooth handles this
        noiseSuppression: false, // Disable to preserve speech clarity
        autoGainControl: true,
      } : {
        deviceId: 'default',
        channelCount: 1,
        sampleRate: { ideal: 16000, min: 8000, max: 48000 },
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      }
      
      // Log which microphone is being used and device details
      if (bluetoothMic && bluetoothMic.deviceId) {
        console.log('🎧 Using Bluetooth microphone for transcription:', bluetoothMic.label)
        console.log('🔧 Bluetooth device ID:', bluetoothMic.deviceId)
        console.log('🔧 Audio constraints:', audioConstraints)
      } else {
        console.log('🎤 Using default microphone for transcription')
        console.log('🔧 Audio constraints:', audioConstraints)
      }
      
      // Get microphone stream for transcription
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })
      
      console.log('✅ Microphone transcription stream started')
      audioStreamRef.current = stream

      // Start transcription processing with improved audio handling
      const processTranscriptionChunk = async (): Promise<void> => {
        if (!isRecordingRef.current || !isCombinedRecordingRef.current) return

        return new Promise<void>((resolve) => {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm'

          const recorder = new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 48000 // Higher bitrate for better quality
          })

          const chunks: Blob[] = []

          // Monitor audio levels to ensure we're getting audio
          const audioContext = new AudioContext()
          const source = audioContext.createMediaStreamSource(stream)
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)
          
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          let hasAudio = false

          const checkAudioLevel = (): void => {
            analyser.getByteFrequencyData(dataArray)
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length
            console.log('🎤 Audio level:', average)
            if (average > 10) { // Threshold for detecting audio
              hasAudio = true
            }
          }

          const audioCheckInterval = setInterval(checkAudioLevel, 100)

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data)
            }
          }

          recorder.onstop = async () => {
            clearInterval(audioCheckInterval)
            audioContext.close()
            
            try {
              if (chunks.length > 0) {
                console.log('🎤 Chunks:', chunks.length)
                const completeBlob = new Blob(chunks, { type: mimeType })
                console.log(`🎤 Audio chunk: ${completeBlob.size} bytes, hasAudio: ${hasAudio}`)
                // Only process if we have sufficient audio data
                if (completeBlob.size > 500) {
                  const arrayBuffer = await completeBlob.arrayBuffer()
                  const result = await window.api.transcription.processChunk(arrayBuffer)
                  if (result.success) {
                    console.log('✅ Microphone transcription chunk processed with audio activity')
                  }
                } else {
                  console.log('⚠️ Skipping transcription - insufficient audio activity or data size')
                }
              }
            } catch (error) {
              console.log('⚠️ Error processing transcription chunk:', error)
            }
            resolve()
          }

          recorder.onerror = () => {
            clearInterval(audioCheckInterval)
            audioContext.close()
            resolve()
          }

          recorder.start()
          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop()
            }
          }, 3000) // 3 seconds for better speech detection while maintaining responsiveness
        })
      }

      // Start transcription loop
      const transcriptionLoop = async (): Promise<void> => {
        while (isRecordingRef.current && isCombinedRecordingRef.current) {
          await processTranscriptionChunk()
          if (isRecordingRef.current && isCombinedRecordingRef.current) {
            await new Promise<void>((resolve) => setTimeout(resolve, 200))
          }
        }
      }

      transcriptionLoop()
      console.log('✅ Microphone transcription started for combined recording')
    } catch (error) {
      console.error('Failed to start microphone transcription:', error)
    }
  }, [])

  // Start parallel transcription recording using microphone (disabled for combined recording)
  const startParallelTranscriptionRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🎤 Starting microphone capture for transcription...')

      // Get available audio devices first for better Bluetooth handling
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      console.log('📱 Available audio input devices:', audioInputs.map(d => ({ id: d.deviceId, label: d.label })))
      
      // Look for Bluetooth devices (usually have "Bluetooth" or specific names like "AirPods" in label)
      const bluetoothDevice = audioInputs.find(device => 
        device.label.toLowerCase().includes('bluetooth') ||
        device.label.toLowerCase().includes('airpods') ||
        device.label.toLowerCase().includes('headphones') ||
        device.label.toLowerCase().includes('headset')
      )
      
      let audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
      
      // If Bluetooth device found, specifically request it and use optimal settings
      if (bluetoothDevice && bluetoothDevice.deviceId) {
        console.log('🎧 Bluetooth device detected, using optimized settings:', bluetoothDevice.label)
        audioConstraints = {
          deviceId: { exact: bluetoothDevice.deviceId },
          channelCount: 1,
          sampleRate: 16000, // Lower sample rate works better with Bluetooth
          echoCancellation: false, // Let Bluetooth device handle this
          noiseSuppression: false, // Bluetooth devices often have built-in processing
          autoGainControl: true
        }
      } else {
        console.log('🎤 Using default/built-in microphone')
        audioConstraints.deviceId = 'default'
      }
      
      // Request microphone access with optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })
      
      console.log('✅ Microphone capture started for transcription')
      
      // Log available audio tracks for debugging
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        const track = audioTracks[0]
        console.log('📊 Audio track info:', {
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings()
        })
      }

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
          const statusResult = await window.api.transcription.isReady()
          
          // @ts-ignore - Handle boolean or object result
          if (!statusResult.ready) {
            // @ts-ignore - Handle boolean or object result
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
              const result = await window.api.transcription.processChunk(chunk)
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
                  const statusResult = await window.api.transcription.isReady()
                  // @ts-ignore - Handle boolean or object result
                  if (!statusResult.ready) {
                    // @ts-ignore - Handle boolean or object result
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
                      const result = await window.api.transcription.processChunk(arrayBuffer)
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

      console.log('✅ System audio transcription started (with queue resilience)')
    } catch (error) {
      console.error('Failed to start system audio transcription:', error)
      // Don't fail the entire recording if transcription fails
      console.log('⚠️ Continuing with recording without live transcription')
    }
  }, [])

  // Start microphone recording
  const startMicrophoneRecording = useCallback(async (): Promise<void> => {
    try {
      console.log('🎤 Starting microphone-only recording...')

      // Check transcription service status
      const statusResult = await window.api.transcription.isReady()
      // @ts-ignore - Handle boolean or object result
      if (!statusResult.ready) {
        console.error('Transcription service not ready')
        return
      }

      // Get available audio devices first for better Bluetooth handling
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      console.log('📱 Available audio input devices for microphone recording:', audioInputs.map(d => ({ id: d.deviceId, label: d.label })))
      
      // Look for Bluetooth devices
      const bluetoothDevice = audioInputs.find(device => 
        device.label.toLowerCase().includes('bluetooth') ||
        device.label.toLowerCase().includes('airpods') ||
        device.label.toLowerCase().includes('headphones') ||
        device.label.toLowerCase().includes('headset')
      )
      
      let audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: false, // Keep background noise for better speech detection
        autoGainControl: true    // Auto-adjust volume for speech
      }
      
      // Optimize for Bluetooth if detected
      if (bluetoothDevice && bluetoothDevice.deviceId) {
        console.log('🎧 Bluetooth device detected for microphone recording:', bluetoothDevice.label)
        audioConstraints = {
          deviceId: { exact: bluetoothDevice.deviceId },
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false, // Bluetooth handles this
          noiseSuppression: false, // Keep for speech detection
          autoGainControl: true
        }
      } else {
        console.log('🎤 Using default microphone for recording')
        audioConstraints.deviceId = 'default'
      }
      
      // Get user media with optimal settings for speech recognition
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })
      
      // Log microphone info for debugging
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        const track = audioTracks[0]
        console.log('🎤 Microphone track info:', {
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        })
      }

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
              console.log(`🎵 Audio data available: ${event.data.size} bytes`)
              chunks.push(event.data)
              // Also save for complete recording
              recordingChunksRef.current.push(event.data)
            } else {
              console.log('⚠️ Empty audio data received')
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
                  const result = await window.api.transcription.processChunk(arrayBuffer)

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
    // Prevent multiple simultaneous stop operations
    if (!isCombinedRecordingRef.current) {
      console.log('⚠️ Combined recording already stopped or not active')
      return
    }

    try {
      console.log('🛑 Stopping combined recording with transcript length:', transcriptRef.current.length)
      
      // Immediately mark as stopping to prevent multiple calls
      isCombinedRecordingRef.current = false
      isRecordingRef.current = false
      
      const result = await window.api.swiftRecorder.stopCombinedRecording()

      if (result.success) {
        console.log('✅ Combined recording stopped successfully')
        
        // Set the recording path if available
        if (result.path) {
          console.log('📁 RecordingService: Setting combined recording path:', result.path)
          combinedRecordingPathRef.current = result.path
          
          // Manually trigger the stopped callback with the recording path
          console.log('📤 Triggering onCombinedRecordingStopped with path:', result.path)
          onCombinedRecordingStopped({
            success: true,
            path: result.path,
            code: 'RECORDING_STOPPED'
          })
        } else {
          // Trigger callback without path but still mark as successful
          console.log('📤 Triggering onCombinedRecordingStopped without path (recording may have completed)')
          onCombinedRecordingStopped({
            success: true,
            code: 'RECORDING_STOPPED'
          })
        }
      } else {
        // Check if it's a "No recording in progress" error - this is normal, not an error
        if (result.error && result.error.includes('No recording in progress')) {
          console.log('⚠️ No recording in progress - this is normal if stop was called multiple times')
          console.log('🔄 Triggering stopped callback to maintain consistent state')
          
          // Trigger stopped callback to maintain consistent state
          onCombinedRecordingStopped({
            success: true,
            code: 'RECORDING_STOPPED',
            warning: 'No recording was in progress'
          })
        } else if (result.error && result.error.includes('timeout')) {
          console.log('⚠️ Timeout error detected - recording may have completed successfully')
          console.log('🔄 Triggering stopped callback to preserve transcript data')
          
          // Still trigger the stopped callback to save transcript data
          onCombinedRecordingStopped({
            success: true,
            code: 'RECORDING_STOPPED',
            warning: 'Recording completed but path verification timed out'
          })
        } else {
          console.error('Failed to stop combined recording:', result.error)
          
          // Trigger failure callback for actual errors
          onCombinedRecordingFailed({
            success: false,
            error: result.error,
            code: 'RECORDING_FAILED'
          })
        }
      }
    } catch (error) {
      console.error('Error stopping combined recording:', error)
    }

    // Stop audio streams used for transcription
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop())
      audioStreamRef.current = null
    }
    
    // Note: System audio transcription cleanup is handled by Swift recorder

    // Clean up common recording state but preserve transcript and recording path
    transcriptionStatusRef.current = 'ready'
    onTranscriptionStatusChange('ready')

    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }

    console.log('✅ Combined recording cleanup completed. Duration:', formatTime(currentTimeRef.current), 'Transcript lines preserved:', transcriptRef.current.length, 'Recording path:', combinedRecordingPathRef.current)
  }, [formatTime, onTranscriptionStatusChange, onCombinedRecordingStopped, onCombinedRecordingFailed])

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
      console.log('🎙️ Starting combined recording (system audio + microphone) with live transcription')
      await startCombinedRecording()
    } else {
      console.log('🎤 Starting microphone-only recording with live transcription')
      await startMicrophoneRecording()
      // Start parallel transcription for microphone-only mode
      await startParallelTranscriptionRecording()
    }
  }, [startCombinedRecording, startMicrophoneRecording, startParallelTranscriptionRecording, startMicrophoneOnlyTranscription])

  // Main stop recording function
  const stopRecording = useCallback(async (): Promise<void> => {
    // Prevent multiple simultaneous stop operations
    if (!isRecordingRef.current) {
      console.log('⚠️ Recording already stopped or not active')
      return
    }

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
    microphoneTranscript: microphoneTranscriptRef.current,
    systemAudioTranscript: systemAudioTranscriptRef.current,
    liveText: liveTextRef.current,
    liveTextMicrophone: liveTextMicrophoneRef.current,
    liveTextSystemAudio: liveTextSystemAudioRef.current,
    recordingWarning: recordingWarningRef.current,
    combinedRecordingPath: combinedRecordingPathRef.current,
    recordedAudioBlob: recordedAudioBlobRef.current
  }), [])

  // Initialize service
  const initializeService = useCallback(async (): Promise<void> => {
    await initializeTranscription()
    await checkSwiftRecorderAvailability()
  }, [initializeTranscription, checkSwiftRecorderAvailability])

  // Setup event listeners - run once on mount
  useEffect(() => {
    // Setup transcription result listener
    if (window.api.transcription) {
      console.log('🎤 TRANSCRIPTION: Setting up transcription result listener')
      window.api.transcription.onResult(handleTranscriptionResult)
      
      // Setup live transcription data listener  
      console.log('📡 TRANSCRIPTION: Setting up live transcription data listener')
      window.api.transcription.onLiveTranscriptionData(handleLiveTranscriptionData)
    }

    // Setup Swift recorder event listeners
    if (window.api.swiftRecorder) {
      console.log('🎙️ AUDIO: Setting up Swift recorder event listeners')
      window.api.swiftRecorder.onRecordingStarted(onCombinedRecordingStarted)
      window.api.swiftRecorder.onRecordingStopped(onCombinedRecordingStopped)
      window.api.swiftRecorder.onRecordingFailed(onCombinedRecordingFailed)
    }

    return () => {
      // Only cleanup when component unmounts, not on every effect run
      console.log('🎤 TRANSCRIPTION: Cleaning up event listeners on component unmount')
      if (window.api.transcription) {
        window.api.transcription.removeAllListeners()
      }
      if (window.api.swiftRecorder) {
        window.api.swiftRecorder.removeAllListeners()
      }
    }
  }, []) // Empty dependency array - only run once on mount

  return {
    startRecording,
    stopRecording,
    getState,
    initializeService
  }
}

export default useRecordingService 