import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Activity, Target, ShieldAlert } from "lucide-react";

const NAV_ITEMS = [
  { path: "/portal", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { path: "/portal/ops", label: "Operations", Icon: Activity },
  { path: "/portal/leadgen", label: "Leadgen", Icon: Target },
  { path: "/portal/opsec", label: "OpSec", Icon: ShieldAlert },
];

export default function AdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="admin-global-nav" aria-label="Global Admin Navigation">
      <div className="admin-global-nav__inner container">
        <ul className="admin-global-nav__list">
          {NAV_ITEMS.map(({ path, label, Icon, exact }) => {
            const isActive = exact ? pathname === path : pathname.startsWith(path);
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={`admin-global-nav__link ${isActive ? "is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="admin-global-nav__halo"></span>
                  <Icon size={16} className="admin-global-nav__icon" />
                  <span className="admin-global-nav__label">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
