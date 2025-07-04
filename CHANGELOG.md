# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Audio-Only Permissions System**: Implemented clean microphone recording without screen recording permissions
  - **New AudioPermissions API**: Clean wrapper using `AVCaptureDevice.requestAccess(for: .audio)` following Apple's recommended approach
  - **Backward Compatibility**: Maintained existing `PermissionsRequester` API while upgrading underlying implementation
  - **Proper Permission Flow**: ➊ Check current TCC status ➋ Request access if not determined ➌ Deliver result on main queue
  - **Bluetooth Optimization**: Enhanced microphone recording for Bluetooth devices without permission conflicts
  - **Clean Architecture**: Removed dependency on `CGRequestScreenCaptureAccess` for microphone-only recording
  - **Better UX**: No more confusing screen recording permission prompts when only recording microphone
  - **Error Prevention**: Eliminates Bluetooth device disconnection issues caused by screen recording permission requests

### Fixed
- **CMSampleBuffer Conversion**: Fixed system audio recording compatibility with latest macOS APIs
  - Proper Core Media framework usage for `CMSampleBuffer` to `AVAudioPCMBuffer` conversion
  - Enhanced audio buffer handling with `CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer`
  - Fixed Swift compilation errors in audio stream processing
  - Improved audio format detection and memory management
  
- **UI Component Dependencies**: Resolved missing UI component imports
  - Added comprehensive UI component library (button, input, card, textarea, dialog, drawer)
  - Fixed TypeScript path mapping for `@/` imports in renderer process
  - Installed missing dependencies: `sonner`, `clsx`, `tailwind-merge`
  - Created utility functions for class name merging with Tailwind CSS

### Enhanced
- **Permission System Architecture**: Following Apple's best practices for audio access
  - Uses `AVCaptureDevice.authorizationStatus(for: .audio)` for status checking
  - Implements proper permission state handling (authorized, denied, restricted, notDetermined)
  - Provides detailed permission status reporting for debugging
  - Maintains clean separation between audio and screen recording permissions

### Technical Details
- **Swift Implementation**: Updated `PermissionsRequester.swift` with modern AVFoundation APIs
- **Main Process Integration**: Enhanced permission checking in `main.swift` with detailed status reporting
- **UI Layer**: Added missing React components and utilities for consistent design system
- **Build System**: Fixed compilation issues and maintained backward compatibility

### Fixed
- **System Audio Capture Issues**
  - Identified and documented Bluetooth audio device interference with ScreenCaptureKit
  - Improved system audio capture configuration in Swift recorder
  - Enhanced audio routing detection and warnings for problematic setups
  - Better stream configuration for more reliable system audio capture
  - Fixed compilation errors in Swift recorder implementation

- **Transcription Service Duplication Issues**
  - Fixed multiple transcription services starting simultaneously
  - Eliminated duplicate transcription results being received
  - Resolved service startup conflicts and timeouts
  - Improved process lock management for single service instance

- **Socket Connection Stability**
  - Removed socket timeouts that caused unnecessary disconnections during transcription
  - Improved reconnection logic with faster recovery (3s vs 5s delay)
  - Enhanced error handling to distinguish between connection and operational errors
  - Better service readiness detection during queue processing

- **Settings Screen Layout**: Updated Settings screen design to match Library screen consistency
  - Changed container styling to use consistent library-container class
  - Improved header styling with proper font sizes and spacing
  - Added content width constraints for better readability
  - Enhanced overall visual consistency across the application

- **Bluetooth Audio Recording Support**: Fixed "System audio capture failed due to Bluetooth audio limitations" error
  - Implemented proactive Bluetooth workaround that creates multi-output devices before recording starts
  - Enhanced multi-output device creation with proper clock synchronization and drift compensation
  - Added robust device verification and comprehensive error handling with detailed diagnostics
  - Improved Bluetooth device detection using proper transport type checking instead of name-based detection
  - Users can now record full system audio while using Bluetooth headphones/speakers
  - Added graceful fallback to microphone-only for combined recording when system audio fails
  - Enhanced user feedback with clear error messages, causes, and actionable recommendations

- **Recording Startup Timeout Issue**: Fixed "Recording start timeout" error for Bluetooth audio setups
  - Increased recording startup timeout from 10 seconds to 30 seconds
  - Bluetooth workaround setup (multi-output device creation) can take 10-15 seconds to properly initialize
  - Prevents timeout errors when using AirPods or other Bluetooth audio devices
  - Allows sufficient time for audio device configuration and system audio routing setup

