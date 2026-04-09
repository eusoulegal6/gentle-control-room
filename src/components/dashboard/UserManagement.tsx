import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAdmin, AppUser } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

interface UserFormState {
  username: string;
  password: string;
  displayName: string;
  status: AppUser["status"];
}

const initialFormState: UserFormState = {
  username: "",
  password: "",
  displayName: "",
  status: "ACTIVE",
};

function formatUserStatus(status: AppUser["status"]) {
  return status === "ACTIVE" ? "Active" : "Disabled";
}

const UserManagement = () => {
  const { users, addUser, editUser, deleteUser } = useAdmin();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState<UserFormState>(initialFormState);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreate = () => {
    setEditingUser(null);
    setForm(initialFormState);
    setDialogOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: "",
      displayName: user.displayName ?? "",
      status: user.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.username.trim()) {
      toast.error("Username is required.");
      return;
    }

    if (!editingUser && !form.password.trim()) {
      toast.error("Password is required.");
      return;
    }

    setIsSaving(true);

    try {
      if (editingUser) {
        await editUser(editingUser.id, {
          username: form.username.trim(),
          displayName: form.displayName.trim() || null,
          status: form.status,
          password: form.password.trim() || undefined,
        });
        toast.success("User updated successfully.");
      } else {
        await addUser(form.username.trim(), form.password.trim(), form.displayName.trim() || null);
        toast.success("User created successfully.");
      }

      setDialogOpen(false);
      setForm(initialFormState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save user.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);

    try {
      await deleteUser(id);
      setDeleteConfirm(null);
      toast.success("User deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">Create and manage Windows app user accounts</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-1" /> Add User
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      {user.displayName || <span className="text-muted-foreground">Not set</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {formatUserStatus(user.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.alertCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="hover:text-destructive" onClick={() => setDeleteConfirm(user.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No users yet. Click "Add User" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                placeholder="e.g. john.doe"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">This will be the login username for the Windows app.</p>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                placeholder="e.g. John Doe"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Optional friendly name shown in admin and desktop views.</p>
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? "Reset Password" : "Password"}</Label>
              <Input
                type="password"
                placeholder={editingUser ? "Leave blank to keep current password" : "Enter password"}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {editingUser
                  ? "Only enter a value if you want to replace the current password."
                  : "This will be the login password for the Windows app."}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="user-status">Active account</Label>
                <p className="text-xs text-muted-foreground mt-1">Disabled users cannot sign in or receive new alerts.</p>
              </div>
              <Switch
                id="user-status"
                checked={form.status === "ACTIVE"}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    status: checked ? "ACTIVE" : "DISABLED",
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="gradient-primary text-primary-foreground"
            >
              {isSaving ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this user? They will no longer be able to log into the Windows app.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                if (deleteConfirm) {
                  void handleDelete(deleteConfirm);
                }
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
