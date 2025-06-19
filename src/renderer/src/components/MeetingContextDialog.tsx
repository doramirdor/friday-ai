import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MeetingContextDialogProps {
  noteId: string | null;
}

export const MeetingContextDialog = ({ }: MeetingContextDialogProps) => {
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [agenda, setAgenda] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSave = () => {
    console.log("Saving meeting context:", {
      meetingTitle,
      meetingDate,
      attendees,
      agenda,
      files
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-gray-600 border-gray-200 hover:bg-gray-50">
          📋 Add meeting context
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Meeting Context</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Meeting Title</label>
            <Input
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Enter meeting title..."
              className="rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Date & Time</label>
            <Input
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Attendees</label>
            <Input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Enter attendee names..."
              className="rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Agenda / Notes</label>
            <Textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Add agenda items, objectives, or additional context..."
              className="rounded-lg min-h-[100px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Attachments</label>
            <Input
              type="file"
              multiple
              onChange={handleFileChange}
              className="rounded-lg"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, index) => (
                  <div key={index} className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                    📎 {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1 bg-green-500 hover:bg-green-600">
              Save Context
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