### Added
- **Comprehensive System Audio Troubleshooting Guide**
  - Detailed documentation of common system audio capture issues
  - Step-by-step solutions for Bluetooth audio interference
  - Best practices for optimal audio recording setup
  - Debugging techniques and diagnostic information
  - Alternative solutions for problematic audio configurations

- **Enhanced Audio Diagnostics and Logging**
  - Real-time audio device detection and routing analysis
  - Bluetooth device warnings with specific recommendations
  - Audio level monitoring and buffer analysis for system audio
  - Enhanced logging for debugging audio capture issues
  - File size monitoring and validation during recording

- **Enhanced Transcription Service Management**
  - Added `isTranscriptionStarting` flag to prevent concurrent service starts in main process
  - Implemented process lock mechanism in Python transcription service to prevent multiple instances
  - Added proper cleanup for lock files on service shutdown with `atexit` handlers
  - Enhanced error handling and logging throughout transcription pipeline

- **Improved Error Reporting and Diagnostics**
  - Comprehensive service readiness checks with detailed status information
  - Better error messages distinguishing between service, socket, and process issues
  - Enhanced queue processing with adaptive wait times based on service state
  - Detailed logging for transcription service debugging and troubleshooting

- **Global Keyboard Shortcuts for Recording Control**
  - `⌘+L` (Cmd+L): Start/Stop Recording
    - Creates new meeting and starts recording if not in transcript view
    - Toggles recording state when in transcript view
  - `⌘+Shift+N` (Cmd+Shift+N): Quick Note
    - Adds timestamped note during recording
    - Switches to notes tab and inserts `[MM:SS] ` timestamp
    - Only works when in transcript view
  - `⌘+P` (Cmd+P): Pause/Resume Recording
    - Placeholder functionality (logs message for now)
    - Will be implemented in future version for streaming transcription

- **Rich Text Editor Integration**
  - **Replaced MDEditor with Quill**: Modern WYSIWYG editor for notes and summary fields
  - **Enhanced Text Formatting**: Full rich text editing capabilities including:
    - Headers (H1, H2, H3)
    - Bold, italic, underline, strikethrough
    - Ordered and unordered lists
    - Blockquotes and code blocks
    - Links and clean formatting options
  - **Improved User Experience**: 
    - Real-time formatting preview (no more raw markdown)
    - Intuitive toolbar with familiar word processor controls
    - Better visual feedback and easier content creation
  - **Theme Integration**: Custom styling that matches Friday app's design system
  - **React Integration**: Proper component lifecycle management and state synchronization

### Changed
- **React Component Optimization**
  - Moved transcription result listener to one-time initialization effect to prevent duplicates
  - Fixed `useEffect` dependencies in `TranscriptScreen` component to prevent re-initialization
  - Separated transcription service initialization from event listeners that depend on `currentTime`
  - Added debug logging to track component initialization

### Technical Details
- **Main Process (`src/main/index.ts`)**
  - Added `isTranscriptionStarting` state flag
  - Enhanced `startTranscriptionService` function with proper flag management
  - Improved error handling in transcription service startup timeouts
  - Added better logging for service startup attempts

- **Python Service (`transcribe.py`)**
  - Implemented file locking using `fcntl` to prevent multiple service instances
  - Added `cleanup_lock` method with `atexit` registration
  - Enhanced error messages for lock file conflicts
  - Improved process lifecycle management

- **Renderer Process (`src/renderer/src/components/TranscriptScreen.tsx`)**
  - Refactored `useEffect` structure to separate one-time initialization from time-dependent listeners
  - Fixed transcription listener registration to prevent multiple subscriptions
  - Added component initialization logging for debugging

### Infrastructure
- Follows Electron architecture best practices with proper separation between main, preload, and renderer layers
- Maintains robust error handling and logging throughout the application stack

### Fixed
- Fixed recording state management when Swift recorder fails after starting
  - Now properly handles RECORDING_FAILED events even after recording has begun
  - Added combined-recording-failed event to notify frontend of mid-recording failures
  - Frontend now cleans up recording state properly when system audio capture fails
  - Prevents "No active recording" error when trying to stop a failed recording
  - Improved error handling and user feedback for Bluetooth audio interference issues

