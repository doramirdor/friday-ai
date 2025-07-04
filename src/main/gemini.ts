import { TranscriptLine, ActionItem } from './database'

interface GeminiGenerationOptions {
  transcript: TranscriptLine[]
  globalContext: string
  meetingContext: string
  notes: string
  existingTitle: string
}

interface GeminiGenerationResult {
  success: boolean
  data?: {
    summary: string
    actionItems: ActionItem[]
    description: string
    tags: string[]
  }
  error?: string
}

interface GeminiMessageOptions {
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

class GeminiService {
  private apiKey: string | null = null
  private defaultModel: string = 'gemini-2.5-flash-lite-preview-06-17'

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || null
  }

  setDefaultModel(model: string): void {
    this.defaultModel = model
  }

  private async makeGeminiRequest(prompt: string, model?: string): Promise<{ success: boolean; content?: string; error?: string }> {
    const selectedModel = model || this.defaultModel
    console.log('🔑 Gemini API Key check:', { hasKey: !!this.apiKey, keyLength: this.apiKey?.length || 0 })
    
    if (!this.apiKey) {
      console.error('❌ Gemini API key not configured')
      return { success: false, error: 'Gemini API key not configured' }
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH", 
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_ONLY_HIGH"
            }
          ]
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        return { success: false, error: `Gemini API error: ${response.status} - ${errorData}` }
      }

      const data = await response.json()
      
      // Check if the prompt was blocked
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        return { success: false, error: `Content blocked by safety filters: ${data.promptFeedback.blockReason}` }
      }

      if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
        const candidate = data.candidates[0]
        
        // Check if the response was blocked by safety filters
        if (candidate.finishReason === 'SAFETY') {
          return { success: false, error: 'Response blocked by safety filters' }
        }
        
        if (candidate && candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts) && candidate.content.parts.length > 0) {
          const content = candidate.content.parts[0].text
          return { success: true, content }
        }
      }
      
      // Log the response structure for debugging
      console.error('Unexpected Gemini API response structure:', JSON.stringify(data, null, 2))
      console.error('Response keys:', Object.keys(data))
      if (data.candidates) {
        console.error('Candidates length:', data.candidates.length)
        if (data.candidates.length > 0) {
          console.error('First candidate:', JSON.stringify(data.candidates[0], null, 2))
        }
      }
      return { success: false, error: 'No content generated by Gemini - unexpected response structure' }
    } catch (error) {
      return { success: false, error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateMeetingContent(options: GeminiGenerationOptions): Promise<GeminiGenerationResult> {
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

DEBUG INFO:
- Global Context Length: ${options.globalContext?.length || 0} characters
- Meeting Context Length: ${options.meetingContext?.length || 0} characters
- Transcript Lines: ${options.transcript?.length || 0}
- Notes Length: ${options.notes?.length || 0} characters

Please provide your response in the following JSON format (ensure it's valid JSON with escaped quotes):
{
  "summary": "A concise 2-3 sentence summary of the meeting's main points and outcomes",
  "description": "A more detailed description of what was discussed and accomplished (2-3 paragraphs)",
  "actionItems": [
    {
      "id": 1,
      "text": "Action item description",
      "completed": false
    }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Guidelines:
- Summary: Keep it concise but capture the essence of the meeting
- Description: Provide context about the meeting type, participants, and key discussions
- Action Items: Extract clear, actionable tasks mentioned or implied in the discussion
- Tags: Generate 3-5 relevant tags for categorization (lowercase, single words or short phrases)
- Ensure the JSON is properly formatted and escaped`

      const result = await this.makeGeminiRequest(prompt)
      
      if (!result.success || !result.content) {
        return { success: false, error: result.error || 'Failed to generate content' }
      }

      try {
        // Try to extract JSON from the response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return { success: false, error: 'No valid JSON found in Gemini response' }
        }

        const parsedData = JSON.parse(jsonMatch[0])
        
        // Validate the structure
        if (!parsedData.summary || !parsedData.description || !parsedData.actionItems || !parsedData.tags) {
          return { success: false, error: 'Invalid response structure from Gemini' }
        }

        // Ensure action items have proper IDs
        const actionItems: ActionItem[] = parsedData.actionItems.map((item: any, index: number) => ({
          id: item.id || Date.now() + index,
          text: item.text || '',
          completed: item.completed || false
        }))

        return {
          success: true,
          data: {
            summary: parsedData.summary,
            description: parsedData.description,
            actionItems,
            tags: Array.isArray(parsedData.tags) ? parsedData.tags : []
          }
        }
      } catch (parseError) {
        return { success: false, error: `Failed to parse Gemini response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` }
      }
    } catch (error) {
      return { success: false, error: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateSummaryOnly(options: GeminiGenerationOptions): Promise<{ success: boolean; summary?: string; error?: string }> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `Please provide a comprehensive, well-structured summary of this meeting using proper HTML formatting:

CONTEXT: ${options.globalContext}
MEETING CONTEXT: ${options.meetingContext}
TRANSCRIPT:
${transcriptText}
NOTES:
${options.notes}

Please create a detailed summary that includes:
- **Key Discussion Points**: Main topics and important discussions
- **Decisions Made**: Any decisions or conclusions reached
- **Action Items**: Tasks or next steps identified
- **Important Details**: Relevant specifics, numbers, dates, or commitments mentioned

Format your response using proper HTML with:
- <h3> tags for section headings
- <p> tags for paragraphs
- <ul> and <li> tags for lists
- <strong> tags for emphasis
- <em> tags for important details

Make it comprehensive but well-organized and easy to read. Focus on actionable insights and key takeaways.`

      const result = await this.makeGeminiRequest(prompt)
      
      if (!result.success || !result.content) {
        return { success: false, error: result.error || 'Failed to generate summary' }
      }

      return { success: true, summary: result.content.trim() }
    } catch (error) {
      return { success: false, error: `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateMessage(options: GeminiMessageOptions): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { type, data } = options
      const model = options.model || this.defaultModel

      // Build the context sections that are provided
      const contextSections: string[] = []
      
      if (data.globalContext) {
        contextSections.push(`GLOBAL CONTEXT:\n${data.globalContext}`)
      }
      
      if (data.meetingContext) {
        contextSections.push(`MEETING CONTEXT:\n${data.meetingContext}`)
      }
      
      if (data.title) {
        contextSections.push(`TITLE:\n${data.title}`)
      }
      
      if (data.description) {
        contextSections.push(`DESCRIPTION:\n${data.description}`)
      }
      
      if (data.summary) {
        contextSections.push(`SUMMARY:\n${data.summary}`)
      }
      
      if (data.notes) {
        contextSections.push(`NOTES:\n${data.notes}`)
      }
      
      if (data.transcript) {
        contextSections.push(`TRANSCRIPT:\n${data.transcript}`)
      }

      // Add action items if provided
      if (data.actionItems && data.actionItems.length > 0) {
        const actionItemsText = data.actionItems
          .map((item: any) => `- ${item.text}${item.completed ? ' (completed)' : ''}`)
          .join('\n')
        contextSections.push(`ACTION ITEMS:\n${actionItemsText}`)
      }

      // Add Q&A section if provided
      if (data.questionHistory && data.questionHistory.length > 0) {
        const qaText = data.questionHistory
          .slice(-5) // Include last 5 Q&A pairs
          .map((qa: any) => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join('\n\n')
        contextSections.push(`QUESTIONS & ANSWERS:\n${qaText}`)
      }

      // Add followup information if provided
      const followupSections: string[] = []
      if (data.followupQuestions && data.followupQuestions.length > 0) {
        followupSections.push(`Suggested Questions:\n${data.followupQuestions.map((q: string) => `- ${q}`).join('\n')}`)
      }
      if (data.followupRisks && data.followupRisks.length > 0) {
        followupSections.push(`Identified Risks:\n${data.followupRisks.map((r: string) => `- ${r}`).join('\n')}`)
      }
      if (data.followupComments && data.followupComments.length > 0) {
        followupSections.push(`AI Comments:\n${data.followupComments.map((c: string) => `- ${c}`).join('\n')}`)
      }
      
      if (followupSections.length > 0) {
        contextSections.push(`FOLLOW-UP INSIGHTS:\n${followupSections.join('\n\n')}`)
      }

      const contextText = contextSections.join('\n\n')

      let prompt = ''
      
      if (type === 'slack') {
        prompt = `You are an AI assistant helping to create a Slack message about a meeting. Please generate a professional Slack message based on the following information:

${contextText}

Please create a well-formatted Slack message that:
- Is professional yet conversational for team communication
- Highlights key points and outcomes
- Includes action items if any
- References important Q&A points if available
- Mentions follow-up insights or risks if relevant
- Uses appropriate Slack formatting (bold for emphasis, bullet points for lists)
- Is concise but informative (aim for under 500 words)
- Suitable for posting in a team channel

Generate only the message content in rich text format, no additional explanations.`
      } else {
        prompt = `You are an AI assistant helping to create an email about a meeting. Please generate a professional email based on the following information:

${contextText}

Please create a well-formatted email message that:
- Has a professional tone suitable for business communication
- Includes a clear structure with paragraphs
- Highlights key points and outcomes
- Includes action items if any
- References important Q&A discussions if available
- Mentions follow-up insights, risks, or suggestions if relevant
- Uses appropriate formatting for email (headings, bullet points)
- Is comprehensive but well-organized
- Suitable for sending to stakeholders or team members

Generate only the email body content in rich text format, no subject line or additional explanations.`
      }

      const result = await this.makeGeminiRequest(prompt, model)
      
      if (!result.success || !result.content) {
        return { success: false, error: result.error || 'Failed to generate message' }
      }

      return { success: true, message: result.content.trim() }
    } catch (error) {
      return { success: false, error: `Message generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async generateFollowupQuestions(options: FollowupQuestionsOptions): Promise<FollowupQuestionsResult> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `You are an AI assistant analyzing an ongoing meeting transcript. Based on the current transcript and context, please provide a summary of the latest information and predict what the next sentence in the transcript might be.

MEETING CONTEXT:
Title: ${options.title || 'Meeting'}
Context: ${options.context || 'No specific context'}
Description: ${options.description || 'No description'}

CURRENT TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes || 'No notes'}

SUMMARY SO FAR:
${options.summary || 'No summary yet'}

Please provide your response in the following JSON format:
{
  "transcriptSummary": "A concise summary of the latest and most important information from the transcript",
  "predictedNextSentence": "A realistic prediction of what might be said next based on the conversation flow and context"
}

Guidelines:
- Transcript Summary: Summarize the most recent and relevant information from the conversation, focusing on the current topic and key points
- Predicted Next Sentence: Analyze the conversation flow, context, and patterns to predict what someone might realistically say next. Consider:
  - The current speaker and topic
  - Natural conversation patterns
  - Unresolved questions or incomplete thoughts
  - Meeting dynamics and typical responses
- Make predictions realistic and contextually appropriate
- Ensure the JSON is properly formatted`

      const result = await this.makeGeminiRequest(prompt)
      
      if (!result.success || !result.content) {
        return { success: false, error: result.error || 'Failed to generate transcript prediction' }
      }

      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return { success: false, error: 'No valid JSON found in Gemini response' }
        }

        const parsedData = JSON.parse(jsonMatch[0])
        
        return {
          success: true,
          data: {
            transcriptSummary: parsedData.transcriptSummary || 'No summary available',
            predictedNextSentence: parsedData.predictedNextSentence || 'Unable to predict next sentence'
          }
        }
      } catch (parseError) {
        return { success: false, error: `Failed to parse Gemini response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` }
      }
    } catch (error) {
      return { success: false, error: `Transcript prediction generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  async askQuestion(options: AskQuestionOptions): Promise<AskQuestionResult> {
    try {
      const transcriptText = options.transcript
        .map(line => `[${line.time}] ${line.text}`)
        .join('\n')

      const prompt = `You are an AI assistant with access to both meeting information and general knowledge. Please answer the user's question using:
1. The available meeting data (primary source when relevant)
2. Your general knowledge to provide comprehensive context and insights
3. Best practices and expertise relevant to the topic

MEETING CONTEXT:
Title: ${options.title || 'Meeting'}
Description: ${options.description || 'No description'}
Context: ${options.context || 'No specific context'}

TRANSCRIPT:
${transcriptText}

NOTES:
${options.notes || 'No notes'}

SUMMARY:
${options.summary || 'No summary'}

USER QUESTION:
${options.question}

Instructions:
- If the question relates to specific meeting content, reference the transcript, notes, or summary directly
- If the question requires general knowledge or expertise, provide comprehensive insights from your knowledge base
- Combine meeting-specific information with general knowledge for a complete answer
- If you're making connections or providing context beyond the meeting data, make it clear what's from the meeting vs. your general knowledge
- Be helpful, accurate, and thorough
- Use specific examples from the meeting when available
- Provide actionable insights and recommendations when appropriate

Respond with a well-structured, informative answer that combines both sources appropriately.`

      const result = await this.makeGeminiRequest(prompt)
      
      if (!result.success || !result.content) {
        return { success: false, error: result.error || 'Failed to get answer' }
      }

      return { success: true, answer: result.content.trim() }
    } catch (error) {
      return { success: false, error: `Question answering failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}

export const geminiService = new GeminiService() 