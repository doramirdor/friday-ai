import React, { useState } from 'react'
import BlockNoteEditor from './BlockNoteEditor'
import {
  XIcon,
  PlusIcon,
  CheckIcon,
  FileTextIcon,
  ClipboardListIcon,
  InfoIcon,
  UploadIcon,
  SaveIcon,
  SparklesIcon,
  BookOpenIcon,
  BotIcon,
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
  onGenerateAIMessage: (type: 'slack' | 'email') => Promise<string | void>
  onSetGeneratingMessage: (isGenerating: boolean) => void
  onAlertKeywordsChange: (keywords: AlertKeyword[]) => void
  transcript: Array<{ time: string; text: string }>
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
  transcript
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
    title: true
  })
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [messageType, setMessageType] = useState<'slack' | 'email'>('slack')

  // Followup questions state - runs in background
  const [followupEnabled, setFollowupEnabled] = useState(false)
  const [followupInterval, setFollowupInterval] = useState(30) // seconds
  const [followupQuestions, setFollowupQuestions] = useState<string[]>([])
  const [followupRisks, setFollowupRisks] = useState<string[]>([])
  const [followupComments, setFollowupComments] = useState<string[]>([])
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
      const result = await onGenerateAIMessage(type)
      if (result) {
        setGeneratedMessage(result)
      }
    } finally {
      onSetGeneratingMessage(false)
    }
  }

  const copyToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(generatedMessage)
      console.log('✅ Message copied to clipboard')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
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
      console.log('🤖 Generating followup questions with Gemini...')
      
      const options = {
        transcript,
        title,
        description,
        context: contextText,
        notes,
        summary
      }

      const result = await window.api.gemini.generateFollowupQuestions(options)
      
      if (result.success && result.data) {
        setFollowupQuestions(result.data.questions || [])
        setFollowupRisks(result.data.risks || [])
        setFollowupComments(result.data.comments || [])
        setLastFollowupTime(Date.now())
        console.log('✅ Followup questions generated successfully')
      } else {
        console.error('Failed to generate followup questions:', result.error)
      }
    } catch (error) {
      console.error('Error generating followup questions:', error)
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

      const result = await window.api.gemini.askQuestion(options)
      
      if (result.success && result.answer) {
        setQuestionAnswer(result.answer)
        setQuestionHistory(prev => [...prev, {
          question: userQuestion.trim(),
          answer: result.answer,
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
                💡 Followup Questions
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
                AI automatically analyzes your meeting transcript and generates relevant followup questions, identifies potential risks, and provides helpful comments.
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
                  {isGeneratingFollowup ? 'Generating...' : 'Generate Now'}
                </button>
              </div>

              {(followupQuestions.length > 0 || followupRisks.length > 0 || followupComments.length > 0) && (
                <div className="followup-results">
                  {followupQuestions.length > 0 && (
                    <div className="followup-section">
                      <h5 style={{ color: 'var(--interactive-primary)', marginBottom: '8px' }}>
                        💡 Suggested Questions
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {followupQuestions.map((question, index) => (
                          <li key={index} style={{ marginBottom: '4px', fontSize: '14px' }}>
                            {question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {followupRisks.length > 0 && (
                    <div className="followup-section">
                      <h5 style={{ color: 'var(--status-error)', marginBottom: '8px' }}>
                        ⚠️ Potential Risks
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {followupRisks.map((risk, index) => (
                          <li key={index} style={{ marginBottom: '4px', fontSize: '14px' }}>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {followupComments.length > 0 && (
                    <div className="followup-section">
                      <h5 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
                        💬 Comments
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {followupComments.map((comment, index) => (
                          <li key={index} style={{ marginBottom: '4px', fontSize: '14px' }}>
                            {comment}
                          </li>
                        ))}
                      </ul>
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
                Ask AI anything about your meeting. The AI has access to your complete transcript, notes, summary, and context.
              </div>

              <div className="input-group">
                <textarea
                  className="input textarea input-floating"
                  placeholder=" "
                  value={userQuestion}
                  onChange={(e) => setUserQuestion(e.target.value)}
                  style={{ minHeight: '80px' }}
                />
                <label className="input-label">Your question...</label>
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
                    lineHeight: '1.5'
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
                  <div className="question-history-list">
                    {questionHistory.slice(-5).reverse().map((item, index) => (
                      <div key={index} style={{
                        padding: '8px',
                        background: 'var(--surface-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '8px',
                        fontSize: '12px'
                      }}>
                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                          Q: {item.question}
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          A: {item.answer.length > 150 ? `${item.answer.substring(0, 150)}...` : item.answer}
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
                      <span style={{ textTransform: 'capitalize' }}>{key}</span>
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
              <div className="input-group">
                <button
                  className="btn btn-primary w-full"
                  onClick={() => handleGenerateAIMessage(messageType)}
                  disabled={isGeneratingMessage}
                >
                  <SparklesIcon size={16} />
                  {isGeneratingMessage ? 'Generating...' : `Generate ${messageType === 'slack' ? 'Slack' : 'Email'} Message`}
                </button>
              </div>

              {/* Generated Message Output */}
              {generatedMessage && !isGeneratingMessage && (
                <div className="input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="demo-label">Generated Message</label>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={copyToClipboard}
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

  return (
    <div className="transcript-sidebar">
      {/* Tab Navigation */}
      <div className="tabs">
        <button
          className={`tab ${activeSidebarTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('details')}
        >
          <InfoIcon size={14} />
          Details
        </button>
        <button
          className={`tab ${activeSidebarTab === 'context' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('context')}
        >
          <FileTextIcon size={14} />
          Context
        </button>
        <button
          className={`tab ${activeSidebarTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('actions')}
        >
          <ClipboardListIcon size={14} />
          Actions
        </button>
        <button
          className={`tab ${activeSidebarTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('notes')}
        >
          <BookOpenIcon size={14} />
          Notes
        </button>
        <button
          className={`tab ${activeSidebarTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('summary')}
        >
          <FileTextIcon size={14} />
          Summary
        </button>
        <button
          className={`tab ${activeSidebarTab === 'followup-questions' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('followup-questions')}
        >
          <SparklesIcon size={14} />
          Followup
          {followupEnabled && (
            <div style={{ 
              width: '6px', 
              height: '6px', 
              background: 'var(--green-dark)', 
              borderRadius: '50%',
              marginLeft: '4px'
            }} />
          )}
        </button>
        <button
          className={`tab ${activeSidebarTab === 'ask-question' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('ask-question')}
        >
          <MessageSquareIcon size={14} />
          Q&A
        </button>
        <button
          className={`tab ${activeSidebarTab === 'ai-messages' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('ai-messages')}
        >
          <BotIcon size={14} />
          Messages
        </button>
        <button
          className={`tab ${activeSidebarTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('alerts')}
        >
          <AlertTriangleIcon size={14} />
          Alerts
        </button>
      </div>

      {/* Tab Content */}
      {renderSidebarContent()}

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