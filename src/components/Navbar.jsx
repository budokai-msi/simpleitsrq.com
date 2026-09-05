import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid, ShoppingBag, Briefcase, MapPin, Shield, Wrench,
  Target, BookOpen, ShieldAlert, Lock, Info, Search, Phone,
  Menu, X, LogIn, User as UserIcon, Calendar,
} from "lucide-react";
import { PRIMARY_NAV, isNavSectionActive, isNavItemActive } from "../data/navigation";
import { useAuth } from "../lib/authContext.js";

const NAV_ICONS = {
  LayoutGrid, ShoppingBag, Briefcase, MapPin, Shield, Wrench, Target,
  BookOpen, ShieldAlert, Lock, Info, Search, Phone,
  UserIcon, LogIn, Calendar,
};

function NavIcon({ name, size = 16, className }) {
  const Icon = NAV_ICONS[name] || Info;
  return <Icon size={size} aria-hidden="true" className={className} />;
}

// Site header. daisyUI navbar + menu + dropdown (details/summary) + btn.
// Desktop groups open on hover or click; mobile uses a single stacked menu.
export function Navbar({ logo: Logo, themeToggle: ThemeToggle }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { user, loading } = useAuth();

  useEffect(() => {
    const id = window.setTimeout(() => {
      setOpen(false);
      setOpenGroup(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.navMenu = "open";

    function onKeyDown(event) { if (event.key === "Escape") setOpen(false); }
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || menuButtonRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.navMenu;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const portalActive = location.pathname.startsWith("/portal");
  const portalItem = {
    id: "portal",
    label: user ? "My portal" : "Sign in",
    to: "/portal",
    icon: user ? "UserIcon" : "LogIn",
    description: user ? "Tickets, leadgen, opsec, and account tools." : "Access the client portal.",
  };

  const portalLink = loading ? null : (
    <Link
      to="/portal"
      className={`btn btn-ghost btn-sm${portalActive ? " btn-active" : ""}`}
      title={user ? `Signed in as ${user.email}` : undefined}
      aria-current={portalActive ? "page" : undefined}
    >
      {user?.avatarUrl
        ? <img src={user.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
        : user ? <UserIcon size={16} /> : <LogIn size={16} />}
      <span>{user ? (user.name ? user.name.split(" ")[0] : "Portal") : "Sign in"}</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 bg-base-100 border-b border-base-300" role="banner">
      <div className="navbar container min-h-14 py-0 px-0">
        <div className="navbar-start gap-2">
          {Logo && <Logo />}
        </div>

        <nav className="navbar-center hidden lg:flex" aria-label="Primary" onMouseLeave={() => setOpenGroup(null)}>
          <ul className="menu menu-horizontal px-0 gap-1">
            {PRIMARY_NAV.map((section) => {
              const active = isNavSectionActive(section, location);
              if (!section.items) {
                return (
                  <li key={section.id}>
                    <Link to={section.to} className={active ? "menu-active" : undefined} aria-current={active ? "page" : undefined}>
                      <NavIcon name={section.icon} size={15} />
                      {section.label}
                    </Link>
                  </li>
                );
              }
              const isOpen = openGroup === section.id;
              return (
                <li key={section.id} onMouseEnter={() => setOpenGroup(section.id)}>
                  <details
                    className="dropdown"
                    open={isOpen}
                    onToggle={(e) => setOpenGroup(e.currentTarget.open ? section.id : (isOpen ? null : openGroup))}
                  >
                    <summary className={active ? "menu-active" : undefined}>
                      <NavIcon name={section.icon} size={15} />
                      {section.label}
                    </summary>
                    <ul className="menu dropdown-content bg-base-100 border border-base-300 w-72 p-2 z-50 mt-2">
                      {section.items.map((item) => {
                        const itemActive = isNavItemActive(item, location);
                        return (
                          <li key={item.id}>
                            <Link to={item.to} className={itemActive ? "menu-active" : undefined} aria-current={itemActive ? "page" : undefined}>
                              <NavIcon name={item.icon} size={18} className="shrink-0" />
                              <span className="flex flex-col">
                                <span className="font-semibold">{item.label}</span>
                                <span className="text-xs opacity-70">{item.description}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="navbar-end gap-2">
          {ThemeToggle && <ThemeToggle />}
          <div className="hidden lg:flex items-center gap-2">
            {portalLink}
            <Link to="/leadgen" className="btn btn-sm">
              <Target size={15} /> Try Leadgen
            </Link>
            <Link to="/book" className="btn btn-primary btn-sm">Book a Call</Link>
          </div>
          <button
            ref={menuButtonRef}
            className="btn btn-ghost btn-square lg:hidden"
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-primary-menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-primary-menu"
          ref={menuRef}
          className="lg:hidden absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto bg-base-100 border-b border-base-300"
          aria-label="Mobile primary"
        >
          <ul className="menu w-full p-3">
            {PRIMARY_NAV.map((section) => (
              section.items ? (
                <li key={section.id}>
                  <h2 className="menu-title flex items-center gap-2">
                    <NavIcon name={section.icon} size={14} /> {section.label}
                  </h2>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link to={item.to} className={isNavItemActive(item, location) ? "menu-active" : undefined} onClick={() => setOpen(false)}>
                          <NavIcon name={item.icon} size={18} />
                          <span className="flex flex-col">
                            <span className="font-semibold">{item.label}</span>
                            <span className="text-xs opacity-70">{item.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={section.id}>
                  <Link to={section.to} className={isNavItemActive(section, location) ? "menu-active" : undefined} onClick={() => setOpen(false)}>
                    <NavIcon name={section.icon} size={18} />
                    <span className="font-semibold">{section.label}</span>
                  </Link>
                </li>
              )
            ))}
            <li>
              <h2 className="menu-title flex items-center gap-2"><UserIcon size={14} /> Account</h2>
              <ul>
                <li>
                  <Link to={portalItem.to} onClick={() => setOpen(false)}>
                    <NavIcon name={portalItem.icon} size={18} />
                    <span className="flex flex-col">
                      <span className="font-semibold">{portalItem.label}</span>
                      <span className="text-xs opacity-70">{portalItem.description}</span>
                    </span>
                  </Link>
                </li>
              </ul>
            </li>
          </ul>
          <div className="flex flex-col gap-2 p-3 pt-0">
            <Link to="/book" className="btn btn-primary" onClick={() => setOpen(false)}>
              <Calendar size={16} /> Book a Call
            </Link>
            <Link to="/leadgen" className="btn" onClick={() => setOpen(false)}>
              <Target size={16} /> Try Leadgen
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
