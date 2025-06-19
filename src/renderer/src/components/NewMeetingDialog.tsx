import React, { useState } from 'react'
import { SaveIcon, XIcon } from 'lucide-react'
import { Meeting } from '../types/database'

interface NewMeetingDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (meeting: Omit<Meeting, 'id'>) => Promise<void>
}

const NewMeetingDialog: React.FC<NewMeetingDialogProps> = ({ isOpen, onClose, onSave }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [context, setContext] = useState('')
  const [loading, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ title?: string }>({})

  const contextTemplates = {
    custom: '',
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

  const validateForm = (): boolean => {
    const newErrors: { title?: string } = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (): Promise<void> => {
    if (!validateForm()) {
      return
    }

    setSaving(true)

    try {
      const now = new Date().toISOString()
      const newMeeting: Omit<Meeting, 'id'> = {
        recordingPath: '', // Will be set when recording is available
        transcript: [],
        title: title.trim(),
        description: description.trim(),
        tags,
        actionItems: [],
        context: context.trim(),
        context_files: [], // Initialize with empty array
        notes: '', // Initialize with empty notes
        summary: '',
        chatMessages: [], // Initialize with empty chat messages
        createdAt: now,
        updatedAt: now,
        duration: '00:00' // Default empty duration
      }

      await onSave(newMeeting)

      // Reset form
      setTitle('')
      setDescription('')
      setTags([])
      setNewTag('')
      setContext('')
      setErrors({})
      onClose()
    } catch (error) {
      console.error('Failed to save meeting:', error)
    } finally {
      setSaving(false)
    }
  }

  const addTag = (): void => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string): void => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleTagKeyPress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTag()
    }
  }

  const handleContextTemplateChange = (template: string): void => {
    setContext(contextTemplates[template as keyof typeof contextTemplates])
  }

  const handleClose = (): void => {
    // Reset form when closing
    setTitle('')
    setDescription('')
    setTags([])
    setNewTag('')
    setContext('')
    setErrors({})
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} onClick={handleClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxWidth: '600px', 
          width: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 className="modal-title">New Meeting</h3>
          <button className="btn btn-ghost btn-icon" onClick={handleClose}>
            <XIcon size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ 
          flex: 1, 
          overflowY: 'auto',
          paddingBottom: 'var(--spacing-md)'
        }}>
          {/* Title - Required */}
          <div className="input-group">
            <input
              type="text"
              className={`input input-floating ${errors.title ? 'error' : ''}`}
              placeholder=" "
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={errors.title ? { borderColor: 'var(--status-error)' } : {}}
            />
            <label className="input-label">Title *</label>
            {errors.title && (
              <div
                style={{
                  color: 'var(--status-error)',
                  fontSize: 'var(--font-size-sm)',
                  marginTop: '4px'
                }}
              >
                {errors.title}
              </div>
            )}
          </div>

          {/* Description - Optional */}
          <div className="input-group">
            <textarea
              className="input textarea input-floating"
              placeholder=" "
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: '80px' }}
            />
            <label className="input-label">Description</label>
          </div>

          {/* Tags - Optional */}
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

          {/* Context Template - Optional */}
          <div className="input-group">
            <label className="demo-label">Context Template</label>
            <select
              className="input"
              onChange={(e) => handleContextTemplateChange(e.target.value)}
              defaultValue="custom"
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

          {/* Context - Optional */}
          <div className="input-group">
            <textarea
              className="input textarea input-floating"
              placeholder=" "
              value={context}
              onChange={(e) => setContext(e.target.value)}
              style={{ minHeight: '100px' }}
            />
            <label className="input-label">Context</label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ 
          flexShrink: 0,
          borderTop: '1px solid var(--border-primary)',
          marginTop: 'auto'
        }}>
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            <SaveIcon size={16} />
            {loading ? 'Creating...' : 'Create & Start Recording'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewMeetingDialog
