import React from "react";
import { RefreshCw, Zap } from "lucide-react";
import BlockNoteEditor from "./BlockNoteEditor";

interface AISummaryTabProps {
  summary: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onSummaryChange: (summary: string) => void;
}

export const AISummaryTab = ({ 
  summary, 
  isGenerating, 
  onGenerate,
  onSummaryChange
}: AISummaryTabProps): React.ReactElement => {
  // Check if summary content exists
  const hasSummaryContent = summary && summary.trim().length > 0;

  return (
    <div className="ai-summary-tab-content">
      <div className="summary-header">
        <button 
          className="regenerate-btn"
          onClick={onGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Generating...
            </>
          ) : hasSummaryContent ? (
            <>
              <RefreshCw size={16} />
              Regenerate
            </>
          ) : (
            <>
              <Zap size={16} />
              Generate Summary
            </>
          )}
        </button>
      </div>

      {hasSummaryContent ? (
        <div className="summary-sections">
          <div className="summary-card">
            <BlockNoteEditor
              value={summary}
              onChange={onSummaryChange}
              placeholder="AI-generated summary will appear here..."
              readOnly={false}
              height={400}
            />
          </div>
        </div>
      ) : (
        <div className="empty-summary">
          <div className="empty-summary-content">
            <Zap size={48} className="empty-icon" />
            <h3 className="empty-title">No AI Summary Yet</h3>
            <p className="empty-description">
              Generate an AI summary to get key points, decisions, and next steps from your meeting.
            </p>
            <button 
              className="generate-summary-btn"
              onClick={onGenerate}
              disabled={isGenerating}
            >
              <Zap size={16} />
              {isGenerating ? 'Generating...' : 'Generate AI Summary'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
