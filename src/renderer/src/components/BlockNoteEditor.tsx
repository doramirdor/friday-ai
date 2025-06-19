import React from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

interface BlockNoteEditorProps {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  height?: number
  readOnly?: boolean
  onSave?: () => void
  autoSave?: boolean
  autoSaveDelay?: number
}

const BlockNoteEditor: React.FC<BlockNoteEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  height = 200,
  readOnly = false,
  onSave,
  autoSave = true,
  autoSaveDelay = 2000
}) => {
  // Create the BlockNote editor instance
  const editor = useCreateBlockNote()
  
  // Track if we're updating from external value to prevent loops
  const isUpdatingFromValue = React.useRef(false)
  const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const lastSavedContentRef = React.useRef<string>('')
  const editorRef = React.useRef<HTMLDivElement>(null)

  // Handle content changes
  const handleChange = React.useCallback(async (): Promise<void> => {
    // Don't trigger onChange if we're updating from external value
    if (isUpdatingFromValue.current) {
      return
    }
    
    try {
      // Get the content as HTML
      let htmlContent = await editor.blocksToHTMLLossy(editor.document)
      
      // Replace trailing spaces with non-breaking spaces to preserve them
      // This regex finds spaces at the end of text content within HTML tags
      htmlContent = htmlContent.replace(/(\S) +(<\/[^>]+>)/g, (match, beforeSpace, closeTag) => {
        const spaceMatch = match.match(/ +/)
        if (!spaceMatch) return match
        const spaces = spaceMatch[0]
        const nbspSpaces = spaces.replace(/ /g, '&nbsp;')
        return beforeSpace + nbspSpaces + closeTag
      })
      
      onChange(htmlContent)

      // Auto-save functionality
      if (autoSave && onSave && htmlContent !== lastSavedContentRef.current) {
        // Clear existing timeout
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
        }
        
        // Set new timeout for auto-save
        autoSaveTimeoutRef.current = setTimeout(() => {
          onSave()
          lastSavedContentRef.current = htmlContent
        }, autoSaveDelay)
      }
    } catch (error) {
      console.error('Failed to convert blocks to HTML:', error)
    }
  }, [editor, onChange, onSave, autoSave, autoSaveDelay])

  // Handle keyboard shortcuts
  const handleKeyDown = React.useCallback((event: Event): void => {
    const keyboardEvent = event as KeyboardEvent
    // Check for Cmd+S (Mac) or Ctrl+S (Windows/Linux)
    if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key === 's') {
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
      
      if (onSave) {
        // Clear auto-save timeout since we're manually saving
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
          autoSaveTimeoutRef.current = null
        }
        
        onSave()
        
        // Update last saved content
        const saveCurrentContent = async (): Promise<void> => {
          try {
            const htmlContent = await editor.blocksToHTMLLossy(editor.document)
            lastSavedContentRef.current = htmlContent
          } catch (error) {
            console.error('Failed to update saved content reference:', error)
          }
        }
        saveCurrentContent()
      }
    }
  }, [editor, onSave])

  // Handle blur events for auto-save
  const handleBlur = React.useCallback((): void => {
    if (autoSave && onSave) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
      
      // Save immediately on blur
      onSave()
      
      // Update last saved content
      const saveCurrentContent = async (): Promise<void> => {
        try {
          const htmlContent = await editor.blocksToHTMLLossy(editor.document)
          lastSavedContentRef.current = htmlContent
        } catch (error) {
          console.error('Failed to update saved content reference:', error)
        }
      }
      saveCurrentContent()
    }
  }, [editor, onSave, autoSave])

  // Set up change listener
  React.useEffect(() => {
    return editor.onEditorContentChange(handleChange)
  }, [editor, handleChange])

  // Set up keyboard event listeners
  React.useEffect(() => {
    const editorElement = editorRef.current?.querySelector('.ProseMirror')
    if (editorElement) {
      editorElement.addEventListener('keydown', handleKeyDown)
      editorElement.addEventListener('blur', handleBlur)
      
      return () => {
        editorElement.removeEventListener('keydown', handleKeyDown)
        editorElement.removeEventListener('blur', handleBlur)
      }
    }
  }, [handleKeyDown, handleBlur])

  // Update editor content when value prop changes
  React.useEffect(() => {
    const updateContent = async (): Promise<void> => {
      try {
        // Get current content to compare
        const currentContent = await editor.blocksToHTMLLossy(editor.document)
        
        // Only update if the value is actually different
        if (currentContent === value) {
          return
        }
        
        isUpdatingFromValue.current = true
        
        if (value !== '') {
          // Convert HTML to blocks and replace content
          const blocks = await editor.tryParseHTMLToBlocks(value)
          editor.replaceBlocks(editor.document, blocks)
        } else if (value === '') {
          // Clear the editor
          editor.replaceBlocks(editor.document, [])
        }
        
        isUpdatingFromValue.current = false
        lastSavedContentRef.current = value
      } catch (error) {
        console.warn('Failed to update editor content:', error)
        isUpdatingFromValue.current = false
      }
    }

    updateContent()
  }, [value, editor])

  // Set read-only mode
  React.useEffect(() => {
    editor.isEditable = !readOnly
  }, [editor, readOnly])

  // Cleanup auto-save timeout on unmount
  React.useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={editorRef}
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        background: 'var(--surface-primary)',
        overflow: 'hidden',
        minHeight: `${height}px`
      }}
    >
      <BlockNoteView
        editor={editor}
        theme="light"
        style={{
          minHeight: `${height}px`
        }}
      />
      <style dangerouslySetInnerHTML={{
        __html: `
          .bn-container {
            min-height: ${height}px;
          }
          
          .bn-editor {
            color: var(--text-primary);
            font-family: var(--font-family);
            font-size: 14px;
            line-height: 1.5;
          }
          
          .bn-editor [data-node-type="paragraph"][data-is-empty="true"]::before {
            content: "${placeholder}";
            color: var(--text-tertiary);
            opacity: 0.6;
            pointer-events: none;
          }
          
          .bn-side-menu {
            color: var(--text-secondary);
          }
          
          .bn-formatting-toolbar {
            background: var(--surface-secondary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-md);
          }
          
          .bn-formatting-toolbar button {
            color: var(--text-secondary);
          }
          
          .bn-formatting-toolbar button:hover {
            color: var(--text-primary);
            background: var(--surface-tertiary);
          }
          
          .bn-suggestion-menu {
            background: var(--surface-primary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-md);
          }
          
          .bn-suggestion-menu-item {
            color: var(--text-primary);
          }
          
          .bn-suggestion-menu-item:hover {
            background: var(--surface-secondary);
          }
        `
      }} />
    </div>
  )
}

export default BlockNoteEditor 