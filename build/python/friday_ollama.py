#!/usr/bin/env python3
"""
Friday Ollama Service - Standalone Python Distribution
This is a self-contained Python script for Ollama integration
"""

import sys
import os
import subprocess
import requests
import json
import time
import signal
import argparse
from typing import Dict, List, Optional, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add the bundle directory to Python path
bundle_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, bundle_dir)

class FridayOllamaService:
    def __init__(self, api_url: str = "http://localhost:11434", default_model: str = "mistral:7b"):
        self.api_url = api_url
        self.default_model = default_model
        self.ollama_process = None
        self.is_running = False
        
    def check_ollama_installed(self) -> bool:
        """Check if Ollama is installed on the system"""
        try:
            result = subprocess.run(['which', 'ollama'], capture_output=True, text=True)
            return result.returncode == 0
        except Exception:
            return False
    
    def install_ollama(self) -> bool:
        """Install Ollama using the official installer"""
        try:
            logger.info("Installing Ollama...")
            # Download and run the Ollama installer
            result = subprocess.run([
                'curl', '-fsSL', 'https://ollama.ai/install.sh'
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"Failed to download Ollama installer: {result.stderr}")
                return False
                
            # Run the installer
            install_result = subprocess.run(['sh'], input=result.stdout, text=True)
            return install_result.returncode == 0
            
        except Exception as e:
            logger.error(f"Error installing Ollama: {e}")
            return False
    
    def start_ollama(self) -> bool:
        """Start Ollama service if not already running"""
        try:
            # Check if Ollama is already running
            response = requests.get(f"{self.api_url}/api/tags", timeout=5)
            if response.status_code == 200:
                logger.info("Ollama is already running")
                self.is_running = True
                return True
        except requests.RequestException:
            logger.info("Ollama not running, attempting to start...")
            
        try:
            # Start Ollama serve
            self.ollama_process = subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Wait for Ollama to start
            for _ in range(30):  # Wait up to 30 seconds
                try:
                    response = requests.get(f"{self.api_url}/api/tags", timeout=2)
                    if response.status_code == 200:
                        logger.info("Ollama started successfully")
                        self.is_running = True
                        return True
                except requests.RequestException:
                    time.sleep(1)
                    
            logger.error("Failed to start Ollama service")
            return False
            
        except Exception as e:
            logger.error(f"Error starting Ollama: {e}")
            return False
    
    def ensure_model_available(self, model: str) -> bool:
        """Ensure the specified model is available, download if necessary"""
        try:
            # Check if model exists
            response = requests.post(
                f"{self.api_url}/api/show",
                json={"name": model},
                timeout=10
            )
            
            if response.status_code == 200:
                return True
                
            logger.info(f"Model {model} not found, downloading...")
            
            # Pull the model
            response = requests.post(
                f"{self.api_url}/api/pull",
                json={"name": model},
                timeout=300  # 5 minutes for download
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Error ensuring model {model} is available: {e}")
            return False
    
    def generate_response(self, prompt: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Generate a response using Ollama"""
        if not self.is_running:
            if not self.start_ollama():
                return {"success": False, "error": "Failed to start Ollama service"}
        
        model = model or self.default_model
        
        if not self.ensure_model_available(model):
            return {"success": False, "error": f"Model {model} is not available"}
        
        try:
            response = requests.post(
                f"{self.api_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_k": 40,
                        "top_p": 0.95,
                        "num_predict": 2048,
                    }
                },
                timeout=120
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "response": data.get("response", ""),
                    "model": model
                }
            else:
                return {
                    "success": False,
                    "error": f"Ollama API error: {response.status_code} - {response.text}"
                }
                
        except Exception as e:
            return {"success": False, "error": f"Request error: {str(e)}"}
    
    def cleanup(self):
        """Clean up the Ollama process"""
        if self.ollama_process and self.ollama_process.poll() is None:
            logger.info("Stopping Ollama process...")
            self.ollama_process.terminate()
            try:
                self.ollama_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.ollama_process.kill()
            self.ollama_process = None
        self.is_running = False

def setup_ollama_for_friday():
    """Setup Ollama for Friday on first run"""
    service = FridayOllamaService()
    
    # Check if Ollama is installed
    if not service.check_ollama_installed():
        print("🦙 Ollama not found. Installing...")
        if not service.install_ollama():
            print("❌ Failed to install Ollama")
            return False
        print("✅ Ollama installed successfully")
    
    # Start Ollama
    if not service.start_ollama():
        print("❌ Failed to start Ollama")
        return False
    
    # Download recommended models
    models = ["mistral:7b", "qwen2.5:1.5b"]  # Start with essential models
    
    for model in models:
        print(f"📥 Downloading {model}...")
        if service.ensure_model_available(model):
            print(f"✅ {model} ready")
        else:
            print(f"⚠️ Failed to download {model}")
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Friday Ollama Service")
    parser.add_argument("--setup", action="store_true", help="Setup Ollama for Friday")
    parser.add_argument("--test", action="store_true", help="Test Ollama installation")
    
    args = parser.parse_args()
    
    if args.setup:
        success = setup_ollama_for_friday()
        sys.exit(0 if success else 1)
    
    if args.test:
        service = FridayOllamaService()
        if service.check_ollama_installed():
            print("✅ Ollama is installed")
            if service.start_ollama():
                print("✅ Ollama is running")
                sys.exit(0)
            else:
                print("❌ Ollama failed to start")
                sys.exit(1)
        else:
            print("❌ Ollama is not installed")
            sys.exit(1)
    
    # Default: keep service running
    service = FridayOllamaService()
    
    def signal_handler(sig, frame):
        print("Shutting down...")
        service.cleanup()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        service.cleanup()

if __name__ == "__main__":
    main()
