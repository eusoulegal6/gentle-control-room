import { useAdmin } from "@/context/AdminContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, CheckCircle, AlertTriangle } from "lucide-react";

const DashboardHome = () => {
  const { users, alerts } = useAdmin();

  const stats = [
    { title: "Total Users", value: users.length, icon: Users, color: "text-primary" },
    { title: "Active Users", value: users.filter(u => u.status === "active").length, icon: CheckCircle, color: "text-success" },
    { title: "Alerts Sent", value: alerts.length, icon: Send, color: "text-primary" },
    { title: "Pending Alerts", value: alerts.filter(a => a.status === "sent").length, icon: AlertTriangle, color: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Manage your Windows app users and alerts</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No alerts sent yet.</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">To: {alert.username}</p>
                    <p className="text-sm text-muted-foreground truncate">{alert.message}</p>
                  </div>
                  <StatusBadge status={alert.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    sent: "bg-warning/10 text-warning",
    delivered: "bg-primary/10 text-primary",
    read: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${styles[status] || ""}`}>
      {status}
    </span>
  );
};

export default DashboardHome;
