import React, { useState } from 'react'
import { ArrowLeftIcon, SaveIcon, MicIcon, XIcon } from 'lucide-react'
import { Meeting } from '../types/database'

interface NewMeetingScreenProps {
  onBack: () => void
  onSave: (meeting: Omit<Meeting, 'id'>) => Promise<void>
}

const NewMeetingScreen: React.FC<NewMeetingScreenProps> = ({ onBack, onSave }) => {
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
        createdAt: now,
        updatedAt: now,
        duration: '00:00' // Default empty duration
      }

      await onSave(newMeeting)
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

  return (
    <div className="settings-container">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-xl)'
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onBack}>
          <ArrowLeftIcon size={20} />
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 'var(--font-weight-semibold)'
          }}
        >
          New Meeting
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-md)' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            <SaveIcon size={16} />
            {loading ? 'Creating...' : 'Create & Start Recording'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Meeting Details</h3>
        </div>
        <div className="card-body">
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
              style={{ minHeight: '100px' }}
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
              style={{ minHeight: '120px' }}
            />
            <label className="input-label">Context</label>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div
        style={{
          marginTop: 'var(--spacing-lg)',
          padding: 'var(--spacing-lg)',
          background: 'var(--surface-secondary)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div className="flex gap-sm items-center mb-sm">
          <MicIcon size={16} color="var(--text-secondary)" />
          <span className="text-sm font-medium text-secondary">Quick Start</span>
        </div>
        <p className="text-sm text-secondary" style={{ margin: 0, lineHeight: '1.4' }}>
          Create your meeting details and you&apos;ll be taken to the recording screen where you can
          start recording immediately. Only the title is required - you can always add more
          information later.
        </p>
      </div>
    </div>
  )
}

export default NewMeetingScreen
