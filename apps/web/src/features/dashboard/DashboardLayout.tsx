import { Navigate, Outlet } from "@tanstack/react-router";
import { useAuthStore } from "../../stores/authStore";
import { TopHeader } from "./TopHeader";
import { Sidebar } from "./Sidebar";

/** Shell for every authenticated app route: top header + per-app sidebar + content. */
export function DashboardLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" />;

  return (
    <div className="dashboard-shell">
      <TopHeader />
      <div className="dashboard-body">
        <Sidebar />
        <div className="sidebar-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
