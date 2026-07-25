import { Navigate, Outlet } from "@tanstack/react-router";
import { useAuthStore } from "../../stores/authStore";
import { Sidebar } from "./Sidebar";

/** Shell for every authenticated app route: sidebar + content, no header/footer. */
export function DashboardLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" />;

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="sidebar-content">
        <Outlet />
      </div>
    </div>
  );
}
