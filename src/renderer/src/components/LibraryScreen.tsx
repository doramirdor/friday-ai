import React, { useState, useEffect } from 'react'
import { PlayIcon, Trash2Icon, MicOffIcon, PlusIcon } from 'lucide-react'
import { Meeting } from '../types/database'

interface LibraryScreenProps {
  onOpenTranscript: (meeting: Meeting) => void
  onNewMeeting?: () => void
}

const LibraryScreen: React.FC<LibraryScreenProps> = ({ onOpenTranscript, onNewMeeting }) => {
  const [recordings, setRecordings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; meeting: Meeting | null }>({
    show: false,
    meeting: null
  })

  // Load meetings from database
  useEffect(() => {
    const loadMeetings = async (): Promise<void> => {
      try {
        const meetings = await (window as any).api.db.getAllMeetings()
        console.log('meetings', meetings)
        setRecordings(meetings)
      } catch (error) {
        console.error('Failed to load meetings:', error)
      } finally {
        setLoading(false)
      }
    }

    loadMeetings()
  }, [])

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleDeleteClick = (meeting: Meeting): void => {
    setDeleteModal({ show: true, meeting })
  }

  const confirmDelete = async (): Promise<void> => {
    if (deleteModal.meeting?.id) {
      try {
        await (window as any).api.db.deleteMeeting(deleteModal.meeting.id)
        setRecordings((prev) => prev.filter((r) => r.id !== deleteModal.meeting!.id))
        setDeleteModal({ show: false, meeting: null })
      } catch (error) {
        console.error('Failed to delete meeting:', error)
      }
    }
  }

  const handleRowClick = (meeting: Meeting): void => {
    console.log('Opening transcript for:', meeting.title)
    onOpenTranscript(meeting)
  }

  const handlePlayClick = (event: React.MouseEvent, meeting: Meeting): void => {
    event.stopPropagation()
    console.log('Playing recording:', meeting.title)
  }

  if (loading) {
    return (
      <div className="library-container">
        <div className="library-empty">
          <div className="empty-state">
            <div className="empty-state-title">Loading recordings...</div>
          </div>
        </div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="library-container">
        <div className="library-empty">
          <div className="empty-state">
            <div className="empty-state-icon">
              <MicOffIcon size={64} style={{ opacity: 0.5 }} />
            </div>
            <h3 className="empty-state-title">No recordings yet</h3>
            <p className="empty-state-description">
              Start your first recording by clicking the &quot;Start Recording&quot; button above,
              <br />
              or press <kbd>⌘ L</kbd> to quick start.
            </p>
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
              {onNewMeeting && (
                <button className="btn btn-secondary" onClick={onNewMeeting}>
                  <PlusIcon size={18} />
                  New Meeting
                </button>
              )}
              <button className="btn btn-primary">
                <MicOffIcon size={18} />
                Start Your First Recording
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="library-container">
      {/* Header with New Meeting button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-lg)'
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-semibold)'
          }}
        >
          Recordings ({recordings.length})
        </h2>
        {onNewMeeting && (
          <button className="btn btn-secondary" onClick={onNewMeeting}>
            <PlusIcon size={16} />
            New Meeting
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Created On</th>
              <th>Duration</th>
              <th>Tags</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recordings.map(
              (recording) => (
                console.log(recording),
                (
                  <tr
                    key={recording.id}
                    onClick={() => handleRowClick(recording)}
                    className="recording-row"
                  >
                    <td>
                      <div className="recording-title">{recording.title}</div>
                    </td>
                    <td className="text-secondary">{formatDate(recording.createdAt)}</td>
                    <td className="text-secondary monospace">{recording.duration}</td>
                    <td>
                      <div className="flex gap-sm">
                        {recording.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="action-bar">
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => handlePlayClick(e, recording)}
                          title="Play recording"
                        >
                          <PlayIcon size={16} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(recording)
                          }}
                          title="Delete recording"
                        >
                          <Trash2Icon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Move to Trash</h3>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to move this recording to the trash? This action cannot be
                undone.
              </p>
              <p>
                <strong>{deleteModal.meeting?.title}</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteModal({ show: false, meeting: null })}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmDelete}
                style={{ background: 'var(--status-error)' }}
              >
                <Trash2Icon size={16} />
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LibraryScreen
