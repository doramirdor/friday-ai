import React, { useState } from 'react'
import BlockNoteEditor from './BlockNoteEditor'
import {
  XIcon,
  PlusIcon,
  CheckIcon,
  FileTextIcon,
  ClipboardListIcon,
  UploadIcon,
  SaveIcon,
  SparklesIcon,
  BookOpenIcon,
  MailIcon,
  MessageSquareIcon,
  CopyIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon
} from 'lucide-react'
import { Meeting } from '../types/database'

type SidebarTab = 'details' | 'context' | 'actions' | 'notes' | 'summary' | 'followup-questions' | 'ask-question' | 'ai-messages' | 'alerts'

interface AIDataSelection {
  notes: boolean
  summary: boolean
  transcript: boolean
  description: boolean
  title: boolean
  questionHistory: boolean
  followupQuestions: boolean
}

interface AlertKeyword {
  id: number
  keyword: string
  threshold: number
  enabled: boolean
}

interface SidebarContentProps {
  meeting: Meeting | null
  title: string
  description: string
  tags: string[]
  contextText: string
  uploadedFiles: string[]
  actionItems: Array<{ id: number; text: string; completed: boolean }>
  notes: string
  summary: string
  isSummaryAIGenerated: boolean
  savingMeeting: boolean
  isGeneratingSummary: boolean
  isGeneratingAllContent: boolean
  isGeneratingMessage: boolean
  alertKeywords: AlertKeyword[]
  onTitleChange: (title: string) => void
  onDescriptionChange: (description: string) => void
  onTagsChange: (tags: string[]) => void
  onContextTextChange: (contextText: string) => void
  onUploadedFilesChange: (files: string[]) => void
  onActionItemsChange: (items: Array<{ id: number; text: string; completed: boolean }>) => void
  onNotesChange: (notes: string) => void
  onSummaryChange: (summary: string) => void
  onSaveMeeting: () => Promise<void>
  onGenerateSummary: () => Promise<void>
  onGenerateAllContent: () => Promise<void>
  onGenerateAIMessage: (type: 'slack' | 'email', options?: unknown) => Promise<string | void>
  onSetGeneratingMessage: (isGenerating: boolean) => void
  onAlertKeywordsChange: (keywords: AlertKeyword[]) => void
  transcript: Array<{ time: string; text: string }>
  restrictToTabs?: SidebarTab[]
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  title,
  description,
  tags,
  contextText,
  uploadedFiles,
  actionItems,
  notes,
  summary,
  isSummaryAIGenerated,
  savingMeeting,
  isGeneratingSummary,
  isGeneratingAllContent,
  isGeneratingMessage,
  alertKeywords,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  onContextTextChange,
  onUploadedFilesChange,
  onActionItemsChange,
  onNotesChange,
  onSummaryChange,
  onSaveMeeting,
  onGenerateSummary,
  onGenerateAllContent,
  onGenerateAIMessage,
  onSetGeneratingMessage,
  onAlertKeywordsChange,
  transcript,
  restrictToTabs
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('details')
  const [newTag, setNewTag] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [newThreshold, setNewThreshold] = useState(0.6)
  const [aiDataSelection, setAiDataSelection] = useState<AIDataSelection>({
    notes: true,
    summary: true,
    transcript: true,
    description: true,
    title: true,
    questionHistory: true,
    followupQuestions: true
  })
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [messageType, setMessageType] = useState<'slack' | 'email'>('slack')
  
  // Modal state for generated message dialog
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')
  const [dialogMessageType, setDialogMessageType] = useState<'slack' | 'email'>('slack')

  // Transcript prediction state - runs in background
  const [followupEnabled, setFollowupEnabled] = useState(false)
  const [followupInterval, setFollowupInterval] = useState(30) // seconds
  const [transcriptSummary, setTranscriptSummary] = useState<string>('')
  const [predictedNextSentence, setPredictedNextSentence] = useState<string>('')
  const [isGeneratingFollowup, setIsGeneratingFollowup] = useState(false)
  const [lastFollowupTime, setLastFollowupTime] = useState<number>(0)

