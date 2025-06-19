import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Mail, MessageSquare, CheckSquare, FileText, Sparkles, Send } from "lucide-react";

interface AIAssistantProps {
  currentView: "dashboard" | "note";
  selectedNoteId: string | null;
}

export const AIAssistant = ({ currentView }: AIAssistantProps) => {
  const [askQuestion, setAskQuestion] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (currentView !== "note") {
    return null;
  }

  if (isCollapsed) {
    return (
      <div className="fixed bottom-6 left-6 z-40">
        <Button
          onClick={() => setIsCollapsed(false)}
          className="rounded-full w-12 h-12 bg-blue-500 hover:bg-blue-600 shadow-lg text-white"
        >
          ⭐ Ask Friday
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white text-xs">⭐</span>
            </div>
            <h3 className="font-semibold text-gray-900">Ask Friday</h3>
          </div>
          <Button
            onClick={() => setIsCollapsed(true)}
            className="p-1 h-6 w-6 rounded hover:bg-gray-100"
            variant="ghost"
            size="sm"
          >
            <X size={12} className="text-gray-500" />
          </Button>
        </div>
      </div>

      {/* Action Cards */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        <Card className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center">
              <Mail size={16} className="text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">Email Follow-up</h4>
              <p className="text-xs text-gray-500 mt-1">Draft a follow-up email</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gray-50 rounded flex items-center justify-center">
              <MessageSquare size={16} className="text-gray-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">Slack Summary</h4>
              <p className="text-xs text-gray-500 mt-1">Create a Slack update</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-orange-50 rounded flex items-center justify-center">
              <span className="text-orange-600 text-sm">❓</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">What Did I Miss?</h4>
              <p className="text-xs text-gray-500 mt-1">Catch up on key points</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-50 rounded flex items-center justify-center">
              <CheckSquare size={16} className="text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">Generate Action Items</h4>
              <p className="text-xs text-gray-500 mt-1">Extract next steps</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-50 rounded flex items-center justify-center">
              <FileText size={16} className="text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">Generate Summary</h4>
              <p className="text-xs text-gray-500 mt-1">Summarize the meeting</p>
            </div>
          </div>
        </Card>

        {/* Centered Message */}
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Sparkles size={20} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed px-2">
            Choose an action above to get started, or ask me anything about your meeting!
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <Input
            placeholder="Ask Friday anything about your meeting..."
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            className="flex-1 bg-gray-50 border-gray-200 rounded-lg text-sm"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && askQuestion.trim()) {
                console.log("Asking:", askQuestion);
                setAskQuestion("");
              }
            }}
          />
          <Button 
            size="sm" 
            className="bg-blue-500 hover:bg-blue-600 rounded-lg px-3"
            disabled={!askQuestion.trim()}
            onClick={() => {
              console.log("Asking:", askQuestion);
              setAskQuestion("");
            }}
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};
