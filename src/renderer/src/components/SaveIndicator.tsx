import React from 'react'
import { CheckIcon, SaveIcon } from 'lucide-react'

interface SaveIndicatorProps {
  isSaving: boolean
  hasUnsavedChanges: boolean
  lastSaved?: Date
  showKeyboardHint?: boolean
}

const SaveIndicator: React.FC<SaveIndicatorProps> = ({
  isSaving,
  hasUnsavedChanges,
  lastSaved,
  showKeyboardHint = true
}) => {
  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'just now'
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes}m ago`
    } else {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours}h ago`
    }
  }

  if (isSaving) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        padding: '4px 8px',
        borderRadius: '4px',
        background: 'var(--surface-secondary)'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          border: '2px solid var(--border-primary)',
          borderTop: '2px solid var(--interactive-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span>Saving...</span>
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `
        }} />
      </div>
    )
  }

  if (hasUnsavedChanges) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: 'var(--status-warning)',
        padding: '4px 8px',
        borderRadius: '4px',
        background: 'var(--surface-secondary)'
      }}>
        <SaveIcon size={12} />
        <span>Unsaved changes</span>
        {showKeyboardHint && (
          <span style={{
            marginLeft: '4px',
            fontSize: '11px',
            opacity: 0.7,
            background: 'var(--surface-tertiary)',
            padding: '2px 4px',
            borderRadius: '3px',
            fontFamily: 'monospace'
          }}>
            {navigator.platform.toLowerCase().includes('mac') ? '⌘S' : 'Ctrl+S'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      color: 'var(--status-success)',
      padding: '4px 8px',
      borderRadius: '4px',
      background: 'var(--surface-secondary)'
    }}>
      <CheckIcon size={12} />
      <span>
        {lastSaved ? `Saved ${formatTimeAgo(lastSaved)}` : 'All changes saved'}
      </span>
    </div>
  )
}

export default SaveIndicator 