import { Routes, Route, Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import UserManagement from "@/components/dashboard/UserManagement";
import SendAlert from "@/components/dashboard/SendAlert";
import AlertHistory from "@/components/dashboard/AlertHistory";
import DashboardHome from "@/components/dashboard/DashboardHome";
import DesktopApp from "@/components/dashboard/DesktopApp";
import { useAdmin } from "@/context/AdminContext";

const Dashboard = () => {
  const { logout, adminEmail } = useAdmin();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
            <SidebarTrigger className="ml-1" />
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:inline">{adminEmail}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void logout()}
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-1" /> Logout
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Routes>
              <Route index element={<DashboardHome />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="send-alert" element={<SendAlert />} />
              <Route path="alerts" element={<AlertHistory />} />
              <Route path="desktop-app" element={<DesktopApp />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