  // Ask a question state - available in background
  const [userQuestion, setUserQuestion] = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false)
  const [questionHistory, setQuestionHistory] = useState<Array<{ question: string; answer: string; timestamp: number }>>([])

  const contextTemplates = {
    custom: 'Add your custom context here...',
    standup:
      "This is our daily standup meeting. We discuss what we completed yesterday, what we're working on today, and any blockers. Team members share progress updates and coordinate on shared tasks.",
    planning:
      'Sprint planning session where we review the product backlog, estimate story points, and plan work for the upcoming sprint. We discuss priorities, dependencies, and resource allocation.',
    review:
      'Code review session where we examine recent changes, discuss implementation approaches, identify potential issues, and ensure code quality standards are met.',
    client:
      'Client meeting to discuss project progress, gather feedback, review deliverables, and align on next steps. We present updates and address any concerns or questions.',
    interview:
      'Interview session for evaluating candidate qualifications, cultural fit, and technical skills. We assess experience, problem-solving abilities, and alignment with role requirements.',
    retrospective:
      'Sprint retrospective to reflect on what went well, what could be improved, and action items for the next sprint. Team discussion on process improvements.'
  }

  // Filter available tabs based on restrictToTabs prop
  const availableTabs = restrictToTabs || [
    'details', 'context', 'actions', 'notes', 'summary', 
    'followup-questions', 'ask-question', 'ai-messages', 'alerts'
  ]

  // Ensure the active tab is available
  React.useEffect(() => {
    if (!availableTabs.includes(activeSidebarTab)) {
      setActiveSidebarTab(availableTabs[0] || 'details')
    }
  }, [availableTabs, activeSidebarTab])

  const addTag = (): void => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onTagsChange([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string): void => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleTagKeyPress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      addTag()
    }
  }

  const toggleActionItem = (id: number): void => {
    const updatedItems = actionItems.map((item) => 
      (item.id === id ? { ...item, completed: !item.completed } : item)
    )
    onActionItemsChange(updatedItems)
  }

  const addActionItem = (): void => {
    const newItem = {
      id: Date.now(),
      text: 'New action item...',
      completed: false
    }
    onActionItemsChange([...actionItems, newItem])
  }

  const handleContextTemplateChange = (template: string): void => {
    onContextTextChange(contextTemplates[template as keyof typeof contextTemplates])
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files
    if (files) {
      const validExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.json', '.xml']
      const remainingSlots = 5 - uploadedFiles.length
      
      if (remainingSlots <= 0) {
        alert('Maximum of 5 context files allowed')
        return
      }
      
      const filesToProcess = Array.from(files).slice(0, remainingSlots)
      const validFiles = filesToProcess.filter(file => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase()
        return validExtensions.includes(extension)
      })
      
      if (validFiles.length !== filesToProcess.length) {
        alert('Only text format files are supported: PDF, DOC, DOCX, TXT, MD, JSON, XML')
      }
      
      const newFileNames = validFiles.map((file) => file.name)
      onUploadedFilesChange([...uploadedFiles, ...newFileNames])
    }
    
    event.target.value = ''
  }

  const removeFile = (fileName: string): void => {
    onUploadedFilesChange(uploadedFiles.filter((file) => file !== fileName))
  }

  const toggleDataSelection = (key: keyof AIDataSelection): void => {
    setAiDataSelection(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleGenerateAIMessage = async (type: 'slack' | 'email'): Promise<void> => {
    onSetGeneratingMessage(true)
    try {
      console.log('🚀 Starting AI message generation...', { type, hasCallback: !!onGenerateAIMessage })
      
      if (!onGenerateAIMessage) {
        console.error('❌ onGenerateAIMessage callback not provided')
        setGeneratedMessage(`**Error**: AI message generation not configured properly. Please check the parent component.`)
        return
      }

      // Prepare enhanced options including Q&A and transcript prediction data
      const enhancedOptions = {
        type,
        title: aiDataSelection.title ? title : '',
        description: aiDataSelection.description ? description : '',
        notes: aiDataSelection.notes ? notes : '',
        summary: aiDataSelection.summary ? summary : '',
        transcript: aiDataSelection.transcript ? transcript : [],
        actionItems,
        contextText,
        questionHistory: aiDataSelection.questionHistory ? questionHistory : [],
        transcriptSummary: aiDataSelection.followupQuestions ? transcriptSummary : '',
        predictedNextSentence: aiDataSelection.followupQuestions ? predictedNextSentence : ''
      }
      
      const result = await onGenerateAIMessage(type, enhancedOptions)
      if (result) {
        console.log('✅ AI message generated successfully')
        
        // Show in dialog first
        setDialogMessage(result)
        setDialogMessageType(type)
        setShowMessageDialog(true)
      } else {
        console.log('⚠️ No result returned from AI message generation')
        
        // Create enhanced demo message with Q&A and followup data
        let demoMessage = `**Demo ${type === 'slack' ? 'Slack' : 'Email'} Message**

Hi team,

I wanted to share a quick update from our meeting:

**Key Points:**
- ${title || 'Meeting discussion'}
- ${description || 'Various topics covered'}

**Action Items:**
${actionItems.length > 0 ? actionItems.map(item => `- ${item.text}`).join('\n') : '- Follow up on discussed items'}`

        // Add Q&A section if there are questions
        if (questionHistory.length > 0 && aiDataSelection.questionHistory) {
          demoMessage += `

**Questions & Answers:**
${questionHistory.slice(-3).map(qa => `
Q: ${qa.question}
A: ${qa.answer.substring(0, 100)}${qa.answer.length > 100 ? '...' : ''}`).join('\n')}`
        }

        // Add transcript prediction section if available
        if ((transcriptSummary || predictedNextSentence) && aiDataSelection.followupQuestions) {
          demoMessage += `

**Transcript Analysis:**`
          
          if (transcriptSummary) {
            demoMessage += `
- Current Summary: ${transcriptSummary.substring(0, 100)}${transcriptSummary.length > 100 ? '...' : ''}`
          }
          
          if (predictedNextSentence) {
            demoMessage += `
- Predicted Next: ${predictedNextSentence}`
          }
        }

        demoMessage += `

**Next Steps:**
- Review meeting notes
- Complete assigned tasks

Let me know if you have any questions!

Best regards,
[Your name]

---
*This is a demo message. Configure AI message generation for full functionality.*`

        // Show demo message in dialog
        setDialogMessage(demoMessage)
        setDialogMessageType(type)
        setShowMessageDialog(true)
      }
    } catch (error) {
      console.error('❌ Error generating AI message:', error)
      const errorMessage = `**Error**: Failed to generate message. ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      
      // Show error in dialog
      setDialogMessage(errorMessage)
      setDialogMessageType(type)
      setShowMessageDialog(true)
    } finally {
      onSetGeneratingMessage(false)
    }
  }

  const handleDialogAccept = (): void => {
    // Save to the main editor
    setGeneratedMessage(dialogMessage)
    setMessageType(dialogMessageType)
    setShowMessageDialog(false)
  }

  const handleDialogCancel = (): void => {
    setShowMessageDialog(false)
  }

  const copyDialogMessage = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(dialogMessage)
      console.log('✅ Dialog message copied to clipboard')
    } catch (error) {
      console.error('Failed to copy dialog message to clipboard:', error)
      alert('Failed to copy to clipboard')
    }
  }

  const addKeyword = (): void => {
    if (newKeyword.trim()) {
      const newAlertKeyword: AlertKeyword = {
        id: Date.now(),
        keyword: newKeyword.trim(),
        threshold: newThreshold,
        enabled: true
      }
      onAlertKeywordsChange([...alertKeywords, newAlertKeyword])
      setNewKeyword('')
    }
  }

  const removeKeyword = (id: number): void => {
    onAlertKeywordsChange(alertKeywords.filter(keyword => keyword.id !== id))
  }

  const toggleKeyword = (id: number): void => {
    onAlertKeywordsChange(alertKeywords.map(keyword => 
      keyword.id === id ? { ...keyword, enabled: !keyword.enabled } : keyword
    ))
  }

  const updateKeywordThreshold = (id: number, threshold: number): void => {
    onAlertKeywordsChange(alertKeywords.map(keyword => 
      keyword.id === id ? { ...keyword, threshold } : keyword
    ))
  }

  const handleKeywordKeyPress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      addKeyword()
    }
  }

  const generateFollowupQuestions = async (): Promise<void> => {
    if (transcript.length === 0) {
      return
    }

    try {
      setIsGeneratingFollowup(true)
      console.log('🤖 Generating transcript prediction with Gemini...')
      
      const options = {
        transcript,
        title,
        description,
        context: contextText,
        notes,
        summary
      }

      const result = await (window.api as unknown as { gemini: { generateFollowupQuestions: (options: unknown) => Promise<{ success: boolean; data?: { transcriptSummary?: string; predictedNextSentence?: string }; error?: string }> } }).gemini.generateFollowupQuestions(options)
      
      if (result.success && result.data) {
        setTranscriptSummary(result.data.transcriptSummary || 'No summary available')
        setPredictedNextSentence(result.data.predictedNextSentence || 'Unable to predict next sentence')
        setLastFollowupTime(Date.now())
        console.log('✅ Transcript prediction generated successfully')
      } else {
        console.error('Failed to generate transcript prediction:', result.error)
      }
    } catch (error) {
      console.error('Error generating transcript prediction:', error)
    } finally {
      setIsGeneratingFollowup(false)
    }
  }

  const askQuestion = async (): Promise<void> => {
    if (!userQuestion.trim() || transcript.length === 0) {
      return
    }

    try {
      setIsGeneratingAnswer(true)
      console.log('🤖 Asking question to Gemini...')
      
      const options = {
        question: userQuestion.trim(),
        transcript,
        title,
        description,
        context: contextText,
        notes,
        summary
      }

      const result = await (window.api as unknown as { gemini: { askQuestion: (options: unknown) => Promise<{ success: boolean; answer?: string; error?: string }> } }).gemini.askQuestion(options)
      
      if (result.success && result.answer) {
        setQuestionAnswer(result.answer)
        setQuestionHistory(prev => [...prev, {
          question: userQuestion.trim(),
          answer: result.answer || '',
          timestamp: Date.now()
        }])
        setUserQuestion('')
        console.log('✅ Question answered successfully')
      } else {
        console.error('Failed to get answer:', result.error)
        setQuestionAnswer('Failed to get answer. Please try again.')
      }
    } catch (error) {
      console.error('Error asking question:', error)
      setQuestionAnswer('Error occurred while asking question.')
    } finally {
      setIsGeneratingAnswer(false)
    }
  }

  // Followup questions interval effect
  React.useEffect(() => {
    if (!followupEnabled || transcript.length === 0) {
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      if (now - lastFollowupTime >= followupInterval * 1000) {
        generateFollowupQuestions()
      }
    }, followupInterval * 1000)

    return () => clearInterval(interval)
  }, [followupEnabled, followupInterval, transcript.length, lastFollowupTime])

  const renderSidebarContent = (): React.ReactNode => {
    switch (activeSidebarTab) {
      case 'details':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recording Details</h3>
            </div>
            <div className="card-body">
              <div className="input-group">
                <input
                  type="text"
                  className="input input-floating"
                  placeholder=" "
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
                <label className="input-label">Title</label>
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                />
                <label className="input-label">Description</label>
              </div>

              <div className="input-group">
                <label className="demo-label">Tags</label>
                <div className="tag-input-container">
                  {tags.map((tag) => (
                    <span key={tag} className="tag tag-deletable">
                      {tag}
                      <button className="tag-delete" onClick={() => removeTag(tag)}>
                        <XIcon size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="tag-input"
                    placeholder="Add tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={handleTagKeyPress}
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 'context':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Context Information</h3>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label className="demo-label">Context Template</label>
                <select
                  className="input"
                  onChange={(e) => handleContextTemplateChange(e.target.value)}
                  value={contextText === contextTemplates.standup ? 'standup' : 'custom'}
                >
                  <option value="custom">Custom</option>
                  <option value="standup">Daily Standup</option>
                  <option value="planning">Sprint Planning</option>
                  <option value="review">Code Review</option>
                  <option value="client">Client Meeting</option>
                  <option value="interview">Interview</option>
                  <option value="retrospective">Sprint Retrospective</option>
                </select>
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  style={{ minHeight: '120px' }}
                  value={contextText}
                  onChange={(e) => onContextTextChange(e.target.value)}
                />
                <label className="input-label">Context</label>
              </div>

              <div className="input-group">
                <label className="demo-label">Context Files</label>
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    id="context-files"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.json,.xml"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="context-files" className="btn btn-secondary btn-sm">
                    <UploadIcon size={16} />
                    Upload Files ({uploadedFiles.length}/5)
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="uploaded-files">
                    {uploadedFiles.map((fileName, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-sm"
                        style={{
                          background: 'var(--surface-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: '8px'
                        }}
                      >
                        <div className="flex items-center gap-sm">
                          <FileTextIcon size={16} color="var(--text-secondary)" />
                          <span className="text-sm">{fileName}</span>
                        </div>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => removeFile(fileName)}
                          style={{ padding: '4px' }}
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'actions':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Action Items</h3>
            </div>
            <div className="card-body">
              <div className="action-items-container">
                <div className="action-items">
                  {actionItems.map((item) => (
                    <div key={item.id} className="action-item">
                      <input
                        type="checkbox"
                        id={`action-${item.id}`}
                        checked={item.completed}
                        onChange={() => toggleActionItem(item.id)}
                      />
                      <label
                        htmlFor={`action-${item.id}`}
                        className={`action-item-text ${item.completed ? 'completed' : ''}`}
                      >
                        {item.text}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-ghost btn-sm w-full"
                onClick={addActionItem}
                style={{ marginTop: '12px' }}
              >
                <PlusIcon size={16} />
                Add Action Item
              </button>
            </div>
          </div>
        )

      case 'notes':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Notes</h3>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onGenerateAllContent}
                  disabled={isGeneratingAllContent}
                  title="Generate all content with AI"
                >
                  <SparklesIcon size={16} />
                  {isGeneratingAllContent ? 'Generating...' : 'Generate All'}
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label className="demo-label">Notes (Rich Text Editor)</label>
                <div style={{ marginTop: '8px' }}>
                  <BlockNoteEditor
                    value={notes}
                    onChange={(val) => onNotesChange(val || '')}
                    placeholder="Write your notes here..."
                    height={250}
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Use the toolbar above for rich text formatting. Bold, italic, headers, lists, and more are available.
              </div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Use &ldquo;/&rdquo; to open the command menu for blocks, headings, lists, and more. Drag blocks to reorder them.
              </div>
            </div>
          </div>
        )

      case 'summary':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Summary</h3>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={onGenerateSummary}
                  disabled={isGeneratingSummary}
                  title="Generate summary with AI"
                >
                  <SparklesIcon size={16} />
                  {isGeneratingSummary ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
            <div className="card-body">
              {!isSummaryAIGenerated && !summary && !isGeneratingSummary ? (
                <div style={{
                  textAlign: 'center',
                  padding: 'var(--spacing-xl)',
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  border: '2px dashed var(--border-primary)'
                }}>
                  <SparklesIcon size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>No summary yet</p>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    Click &ldquo;Generate&rdquo; to create an AI-powered summary based on your transcript, context, and notes.
                  </p>
                </div>
              ) : (
                <div className="input-group">
                  <textarea
                    className="input textarea input-floating"
                    placeholder=" "
                    style={{ minHeight: '150px' }}
                    value={summary}
                    onChange={(e) => onSummaryChange(e.target.value)}
                  />
                  <label className="input-label">Meeting Summary</label>
                </div>
              )}
              {summary && !isGeneratingSummary && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isSummaryAIGenerated ? '🤖 AI-generated summary - you can edit it above' : 'Custom summary'}
                </div>
              )}
            </div>
          </div>
        )

      case 'followup-questions':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                🔮 Transcript Prediction
                {followupEnabled && (
                  <span style={{ 
                    marginLeft: '8px', 
                    fontSize: '12px', 
                    background: 'var(--green-light)', 
                    color: 'var(--green-dark)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Auto-generating
                  </span>
                )}
              </h3>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                AI automatically analyzes your meeting transcript to summarize the latest information and predict what might be said next.
              </div>

              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={followupEnabled}
                    onChange={(e) => setFollowupEnabled(e.target.checked)}
                  />
                  <span>Enable auto-generation during recording</span>
                </label>
              </div>

              <div className="input-group">
                <label className="demo-label">Update Interval: {followupInterval} seconds</label>
                <input
                  type="range"
                  min="5"
                  max="300"
                  step="5"
                  value={followupInterval}
                  onChange={(e) => setFollowupInterval(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)',
                  marginTop: '4px'
                }}>
                  <span>5s (frequent)</span>
                  <span>5m (occasional)</span>
                </div>
              </div>

              <div className="input-group">
                <button
                  className="btn btn-primary w-full"
                  onClick={generateFollowupQuestions}
                  disabled={isGeneratingFollowup || transcript.length === 0}
                >
                  <SparklesIcon size={16} />
                  {isGeneratingFollowup ? 'Generating...' : 'Generate Prediction'}
                </button>
              </div>

              {(transcriptSummary || predictedNextSentence) && (
                <div className="followup-results">
                  {transcriptSummary && (
                    <div className="followup-section">
                      <h5 style={{ color: 'var(--interactive-primary)', marginBottom: '8px' }}>
                        📋 Latest Information Summary
                      </h5>
                      <div style={{ 
                        padding: '12px', 
                        background: 'var(--surface-secondary)', 
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '14px',
                        lineHeight: 'var(--line-height-relaxed)',
                        color: 'var(--text-primary)'
                      }}>
                        {transcriptSummary}
                      </div>
                    </div>
                  )}

                  {predictedNextSentence && (
                    <div className="followup-section">
                      <h5 style={{ color: 'var(--status-success)', marginBottom: '8px' }}>
                        🔮 Predicted Next Sentence
                      </h5>
                      <div style={{ 
                        padding: '12px', 
                        background: 'var(--surface-secondary)', 
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '14px',
                        lineHeight: 'var(--line-height-relaxed)',
                        color: 'var(--text-primary)',
                        fontStyle: 'italic',
                        border: '1px dashed var(--border)'
                      }}>
                        &ldquo;{predictedNextSentence}&rdquo;
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )

      case 'ask-question':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">🤔 Ask a Question</h3>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Ask AI anything about your meeting or get general knowledge and expertise. The AI can access your complete transcript, notes, summary, context, and provide insights from its knowledge base.
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  value={userQuestion}
                  onChange={(e) => setUserQuestion(e.target.value)}
                  style={{ minHeight: '80px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      askQuestion()
                    }
                  }}
                />
                <label className="input-label">Your question... (Cmd/Ctrl+Enter to submit)</label>
              </div>

              <div className="input-group">
                <button
                  className="btn btn-primary w-full"
                  onClick={askQuestion}
                  disabled={isGeneratingAnswer || !userQuestion.trim() || transcript.length === 0}
                >
                  <MessageSquareIcon size={16} />
                  {isGeneratingAnswer ? 'Thinking...' : 'Ask Question'}
                </button>
              </div>

              {questionAnswer && (
                <div className="question-answer">
                  <h5 style={{ color: 'var(--interactive-primary)', marginBottom: '8px' }}>
                    💬 Answer
                  </h5>
                  <div style={{
                    padding: '12px',
                    background: 'var(--surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    maxHeight: '40vh',
                    overflowY: 'auto',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {questionAnswer}
                  </div>
                </div>
              )}

              {questionHistory.length > 0 && (
                <div className="question-history">
                  <h5 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
                    📚 Recent Questions ({questionHistory.length})
                  </h5>
                  <div 
                    className="question-history-list"
                    style={{
                      maxHeight: questionHistory.length > 3 ? '40vh' : 'auto'
                    }}
                  >
                    {questionHistory.slice(-10).reverse().map((item, index) => (
                      <div key={index} style={{
                        padding: '8px',
                        background: 'var(--surface-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'background-color var(--transition-fast)'
                      }}
                      onClick={() => {
                        setUserQuestion(item.question)
                        setQuestionAnswer(item.answer)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-secondary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--surface-tertiary)'
                      }}
                      >
                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                          Q: {item.question}
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          A: {item.answer.length > 150 ? `${item.answer.substring(0, 150)}...` : item.answer}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          {new Date(item.timestamp).toLocaleTimeString()} • Click to reuse
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 'ai-messages':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">✉️ AI Message Generator</h3>
            </div>
            <div className="card-body ai-message-generator">
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Generate professional Slack messages or emails based on your meeting content.
              </div>

              {/* Data Selection */}
              <div className="input-group">
                <label className="demo-label">Include Data</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(aiDataSelection).map(([key, value]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() => toggleDataSelection(key as keyof AIDataSelection)}
                      />
                      <span style={{ textTransform: 'capitalize' }}>
                        {key === 'questionHistory' ? 'Questions & Answers' : 
                         key === 'followupQuestions' ? 'Transcript Prediction' : 
                         key}
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Global context and meeting context are always included
                </div>
              </div>

              {/* Message Type Selection */}
              <div className="input-group">
                <label className="demo-label">Message Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn btn-sm ${messageType === 'slack' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMessageType('slack')}
                  >
                    <MessageSquareIcon size={16} />
                    Slack Message
                  </button>
                  <button
                    className={`btn btn-sm ${messageType === 'email' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMessageType('email')}
                  >
                    <MailIcon size={16} />
                    Email Message
                  </button>
                </div>
              </div>

              {/* Generate Button */}
              <div className="input-group" style={{ marginTop: '16px' }}>
                <button
                  className="btn btn-primary w-full"
                  onClick={() => {
                    console.log('🚀 AI Message Generator button clicked!', { messageType, isGeneratingMessage })
                    handleGenerateAIMessage(messageType)
                  }}
                  disabled={isGeneratingMessage}
                  style={{ 
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    minHeight: '44px'
                  }}
                >
                  <SparklesIcon size={16} />
                  {isGeneratingMessage ? (
                    <>✨ Generating {messageType === 'slack' ? 'Slack' : 'Email'} Message...</>
                  ) : (
                    <>🚀 Generate {messageType === 'slack' ? 'Slack' : 'Email'} Message</>
                  )}
                </button>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: 'var(--text-secondary)',
                  textAlign: 'center'
                }}>
                  Click to generate a professional {messageType === 'slack' ? 'Slack message' : 'email'} using AI
                </div>
              </div>

              {/* Generated Message Output */}
              {generatedMessage && !isGeneratingMessage && (
                <div className="input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="demo-label">Generated Message</label>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(generatedMessage)
                          console.log('✅ Message copied to clipboard')
                        } catch (error) {
                          console.error('Failed to copy to clipboard:', error)
                          alert('Failed to copy to clipboard')
                        }
                      }}
                      title="Copy to clipboard"
                    >
                      <CopyIcon size={16} />
                      Copy
                    </button>
                  </div>
                  <div className="ai-message-editor-container">
                    <BlockNoteEditor
                      value={generatedMessage}
                      onChange={setGeneratedMessage}
                      placeholder="Generated message will appear here..."
                      height={300}
                    />
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    You can edit the message above and copy it to your clipboard
                  </div>
                </div>
              )}

              {/* Message Generation Dialog */}
              {showMessageDialog && (
                <div 
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      handleDialogCancel()
                    }
                  }}
                >
                  <div 
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      maxWidth: '600px',
                      maxHeight: '80vh',
                      width: '90%',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    {/* Dialog Header */}
                    <div style={{
                      padding: '20px 24px 16px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <h3 style={{ 
                        margin: 0, 
                        fontSize: '18px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {dialogMessageType === 'slack' ? <MessageSquareIcon size={20} /> : <MailIcon size={20} />}
                        Generated {dialogMessageType === 'slack' ? 'Slack Message' : 'Email'}
                      </h3>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={handleDialogCancel}
                        style={{ padding: '8px' }}
                      >
                        <XIcon size={20} />
                      </button>
                    </div>

                    {/* Dialog Content */}
                    <div style={{
                      padding: '20px 24px',
                      overflow: 'auto',
                      flex: 1
                    }}>
                      <div style={{
                        background: 'var(--surface-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'var(--font-mono)',
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        {dialogMessage}
                      </div>
                    </div>

                    {/* Dialog Actions */}
                    <div style={{
                      padding: '16px 24px 20px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      gap: '12px',
                      justifyContent: 'flex-end'
                    }}>
                      <button
                        className="btn btn-ghost"
                        onClick={copyDialogMessage}
                      >
                        <CopyIcon size={16} />
                        Copy to Clipboard
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={handleDialogCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleDialogAccept}
                      >
                        <SaveIcon size={16} />
                        Save to Editor
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 'alerts':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Smart Alerts</h3>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Monitor your transcript for important keywords using AI-powered semantic matching. 
                Get notified when topics of interest are mentioned, even if the exact words aren&apos;t used.
              </div>

              {/* Add New Keyword */}
              <div className="input-group">
                <label className="demo-label">Add Alert Keyword</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., budget, deadline, customer complaint..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={handleKeywordKeyPress}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={addKeyword}
                    disabled={!newKeyword.trim()}
                  >
                    <PlusIcon size={16} />
                    Add
                  </button>
                </div>
                
                {/* Threshold Slider */}
                <div style={{ marginBottom: '8px' }}>
                  <label className="demo-label" style={{ fontSize: '12px' }}>
                    Similarity Threshold: {newThreshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '10px', 
                    color: 'var(--text-secondary)',
                    marginTop: '4px'
                  }}>
                    <span>More sensitive</span>
                    <span>Less sensitive</span>
                  </div>
                </div>
              </div>

              {/* Keywords List */}
              <div className="input-group">
                <label className="demo-label">Alert Keywords ({alertKeywords.length})</label>
                
                {alertKeywords.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '2px dashed var(--border)'
                  }}>
                    <AlertTriangleIcon size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>No alert keywords yet</p>
                    <p style={{ margin: 0, fontSize: '14px' }}>
                      Add keywords above to start monitoring your transcripts for important topics.
                    </p>
                  </div>
                ) : (
                  <div className="action-items-container" style={{ maxHeight: '200px' }}>
                    {alertKeywords.map((alertKeyword) => (
                      <div
                        key={alertKeyword.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px',
                          background: alertKeyword.enabled ? 'var(--surface)' : 'var(--surface-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${alertKeyword.enabled ? 'var(--border)' : 'var(--border-secondary)'}`,
                          marginBottom: '8px'
                        }}
                      >
                        {/* Toggle Button */}
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => toggleKeyword(alertKeyword.id)}
                          title={alertKeyword.enabled ? 'Disable alert' : 'Enable alert'}
                        >
                          {alertKeyword.enabled ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                        </button>

                        {/* Keyword Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontWeight: '500', 
                            color: alertKeyword.enabled ? 'var(--text-primary)' : 'var(--text-secondary)' 
                          }}>
                            {alertKeyword.keyword}
                          </div>
                          <div style={{ 
                            fontSize: '12px', 
                            color: 'var(--text-secondary)' 
                          }}>
                            Threshold: {alertKeyword.threshold.toFixed(2)}
                          </div>
                        </div>

                        {/* Threshold Adjustment */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' }}>
                          <input
                            type="range"
                            min="0.3"
                            max="0.9"
                            step="0.05"
                            value={alertKeyword.threshold}
                            onChange={(e) => updateKeywordThreshold(alertKeyword.id, parseFloat(e.target.value))}
                            style={{ width: '60px' }}
                            disabled={!alertKeyword.enabled}
                          />
                        </div>

                        {/* Remove Button */}
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => removeKeyword(alertKeyword.id)}
                          title="Remove keyword"
                        >
                          <XIcon size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Section */}
              <div style={{
                padding: '12px',
                background: 'var(--surface-secondary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4'
              }}>
                <strong>How it works:</strong> Uses AI semantic matching to detect when topics similar to your keywords are mentioned in the transcript. 
                Higher thresholds = more exact matches, lower thresholds = broader topic detection.
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Tab configuration for the 5 requested tabs
  const tabConfig = {
    // details: { icon: InfoIcon, label: 'Details' },
    context: { icon: FileTextIcon, label: 'Context' },
    actions: { icon: ClipboardListIcon, label: 'Action Items' },
    summary: { icon: BookOpenIcon, label: 'AI Summary' },
    alerts: { icon: AlertTriangleIcon, label: 'Alerts' }
  }

  return (
    <div className="sidebar-content-wrapper">
      {/* Tab Navigation */}
      <div className="sidebar-tabs">
        {availableTabs.map((tab) => {
          const config = tabConfig[tab as keyof typeof tabConfig]
          if (!config) return null
          
          const Icon = config.icon
          return (
            <button
              key={tab}
              className={`sidebar-tab ${activeSidebarTab === tab ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab(tab)}
            >
              <Icon size={16} />
              <span>{config.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="sidebar-tab-content">
        {renderSidebarContent()}
      </div>

      {/* Save Indicator */}
      <div className="save-indicator saved">
        <CheckIcon size={16} />
        <span>All changes saved</span>
        <span className="text-xs text-secondary">⌘ S</span>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: 'var(--spacing-md)' }}>
        <button
          className="btn btn-primary w-full"
          onClick={onSaveMeeting}
          disabled={savingMeeting}
        >
          <SaveIcon size={16} />
          {savingMeeting ? 'Saving...' : 'Save Meeting'}
        </button>
      </div>
    </div>
  )
}

export default SidebarContent 