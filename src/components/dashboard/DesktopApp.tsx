import { useEffect, useState } from "react";
import { Download, Monitor, CheckCircle, Bell, LogIn, KeyRound, UserPlus, Upload, Loader2 } from "lucide-react";
import ReleaseNotes from "./ReleaseNotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/context/AdminContext";

interface AppRelease {
  id: string;
  version: string;
  downloadUrl: string;
  releaseNotes: string | null;
  publishedAt: string;
  createdBy: string | null;
}

const steps = [
  {
    step: 1,
    icon: UserPlus,
    title: "Create a Desktop User",
    description:
      'Go to User Management and create a username and password for the person who will use the desktop app.',
  },
  {
    step: 2,
    icon: Download,
    title: "Download & Install",
    description:
      "Download the installer below and send it to your user. They run it and follow the prompts — takes less than a minute.",
  },
  {
    step: 3,
    icon: LogIn,
    title: "User Signs In",
    description:
      "The user opens the app from the system tray and enters the username and password you created for them.",
  },
  {
    step: 4,
    icon: Bell,
    title: "Send Alerts",
    description:
      'Go to Send Alert, pick the user, and send a notification. It will appear on their desktop instantly.',
  },
];

const FALLBACK_DOWNLOAD_URL =
  "https://ipwmfdsnzjhzeofwwptk.supabase.co/storage/v1/object/public/downloads/GentleControlRoom-Setup-0.1.1.exe";
const FALLBACK_VERSION = "0.1.1";

const DesktopApp = () => {
  const { adminRole } = useAdmin();
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [isLoadingRelease, setIsLoadingRelease] = useState(true);

  // Publish form state
  const [newVersion, setNewVersion] = useState("");
  const [newDownloadUrl, setNewDownloadUrl] = useState("");
  const [newReleaseNotes, setNewReleaseNotes] = useState("");
  const [notifyUsers, setNotifyUsers] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const downloadUrl = latestRelease?.downloadUrl ?? FALLBACK_DOWNLOAD_URL;
  const displayVersion = latestRelease?.version ?? FALLBACK_VERSION;

  const fetchLatestRelease = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("app-releases", {
        method: "GET" as const,
      });
      if (error) throw error;
      setLatestRelease(data?.release ?? null);
    } catch (err) {
      console.error("Failed to fetch latest release:", err);
    } finally {
      setIsLoadingRelease(false);
    }
  };

  useEffect(() => {
    fetchLatestRelease();
  }, []);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion.trim() || !newDownloadUrl.trim()) {
      toast.error("Version and download URL are required.");
      return;
    }

    setIsPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("app-releases", {
        method: "POST" as const,
        body: {
          version: newVersion.trim(),
          downloadUrl: newDownloadUrl.trim(),
          releaseNotes: newReleaseNotes.trim() || null,
          notify: notifyUsers,
        },
      });
      if (error) {
        const msg = typeof error === "object" && "message" in error ? (error as { message: string }).message : String(error);
        throw new Error(msg);
      }

      toast.success(`Version ${newVersion} published!${notifyUsers ? " All desktop users have been notified." : ""}`);
      setLatestRelease(data.release);
      setNewVersion("");
      setNewDownloadUrl("");
      setNewReleaseNotes("");
      setNotifyUsers(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish release.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Desktop App</h1>
        <p className="text-muted-foreground mt-1">
          Download the Windows agent and share it with your team.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Download card */}
        <Card className="shadow-elevated border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="gradient-primary p-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
                <Monitor className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold text-primary-foreground">
                Emergency Staff Alert for Windows
              </h3>
              <p className="text-primary-foreground/80 text-sm">
                {isLoadingRelease ? "Loading..." : `Version ${displayVersion} · Windows 10/11 (x64)`}
              </p>
              <a href={downloadUrl} download>
                <Button
                  size="lg"
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-2 mt-2 font-semibold"
                >
                  <Download className="w-5 h-5" />
                  Download Installer
                </Button>
              </a>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                {[
                  "Runs silently in system tray",
                  "Minimal resource usage",
                  "Auto-starts with Windows",
                  "No admin privileges required",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Setup guide */}
        <div className="space-y-5">
          <h3 className="text-lg font-bold text-foreground">Quick Setup Guide</h3>
          <div className="space-y-4">
            {steps.map((item) => (
              <div key={item.step} className="flex gap-4 items-start group">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl gradient-primary flex items-center justify-center group-hover:shadow-lg transition-shadow">
                  <item.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground text-sm">
                    Step {item.step}: {item.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Tip</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can create user accounts in the{" "}
                  <a href="/dashboard/users" className="text-primary hover:underline">
                    User Management
                  </a>{" "}
                  page before sharing the installer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured release notes */}
      {latestRelease?.releaseNotes && (
        <ReleaseNotes version={latestRelease.version} notes={latestRelease.releaseNotes} />
      )}

      {/* Publish New Version — developer only */}
      {adminRole === "developer" && <Card className="shadow-elevated border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="w-5 h-5" />
            Publish New Version
          </CardTitle>
          {latestRelease && (
            <p className="text-sm text-muted-foreground">
              Current published version: <span className="font-semibold text-foreground">v{latestRelease.version}</span>
              {" · "}
              Published {new Date(latestRelease.publishedAt).toLocaleDateString()}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePublish} className="grid gap-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="release-version">Version number</Label>
                <Input
                  id="release-version"
                  placeholder="e.g. 0.2.0"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="release-url">Download URL</Label>
                <Input
                  id="release-url"
                  placeholder="https://..."
                  value={newDownloadUrl}
                  onChange={(e) => setNewDownloadUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-notes">Release notes</Label>
              <Textarea
                id="release-notes"
                placeholder="What's new in this version..."
                value={newReleaseNotes}
                onChange={(e) => setNewReleaseNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="notify-users"
                checked={notifyUsers}
                onCheckedChange={(checked) => setNotifyUsers(checked === true)}
              />
              <Label htmlFor="notify-users" className="text-sm font-normal cursor-pointer">
                Notify all desktop users about this update
              </Label>
            </div>
            <Button type="submit" disabled={isPublishing} className="w-fit">
              {isPublishing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Publish Version
            </Button>
          </form>
        </CardContent>
      </Card>}
    </div>
  );
};

export default DesktopApp;
