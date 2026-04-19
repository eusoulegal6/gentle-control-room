import { useCallback, useEffect, useState } from "react";
import { Shield, UserCog, BarChart3, Pencil, Trash2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface AdminProfile {
  id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface SignupStat {
  date: string;
  count: number;
}

async function invokeSuper<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/super-admin${path ? `/${path}` : ""}`;
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

  const res = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

const SuperAdmin = () => {
  const { adminRole } = useAdmin();
  const { toast } = useToast();
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [signups, setSignups] = useState<SignupStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adminsRes, signupsRes] = await Promise.all([
        invokeSuper<{ admins: AdminProfile[] }>(""),
        invokeSuper<{ signups: SignupStat[] }>("signups"),
      ]);
      setAdmins(adminsRes.admins);
      setSignups(signupsRes.signups);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (adminRole === "super_admin") {
      loadData();
    }
  }, [adminRole, loadData]);

  const handleSaveRole = async (id: string) => {
    try {
      const { admin } = await invokeSuper<{ admin: AdminProfile }>(id, {
        method: "PATCH",
        body: { role: editRole },
      });
      setAdmins((prev) => prev.map((a) => (a.id === id ? admin : a)));
      setEditingId(null);
      toast({ title: "Updated", description: "Role updated successfully." });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Update failed", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remove admin access for ${email}?`)) return;
    try {
      await invokeSuper<null>(id, { method: "DELETE" });
      setAdmins((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Removed", description: `${email} has been removed.` });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Delete failed", variant: "destructive" });
    }
  };

  if (adminRole !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Super admin privileges required.</p>
      </div>
    );
  }

  const maxCount = Math.max(...signups.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Platform administration & user management</p>
        </div>
      </div>

      {/* Signup Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-4 h-4" /> Signups Per Day
          </CardTitle>
          <CardDescription>Admin account registrations over time</CardDescription>
        </CardHeader>
        <CardContent>
          {signups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signup data available.</p>
          ) : (
            <div className="space-y-2">
              {signups.map((s) => (
                <div key={s.date} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{s.date}</span>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full gradient-primary rounded-full transition-all"
                      style={{ width: `${(s.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin User List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCog className="w-4 h-4" /> Admin Users
          </CardTitle>
          <CardDescription>Manage admin accounts and access levels</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.email}</TableCell>
                    <TableCell>
                      {editingId === admin.id ? (
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="developer">Developer</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={admin.role === "super_admin" ? "default" : "secondary"}>
                          {admin.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(admin.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === admin.id ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleSaveRole(admin.id)}>
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(admin.id);
                              setEditRole(admin.role);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(admin.id, admin.email)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdmin;
