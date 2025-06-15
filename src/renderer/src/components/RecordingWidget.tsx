
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { TranscriptPanel } from "./TranscriptPanel";
import { Mic, MicOff, FileText, Bot } from "lucide-react";

interface RecordingWidgetProps {
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  onShowTranscript: () => void;
}

export const RecordingWidget = ({ isRecording, onRecordingChange, onShowTranscript }: RecordingWidgetProps) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false);

  const handleRecordingToggle = () => {
    if (!isRecording) {
      onRecordingChange(true);
      const interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      setTimeout(() => {
        clearInterval(interval);
        onRecordingChange(false);
        setRecordingTime(0);
      }, 10000);
    } else {
      onRecordingChange(false);
      setRecordingTime(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-6 right-1/2 transform translate-x-1/2 z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-full shadow-xl px-3 py-2">
        <div className="flex items-center gap-3">
          {/* Transcript Button with Drawer */}
          <Drawer open={showTranscriptDrawer} onOpenChange={setShowTranscriptDrawer}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full p-2 h-9 w-9 bg-gray-50 hover:bg-gray-100 transition-all duration-200 transform hover:scale-105"
                title="View Transcript"
              >
                <FileText size={16} className="text-gray-600" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh] rounded-t-2xl">
              <TranscriptPanel onClose={() => setShowTranscriptDrawer(false)} />
            </DrawerContent>
          </Drawer>

          {/* AI Assistant Button */}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full p-2 h-9 w-9 bg-blue-50 hover:bg-blue-100 transition-all duration-200 transform hover:scale-105"
            title="AI Assistant"
          >
            <Bot size={16} className="text-blue-600" />
          </Button>

          {/* Recording Time */}
          {isRecording && (
            <div className="flex items-center gap-2 px-2 animate-fade-in">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-mono text-gray-700">{formatTime(recordingTime)}</span>
            </div>
          )}

          {/* Main Record Button */}
          <Button
            onClick={handleRecordingToggle}
            className={`rounded-full h-11 w-11 p-0 transition-all duration-300 shadow-lg transform hover:scale-110 ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                : "bg-green-500 hover:bg-green-600"
            }`}
            title={isRecording ? "Stop Recording" : "Start Recording"}
          >
            {isRecording ? (
              <MicOff size={18} className="text-white" />
            ) : (
              <Mic size={18} className="text-white" />
            )}
          </Button>

          {/* Recording Duration Text */}
          {isRecording && (
            <span className="text-xs text-gray-500 whitespace-nowrap animate-fade-in">
              11 Remaining
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
