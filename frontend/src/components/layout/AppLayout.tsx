import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  CircleHelp,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  Settings2,
  Sun,
  Tags,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth, useTheme } from "@/app/providers";
import { Dropdown } from "@/components/ui/components";
import { Button } from "@/components/ui/primitives";
import { api } from "@/services/api";
import { AssistantWidget } from "@/components/layout/AssistantWidget";

type NavigationLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: boolean;
};

const primaryLinks: NavigationLink[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/tasks", label: "My tasks", icon: CheckSquare2 },
  { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/app/notifications", label: "Notifications", icon: Bell, count: true },
];

const manageLinks: NavigationLink[] = [
  { to: "/app/categories", label: "Categories", icon: FolderKanban },
  { to: "/app/tags", label: "Tags", icon: Tags },
  { to: "/app/trash", label: "Trash", icon: Trash2 },
  { to: "/app/profile", label: "Profile", icon: UserRound },
  { to: "/app/settings", label: "Settings", icon: Settings2 },
  { to: "/app/help", label: "Help", icon: CircleHelp },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () =>
      (await api.get<{ count: number }>("/notifications/unread-count")).data.count,
    refetchInterval: 60_000,
  });
  const title = [...primaryLinks, ...manageLinks].find((link) =>
    link.end ? location.pathname === link.to : location.pathname.startsWith(link.to),
  )?.label;
  const initials = user?.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function renderLinks() {
    return (
      <>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace">
          {primaryLinks.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
              {count && !!unread.data && (
                <span className="nav-count" aria-label={`${unread.data} unread`}>
                  {unread.data}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-label">Manage</div>
        <nav className="nav-list" aria-label="Manage account">
          {manageLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </>
    );
  }

  return (
    <div className="app-frame">
      <button
        className={`mobile-scrim${menuOpen ? " open" : ""}`}
        aria-label="Close navigation"
        onClick={() => setMenuOpen(false)}
      />
      <aside className={`sidebar${menuOpen ? " open" : ""}`} aria-label="Main navigation">
        <NavLink className="brand" to="/app" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">
            <CheckSquare2 size={17} />
          </span>
          <span className="brand-name">TaskFlow</span>
        </NavLink>
        {renderLinks()}
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="avatar-copy">
            <strong>{user?.full_name}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            className="icon-btn"
            aria-label="Sign out"
            title="Sign out"
            onClick={handleLogout}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-btn mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="breadcrumb">Workspace{title ? ` / ${title}` : ""}</span>
          </div>
          <div className="top-actions">
            <Dropdown
              label={`Theme: ${mode}`}
              trigger={
                <span className="icon-btn" aria-hidden="true">
                  {mode === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                </span>
              }
            >
              <Button role="menuitem" variant="quiet" onClick={() => setMode("light")}>
                Light
              </Button>
              <Button role="menuitem" variant="quiet" onClick={() => setMode("dark")}>
                Dark
              </Button>
              <Button role="menuitem" variant="quiet" onClick={() => setMode("system")}>
                System
              </Button>
            </Dropdown>
            <NavLink
              className="icon-btn"
              aria-label="Notifications"
              title="Notifications"
              to="/app/notifications"
            >
              <Bell size={16} />
              {!!unread.data && (
                <span className="notification-dot" aria-label={`${unread.data} unread`} />
              )}
            </NavLink>
            <NavLink
              className="icon-btn"
              aria-label="Account settings"
              title="Account settings"
              to="/app/profile"
            >
              <ChevronDown size={15} />
            </NavLink>
          </div>
        </header>
        <div className="content-wrap">
          <Outlet />
        </div>
      </main>
      <AssistantWidget />
    </div>
  );
}
