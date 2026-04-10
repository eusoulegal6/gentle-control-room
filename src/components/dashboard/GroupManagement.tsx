import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, UserPlus, UserMinus, FolderOpen } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  memberIds: string[];
}

const GroupManagement = () => {
  const { users } = useAdmin();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [showCreateEdit, setShowCreateEdit] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Members dialog
  const [managingGroup, setManagingGroup] = useState<UserGroup | null>(null);
  const [memberSelection, setMemberSelection] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [savingMembers, setSavingMembers] = useState(false);

  // Delete
  const [deletingGroup, setDeletingGroup] = useState<UserGroup | null>(null);

  const fetchGroups = useCallback(async () => {
    const { data: groupRows, error: gErr } = await supabase
      .from("user_groups")
      .select("id, name, description, created_at")
      .order("name");

    if (gErr) {
      console.error(gErr);
      return;
    }

    const { data: memberRows, error: mErr } = await supabase
      .from("user_group_members")
      .select("group_id, desktop_user_id");

    if (mErr) {
      console.error(mErr);
      return;
    }

    const memberMap = new Map<string, string[]>();
    for (const m of memberRows || []) {
      const arr = memberMap.get(m.group_id) || [];
      arr.push(m.desktop_user_id);
      memberMap.set(m.group_id, arr);
    }

    setGroups(
      (groupRows || []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        created_at: g.created_at,
        memberIds: memberMap.get(g.id) || [],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const openCreate = () => {
    setEditingGroup(null);
    setName("");
    setDescription("");
    setShowCreateEdit(true);
  };

  const openEdit = (group: UserGroup) => {
    setEditingGroup(group);
    setName(group.name);
    setDescription(group.description || "");
    setShowCreateEdit(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Group name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editingGroup) {
        const { error } = await supabase
          .from("user_groups")
          .update({ name: name.trim(), description: description.trim() || null })
          .eq("id", editingGroup.id);
        if (error) throw error;
        toast.success("Group updated.");
      } else {
        const { error } = await supabase
          .from("user_groups")
          .insert({ name: name.trim(), description: description.trim() || null });
        if (error) throw error;
        toast.success("Group created.");
      }
      setShowCreateEdit(false);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save group.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    try {
      const { error } = await supabase.from("user_groups").delete().eq("id", deletingGroup.id);
      if (error) throw error;
      toast.success(`Group "${deletingGroup.name}" deleted.`);
      setDeletingGroup(null);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete group.");
    }
  };

  const openMembers = (group: UserGroup) => {
    setManagingGroup(group);
    setMemberSelection(new Set(group.memberIds));
    setMemberSearch("");
  };

  const handleSaveMembers = async () => {
    if (!managingGroup) return;
    setSavingMembers(true);
    try {
      // Remove all existing, then insert new
      const { error: delErr } = await supabase
        .from("user_group_members")
        .delete()
        .eq("group_id", managingGroup.id);
      if (delErr) throw delErr;

      if (memberSelection.size > 0) {
        const rows = Array.from(memberSelection).map((uid) => ({
          group_id: managingGroup.id,
          desktop_user_id: uid,
        }));
        const { error: insErr } = await supabase.from("user_group_members").insert(rows);
        if (insErr) throw insErr;
      }

      toast.success("Members updated.");
      setManagingGroup(null);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update members.");
    } finally {
      setSavingMembers(false);
    }
  };

  const toggleMember = (id: string) => {
    setMemberSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeUsers = users.filter((u) => u.status === "ACTIVE");
  const filteredUsers = memberSearch
    ? activeUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
          (u.displayName && u.displayName.toLowerCase().includes(memberSearch.toLowerCase()))
      )
    : activeUsers;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-muted-foreground mt-1">Organize staff into departments or teams for bulk alerts</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-1" /> New Group
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : groups.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No groups yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.id} className="shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{group.name}</CardTitle>
                    {group.description && (
                      <CardDescription className="mt-0.5">{group.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    <Users className="w-3 h-3 mr-1" />
                    {group.memberIds.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openMembers(group)}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Members
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(group)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeletingGroup(group)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateEdit} onOpenChange={setShowCreateEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create Group"}</DialogTitle>
            <DialogDescription>
              {editingGroup ? "Update the group details." : "Create a new group to organize staff."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Security Team" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateEdit(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? "Saving…" : editingGroup ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={!!managingGroup} onOpenChange={(open) => !open && setManagingGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Members — {managingGroup?.name}</DialogTitle>
            <DialogDescription>Select which staff belong to this group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search users…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />
          <ScrollArea className="max-h-[300px] border rounded-lg">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No users found.</p>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleMember(user.id)}
                  className="flex items-center gap-3 w-full px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox checked={memberSelection.has(user.id)} className="pointer-events-none" />
                  <span className="text-sm">
                    {user.displayName ? `${user.displayName} (${user.username})` : user.username}
                  </span>
                </button>
              ))
            )}
          </ScrollArea>
          <p className="text-xs text-muted-foreground">{memberSelection.size} member{memberSelection.size !== 1 ? "s" : ""} selected</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingGroup(null)}>Cancel</Button>
            <Button onClick={handleSaveMembers} disabled={savingMembers} className="gradient-primary text-primary-foreground">
              {savingMembers ? "Saving…" : "Save Members"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingGroup?.name}"? This won't affect the users in it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GroupManagement;
