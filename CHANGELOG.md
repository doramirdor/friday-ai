# Changelog

All notable changes to the Friday project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive UI mockups for Friday desktop recording app
- High-fidelity HTML/CSS/JS prototypes for all core screens:
  - **Main Library Page**: Recordings overview with table, empty state, delete modal
  - **Transcript Details**: Interactive waveform player, editable transcript, metadata sidebar
  - **Settings Screen**: Tabbed interface with General, Shortcuts, Transcription, and About sections
  - **Component Library**: Complete design system showcase with all UI components
- Full light/dark mode theming system using CSS custom properties
- Apple-inspired design aesthetic with modern, clean styling
- Green accent color palette (#28C76F primary, #5BD48D hover, #1D9F55 dark)
- Neutral gray palette (White, Gray-50 through Gray-900)
- Inter/SF Pro typography system with comfortable line-heights
- Comprehensive component library including:
  - Primary, secondary, and ghost buttons with ripple effects
  - Floating label inputs and textareas
  - Toggle switches for preferences
  - Tag system with add/delete functionality
  - Modal dialogs with smooth animations
  - Interactive waveform player with scrubbing
  - Editable transcript lines with time codes
  - Data tables with hover effects
- Interactive features and micro-animations:
  - 150ms ease-out transitions for premium feel
  - Row hover effects and smooth delete animations
  - Live transcript highlighting during playback
  - Auto-save indicators with spinning loader
  - Modal fade-in/out with scale effect
  - Button hover states with subtle transform
- Keyboard shortcuts support (⌘ L for recording)
- Toast notification system for user feedback
- Responsive design for mobile and tablet viewports
- Accessibility features:
  - WCAG AA contrast ratios
  - Keyboard navigation support
  - Focus rings in green tint
  - Screen reader friendly markup
- Comprehensive documentation with usage instructions
- Local development server setup for testing

### Technical Implementation

- Vanilla JavaScript (no framework dependencies)
- CSS Grid and Flexbox for modern layouts
- CSS custom properties for consistent theming
- Semantic HTML markup
- Progressive enhancement approach
- Lucide icons integration via CDN
- Browser support for modern Chrome, Firefox, Safari
- File structure organized by feature (styles, scripts, assets)

### Developer Experience

- Live mockup server for immediate testing
- Component showcase for design validation
- Design token documentation (colors, typography, spacing)
- Interactive prototypes for stakeholder demos
- Git version control with meaningful commit messages
- README with setup and usage instructions
