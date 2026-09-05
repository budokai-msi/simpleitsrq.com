import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutDashboard, Activity, Target, ShieldAlert, ExternalLink, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../lib/authContext.js";

const NAV_ITEMS = [
  { path: "/portal", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { path: "/portal/ops", label: "Operations", Icon: Activity },
  { path: "/portal/leadgen", label: "Leadgen", Icon: Target },
  { path: "/portal/opsec", label: "OpSec", Icon: ShieldAlert },
];

export default function AdminNav() {
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2${isActive ? " menu-active" : ""}`;

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="drawer">
      <input
        id="admin-nav-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={drawerOpen}
        onChange={(e) => setDrawerOpen(e.target.checked)}
      />
      <div className="drawer-content">
        <div className="navbar bg-base-100 border-b border-base-300 min-h-12 px-0">
          <div className="navbar-start">
            <label
              htmlFor="admin-nav-drawer"
              aria-label="Open admin navigation"
              className="btn btn-ghost btn-square btn-sm lg:hidden"
            >
              {drawerOpen ? <X size={18} /> : <Menu size={18} />}
            </label>
            <nav className="hidden lg:flex" aria-label="Global Admin Navigation">
              <ul className="menu menu-horizontal px-0 gap-1">
                {NAV_ITEMS.map(({ path, label, Icon, end }) => (
                  <li key={path}>
                    <NavLink to={path} end={end} className={navLinkClass}>
                      <Icon size={16} />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="navbar-end gap-2">
            <Link to="/" className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> View site
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </div>
      <div className="drawer-side z-50">
        <label htmlFor="admin-nav-drawer" aria-label="Close admin navigation" className="drawer-overlay" />
        <ul className="menu bg-base-100 min-h-full w-64 p-4 border-r border-base-300">
          {NAV_ITEMS.map(({ path, label, Icon, end }) => (
            <li key={path}>
              <NavLink to={path} end={end} className={navLinkClass} onClick={closeDrawer}>
                <Icon size={16} />
                {label}
              </NavLink>
            </li>
          ))}
          <li className="mt-4">
            <Link to="/" target="_blank" rel="noopener noreferrer" onClick={closeDrawer}>
              <ExternalLink size={16} /> View site
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => { closeDrawer(); logout(); }}>
              <LogOut size={16} /> Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
