import { useState } from "react";
import { Upload, X, FileText, Users, Calendar, Target } from "lucide-react";

interface ContextTabProps {
  contextText: string;
  onContextTextChange: (text: string) => void;
  uploadedFiles: string[];
  onFilesChange: (files: string[]) => void;
}

export const ContextTab = ({ contextText, onContextTextChange }: ContextTabProps) => {
  const [contextTemplate, setContextTemplate] = useState("custom");
  const [files, setFiles] = useState<File[]>([]);

  // Debug logging
  console.log('🔍 ContextTab Debug:', {
    contextTextLength: contextText?.length || 0,
    contextText: contextText
  });

  const templates = {
    custom: {
      icon: FileText,
      name: "Custom",
      placeholder: "Enter your custom meeting context..."
    },
    meeting: {
      icon: Users,
      name: "Team Meeting",
      placeholder: "Meeting agenda:\n• Topic 1\n• Topic 2\n• Action items from last meeting\n\nAttendees:\n• [List attendees]\n\nObjectives:\n• [Main goals]"
    },
    interview: {
      icon: Users,
      name: "Interview",
      placeholder: "Interview details:\n• Position: [Job title]\n• Candidate: [Name]\n• Interview type: [Technical/Behavioral/Final]\n\nKey areas to cover:\n• [Skill assessment]\n• [Cultural fit]\n• [Experience review]\n\nQuestions prepared:\n• [List key questions]"
    },
    standup: {
      icon: Calendar,
      name: "Daily Standup",
      placeholder: "Daily standup context:\n• Sprint: [Sprint name/number]\n• Date: [Date]\n\nTeam focus:\n• [Current sprint goals]\n• [Blockers to discuss]\n• [Key deliverables]\n\nAttendees:\n• [Team members]"
    },
    planning: {
      icon: Target,
      name: "Planning Session",
      placeholder: "Planning session context:\n• Project: [Project name]\n• Timeline: [Duration]\n• Scope: [What we're planning]\n\nGoals:\n• [Primary objectives]\n• [Success criteria]\n\nStakeholders:\n• [Key participants]\n\nPrep materials:\n• [Documents/data needed]"
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const totalFiles = files.length + newFiles.length;
      
      if (totalFiles <= 5) {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        alert(`You can only upload up to 5 files. You currently have ${files.length} files.`);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleTemplateChange = (templateKey: string): void => {
    setContextTemplate(templateKey);
    if (templateKey !== "custom" && templates[templateKey as keyof typeof templates]) {
      onContextTextChange(templates[templateKey as keyof typeof templates].placeholder);
    } else if (templateKey === "custom") {
      onContextTextChange("");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const totalFiles = files.length + droppedFiles.length;
    
    if (totalFiles <= 5) {
      setFiles(prev => [...prev, ...droppedFiles]);
    } else {
      alert(`You can only upload up to 5 files. You currently have ${files.length} files.`);
    }
  };

  return (
    <div className="context-tab-content">
      <div>
        <h2>Meeting Context</h2>
        <p className="tab-description">
          Add context to help Friday better understand your meeting and provide more relevant insights.
        </p>
        <div className="divider"></div>
      </div>

      <div className="form-section">
        <div className="form-group">
          <label>Context Template</label>
          <div className="template-grid">
            {Object.entries(templates).map(([key, template]) => {
              const IconComponent = template.icon;
              return (
                <button
                  key={key}
                  type="button"
                  className={`template-option ${contextTemplate === key ? 'active' : ''}`}
                  onClick={() => handleTemplateChange(key)}
                >
                  <IconComponent size={16} />
                  <span>{template.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-group">
          <label>Context Details</label>
          <textarea
            value={contextText}
            onChange={(e) => onContextTextChange(e.target.value)}
            placeholder={templates[contextTemplate as keyof typeof templates]?.placeholder || "Enter meeting context..."}
            className="form-textarea"
            rows={10}
          />
        </div>

        <div className="form-group">
          <label>Supporting Files ({files.length}/5)</label>
          <div 
            className="file-upload-area"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <Upload className="upload-icon" />
            <div className="file-upload-content">
              <p className="file-upload-label">
                <strong>Drop files here</strong> or{" "}
                <label className="file-upload-link">
                  browse
                  <input
                    type="file"
                    multiple
                    className="file-input"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.ppt,.pptx,.xls,.xlsx"
                  />
                </label>
              </p>
              <p className="file-upload-hint">
                PDF, DOC, TXT, images, presentations, spreadsheets (max 5 files)
              </p>
            </div>
          </div>
          
          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, index) => (
                <div key={index} className="file-item">
                  <div className="file-info">
                    <FileText size={16} />
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">
                      ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeFile(index)}
                    title="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="context-tips">
          <h4>💡 Tips for better context:</h4>
          <ul>
            <li>Include meeting objectives and expected outcomes</li>
            <li>List key participants and their roles</li>
            <li>Add relevant background information or previous decisions</li>
            <li>Upload supporting documents, agendas, or reference materials</li>
            <li>Mention any specific topics or questions to focus on</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
