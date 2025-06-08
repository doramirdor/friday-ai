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
}

const BlockNoteEditor: React.FC<BlockNoteEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  height = 200,
  readOnly = false
}) => {
  // Create the BlockNote editor instance
  const editor = useCreateBlockNote()

  // Handle content changes
  const handleChange = React.useCallback(async (): Promise<void> => {
    try {
      // Get the content as HTML
      const htmlContent = await editor.blocksToHTMLLossy(editor.document)
      onChange(htmlContent)
    } catch (error) {
      console.error('Failed to convert blocks to HTML:', error)
    }
  }, [editor, onChange])

  // Set up change listener
  React.useEffect(() => {
    return editor.onEditorContentChange(handleChange)
  }, [editor, handleChange])

  // Update editor content when value prop changes
  React.useEffect(() => {
    const updateContent = async (): Promise<void> => {
      try {
        if (value && value.trim() !== '') {
          // Convert HTML to blocks and replace content
          const blocks = await editor.tryParseHTMLToBlocks(value)
          editor.replaceBlocks(editor.document, blocks)
        } else if (value === '') {
          // Clear the editor
          editor.replaceBlocks(editor.document, [])
        }
      } catch (error) {
        console.warn('Failed to update editor content:', error)
      }
    }

    updateContent()
  }, [value, editor])

  // Set read-only mode
  React.useEffect(() => {
    editor.isEditable = !readOnly
  }, [editor, readOnly])

  return (
    <div
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