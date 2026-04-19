import { useCallback, useEffect, useState } from "react";
import { KeyRound, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/context/AdminContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const AccountSettings = () => {
  const { adminEmail, adminRole } = useAdmin();
  const { toast } = useToast();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  const loadMfa = useCallback(async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-mfa/settings`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok) setMfaEnabled(!!data.enabled);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadMfa();
  }, [loadMfa]);

  const toggleMfa = async (next: boolean) => {
    setMfaLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in.");
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-mfa/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update.");
      setMfaEnabled(!!data.enabled);
      toast({
        title: next ? "Two-step verification enabled" : "Two-step verification disabled",
        description: next
          ? "You'll be asked for an email code on your next sign-in."
          : "Future sign-ins will use password only.",
      });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
          <UserCircle className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your personal admin account and security</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>Your administrator account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{adminEmail}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant={adminRole === "super_admin" ? "default" : "secondary"}>
              {adminRole ?? "admin"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="w-4 h-4" /> Two-Step Verification
          </CardTitle>
          <CardDescription>
            Optional. When enabled, signing in to the admin dashboard requires a 6-digit code sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4 opacity-60">
            <div className="space-y-1">
              <Label htmlFor="mfa-toggle" className="text-base">Require email code on sign-in</Label>
              <p className="text-xs text-muted-foreground">
                Temporarily unavailable while email delivery is being reconfigured.
              </p>
            </div>
            <Switch id="mfa-toggle" checked={false} disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountSettings;
