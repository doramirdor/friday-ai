# Friday - Desktop Recorder & AI Transcript

A modern macOS desktop application for recording audio and generating AI-powered transcripts with action items and metadata.

## 🎯 Features

- **Audio Recording**: High-quality audio recording with global keyboard shortcuts
- **AI Transcription**: Real-time transcription powered by Gemini AI
- **Interactive Transcript**: Click-to-seek, editable text, live highlighting during playback
- **Action Items**: Automatically extract and manage action items
- **Tagging System**: Organize recordings with custom tags
- **Dark/Light Mode**: Automatic theme switching based on system preferences
- **Keyboard Shortcuts**: Global hotkeys for quick recording control

## 🏗️ Architecture

Built with modern web technologies in an Electron wrapper:

- **Frontend**: React 18 + TypeScript
- **Styling**: CSS Custom Properties with design tokens
- **Icons**: Lucide React
- **Build**: Electron Vite
- **Platform**: macOS (primary), with cross-platform potential

## 🎨 Design System

### Color Palette

- **Primary Green**: #28C76F
- **Hover/Light**: #5BD48D
- **Dark/Active**: #1D9F55
- **Neutrals**: White, Gray-50 through Gray-900

### Typography

- **Primary**: Inter (with SF Pro fallback)
- **Monospace**: SF Mono for timestamps
- **Scale**: 11px (XS) to 30px (3XL)

### Components

- Buttons with ripple effects
- Floating label inputs
- Toggle switches
- Tag management system
- Modal dialogs
- Interactive waveform player
- Editable transcript lines
- Tabbed settings interface

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- macOS (for development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd friday

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Build for macOS
npm run build:mac
```

## 📁 Project Structure

```
friday/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts
│   └── renderer/       # React frontend
│       ├── src/
│       │   ├── components/     # React components
│       │   │   ├── LibraryScreen.tsx
│       │   │   ├── TranscriptScreen.tsx
│       │   │   └── SettingsScreen.tsx
│       │   ├── assets/         # Styles and static assets
│       │   │   ├── tokens.css     # Design tokens
│       │   │   ├── components.css # UI components
│       │   │   ├── layout.css     # Layout utilities
│       │   │   └── main.css       # Main stylesheet
│       │   ├── App.tsx         # Main app component
│       │   └── main.tsx        # App entry point
│       └── index.html
├── mockups/            # Original HTML mockups (reference)
└── package.json
```

## 🖥️ Screens

### 1. Library Screen

- Recordings overview table
- Quick actions (play, delete)
- Empty state for new users
- Global search and filtering

### 2. Transcript Details

- Interactive waveform player
- Editable transcript with timestamps
- Metadata sidebar (title, description, tags)
- Action items management
- Auto-save functionality

### 3. Settings

- **General**: Theme, save location, startup options
- **Shortcuts**: Customizable keyboard shortcuts
- **Transcription**: AI settings, language, API configuration
- **About**: Version info, support links

## ⌨️ Keyboard Shortcuts

- `⌘ L` - Start/Stop Recording
- `⌘ Shift N` - Quick Note
- `⌘ Shift H` - Show/Hide Window
- `⌘ P` - Pause/Resume Recording
- `⌘ S` - Save Changes

## 🔧 Configuration

### Transcription Setup

1. Get a Gemini API key from Google AI Studio
2. Enter the API key in Settings > Transcription
3. Select your preferred language
4. Enable real-time transcription

### Recording Preferences

- Set default save location
- Configure audio quality
- Choose auto-save options
- Set up global shortcuts

## 🎭 Themes

Friday supports both light and dark modes:

- **Auto**: Follows system preference
- **Light**: Clean, bright interface
- **Dark**: Easy on the eyes for extended use

## 🚧 Development

### Tech Stack

- **Electron**: Cross-platform desktop app framework
- **React 18**: Component-based UI library
- **TypeScript**: Type-safe JavaScript
- **CSS Custom Properties**: Design token system
- **Lucide React**: Icon library

### Development Commands

```bash
# Start dev server with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Architecture Notes

- Main process handles OS integration and recording
- Renderer process manages UI and user interactions
- Preload scripts provide secure IPC communication
- CSS custom properties enable dynamic theming

## 📝 License

[Add your license here]

## 🤝 Contributing

[Add contribution guidelines here]

## 📞 Support

[Add support information here]

---

Made with ❤️ for productive conversations
