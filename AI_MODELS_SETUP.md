# AI Models Setup for Friday

Friday now supports both cloud-based and local AI models for enhanced privacy and performance options.

## AI Provider Options

### 1. Gemini (Cloud) - Default
- **Pro**: Fast, high-quality responses
- **Con**: Requires internet connection and API key
- **Best for**: Users who prioritize quality and don't mind cloud processing

### 2. Ollama (Local)
- **Pro**: Complete privacy, no internet required after setup, no API costs
- **Con**: Requires local setup and more system resources
- **Best for**: Privacy-conscious users or those with unreliable internet

## Quick Setup

### Option 1: Use Automatic Installer (Recommended)
```bash
./install_ollama.sh
```

### Option 2: Manual Setup

#### Install Ollama
```bash
# Download and install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama
ollama serve
```

#### Download AI Models
```bash
# Recommended model (best balance)
ollama pull mistral:7b

# Fast model (good for older hardware)
ollama pull qwen2.5:1.5b

# Fastest model (minimal resources)
ollama pull qwen2.5:0.5b

# Efficient model
ollama pull gemma2:2b
```

## Available Models

| Model | Size | Speed | Quality | Memory Usage | Best For |
|-------|------|-------|---------|--------------|----------|
| **Mistral 7B** | ~4GB | Medium | High | 8GB+ RAM | Recommended default |
| **Qwen2.5 1.5B** | ~1GB | Fast | Good | 4GB+ RAM | Good balance |
| **Qwen2.5 0.5B** | ~0.5GB | Very Fast | Fair | 2GB+ RAM | Older hardware |
| **Gemma2 2B** | ~1.5GB | Fast | Good | 4GB+ RAM | Google's efficient model |

## Configuration in Friday

1. **Open Friday Settings**
2. **Go to Transcription Tab**
3. **Select AI Provider**:
   - Choose "Gemini (Cloud)" for cloud-based processing
   - Choose "Ollama (Local)" for local processing
4. **Configure Selected Provider**:
   - **Gemini**: Enter your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **Ollama**: Select your preferred model and confirm the API URL (default: http://localhost:11434)

## System Requirements for Ollama

### Minimum Requirements
- **RAM**: 4GB (8GB+ recommended for Mistral 7B)
- **Storage**: 5GB+ free space for models
- **CPU**: Modern multi-core processor

### Recommended Requirements
- **RAM**: 16GB+
- **Storage**: 10GB+ free space
- **CPU**: Apple Silicon Mac or Intel i5/i7

## Troubleshooting

### Ollama Not Starting
```bash
# Check if Ollama is installed
ollama --version

# Start Ollama manually
ollama serve

# Check if service is running
curl http://localhost:11434/api/tags
```

### Model Download Issues
```bash
# Check available models
ollama list

# Re-download a model
ollama pull mistral:7b

# Check model status
ollama show mistral:7b
```

### Friday Can't Connect to Ollama
1. Ensure Ollama is running: `ollama serve`
2. Check the API URL in Friday settings (should be `http://localhost:11434`)
3. Verify the selected model exists: `ollama list`

### Performance Issues
- **Slow responses**: Try a smaller model (qwen2.5:0.5b)
- **Out of memory**: Close other applications or use a smaller model
- **High CPU usage**: This is normal during AI processing

## Privacy Benefits of Local Models

When using Ollama (local models):
- ✅ **Complete Privacy**: Your data never leaves your device
- ✅ **No Internet Required**: Works offline after initial setup
- ✅ **No API Costs**: Free to use after installation
- ✅ **Consistent Performance**: Not affected by internet speed
- ✅ **No Rate Limits**: Process as much as you want

## Performance Comparison

| Feature | Gemini (Cloud) | Ollama (Local) |
|---------|----------------|----------------|
| **Response Quality** | Excellent | Very Good |
| **Speed** | Fast (with internet) | Varies by model |
| **Privacy** | Data sent to Google | Complete privacy |
| **Internet Required** | Yes | No (after setup) |
| **Cost** | API fees apply | Free after setup |
| **Setup Complexity** | Easy (just API key) | Moderate |

## Tips for Best Experience

### For Gemini Users
- Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Monitor your API usage to avoid unexpected charges
- Ensure stable internet connection for best performance

### For Ollama Users
- Start with Mistral 7B for best quality
- Keep Ollama running in the background for faster responses
- Consider setting up Ollama as a system service for automatic startup
- Regularly update models: `ollama pull mistral:7b`

## Switching Between Providers

You can easily switch between Gemini and Ollama at any time:
1. Go to Friday Settings > Transcription
2. Change the AI Provider dropdown
3. Configure the new provider's settings
4. Test the connection

Your existing meetings and transcripts will work with both providers.

## Support

If you encounter issues:
1. Check this documentation
2. Verify your system meets the requirements
3. Try the troubleshooting steps above
4. Check the Friday logs for error messages

For more help, visit the Friday support documentation or contact support. 