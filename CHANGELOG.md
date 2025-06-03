# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
