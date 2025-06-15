import React from 'react';

interface TranscriptPanelProps {
  transcriptText?: string;
  isVisible?: boolean;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ 
  transcriptText = '', 
  isVisible = true 
}) => {
  if (!isVisible) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-3">Live Transcript</h3>
      {transcriptText ? (
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {transcriptText}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic">
          No transcript available yet...
        </div>
      )}
    </div>
  );
}; 