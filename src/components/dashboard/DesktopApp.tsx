import { Download, Monitor, CheckCircle, Bell, LogIn, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DOWNLOAD_URL =
  "https://ipwmfdsnzjhzeofwwptk.supabase.co/storage/v1/object/public/downloads/GentleControlRoom-Setup-0.1.1.exe";

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

const DesktopApp = () => {
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
                Gentle Control Room for Windows
              </h3>
              <p className="text-primary-foreground/80 text-sm">
                Version 0.1.1 · Windows 10/11 (x64)
              </p>
              <a href={DOWNLOAD_URL} download>
                <Button
                  size="lg"
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-2 mt-2 font-semibold"
                >
                  <Download className="w-5 h-5" />
                  Download Installer
                </Button>
              </a>
            </div>
            <div className="p-6 space-y-3">
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
    </div>
  );
};

export default DesktopApp;
