import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface AudioRecordingOptions {
  source: 'microphone' | 'system' | 'both';
  recordingPath?: string;
  filename?: string;
}

export interface AudioRecordingState {
  isRecording: boolean;
  isAvailable: boolean;
  currentTime: number;
  recordingPath: string | null;
  error: string | null;
  permissions: {
    microphone: boolean;
    screenRecording: boolean;
  };
}

export interface RecordingResult {
  success: boolean;
  path?: string;
  error?: string;
  warning?: string;
}

export interface UseAudioRecordingReturn {
  state: AudioRecordingState;
  startRecording: (options?: AudioRecordingOptions) => Promise<void>;
  stopRecording: () => Promise<RecordingResult>;
  checkPermissions: () => Promise<void>;
  playRecording: (path: string) => Promise<void>;
}

export const useAudioRecording = (): UseAudioRecordingReturn => {
  const [state, setState] = useState<AudioRecordingState>({
    isRecording: false,
    isAvailable: false,
    currentTime: 0,
    recordingPath: null,
    error: null,
    permissions: {
      microphone: false,
      screenRecording: false
    }
  });

  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const startTime = useRef<number>(0);

  // Check if Electron APIs are available
  const isElectronAvailable = useCallback(() => {
    return !!(window as any).api?.swiftRecorder;
  }, []);

  // Check Swift recorder availability
  const checkAvailability = useCallback(async () => {
    if (!isElectronAvailable()) {
      setState(prev => ({ 
        ...prev, 
        isAvailable: false, 
        error: 'Audio recording requires Electron environment' 
      }));
      return;
    }

    try {
      const result = await (window as any).api.swiftRecorder.checkAvailability();
      setState(prev => ({ 
        ...prev, 
        isAvailable: result.available,
        error: result.available ? null : 'Swift recorder not available'
      }));
    } catch (error) {
      console.error('Failed to check Swift recorder availability:', error);
      setState(prev => ({ 
        ...prev, 
        isAvailable: false, 
        error: 'Failed to check recorder availability' 
      }));
    }
  }, [isElectronAvailable]);

  // Check permissions
  const checkPermissions = useCallback(async () => {
    if (!isElectronAvailable()) return;

    try {
      const result = await (window as any).api.swiftRecorder.checkPermissions();
      setState(prev => ({
        ...prev,
        permissions: {
          microphone: result.microphone === 'GRANTED',
          screenRecording: result.screen_recording === 'GRANTED' || false // Optional for audio-only mode
        }
      }));
    } catch (error) {
      console.error('Failed to check permissions:', error);
      // Fallback: assume permissions are granted if recorder is available
      setState(prev => ({
        ...prev,
        permissions: {
          microphone: prev.isAvailable,
          screenRecording: false // Default to audio-only mode
        }
      }));
    }
  }, [isElectronAvailable]);

  // Start recording
  const startRecording = useCallback(async (options: AudioRecordingOptions = { source: 'both' }) => {
    if (!state.isAvailable) {
      toast.error('Audio recorder is not available');
      return;
    }

    if (state.isRecording) {
      toast.warning('Recording is already in progress');
      return;
    }

    try {
      const recordingPath = options.recordingPath || `${process.env.HOME}/Documents/Friday Recordings`;
      const filename = options.filename || `recording-${Date.now()}`;

      setState(prev => ({ 
        ...prev, 
        isRecording: true, 
        currentTime: 0, 
        error: null 
      }));

      let result;
      if (options.source === 'both') {
        result = await (window as any).api.swiftRecorder.startCombinedRecording(recordingPath, filename);
      } else {
        // For microphone or system only, we'd need to add specific methods
        result = await (window as any).api.swiftRecorder.startCombinedRecording(recordingPath, filename);
      }

      if (result.success) {
        startTime.current = Date.now();
        
        // Start timer
        recordingInterval.current = setInterval(() => {
          setState(prev => ({
            ...prev,
            currentTime: Math.floor((Date.now() - startTime.current) / 1000)
          }));
        }, 1000);

        toast.success('Recording started successfully');
      } else {
        setState(prev => ({ 
          ...prev, 
          isRecording: false, 
          error: result.error || 'Failed to start recording' 
        }));
        toast.error(result.error || 'Failed to start recording');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState(prev => ({ 
        ...prev, 
        isRecording: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
      toast.error('Failed to start recording');
    }
  }, [state.isAvailable, state.isRecording]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    if (!state.isRecording) {
      return { success: false, error: 'No recording in progress' };
    }

    try {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }

      const result = await (window as any).api.swiftRecorder.stopCombinedRecording();

      setState(prev => ({ 
        ...prev, 
        isRecording: false,
        recordingPath: result.path || null,
        error: result.success ? null : result.error
      }));

      if (result.success) {
        toast.success('Recording stopped successfully');
        return { success: true, path: result.path };
      } else {
        toast.error(result.error || 'Failed to stop recording');
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setState(prev => ({ 
        ...prev, 
        isRecording: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
      toast.error('Failed to stop recording');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [state.isRecording]);

  // Play recording
  const playRecording = useCallback(async (path: string) => {
    if (!isElectronAvailable()) {
      toast.error('Audio playback requires Electron environment');
      return;
    }

    try {
      // This would need to be implemented in the Electron main process
      if ((window as any).api?.playAudioFile) {
        const result = await (window as any).api.playAudioFile(path);
        if (result.success) {
          toast.success('Playing recording with native player');
        } else {
          toast.error('Failed to play recording');
        }
      } else {
        // Fallback to browser audio
        const audio = new Audio(`file://${path}`);
        audio.play().catch(() => {
          toast.error('Failed to play recording');
        });
      }
    } catch (error) {
      console.error('Failed to play recording:', error);
      toast.error('Failed to play recording');
    }
  }, [isElectronAvailable]);

  // Set up event listeners for recording events
  useEffect(() => {
    if (!isElectronAvailable()) return;

    const api = (window as any).api.swiftRecorder;

    const handleRecordingStarted = (result: any) => {
      console.log('Recording started:', result);
      setState(prev => ({ ...prev, isRecording: true, error: null }));
    };

    const handleRecordingStopped = (result: any) => {
      console.log('Recording stopped:', result);
      setState(prev => ({ 
        ...prev, 
        isRecording: false, 
        recordingPath: result.path || null 
      }));
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
    };

    const handleRecordingFailed = (result: any) => {
      console.error('Recording failed:', result);
      setState(prev => ({ 
        ...prev, 
        isRecording: false, 
        error: result.error || 'Recording failed' 
      }));
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
    };

    // Set up event listeners
    api.onRecordingStarted?.(handleRecordingStarted);
    api.onRecordingStopped?.(handleRecordingStopped);
    api.onRecordingFailed?.(handleRecordingFailed);

    return () => {
      // Clean up event listeners
      api.removeAllListeners?.();
      
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isElectronAvailable]);

  // Initialize on mount
  useEffect(() => {
    checkAvailability().then(() => {
      checkPermissions();
    });
  }, [checkAvailability, checkPermissions]);

  // Format time helper
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    state: {
      ...state,
      // Add formatted time for convenience
      currentTime: state.currentTime
    },
    startRecording,
    stopRecording,
    checkPermissions,
    playRecording
  };
}; 