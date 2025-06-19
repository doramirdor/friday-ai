#!/bin/bash

# Install Ollama for Friday - Local AI Support
# This script installs Ollama and downloads the recommended models

set -e

echo "🦙 Installing Ollama for Friday..."

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is currently for macOS only"
    echo "Please visit https://ollama.ai to install manually"
    exit 1
fi

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    echo "✅ Ollama is already installed"
else
    echo "📥 Downloading and installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
fi

# Start Ollama service
echo "🚀 Starting Ollama service..."
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
sleep 5

# Function to check if Ollama is responding
check_ollama() {
    curl -s http://localhost:11434/api/tags > /dev/null 2>&1
}

# Wait up to 30 seconds for Ollama to be ready
for i in {1..30}; do
    if check_ollama; then
        echo "✅ Ollama is ready!"
        break
    fi
    echo "⏳ Waiting... ($i/30)"
    sleep 1
done

if ! check_ollama; then
    echo "❌ Ollama failed to start properly"
    exit 1
fi

# Download recommended models for Friday
echo "📥 Downloading AI models for Friday..."

models=("mistral:7b" "qwen2.5:1.5b" "qwen2.5:0.5b" "gemma2:2b")

for model in "${models[@]}"; do
    echo "📥 Downloading $model..."
    if ollama pull "$model"; then
        echo "✅ $model downloaded successfully"
    else
        echo "⚠️  Failed to download $model (continuing with others)"
    fi
done

# List available models
echo "📋 Available models:"
ollama list

echo ""
echo "🎉 Ollama setup complete!"
echo ""
echo "Available models for Friday:"
echo "• mistral:7b - Best overall performance (recommended)"
echo "• qwen2.5:1.5b - Good balance of speed and quality"
echo "• qwen2.5:0.5b - Fastest, lowest resource usage"
echo "• gemma2:2b - Efficient and capable"
echo ""
echo "You can now:"
echo "1. Open Friday settings"
echo "2. Go to Transcription tab"
echo "3. Change AI Provider to 'Ollama (Local)'"
echo "4. Select your preferred model"
echo ""
echo "Note: Ollama will continue running in the background."
echo "To stop it, run: killall ollama" 