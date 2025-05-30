# Friday - UI Mockups

High-fidelity UI mockups for Friday, the macOS desktop recorder & AI transcript app.

## Overview

This directory contains comprehensive UI mockups built with HTML, CSS, and JavaScript that demonstrate:

- **Main Library Page** - Overview & quick actions for recordings
- **Transcript Details** - Review & enrich individual recordings  
- **Settings Screen** - Tabbed preferences interface
- **Component Library** - Complete design system showcase

## Features Demonstrated

### 🎨 Visual Design
- Modern, clean Apple-inspired aesthetic
- Consistent color palette with green accent family
- SF Pro/Inter typography with comfortable line-heights
- Generous whitespace and 24px padding
- Rounded corners (16px) and subtle shadows

### 🌈 Color System
- **Primary Green**: #28C76F
- **Hover/Light**: #5BD48D  
- **Dark/Active**: #1D9F55
- **Neutrals**: White, Gray-50 through Gray-900
- Full light/dark mode support

### 🧩 Components
- Primary/secondary/ghost buttons with ripple effects
- Floating label inputs and toggles
- Tag system with deletion
- Modal dialogs with smooth animations
- Interactive waveform player
- Editable transcript lines
- Settings with tabs

### ⚡ Interactions
- Row hover effects
- Live transcript highlighting during playback
- Smooth delete animations
- Modal fade-in/out (150ms ease-out)
- Keyboard shortcuts (⌘ L for recording)
- Auto-save indicators

### ♿ Accessibility
- WCAG AA contrast ratios
- Keyboard navigation support
- Focus rings in green tint
- Screen reader friendly markup

## File Structure

```
mockups/
├── index.html          # Main navigation and layout
├── styles/
│   ├── tokens.css      # Design tokens (colors, typography, spacing)
│   ├── components.css  # UI component styles
│   └── layout.css      # Page layouts and responsive design
└── scripts/
    ├── navigation.js   # Screen switching and utilities
    ├── library.js      # Main library page content
    ├── transcript.js   # Transcript details page
    ├── settings.js     # Settings tabs and preferences
    └── components.js   # Component library showcase
```

## How to View

1. **Open in Browser**: Simply open `index.html` in any modern web browser
2. **Local Server**: For best experience, serve via HTTP:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (if you have serve installed)
   npx serve .
   
   # Or any other local server
   ```
3. **Navigate**: Use the top navigation to switch between screens
4. **Theme Toggle**: Click the theme toggle to switch between light/dark modes

## Interactive Features

### Library Screen
- ✅ Start Recording button (shows toast notification)
- ✅ Table row hover effects
- ✅ Play/delete actions on recordings
- ✅ Delete confirmation modal with animation
- ✅ Empty state for new users
- ✅ Global keyboard shortcut (⌘ L)

### Transcript Details
- ✅ Interactive waveform player with scrubbing
- ✅ Play/pause controls
- ✅ Live transcript line highlighting
- ✅ Click transcript lines to jump to time
- ✅ Editable transcript text with auto-save
- ✅ Tag management (add/remove)
- ✅ Action items with checkboxes
- ✅ Floating label inputs

### Settings
- ✅ Tabbed interface (General, Shortcuts, Transcription, About)
- ✅ Toggle switches for preferences
- ✅ File browser simulation
- ✅ Keyboard shortcut display
- ✅ API key input handling

### Component Library
- ✅ All component variants displayed
- ✅ Interactive demos (buttons, modals, waveform)
- ✅ Color palette with values
- ✅ Typography scale demonstration
- ✅ Spacing tokens visualization

## Design Decisions

### Typography
- **Primary**: Inter (with SF Pro fallback)
- **Monospace**: SF Mono for timestamps
- **Scale**: 11px (XS) to 30px (3XL)
- **Line Height**: 1.5 for comfortable reading

### Spacing
- **Scale**: 4px, 8px, 12px, 16px, 24px, 32px, 48px
- **Primary**: 24px padding for generous whitespace
- **Consistent**: 16px gaps between major elements

### Animation
- **Duration**: 150ms for fast interactions
- **Easing**: ease-out for natural feel
- **Hover**: Subtle transform and shadow
- **Modals**: Scale + fade for premium feel

### Responsive Design
- **Breakpoints**: 1024px, 768px, 480px
- **Mobile**: Stacked layout for transcript
- **Touch**: Larger tap targets on smaller screens

## Browser Support

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ⚠️ CSS custom properties required (IE11+ only)

## Development Notes

- Uses Lucide icons via CDN
- CSS custom properties for theming
- Vanilla JavaScript (no frameworks)
- Semantic HTML markup
- Progressive enhancement approach

---

**Note**: These are high-fidelity prototypes for design validation. For production implementation, consider framework integration and performance optimization. 