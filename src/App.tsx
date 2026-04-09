import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminProvider, useAdmin } from "@/context/AdminContext";
import { isDesktopHost } from "@/lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Desktop from "./pages/Desktop";

const queryClient = new QueryClient();

const AuthGuard = () => {
  const { isLoggedIn, isReady } = useAdmin();
  if (!isReady) return null;
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return <Dashboard />;
};

const LoginGuard = () => {
  const { isLoggedIn, isReady } = useAdmin();
  if (!isReady) return null;
  if (isLoggedIn) return <Navigate to="/dashboard" replace />;
  return <Login />;
};

const DesktopModeApp = () => <Desktop />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {isDesktopHost() ? (
        <DesktopModeApp />
      ) : (
        <AdminProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LoginGuard />} />
              <Route path="/dashboard/*" element={<AuthGuard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AdminProvider>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
