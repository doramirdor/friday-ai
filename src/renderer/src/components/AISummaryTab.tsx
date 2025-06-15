import React from "react";
import { Sparkles, RefreshCw, Zap } from "lucide-react";

export const AISummaryTab = (): React.ReactElement => {
  // Initial empty state - in real implementation this would come from props or context
  const summary = {
    keyPoints: [],
    decisions: [],
    nextSteps: []
  };

  // Check if any summary content exists
  const hasSummaryContent = summary.keyPoints.length > 0 || 
                           summary.decisions.length > 0 || 
                           summary.nextSteps.length > 0;

  return (
    <div className="ai-summary-tab-content">
      <div className="summary-header">
        <div>
          <h2>AI Summary</h2>
          <p className="tab-description">AI-generated insights from your meeting</p>
        </div>
        <button className="regenerate-btn">
          {hasSummaryContent ? (
            <>
              <RefreshCw size={16} />
              Regenerate
            </>
          ) : (
            <>
              <Zap size={16} />
              Generate
            </>
          )}
        </button>
      </div>

      {hasSummaryContent ? (
        <div className="summary-sections">
          <div className="summary-card">
            <h3 className="section-title">
              <Sparkles size={16} className="section-icon blue" />
              Key Points
            </h3>
            <ul className="summary-list">
              {summary.keyPoints.map((point, index) => (
                <li key={index} className="summary-item">
                  <span className="bullet-dot blue"></span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="summary-card">
            <h3 className="section-title">
              <span className="section-icon-square green"></span>
              Decisions Made
            </h3>
            <ul className="summary-list">
              {summary.decisions.map((decision, index) => (
                <li key={index} className="summary-item">
                  <span className="bullet-dot green"></span>
                  {decision}
                </li>
              ))}
            </ul>
          </div>

          <div className="summary-card">
            <h3 className="section-title">
              <span className="section-icon-square orange"></span>
              Next Steps
            </h3>
            <ul className="summary-list">
              {summary.nextSteps.map((step, index) => (
                <li key={index} className="summary-item">
                  <span className="bullet-dot orange"></span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="empty-summary">
          <div className="empty-summary-content">
            <Sparkles size={48} className="empty-icon" />
            <h3 className="empty-title">No AI Summary Yet</h3>
            <p className="empty-description">
              Generate an AI summary to get key points, decisions, and next steps from your meeting.
            </p>
            <button className="generate-summary-btn">
              <Zap size={16} />
              Generate AI Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
