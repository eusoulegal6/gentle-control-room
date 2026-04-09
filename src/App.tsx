import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminProvider, useAdmin } from "@/context/AdminContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AuthGuard = () => {
  const { isLoggedIn } = useAdmin();
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return <Dashboard />;
};

const LoginGuard = () => {
  const { isLoggedIn } = useAdmin();
  if (isLoggedIn) return <Navigate to="/dashboard" replace />;
  return <Login />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AdminProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginGuard />} />
            <Route path="/dashboard/*" element={<AuthGuard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AdminProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
