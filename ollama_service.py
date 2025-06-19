#!/usr/bin/env python3
"""
Ollama Service Backend for Friday
Provides a Python interface to Ollama models for AI features
"""

import requests
import json
import subprocess
import time
import socket
import logging
import argparse
from typing import Dict, List, Optional, Any
from threading import Thread
import signal
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OllamaServiceBackend:
    def __init__(self, api_url: str = "http://localhost:11434", default_model: str = "mistral:7b"):
        self.api_url = api_url
        self.default_model = default_model
        self.ollama_process = None
        self.is_running = False
        
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
    
    def generate_meeting_content(self, transcript: List[Dict], global_context: str, 
                               meeting_context: str, notes: str, title: str, 
                               model: Optional[str] = None) -> Dict[str, Any]:
        """Generate meeting content analysis"""
        transcript_text = "\n".join([f"[{line['time']}] {line['text']}" for line in transcript])
        
        prompt = f"""You are an AI assistant helping to analyze a meeting recording. Please generate a comprehensive analysis based on the following information:

MEETING CONTEXT:
Title: {title}
Global Context: {global_context}
Meeting-Specific Context: {meeting_context}

TRANSCRIPT:
{transcript_text}

NOTES:
{notes}

Please provide your response in the following JSON format (ensure it's valid JSON with escaped quotes):
{{
  "summary": "A comprehensive summary of the meeting (3-4 sentences)",
  "description": "A detailed description covering key topics, decisions, and outcomes",
  "actionItems": [
    {{
      "id": 1,
      "text": "Action item description",
      "completed": false
    }}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}}

Response:"""
        
        result = self.generate_response(prompt, model)
        if not result["success"]:
            return result
            
        try:
            # Extract JSON from response
            content = result["response"]
            json_start = content.find("{")
            json_end = content.rfind("}")
            
            if json_start != -1 and json_end != -1:
                json_str = content[json_start:json_end+1]
                parsed_data = json.loads(json_str)
                
                return {
                    "success": True,
                    "data": {
                        "summary": parsed_data.get("summary", ""),
                        "description": parsed_data.get("description", ""),
                        "actionItems": parsed_data.get("actionItems", []),
                        "tags": parsed_data.get("tags", [])
                    }
                }
            else:
                return {"success": False, "error": "No JSON found in response"}
                
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Failed to parse JSON response: {str(e)}"}
    
    def generate_summary(self, transcript: List[Dict], global_context: str, 
                        meeting_context: str, notes: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Generate meeting summary only"""
        transcript_text = "\n".join([f"[{line['time']}] {line['text']}" for line in transcript])
        
        prompt = f"""Please provide a concise summary of this meeting transcript:

CONTEXT: {global_context}
MEETING CONTEXT: {meeting_context}

TRANSCRIPT:
{transcript_text}

NOTES:
{notes}

Please provide a 2-3 sentence summary focusing on key decisions, outcomes, and next steps:"""
        
        result = self.generate_response(prompt, model)
        if result["success"]:
            return {"success": True, "summary": result["response"]}
        return result
    
    def ask_question(self, question: str, transcript: List[Dict], context: Dict[str, str], 
                    model: Optional[str] = None) -> Dict[str, Any]:
        """Answer a question about the meeting"""
        transcript_text = "\n".join([f"[{line['time']}] {line['text']}" for line in transcript])
        
        prompt = f"""You are an AI assistant with access to a meeting transcript. Please answer the user's question based on the information provided.

MEETING INFORMATION:
Title: {context.get('title', 'Meeting')}
Description: {context.get('description', '')}
Context: {context.get('context', '')}
Notes: {context.get('notes', '')}
Summary: {context.get('summary', '')}

TRANSCRIPT:
{transcript_text}

USER QUESTION: {question}

Please provide a helpful and accurate answer based on the meeting information. If the information isn't available in the transcript, please say so.

Answer:"""
        
        result = self.generate_response(prompt, model)
        if result["success"]:
            return {"success": True, "answer": result["response"]}
        return result
    
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

def signal_handler(sig, frame):
    """Handle shutdown signals"""
    logger.info("Received shutdown signal, cleaning up...")
    if hasattr(signal_handler, 'service'):
        signal_handler.service.cleanup()
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Ollama Service Backend for Friday")
    parser.add_argument("--api-url", default="http://localhost:11434", help="Ollama API URL")
    parser.add_argument("--model", default="mistral:7b", help="Default model to use")
    parser.add_argument("--port", type=int, default=9002, help="Port to run service on")
    
    args = parser.parse_args()
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create service
    service = OllamaServiceBackend(args.api_url, args.model)
    signal_handler.service = service
    
    # Start Ollama
    if not service.start_ollama():
        logger.error("Failed to start Ollama service")
        sys.exit(1)
    
    logger.info(f"Ollama service backend started on port {args.port}")
    logger.info(f"Using model: {args.model}")
    
    # Keep the service running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        service.cleanup()

if __name__ == "__main__":
    main() 