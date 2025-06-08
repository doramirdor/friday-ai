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
  CopyIcon
} from 'lucide-react'
import { Meeting } from '../types/database'

type SidebarTab = 'details' | 'context' | 'actions' | 'notes' | 'summary' | 'ai'

interface AIDataSelection {
  notes: boolean
  summary: boolean
  transcript: boolean
  description: boolean
  title: boolean
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
  onGenerateAIMessage: (type: 'slack' | 'email') => Promise<void>
  transcript: Array<{ time: string; text: string }>
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  meeting,
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
  transcript
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('details')
  const [newTag, setNewTag] = useState('')
  const [aiDataSelection, setAiDataSelection] = useState<AIDataSelection>({
    notes: true,
    summary: true,
    transcript: true,
    description: true,
    title: true
  })
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false)
  const [messageType, setMessageType] = useState<'slack' | 'email'>('slack')

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
    setIsGeneratingMessage(true)
    try {
      await onGenerateAIMessage(type)
    } finally {
      setIsGeneratingMessage(false)
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
                  title="Generate all content with AI"
                >
                  <SparklesIcon size={16} />
                  Generate All
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
                  title="Generate summary with AI"
                >
                  <SparklesIcon size={16} />
                  Generate
                </button>
              </div>
            </div>
            <div className="card-body">
              {!isSummaryAIGenerated && !summary ? (
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
              {summary && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isSummaryAIGenerated ? '🤖 AI-generated summary - you can edit it above' : 'Custom summary'}
                </div>
              )}
            </div>
          </div>
        )

      case 'ai':
        return (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">AI Message Generator</h3>
            </div>
            <div className="card-body">
              <div className="ai-content-container">
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
                {generatedMessage && (
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
                    <BlockNoteEditor
                      value={generatedMessage}
                      onChange={setGeneratedMessage}
                      placeholder="Generated message will appear here..."
                      height={300}
                    />
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      You can edit the message above and copy it to your clipboard
                    </div>
                  </div>
                )}
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
          <InfoIcon size={16} />
          Details
        </button>
        <button
          className={`tab ${activeSidebarTab === 'context' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('context')}
        >
          <FileTextIcon size={16} />
          Context
        </button>
        <button
          className={`tab ${activeSidebarTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('actions')}
        >
          <ClipboardListIcon size={16} />
          Actions
        </button>
        <button
          className={`tab ${activeSidebarTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('notes')}
        >
          <BookOpenIcon size={16} />
          Notes
        </button>
        <button
          className={`tab ${activeSidebarTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('summary')}
        >
          <FileTextIcon size={16} />
          Summary
        </button>
        <button
          className={`tab ${activeSidebarTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('ai')}
        >
          <BotIcon size={16} />
          AI
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