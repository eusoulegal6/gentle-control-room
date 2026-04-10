import { useState } from "react";
import { Send, User, CheckSquare, Square, Users } from "lucide-react";
import { toast } from "sonner";

import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

const SendAlert = () => {
  const { users, sendAlert } = useAdmin();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const activeUsers = users.filter((user) => user.status === "ACTIVE");
  const allSelected = activeUsers.length > 0 && selectedUsers.size === activeUsers.length;
  const someSelected = selectedUsers.size > 0 && selectedUsers.size < activeUsers.length;

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(activeUsers.map((u) => u.id)));
    }
  };

  const handleSend = async () => {
    if (selectedUsers.size === 0) {
      toast.error("Please select at least one user.");
      return;
    }

    if (!message.trim()) {
      toast.error("Please enter a message.");
      return;
    }

    setIsSending(true);

    try {
      const ids = Array.from(selectedUsers);
      await sendAlert(ids, message.trim(), title.trim() || undefined);
      const count = ids.length;
      toast.success(`Alert sent to ${count} user${count > 1 ? "s" : ""}.`);
      setMessage("");
      setTitle("");
      setSelectedUsers(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send alert.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Send Alert</h1>
        <p className="text-muted-foreground mt-1">Send a message to one or more Windows app users</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Compose Alert</CardTitle>
          <CardDescription>Selected users will receive this alert on their desktop app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* User selection */}
          <div className="space-y-2">
            <Label>Select Recipients</Label>
            {activeUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active users available.</p>
            ) : (
              <div className="border rounded-lg">
                {/* Select all header */}
                <button
                  type="button"
                  onClick={toggleAll}
                  className="flex items-center gap-3 w-full px-3 py-2.5 border-b hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    className="pointer-events-none"
                  />
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Select All ({activeUsers.length} user{activeUsers.length !== 1 ? "s" : ""})
                  </span>
                </button>

                {/* User list */}
                <ScrollArea className="max-h-[200px]">
                  {activeUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user.id)}
                      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedUsers.has(user.id)}
                        onCheckedChange={() => toggleUser(user.id)}
                        className="pointer-events-none"
                      />
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">
                        {user.displayName ? `${user.displayName} (${user.username})` : user.username}
                      </span>
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}
            {selectedUsers.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedUsers.size} user{selectedUsers.size !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {/* Title (optional) */}
          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <Input
              placeholder="Alert title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Type your alert message here..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{message.length}/2000 characters</p>
          </div>

          <Button
            onClick={() => void handleSend()}
            disabled={isSending || activeUsers.length === 0 || selectedUsers.size === 0}
            className="gradient-primary text-primary-foreground w-full sm:w-auto"
          >
            <Send className="w-4 h-4 mr-1" />
            {isSending
              ? "Sending..."
              : selectedUsers.size > 1
                ? `Send Alert to ${selectedUsers.size} Users`
                : "Send Alert"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendAlert;
