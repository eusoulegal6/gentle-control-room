import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X, User, FolderOpen, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GroupInfo {
  id: string;
  name: string;
  memberIds: string[];
}

type Suggestion = { type: "user"; id: string; label: string; sub?: string } | { type: "group"; id: string; label: string; count: number };

const SendAlert = () => {
  const { users, sendAlert } = useAdmin();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeUsers = users.filter((u) => u.status === "ACTIVE");

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    const { data: groupRows } = await supabase.from("user_groups").select("id, name").order("name");
    const { data: memberRows } = await supabase.from("user_group_members").select("group_id, desktop_user_id");
    const memberMap = new Map<string, string[]>();
    for (const m of memberRows || []) {
      const arr = memberMap.get(m.group_id) || [];
      arr.push(m.desktop_user_id);
      memberMap.set(m.group_id, arr);
    }
    setGroups((groupRows || []).map((g) => ({ id: g.id, name: g.name, memberIds: memberMap.get(g.id) || [] })));
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build suggestions
  const lowerQ = query.toLowerCase();
  const activeIds = new Set(activeUsers.map((u) => u.id));

  const groupSuggestions: Suggestion[] = groups
    .filter((g) => !selectedGroups.has(g.id) && g.name.toLowerCase().includes(lowerQ))
    .map((g) => ({ type: "group", id: g.id, label: g.name, count: g.memberIds.filter((id) => activeIds.has(id)).length }));

  const userSuggestions: Suggestion[] = activeUsers
    .filter((u) => !selectedUsers.has(u.id))
    .filter((u) => u.username.toLowerCase().includes(lowerQ) || (u.displayName && u.displayName.toLowerCase().includes(lowerQ)))
    .slice(0, 20)
    .map((u) => ({ type: "user", id: u.id, label: u.displayName || u.username, sub: u.displayName ? u.username : undefined }));

  const suggestions: Suggestion[] = [...groupSuggestions, ...userSuggestions];

  // Actions
  const addUser = (id: string) => {
    setSelectedUsers((prev) => new Set(prev).add(id));
    setQuery("");
    inputRef.current?.focus();
  };

  const removeUser = (id: string) => {
    setSelectedUsers((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const addGroup = (group: GroupInfo) => {
    setSelectedGroups((prev) => new Set(prev).add(group.id));
    const next = new Set(selectedUsers);
    for (const memberId of group.memberIds) {
      if (activeIds.has(memberId)) next.add(memberId);
    }
    setSelectedUsers(next);
    setQuery("");
    inputRef.current?.focus();
  };

  const removeGroup = (group: GroupInfo) => {
    const nextGroups = new Set(selectedGroups);
    nextGroups.delete(group.id);
    // Remove members only in this group (not in other selected groups)
    const otherMembers = new Set<string>();
    for (const gId of nextGroups) {
      groups.find((g) => g.id === gId)?.memberIds.forEach((id) => otherMembers.add(id));
    }
    const nextUsers = new Set(selectedUsers);
    for (const memberId of group.memberIds) {
      if (!otherMembers.has(memberId)) nextUsers.delete(memberId);
    }
    setSelectedGroups(nextGroups);
    setSelectedUsers(nextUsers);
  };

  const selectAll = () => {
    setSelectedUsers(new Set(activeUsers.map((u) => u.id)));
    setQuery("");
  };

  // Handle backspace on empty input to remove last chip
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && query === "") {
      // Remove last selected group first, then last user
      if (selectedGroups.size > 0) {
        const lastGroupId = Array.from(selectedGroups).pop()!;
        const group = groups.find((g) => g.id === lastGroupId);
        if (group) removeGroup(group);
      } else if (selectedUsers.size > 0) {
        const lastUserId = Array.from(selectedUsers).pop()!;
        removeUser(lastUserId);
      }
    }
  };

  const handleSend = async () => {
    if (selectedUsers.size === 0) { toast.error("Please select at least one recipient."); return; }
    if (!message.trim()) { toast.error("Please enter a message."); return; }
    setIsSending(true);
    try {
      const ids = Array.from(selectedUsers);
      await sendAlert(ids, message.trim(), title.trim() || undefined);
      toast.success(`Alert sent to ${ids.length} user${ids.length > 1 ? "s" : ""}.`);
      setMessage(""); setTitle(""); setSelectedUsers(new Set()); setSelectedGroups(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send alert.");
    } finally { setIsSending(false); }
  };

  // Chips for selected groups and individual users (not part of any selected group)
  const groupChips = groups.filter((g) => selectedGroups.has(g.id));
  const groupMemberIds = new Set<string>();
  groupChips.forEach((g) => g.memberIds.forEach((id) => groupMemberIds.add(id)));
  const individualUserIds = Array.from(selectedUsers).filter((id) => !groupMemberIds.has(id));

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
          {/* Chip input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>To</Label>
              {selectedUsers.size > 0 && (
                <span className="text-xs text-muted-foreground">{selectedUsers.size} recipient{selectedUsers.size !== 1 ? "s" : ""}</span>
              )}
            </div>
            <div ref={containerRef} className="relative">
              <div
                className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-md border border-input bg-background px-2 py-1.5 cursor-text transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background"
                onClick={() => { inputRef.current?.focus(); setShowDropdown(true); }}
              >
                {/* Group chips */}
                {groupChips.map((g) => (
                  <Badge key={`g-${g.id}`} variant="secondary" className="gap-1 pl-1.5 pr-1 py-0.5 text-xs font-medium shrink-0">
                    <FolderOpen className="w-3 h-3" />
                    {g.name}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeGroup(g); }} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {/* Individual user chips */}
                {individualUserIds.map((id) => {
                  const u = activeUsers.find((u) => u.id === id);
                  if (!u) return null;
                  return (
                    <Badge key={`u-${id}`} variant="outline" className="gap-1 pl-1.5 pr-1 py-0.5 text-xs font-medium shrink-0">
                      <User className="w-3 h-3" />
                      {u.displayName || u.username}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeUser(id); }} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
                {/* Search input */}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedUsers.size === 0 ? "Search users or groups…" : ""}
                  className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-[240px] overflow-y-auto">
                    {/* Select All */}
                    {!query && activeUsers.length > 0 && selectedUsers.size < activeUsers.length && (
                      <button
                        type="button"
                        onClick={selectAll}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-primary font-medium"
                      >
                        Select all ({activeUsers.length})
                      </button>
                    )}
                    {suggestions.length === 0 && (
                      <p className="text-sm text-muted-foreground p-3 text-center">No matches found</p>
                    )}
                    {/* Group suggestions */}
                    {groupSuggestions.length > 0 && (
                      <div>
                        <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Groups</p>
                        {groupSuggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { const g = groups.find((g) => g.id === s.id); if (g) addGroup(g); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{s.label}</span>
                            <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">{s.type === "group" ? s.count : ""}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* User suggestions */}
                    {userSuggestions.length > 0 && (
                      <div>
                        {groupSuggestions.length > 0 && <div className="border-t border-border" />}
                        <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Users</p>
                        {userSuggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => addUser(s.id)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{s.label}</span>
                            {s.type === "user" && s.sub && <span className="text-muted-foreground text-xs">({s.sub})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <Input placeholder="Alert title..." value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea placeholder="Type your alert message here..." value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            <p className="text-xs text-muted-foreground">{message.length}/2000 characters</p>
          </div>

          <Button
            onClick={() => void handleSend()}
            disabled={isSending || selectedUsers.size === 0}
            className="gradient-primary text-primary-foreground w-full sm:w-auto"
          >
            <Send className="w-4 h-4 mr-1" />
            {isSending ? "Sending..." : selectedUsers.size > 1 ? `Send Alert to ${selectedUsers.size} Users` : "Send Alert"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SendAlert;
