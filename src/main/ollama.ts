import { TranscriptLine, ActionItem } from './database'
import { spawn, ChildProcess } from 'child_process'

interface OllamaGenerationOptions {
  transcript: TranscriptLine[]
  globalContext: string
  meetingContext: string
  notes: string
  existingTitle: string
}

interface OllamaGenerationResult {
  success: boolean
  data?: {
    summary: string
    actionItems: ActionItem[]
    description: string
    tags: string[]
  }
  error?: string
}

interface OllamaMessageOptions {
  type: 'slack' | 'email'
  data: {
    globalContext: string
    meetingContext: string
    title?: string
    description?: string
    notes?: string
    summary?: string
    transcript?: string
    actionItems?: ActionItem[]
    questionHistory?: { question: string; answer: string }[]
    followupQuestions?: string[]
    followupRisks?: string[]
    followupComments?: string[]
  }
  model?: string
}

interface FollowupQuestionsOptions {
  transcript: TranscriptLine[]
  title?: string
  description?: string
  context?: string
  notes?: string
  summary?: string
}

interface FollowupQuestionsResult {
  success: boolean
  data?: {
    transcriptSummary: string
    predictedNextSentence: string
  }
  error?: string
}

interface AskQuestionOptions {
  question: string
  transcript: TranscriptLine[]
  title?: string
  description?: string
  context?: string
  notes?: string
  summary?: string
}

interface AskQuestionResult {
  success: boolean
  answer?: string
  error?: string
}

class OllamaService {
  private apiUrl = 'http://localhost:11434'
  private model = 'mistral:7b'
  private ollamaProcess: ChildProcess | null = null
  private isOllamaRunning = false

  setApiUrl(url: string): void {
    this.apiUrl = url
  }

  setModel(model: string): void {
    this.model = model
  }

