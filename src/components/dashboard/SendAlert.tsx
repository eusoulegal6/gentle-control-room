import { useState } from "react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, User } from "lucide-react";
import { toast } from "sonner";

const SendAlert = () => {
  const { users, sendAlert } = useAdmin();
  const [selectedUser, setSelectedUser] = useState("");
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!selectedUser) {
      toast.error("Please select a user.");
      return;
    }
    if (!message.trim()) {
      toast.error("Please enter a message.");
      return;
    }
    sendAlert(selectedUser, message.trim());
    toast.success(`Alert sent to ${users.find(u => u.id === selectedUser)?.username}`);
    setMessage("");
    setSelectedUser("");
  };

  const selected = users.find(u => u.id === selectedUser);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Send Alert</h1>
        <p className="text-muted-foreground mt-1">Send a message to a specific Windows app user</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Compose Alert</CardTitle>
          <CardDescription>The selected user will receive this alert on their desktop app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Select User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a user..." />
              </SelectTrigger>
              <SelectContent>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {user.username}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
                {selected.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">Sending to: {selected.username}</p>
                <p className="text-xs text-muted-foreground">Status: {selected.status}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Type your alert message here..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{message.length}/500 characters</p>
          </div>

          <Button onClick={handleSend} className="gradient-primary text-primary-foreground w-full sm:w-auto">
            <Send className="w-4 h-4 mr-1" /> Send Alert
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendAlert;
