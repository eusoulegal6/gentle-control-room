import { useState } from "react";
import { useAdmin, AppUser } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const UserManagement = () => {
  const { users, addUser, editUser, deleteUser } = useAdmin();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setUsername("");
    setPassword("");
    setDialogOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword(user.password);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Username and password are required.");
      return;
    }
    if (editingUser) {
      editUser(editingUser.id, username.trim(), password.trim());
      toast.success("User updated successfully.");
    } else {
      addUser(username.trim(), password.trim());
      toast.success("User created successfully.");
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteUser(id);
    setDeleteConfirm(null);
    toast.success("User deleted.");
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
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
                  <TableHead>Password</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-0.5 rounded">
                          {showPasswords[user.id] ? user.password : "••••••••"}
                        </code>
                        <button onClick={() => togglePassword(user.id)} className="text-muted-foreground hover:text-foreground">
                          {showPasswords[user.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {user.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.createdAt.toLocaleDateString()}
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No users yet. Click "Add User" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input placeholder="e.g. john.doe" value={username} onChange={e => setUsername(e.target.value)} />
              <p className="text-xs text-muted-foreground">This will be the login username for the Windows app.</p>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="text" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">This will be the login password for the Windows app.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground">
              {editingUser ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this user? They will no longer be able to log into the Windows app.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
