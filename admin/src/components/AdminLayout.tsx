import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth.js";

const NAV = [
  { to: "/", label: "Overview", icon: "📊", end: true },
  { to: "/pipelines", label: "Pipelines", icon: "⚙️" },
  { to: "/programs", label: "Programs", icon: "🎓" },
  { to: "/institutions", label: "Institutions", icon: "🏛️" },
  { to: "/regulations", label: "Regulations", icon: "📋" },
  { to: "/api-keys", label: "API Keys", icon: "🔑" },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/data-quality", label: "Data Quality", icon: "✅" },
  { to: "/settings", label: "Settings", icon: "⚡" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">⬡</span>
            <div>
              <div className="font-bold text-white text-sm">DataForge</div>
              <div className="text-xs text-gray-400">Admin</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {NAV.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