### Enhanced
- Better fallback mechanism for system audio capture failures
  - Swift recorder now properly falls back to microphone-only mode
  - Clear user notifications about Bluetooth audio limitations
  - Recording process continues with microphone even when system audio fails

## [2024-06-01]

## [Unreleased] - 2024-06-03

### Fixed
- **Settings Screen UI**: Fixed broken tab interface that was showing as separate buttons instead of connected tabs
  - Replaced custom CSS classes that didn't exist with existing `.tabs` and `.tab` classes
  - Simplified layout structure to match other components in the app
  - Maintained all functional settings features including Gemini API key configuration
  - Now displays proper tab interface with active state indicators

### Added
- **Markdown Editor**: Implemented visual markdown editor for Notes field in transcript screen
  - Users now see formatted text (bold, italic, headers) instead of raw markdown syntax
  - Added built-in toolbar with all markdown formatting options
  - Maintains compatibility with existing markdown data

### Changed
- **Settings Functionality**: Made settings screen fully functional instead of static UI mockup
  - Connected to database for loading and saving all settings including Gemini API key
  - Added real save functionality with success feedback
  - Fixed API key link to point to actual Google AI Studio
  - All settings now persist between app sessions

### Technical Details
- **Core Audio Integration**: Added comprehensive audio device management functions
  - `builtInOutputID()`: Identifies built-in speakers for aggregate device creation
  - `createMultiOutputDevice()`: Creates temporary multi-output devices for Bluetooth workaround
  - `destroyAggregateDevice()`: Properly cleans up temporary devices
  - `enableBluetoothWorkaround()` / `disableBluetoothWorkaround()`: Manages workaround lifecycle
- **Swift Recorder Enhancement**: Integrated workaround into recording setup and teardown
  - Automatic Bluetooth detection via `kAudioDeviceTransportTypeBluetooth` transport type
  - State tracking with `bluetoothWorkaroundEnabled` flag
  - Cleanup in both normal completion and error scenarios

## [Previous versions...]

### Added
- **Chunked Recording System**: Revolutionary new recording architecture for handling large/long recordings
  - **Background Chunk Saving**: Records are automatically saved in 5-minute chunks during recording
  - **Memory Efficiency**: No more memory issues with large recordings - chunks are processed individually
  - **Scalable Architecture**: Can handle recordings of any length (hours, days) without performance degradation
  - **Lazy Loading**: Chunks load on-demand for immediate playback without waiting for entire file
  - **Background Processing**: Chunks save to disk during recording without interrupting the session
  - **Automatic Detection**: Uses chunked recording for sessions longer than 10 minutes
  - **Backward Compatibility**: Existing single-file recordings continue to work seamlessly
  - **Database Schema Enhancement**: Supports both single file paths and arrays of chunk paths
  - **Fault Tolerance**: Individual chunk failures don't affect the entire recording
  - **Storage Optimization**: Compressed chunks use less disk space than single large files

### Technical Implementation
- **Backend Infrastructure**: Complete chunked recording system in `src/main/index.ts`
  - `createRecordingChunk()`: Creates individual MP3 chunks with background conversion
  - `startChunkedRecording()` / `stopChunkedRecording()`: Manages chunked recording lifecycle
  - `addChunkToRecording()`: Adds chunks with automatic database updates
  - `updateMeetingChunks()`: Background database saves without blocking recording
- **Database Updates**: Enhanced Meeting interface to support `recordingPath: string | string[]`
  - Backward compatible with existing single-file recordings
  - JSON serialization for chunk arrays in database
  - Automatic parsing and format detection
- **IPC Architecture**: New API endpoints for chunked recording operations
  - `chunked-recording:start/stop`: Lifecycle management
  - `chunked-recording:add-chunk`: Real-time chunk addition
  - `chunked-recording:load-chunks`: On-demand chunk loading for playback
- **Frontend Foundation**: Prepared infrastructure for chunked recording integration
  - State management for chunk tracking
  - Unified loading interface for single files and chunks
  - Automatic chunk buffer management

### Benefits for Users
- **No More Recording Limits**: Can record meetings of any length without worrying about file size or memory
- **Immediate Playback**: First chunk loads instantly while others load in background
- **Uninterrupted Recording**: Background saving means recording never stops to save data
- **Better Performance**: App remains responsive even with very long recordings
- **Reliable Recording**: Partial chunk failures don't lose entire recording sessions
- **Storage Efficient**: Better compression and organization of recording data