  private async ensureOllamaRunning(): Promise<boolean> {
    if (this.isOllamaRunning) {
      return true
    }

    try {
      // Check if Ollama is already running
      const response = await fetch(`${this.apiUrl}/api/tags`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      
      if (response.ok) {
        this.isOllamaRunning = true
        return true
      }
    } catch (error) {
      console.log('Ollama not running, attempting to start...')
    }

    // Try to start Ollama
    return this.startOllama()
  }

  private async startOllama(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Try to start Ollama serve
        this.ollamaProcess = spawn('ollama', ['serve'], {
          stdio: 'pipe',
          detached: false
        })

        this.ollamaProcess.on('spawn', () => {
          console.log('🦙 Ollama process started')
          
          // Wait a bit for Ollama to initialize
          setTimeout(async () => {
            try {
              const response = await fetch(`${this.apiUrl}/api/tags`, { 
                method: 'GET',
                signal: AbortSignal.timeout(10000)
              })
              
              if (response.ok) {
                this.isOllamaRunning = true
                console.log('✅ Ollama is running and responding')
                resolve(true)
              } else {
                console.log('❌ Ollama started but not responding properly')
                resolve(false)
              }
            } catch (error) {
              console.log('❌ Failed to connect to Ollama after starting:', error)
              resolve(false)
            }
          }, 3000)
        })

        this.ollamaProcess.on('error', (error) => {
          console.error('❌ Failed to start Ollama:', error)
          resolve(false)
        })

        this.ollamaProcess.on('exit', (code) => {
          console.log(`🦙 Ollama process exited with code ${code}`)
          this.isOllamaRunning = false
          this.ollamaProcess = null
        })

      } catch (error) {
        console.error('❌ Error spawning Ollama process:', error)
        resolve(false)
      }
    })
  }

  private async ensureModelAvailable(): Promise<boolean> {
    try {
      // Check if the model is available
      const response = await fetch(`${this.apiUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.model }),
        signal: AbortSignal.timeout(10000)
      })

      if (response.ok) {
        return true
      }

      console.log(`📥 Model ${this.model} not found, attempting to pull...`)
      
      // Pull the model
      const pullResponse = await fetch(`${this.apiUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.model }),
        signal: AbortSignal.timeout(300000) // 5 minutes timeout for model download
      })

      return pullResponse.ok
    } catch (error) {
      console.error(`❌ Failed to ensure model ${this.model} is available:`, error)
      return false
    }
  }

  private async makeOllamaRequest(prompt: string): Promise<{ success: boolean; content?: string; error?: string }> {
    console.log(`🦙 Making Ollama request with model: ${this.model}`)
    
    const isRunning = await this.ensureOllamaRunning()
    if (!isRunning) {
      return { success: false, error: 'Failed to start Ollama service' }
    }

    const modelAvailable = await this.ensureModelAvailable()
    if (!modelAvailable) {
      return { success: false, error: `Model ${this.model} is not available and could not be downloaded` }
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_k: 40,
            top_p: 0.95,
            num_predict: 2048,
          }
        }),
        signal: AbortSignal.timeout(120000) // 2 minutes timeout
      })

      if (!response.ok) {
        const errorData = await response.text()
        return { success: false, error: `Ollama API error: ${response.status} - ${errorData}` }
      }

      const data = await response.json()
      
      if (data.response) {
        return { success: true, content: data.response }
      }
      
      return { success: false, error: 'No response generated by Ollama' }
    } catch (error) {
      return { success: false, error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateMeetingContent(options: OllamaGenerationOptions): Promise<OllamaGenerationResult> {
    try {
      // Prepare transcript text
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `You are an AI assistant helping to analyze a meeting recording. Please generate a comprehensive analysis based on the following information:

MEETING CONTEXT:
Title: ${options.existingTitle}
Global Context: ${options.globalContext}
Meeting-Specific Context: ${options.meetingContext}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes}

Please provide your response in the following JSON format (ensure it's valid JSON with escaped quotes):
{
  "summary": "A comprehensive summary of the meeting (3-4 sentences)",
  "description": "A detailed description covering key topics, decisions, and outcomes",
  "actionItems": [
    {
      "id": 1,
      "text": "Action item description",
      "completed": false
    }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Response:`

      const result = await this.makeOllamaRequest(prompt)
      
      if (!result.success) {
        return { success: false, error: result.error }
      }

      try {
        // Extract JSON from the response
        const content = result.content || ''
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        
        if (!jsonMatch) {
          throw new Error('No JSON found in response')
        }

        const parsedData = JSON.parse(jsonMatch[0])
        
        return {
          success: true,
          data: {
            summary: parsedData.summary || '',
            actionItems: parsedData.actionItems || [],
            description: parsedData.description || '',
            tags: parsedData.tags || []
          }
        }
      } catch (parseError) {
        console.error('Failed to parse Ollama response:', parseError)
        return { success: false, error: 'Failed to parse AI response as JSON' }
      }
    } catch (error) {
      return { success: false, error: `Error generating content: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateSummaryOnly(options: OllamaGenerationOptions): Promise<{ success: boolean; summary?: string; error?: string }> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `Please provide a concise summary of this meeting transcript:

CONTEXT: ${options.globalContext}
MEETING CONTEXT: ${options.meetingContext}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes}

Please provide a 2-3 sentence summary focusing on key decisions, outcomes, and next steps:`

      const result = await this.makeOllamaRequest(prompt)
      
      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        summary: result.content || ''
      }
    } catch (error) {
      return { success: false, error: `Error generating summary: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateMessage(options: OllamaMessageOptions): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const messageType = options.type === 'slack' ? 'Slack message' : 'professional email'
      
      const prompt = `Generate a ${messageType} based on the following meeting information:

Global Context: ${options.data.globalContext}
Meeting Context: ${options.data.meetingContext}
Title: ${options.data.title || 'Meeting'}
Description: ${options.data.description || ''}
Summary: ${options.data.summary || ''}
Notes: ${options.data.notes || ''}

${options.data.actionItems && options.data.actionItems.length > 0 ? 
  `Action Items:\n${options.data.actionItems.map(item => `- ${item.text}`).join('\n')}` : ''
}

Please write a ${messageType} that summarizes the key points and next steps. 
${options.type === 'slack' ? 'Keep it conversational and concise.' : 'Use professional email format with proper greeting and signature.'}

Message:`

      const result = await this.makeOllamaRequest(prompt)
      
      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        message: result.content || ''
      }
    } catch (error) {
      return { success: false, error: `Error generating message: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateFollowupQuestions(options: FollowupQuestionsOptions): Promise<FollowupQuestionsResult> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `Based on this meeting transcript, provide a summary and predict what might be discussed next:

Title: ${options.title || 'Meeting'}
Description: ${options.description || ''}
Context: ${options.context || ''}
Notes: ${options.notes || ''}

TRANSCRIPT:
${transcriptText}

Please provide:
1. A brief summary of what was discussed
2. A prediction of what might be discussed next

Format as JSON:
{
  "transcriptSummary": "Brief summary here",
  "predictedNextSentence": "Prediction of next discussion topic"
}

Response:`

      const result = await this.makeOllamaRequest(prompt)
      
      if (!result.success) {
        return { success: false, error: result.error }
      }

      try {
        const content = result.content || ''
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        
        if (!jsonMatch) {
          throw new Error('No JSON found in response')
        }

        const parsedData = JSON.parse(jsonMatch[0])
        
        return {
          success: true,
          data: {
            transcriptSummary: parsedData.transcriptSummary || '',
            predictedNextSentence: parsedData.predictedNextSentence || ''
          }
        }
      } catch (parseError) {
        return { success: false, error: 'Failed to parse AI response as JSON' }
      }
    } catch (error) {
      return { success: false, error: `Error generating followup questions: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async askQuestion(options: AskQuestionOptions): Promise<AskQuestionResult> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `You are an AI assistant with access to a meeting transcript. Please answer the user's question based on the information provided.

MEETING INFORMATION:
Title: ${options.title || 'Meeting'}
Description: ${options.description || ''}
Context: ${options.context || ''}
Notes: ${options.notes || ''}
Summary: ${options.summary || ''}

TRANSCRIPT:
${transcriptText}

USER QUESTION: ${options.question}

Please provide a helpful and accurate answer based on the meeting information. If the information isn't available in the transcript, please say so.

Answer:`

      const result = await this.makeOllamaRequest(prompt)
      
      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        answer: result.content || ''
      }
    } catch (error) {
      return { success: false, error: `Error answering question: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async cleanup(): Promise<void> {
    if (this.ollamaProcess && !this.ollamaProcess.killed) {
      console.log('🦙 Stopping Ollama process...')
      this.ollamaProcess.kill('SIGTERM')
      this.ollamaProcess = null
      this.isOllamaRunning = false
    }
  }
}

export const ollamaService = new OllamaService() 