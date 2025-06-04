import React, { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

interface QuillEditorProps {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  height?: number
  readOnly?: boolean
}

// Generate unique instance ID for each editor
let editorInstanceCounter = 0

const QuillEditor: React.FC<QuillEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  height = 200,
  readOnly = false
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const isUpdatingRef = useRef(false)
  const instanceIdRef = useRef<string>('')

  // Generate unique instance ID on first render
  useEffect(() => {
    if (!instanceIdRef.current) {
      instanceIdRef.current = `quill-editor-${++editorInstanceCounter}`
    }
  }, [])

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return

    // Clear any existing content first
    editorRef.current.innerHTML = ''

    // Initialize Quill editor
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder,
      readOnly,
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          ['blockquote', 'code-block'],
          ['link'],
          ['clean']
        ]
      }
    })

    quillRef.current = quill

    // Set initial content
    if (value && !isUpdatingRef.current) {
      quill.root.innerHTML = value
    }

    // Handle content changes
    const handleTextChange = (): void => {
      if (!isUpdatingRef.current) {
        const content = quill.root.innerHTML
        onChange(content)
      }
    }

    quill.on('text-change', handleTextChange)

    // Set editor height
    if (editorRef.current) {
      const editor = editorRef.current.querySelector('.ql-editor') as HTMLElement
      if (editor) {
        editor.style.minHeight = `${height}px`
      }
    }

    // Cleanup
    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change', handleTextChange)
        quillRef.current = null
      }
    }
  }, [placeholder, readOnly, height]) // Don't include onChange in deps to avoid re-initialization

  // Update content when value prop changes
  useEffect(() => {
    if (quillRef.current && value !== quillRef.current.root.innerHTML) {
      isUpdatingRef.current = true
      quillRef.current.root.innerHTML = value
      isUpdatingRef.current = false
    }
  }, [value])

  return (
    <div 
      className={`quill-editor-wrapper ${instanceIdRef.current}`}
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        background: 'var(--surface-primary)',
        overflow: 'hidden'
      }}
    >
      <div ref={editorRef} />
      <style dangerouslySetInnerHTML={{
        __html: `
          .quill-editor-wrapper.${instanceIdRef.current} .ql-toolbar {
            border: none;
            border-bottom: 1px solid var(--border-primary);
            background: var(--surface-secondary);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-container {
            border: none;
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-editor {
            color: var(--text-primary);
            font-family: var(--font-family);
            font-size: 14px;
            line-height: 1.5;
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-editor.ql-blank::before {
            color: var(--text-tertiary);
            font-style: normal;
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-toolbar button {
            color: var(--text-secondary);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-toolbar button:hover {
            color: var(--text-primary);
            background: var(--surface-tertiary);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-toolbar button.ql-active {
            color: var(--primary-500);
            background: var(--primary-100);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-picker-label {
            color: var(--text-secondary);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-picker-options {
            background: var(--surface-primary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-md);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-picker-item {
            color: var(--text-primary);
          }
          
          .quill-editor-wrapper.${instanceIdRef.current} .ql-picker-item:hover {
            background: var(--surface-secondary);
          }
        `
      }} />
    </div>
  )
}

export default QuillEditor 