### Configuration
- **Chunk Duration**: 5 minutes per chunk (configurable)
- **Size Limits**: 50MB maximum per chunk
- **Threshold**: Automatic chunking for recordings longer than 10 minutes
- **File Organization**: Chunks stored in organized directories per meeting

### Implementation Status
- ✅ **Backend Infrastructure**: Complete chunked recording system
- ✅ **Database Schema**: Updated to support chunk arrays
- ✅ **IPC Handlers**: All chunk management endpoints implemented
- ✅ **Background Saving**: Automatic chunk saving during recording
- 🔄 **Frontend Integration**: UI integration in progress
- 📋 **Future**: Chunk-based playback controls, progress indicators

This addresses the core issue of large recording limitations and provides a foundation for enterprise-scale recording capabilities.

### Fixed

## [Unreleased] - 2025-01-05

### Fixed - Bluetooth Recording Audio Issues
- **Core Audio Error 2003332927**: Fixed the "who?" error in multi-output device creation by implementing proper HAL API usage with plugin detection and fallback mechanisms
- **Swift Recorder Process Hanging**: Added comprehensive process monitoring with hang detection, timeout management, and force termination for unresponsive processes
- **Recording Start Timeouts**: Implemented immediate response for combined recording to prevent Electron app timeouts, with microphone recording starting first
- **Process Accumulation**: Added automatic cleanup of hanging Swift recorder processes to prevent resource consumption
- **Built-in Device Detection**: Fixed device detection to properly identify speakers vs microphones for Bluetooth workaround
- **Bluetooth Workaround Timing**: Improved system stabilization timing and workaround triggering logic

### Added - Audio Device Optimization
- **Detailed Audio Device Logging**: Added comprehensive audio device information logging including sample rates, channel counts, and transport types
- **Sample Rate Detection**: Added `getDeviceSampleRate()` function to detect optimal sample rates for audio devices
- **Channel Count Detection**: Added `getDeviceChannelCount()` function to detect channel configuration for input/output optimization
- **Device Information API**: Added `getDeviceAudioInfo()` function for comprehensive device analysis
- **Enhanced Error Reporting**: Added ASCII error code translation and detailed error context for Core Audio failures

### Improved - Process Management
- **Hang Detection**: Added periodic monitoring to detect when Swift recorder output stops flowing during initialization
- **Force Termination**: Implemented SIGKILL for unresponsive processes after timeout periods
- **Process Tracking**: Enhanced process lifecycle management with PID tracking and status monitoring
- **Error Context**: Added detailed error causes and solutions for troubleshooting recording failures

### Technical Details
- Fixed Core Audio aggregate device creation using proper `kAudioPlugInCreateAggregateDevice` API
- Implemented HAL plugin detection with fallback to system object for device creation
- Added comprehensive error handling for Core Audio error codes including the notorious 2003332927 ("who?")
- Enhanced Swift recorder with immediate JSON response for combined recording to prevent app timeouts
- Added process cleanup function that runs at startup to eliminate hanging recorder processes
- Improved Bluetooth device detection using transport type instead of name-based detection
- Added detailed audio device information logging for debugging Bluetooth compatibility issues

## [Unreleased] - 2024-12-31

### Fixed
- **Shortcut Change Buttons**: Implemented functional keyboard shortcut change system in settings screen
  - Added real-time key capture interface for shortcut editing
  - Added shortcut validation and conflict detection
  - Created system IPC handlers for shortcut management
  - Improved error handling for shortcut registration failures

- **Menu Bar Functionality**: Implemented system tray menu bar feature
  - Added tray icon with context menu (Show Friday, Start Recording, Settings, Quit)
  - Created toggle functionality for menu bar setting
  - Added navigation handler for tray menu interactions
  - Fixed menu bar setting integration with main process

### Added
- System APIs for shortcuts and menu bar management
- Shortcut editing UI with visual feedback
- Tray icon double-click to show window
- Global shortcuts now properly update when changed
- Navigation from tray menu to settings screen

### Technical
- Updated preload script with new system APIs
- Enhanced type definitions for system functionality
- Improved IPC communication between renderer and main process
- Added proper cleanup for global shortcuts on app shutdown
