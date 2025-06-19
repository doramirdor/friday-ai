# Friday Deployment Guide

This guide covers the complete deployment process for Friday, including bundled Python and automatic Ollama installation for end users.

## 📦 Build Process Overview

Friday is now configured to automatically:
- Bundle Python runtime with all dependencies
- Include Ollama auto-installer
- Provide first-run setup experience
- Work without requiring users to install Python or Ollama manually

## 🔧 Pre-Build Requirements

### Development Machine Setup
```bash
# Required tools
brew install python3 node npm
pip3 install pyinstaller requests

# Verify installations
python3 --version  # Should be 3.8+
node --version     # Should be 16+
npm --version      # Should be 8+
```

### Project Dependencies
```bash
# Install all dependencies
npm install

# Install Electron dependencies
npm run postinstall
```

## 🏗️ Build Process

### 1. Development Build
```bash
# Clean previous builds
npm run clean

# Development build (for testing)
npm run dev
```

### 2. Production Build
```bash
# Full production build with Python bundling
npm run build

# This automatically:
# - Builds the C++ audio recorder
# - Bundles Python with PyInstaller
# - Compiles TypeScript/React
# - Packages everything for Electron
```

### 3. Distribution Builds

#### macOS
```bash
# Build for macOS
npm run dist:mac

# Output: dist/friday-[version].dmg
```

#### Windows
```bash
# Build for Windows (on Windows machine or with Wine)
npm run dist:win

# Output: dist/friday-[version]-setup.exe
```

#### Linux
```bash
# Build for Linux
npm run dist:linux

# Output: 
# - dist/friday-[version].AppImage
# - dist/friday-[version].deb
```

## 📁 Build Artifacts

### What Gets Included
```
friday-app/
├── app/                        # Main Electron app
├── resources/
│   ├── friday_ollama          # Bundled Python executable
│   ├── fridayLogo.png         # App icons
│   └── tray-icon.png
└── node_modules/              # Node.js dependencies
```

### Python Bundle Contents
The `friday_ollama` executable includes:
- Complete Python 3.8+ runtime
- All required dependencies (requests, urllib3, etc.)
- Ollama installation and management logic
- AI model downloading capabilities

## 🚀 First-Run Experience

### User Installation Flow
1. **App Installation**: User installs Friday from DMG/installer
2. **First Launch**: App detects first run
3. **Setup Dialog**: User chooses between:
   - "Setup Local AI" (downloads Ollama + models)
   - "Use Cloud AI Only" (Gemini only)
   - "Cancel" (exit app)
4. **Automatic Setup**: If local AI chosen:
   - Downloads and installs Ollama
   - Downloads AI models (mistral:7b, qwen2.5:1.5b)
   - Configures everything automatically
5. **Ready to Use**: App launches normally

### What Users Don't Need
- ✅ No Python installation required
- ✅ No Ollama manual installation
- ✅ No model downloading
- ✅ No configuration needed
- ✅ Works offline after setup

## 🔧 Configuration Files

### Electron Builder Config (`electron-builder.yml`)
```yaml
extraResources:
  - from: "resources/"
    to: "resources/"
    filter: ["**/*"]
    
files:
  - '!build/**'        # Exclude build artifacts
  - '!scripts/**'      # Exclude build scripts
  - '!venv/**'         # Exclude Python venv
  - '!*.py'            # Exclude Python source
```

### Package.json Scripts
```json
{
  "build:python": "chmod +x scripts/bundle_python.sh && scripts/bundle_python.sh",
  "dist:mac": "npm run build && electron-builder --mac",
  "dist:win": "npm run build && electron-builder --win",
  "dist:linux": "npm run build && electron-builder --linux"
}
```

## 🛠️ Troubleshooting Build Issues

### Python Bundling Fails
```bash
# Check Python installation
python3 --version
pip3 install pyinstaller

# Clean and rebuild
npm run clean:python
npm run build:python
```

### Missing Dependencies
```bash
# Reinstall all dependencies
npm run clean:all
npm install
```

### Build Permissions
```bash
# Fix script permissions
chmod +x scripts/bundle_python.sh
chmod +x resources/friday_ollama
```

### Large Bundle Size
The final app will be larger due to:
- Python runtime (~50MB)
- Electron framework (~100MB)
- Node modules (~50MB)
- **Total: ~200MB** (before AI models)

AI models add ~2GB but are downloaded separately during setup.

## 📋 Pre-Release Checklist

### Testing
- [ ] Clean build from scratch works
- [ ] First-run setup dialog appears
- [ ] Local AI setup downloads and works
- [ ] Cloud AI fallback works
- [ ] App works without internet (after setup)
- [ ] Bundled Python executable works
- [ ] All features function correctly

### Validation
- [ ] App signing/notarization (macOS)
- [ ] Windows code signing
- [ ] No hardcoded paths or development artifacts
- [ ] Error handling for setup failures
- [ ] User can skip local AI setup
- [ ] App gracefully handles missing dependencies

### Distribution
- [ ] DMG/installer packages properly
- [ ] Auto-updater configuration
- [ ] Release notes prepared
- [ ] Documentation updated

## 🔒 Security Considerations

### Code Signing
```bash
# macOS
export CSC_NAME="Your Developer ID"
npm run dist:mac

# Windows
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"
npm run dist:win
```

### Permissions
The app requests:
- Microphone access (for recording)
- File system access (for saving recordings)
- Network access (for cloud AI and Ollama downloads)

## 📈 Size Optimization

### Reducing Bundle Size
1. **Exclude unused modules**:
   ```json
   "files": [
     "!node_modules/unused-package/**"
   ]
   ```

2. **Optimize Python bundle**:
   - Only include required packages
   - Use `--exclude-module` in PyInstaller

3. **Compress resources**:
   - Optimize images
   - Minify CSS/JS

### Expected Sizes
- **Base app**: ~200MB
- **With Ollama**: +~50MB (installer only)
- **With AI models**: +~2GB (user's choice)

## 🎯 Deployment Targets

### Minimum System Requirements
- **macOS**: 10.14+ (Mojave)
- **Windows**: Windows 10 1809+
- **Linux**: Ubuntu 18.04+ or equivalent
- **RAM**: 4GB (8GB recommended with local AI)
- **Storage**: 4GB free space (6GB with local AI models)

### Distribution Channels
- Direct download (GitHub Releases)
- Mac App Store (requires additional configuration)
- Windows Store (requires UWP packaging)
- Linux package managers (Snap, Flatpak)

## 📚 Additional Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [PyInstaller Documentation](https://pyinstaller.org/)
- [Ollama Documentation](https://ollama.ai/docs)
- [Friday AI Models Setup](./AI_MODELS_SETUP.md)

---

**Ready for Production**: Friday is now fully configured for end-user deployment with zero external dependencies required from users! 