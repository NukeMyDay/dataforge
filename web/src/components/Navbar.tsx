import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth.js";

export default function Navbar() {
  const { isLoggedIn, logout } = useAuth();

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-16 gap-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-brand-700 shrink-0">
          <span className="text-2xl">⬡</span>
          <span>Sophex</span>
        </Link>

        <div className="flex items-center gap-1">
          {[
            { to: "/gruendung", label: "Gründungsdaten" },
            { to: "/research", label: "Research" },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {isLoggedIn ? (
            <>
              <Link to="/dashboard" className="btn-secondary text-sm py-1.5">
                Dashboard
              </Link>
              <button
                onClick={() => logout()}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
                Sign in
              </Link>
              <Link to="/register" className="btn-primary text-sm py-1.5">
                Get API key
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
