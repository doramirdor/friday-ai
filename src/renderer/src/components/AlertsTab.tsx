import React, { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";

export const AlertsTab = (): React.ReactElement => {
  const [alertKeyword, setAlertKeyword] = useState("");
  const [similarityThreshold, setSimilarityThreshold] = useState(0.60);
  const [alertKeywords, setAlertKeywords] = useState<string[]>([]);

  const addAlert = (): void => {
    if (alertKeyword.trim()) {
      setAlertKeywords([...alertKeywords, alertKeyword]);
      setAlertKeyword("");
    }
  };

  const removeAlert = (index: number): void => {
    setAlertKeywords(alertKeywords.filter((_, i) => i !== index));
  };

  return (
    <div className="alerts-tab-content">
      <div>
        <h2>Smart Alerts</h2>
        <p className="tab-description">
          Monitor your transcript for important keywords using AI-powered semantic matching. Get 
          notified when topics of interest are mentioned, even if the exact words aren&apos;t used.
        </p>
      </div>

      <div className="alerts-form">
        <div className="form-group">
          <label>Add Alert Keyword</label>
          <div className="keyword-input-group">
            <input
              value={alertKeyword}
              onChange={(e) => setAlertKeyword(e.target.value)}
              placeholder="e.g., budget, deadline, customer complaint..."
              className="form-input"
              onKeyPress={(e) => e.key === 'Enter' && addAlert()}
            />
            <button onClick={addAlert} className="add-alert-btn">
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>
            Similarity Threshold: {similarityThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
            className="similarity-slider"
          />
          <div className="slider-labels">
            <span>More sensitive</span>
            <span>Less sensitive</span>
          </div>
        </div>

        <div className="form-group">
          <h3>Alert Keywords ({alertKeywords.length})</h3>
          {alertKeywords.length === 0 ? (
            <div className="empty-alerts">
              <AlertTriangle size={48} />
              <p className="empty-title">No alert keywords yet</p>
              <p className="empty-description">
                Add keywords above to start monitoring your transcripts for important topics.
              </p>
            </div>
          ) : (
            <div className="keywords-list">
              {alertKeywords.map((keyword, index) => (
                <div key={index} className="keyword-item">
                  <span>{keyword}</span>
                  <button
                    onClick={() => removeAlert(index)}
                    className="remove-btn"
                    title="Remove keyword"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="how-it-works">
          <p>
            <strong>How it works:</strong> Uses AI semantic matching to detect when topics similar to your keywords are mentioned in 
            the transcript. Higher thresholds = more exact matches, lower thresholds = broader topic detection.
          </p>
        </div>
      </div>
    </div>
  );
};
