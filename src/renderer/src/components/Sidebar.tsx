
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Home, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentView: "dashboard" | "note";
  onViewChange: (view: "dashboard" | "note") => void;
  onNoteSelect: (noteId: string) => void;
  selectedNoteId: string | null;
}

const mockNotes = [
  { id: "1", title: "DSE components and mapping workflow update", timestamp: "Yesterday 11:45 AM" },
  { id: "2", title: "Product roadmap planning", timestamp: "Yesterday 2:30 PM" },
  { id: "3", title: "Weekly standup notes", timestamp: "Today 10:00 AM" },
];

export const Sidebar = ({ currentView, onViewChange, onNoteSelect, selectedNoteId }: SidebarProps) => {
  const [foldersExpanded, setFoldersExpanded] = useState(true);

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold text-sm">F</span>
          </div>
          <span className="font-semibold text-gray-900">Friday</span>
        </div>
        
        <Button 
          onClick={() => {
            const newNoteId = `note-${Date.now()}`;
            onNoteSelect(newNoteId);
            onViewChange("note");
          }}
          className="w-full bg-green-500 hover:bg-green-600 text-white"
        >
          New Note
        </Button>
      </div>

      {/* Navigation */}
      <div className="p-4 flex-1">
        <button
          onClick={() => onViewChange("dashboard")}
          className={cn(
            "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
            currentView === "dashboard" 
              ? "bg-green-50 text-green-700" 
              : "text-gray-700 hover:bg-gray-50"
          )}
        >
          <Home size={18} />
          <span>My notes</span>
        </button>

        {/* Folders Section */}
        <div className="mt-6">
          <button
            onClick={() => setFoldersExpanded(!foldersExpanded)}
            className="w-full flex items-center justify-between p-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <span>Folders</span>
            <ChevronDown size={16} className={cn("transition-transform", !foldersExpanded && "-rotate-90")} />
          </button>
          
          {foldersExpanded && (
            <div className="mt-2 pl-4">
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <List size={32} className="mb-2" />
                <p className="text-sm text-center">Use folders to organize and share your notes.</p>
                <Button variant="outline" size="sm" className="mt-3 text-green-600 border-green-200 hover:bg-green-50">
                  New folder
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Recent Notes */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Recent</h3>
          <div className="space-y-1">
            {mockNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => {
                  onNoteSelect(note.id);
                  onViewChange("note");
                }}
                className={cn(
                  "w-full text-left p-2 rounded-lg transition-colors",
                  selectedNoteId === note.id
                    ? "bg-green-50 text-green-700"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <div className="font-medium text-sm truncate">{note.title}</div>
                <div className="text-xs text-gray-500 mt-1">{note.timestamp}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <span className="text-gray-600 font-medium text-sm">DA</span>
          </div>
          <span className="text-sm font-medium text-gray-700">Dor Amir</span>
        </div>
      </div>
    </div>
  );
};
