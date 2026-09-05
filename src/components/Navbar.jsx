import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutGrid, ShoppingBag, Briefcase, MapPin, Shield, 
  Target, BookOpen, ShieldAlert, Lock, Info, Search, Phone, 
  Menu, X, LogIn, User as UserIcon, Calendar, ChevronDown 
} from "lucide-react";
import { PRIMARY_NAV, isNavSectionActive, isNavItemActive } from "../data/navigation";
import { useAuth } from "../lib/authContext.js";

const NAV_ICONS = {
  LayoutGrid, ShoppingBag, Briefcase, MapPin, Shield, Target,
  BookOpen, ShieldAlert, Lock, Info, Search, Phone,
  UserIcon, LogIn, Calendar
};

function NavIcon({ name, size = 16 }) {
  const Icon = NAV_ICONS[name] || Info;
  return <Icon size={size} aria-hidden="true" />;
}

export function Navbar({ logo: Logo, themeToggle: ThemeToggle }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { user, loading } = useAuth();

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    activePrefixes: ["/portal"],
  };

  const portalCta = loading ? null : user ? (
    <Link
      to="/portal"
      className={`link-btn nav-user${portalActive ? " is-active" : ""}`}
      title={`Signed in as ${user.email}`}
      aria-current={portalActive ? "page" : undefined}
    >
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="nav-avatar" /> : <UserIcon size={16} />}
      <span>{user.name ? user.name.split(" ")[0] : "Portal"}</span>
    </Link>
  ) : (
    <Link to="/portal" className={`link-btn${portalActive ? " is-active" : ""}`} aria-current={portalActive ? "page" : undefined}>
      <LogIn size={16} style={{ marginRight: 6 }} /> Sign In
    </Link>
  );

  return (
    <header className={`navbar${scrolled ? " navbar--scrolled" : ""}${open ? " navbar--menu-open" : ""}`} role="banner">
      <div className="container nav-inner">
        {Logo && <Logo />}
        <nav className="nav-links" aria-label="Primary" onMouseLeave={() => setOpenGroup(null)}>
          {PRIMARY_NAV.map((section) => (
            <div key={section.id} className="nav-group" onMouseEnter={() => setOpenGroup(section.id)}>
              {section.items ? (
                <button
                  type="button"
                  className={`nav-link nav-group-btn${isNavSectionActive(section, location) ? " is-active" : ""}${openGroup === section.id ? " is-open" : ""}`}
                  aria-expanded={openGroup === section.id}
                  onClick={() => setOpenGroup(openGroup === section.id ? null : section.id)}
                >
                  <NavIcon name={section.icon} size={15} />
                  <span>{section.label}</span>
                  <ChevronDown size={14} className="nav-chevron" />
                </button>
              ) : (
                <Link to={section.to} className={`nav-link${isNavSectionActive(section, location) ? " is-active" : ""}`}>
                  <NavIcon name={section.icon} size={15} />
                  <span>{section.label}</span>
                </Link>
              )}
              {section.items && (
                <div className={`nav-dropdown ${openGroup === section.id ? "is-visible" : ""}`}>
                  <div className="nav-dropdown-grid">
                    {section.items.map((item) => (
                      <Link key={item.id} to={item.to} className={`nav-dropdown-item${isNavItemActive(item, location) ? " is-active" : ""}`}>
                        <div className="nav-dropdown-item-icon">
                          <NavIcon name={item.icon} size={20} />
                        </div>
                        <div className="nav-dropdown-item-content">
                          <strong className="nav-dropdown-item-title">{item.label}</strong>
                          <span className="nav-dropdown-item-desc">{item.description}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="nav-actions">
          {ThemeToggle && <ThemeToggle />}
          {portalCta}
          <Link to="/leadgen" className="btn btn-secondary nav-leadgen-cta">
            <Target size={15} /> Try Leadgen
          </Link>
          <Link to="/book" className="btn btn-primary">Book a Call</Link>
        </div>
        <div className="nav-mobile-actions">
          {ThemeToggle && <ThemeToggle />}
          {!loading && (user ? (
            <Link to="/portal" className={`nav-mobile-cta nav-mobile-cta--user${portalActive ? " is-active" : ""}`}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="nav-avatar" /> : <UserIcon size={16} />}
            </Link>
          ) : (
            <Link to="/portal" className={`nav-mobile-cta${portalActive ? " is-active" : ""}`}>
              <LogIn size={14} /><span>Sign in</span>
            </Link>
          ))}
          <button ref={menuButtonRef} className="menu-btn" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-primary-menu" ref={menuRef} className="mobile-menu" aria-label="Mobile primary">
          {PRIMARY_NAV.map((section) => (
            <div key={section.id} className="mobile-nav-group">
              {section.items ? (
                <>
                  <div className="mobile-nav-header"><NavIcon name={section.icon} size={14} /> <span>{section.label}</span></div>
                  {section.items.map((item) => (
                    <Link key={item.id} to={item.to} className={`mobile-nav-link${isNavItemActive(item, location) ? " is-active" : ""}`} onClick={() => setOpen(false)}>
                      <NavIcon name={item.icon} size={18} />
                      <div className="mobile-nav-link-content">
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </div>
                    </Link>
                  ))}
                </>
              ) : (
                <Link to={section.to} className={`mobile-nav-link${isNavItemActive(section, location) ? " is-active" : ""}`} onClick={() => setOpen(false)}>
                  <NavIcon name={section.icon} size={18} />
                  <div className="mobile-nav-link-content">
                    <strong>{section.label}</strong>
                  </div>
                </Link>
              )}
            </div>
          ))}
          <div className="mobile-nav-divider" />
          <section className="mobile-nav-section mobile-nav-section--account">
            <div className="mobile-nav-header"><UserIcon size={14} /> <span>Account</span></div>
            <Link to={portalItem.to} className="mobile-nav-link" onClick={() => setOpen(false)}>
              <NavIcon name={portalItem.icon} size={18} />
              <div className="mobile-nav-link-content">
                <strong>{portalItem.label}</strong>
                <span>{portalItem.description}</span>
              </div>
            </Link>
            <Link to="/book" className="btn btn-primary mobile-menu-cta" onClick={() => setOpen(false)}>
              <Calendar size={16} /> Book a Call
            </Link>
            <Link to="/leadgen" className="btn btn-secondary mobile-menu-cta" onClick={() => setOpen(false)}>
              <Target size={16} /> Try Leadgen
            </Link>
          </section>
        </nav>
      )}
    </header>
  );
}

