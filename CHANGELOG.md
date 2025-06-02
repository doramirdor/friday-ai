# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Transcription Service Duplication Issues**
  - Fixed multiple transcription services starting simultaneously
  - Eliminated duplicate transcription results being received
  - Resolved service startup conflicts and timeouts
  - Improved process lock management for single service instance

### Added
- **Enhanced Transcription Service Management**
  - Added `isTranscriptionStarting` flag to prevent concurrent service starts in main process
  - Implemented process lock mechanism in Python transcription service to prevent multiple instances
  - Added proper cleanup for lock files on service shutdown with `atexit` handlers
  - Enhanced error handling and logging throughout transcription pipeline

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
