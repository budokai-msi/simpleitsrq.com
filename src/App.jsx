import { detectPreferredContact } from "./lib/detectPreferredContact";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Link } from "./lib/Link";
import { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import {
  AtSign, Menu, X, ChevronDown, Sun, Moon, LogIn, User as UserIcon, MapPin,
  Phone, MessageSquare, Mail, Calendar, LayoutGrid, ShoppingBag, BookOpen,
  Shield, ShieldAlert, Wrench, FileText, Info, Briefcase, Target, Search, Lock,
} from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
import {
  FOOTER_COLUMNS,
  PRIMARY_NAV,
  SERVICE_AREA_LINKS,
  isNavItemActive,
  isNavSectionActive,
} from "./data/navigation";
import { selectionHaptic } from "./lib/haptics";
import { ThemeContext, useTheme } from "./lib/theme";
import { AuthProvider } from "./lib/auth.jsx";
import { useAuth } from "./lib/authContext.js";
import CookieConsent from "./components/CookieConsent.jsx";
import VisitorTracker from "./components/VisitorTracker.jsx";
import { useAnalyticsPageviews, useAnalyticsConsent, trackEvent } from "./lib/analytics.js";
import { useClarity } from "./lib/clarity.js";
import { useEngagementTracking } from "./lib/engagement.js";
import { AutoAds } from "./components/AdSense.jsx";
import LiveChat from "./components/LiveChat.jsx";
import AIChat from "./components/AIChat.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import "./App.css";
import "./styles/leadgen.css";
import "./styles/leadgen-extras.css";

// Lazy-load everything that isn't the homepage so the initial bundle stays
// small. The homepage is the most-visited route and stays eager.
const BlogIndex = lazy(() => import("./pages/BlogIndex"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const LocalLanding = lazy(() => import("./pages/LocalLanding"));
const IndustryLanding = lazy(() => import("./pages/IndustryLanding"));
const IndustriesHub = lazy(() => import("./pages/IndustriesHub"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Book = lazy(() => import("./pages/Book"));
const Support = lazy(() => import("./pages/Support"));
const ClientPortal = lazy(() => import("./pages/ClientPortalPublic"));
const LeadgenDashboard = lazy(() => import("./pages/LeadgenDashboard"));
const AdminOps = lazy(() => import("./pages/AdminOps"));
const PrivacyPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.TermsPage })));
const AccessibilityPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.AccessibilityPage })));
const Tools = lazy(() => import("./pages/Tools"));
const Services = lazy(() => import("./pages/Services"));
const PasswordCheck = lazy(() => import("./pages/PasswordCheck"));
const ServiceArea = lazy(() => import("./pages/ServiceArea"));
const Partners = lazy(() => import("./pages/Partners"));
const Stack = lazy(() => import("./pages/Stack"));
const Glossary = lazy(() => import("./pages/Glossary"));
const GlossaryEntry = lazy(() => import("./pages/GlossaryEntry"));
const ExposureScan = lazy(() => import("./pages/ExposureScan"));
const Advertise = lazy(() => import("./pages/Advertise"));
const CompareIndex = lazy(() => import("./pages/CompareIndex"));
const CompareDetail = lazy(() => import("./pages/CompareDetail"));
const WhyIndex = lazy(() => import("./pages/WhyIndex"));
const WhyVs = lazy(() => import("./pages/WhyVs"));
const Leadgen = lazy(() => import("./pages/Leadgen"));

// Exit-intent capture modal — lazy-loaded and mounted OUTSIDE the route
// <Suspense> fallback so route transitions aren't blocked on it. Renders
// null until the mouse crosses the top of the viewport after the 30s grace
// period, so it costs nothing on first paint.
const ExitIntentModal = lazy(() => import("./components/ExitIntentModal.jsx"));

// Routes where an exit-intent pitch is redundant or inappropriate. The admin
// portal is off-limits; the others already have their own prominent CTA and
// layering a second one on top would feel spammy.
function shouldShowExitIntent(pathname) {
  if (!pathname) return false;
  if (pathname.startsWith("/portal")) return false;
  const skip = new Set([
    "/book",
    "/support",
  ]);
  if (skip.has(pathname)) return false;
  return true;
}

function ExitIntentMount() {
  const { pathname } = useLocation();
  if (!shouldShowExitIntent(pathname)) return null;
  // No fallback — the modal is invisible until triggered anyway.
  return (
    <Suspense fallback={null}>
      <ExitIntentModal />
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="skeleton-header" />
      <div className="skeleton-hero">
        <div className="skeleton-line skeleton-line-lg" />
        <div className="skeleton-line skeleton-line-md" />
        <div className="skeleton-line skeleton-line-sm" />
        <div className="skeleton-ctas">
          <div className="skeleton-btn" />
          <div className="skeleton-btn skeleton-btn-ghost" />
        </div>
      </div>
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </div>
  );
}

const NAV_ICONS = {
  BookOpen,
  Briefcase,
  Calendar,
  FileText,
  Info,
  LayoutGrid,
  Lock,
  LogIn,
  MapPin,
  Search,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Target,
  UserIcon,
  Wrench,
};

function NavIcon({ name, size = 16 }) {
  const Icon = NAV_ICONS[name] || Info;
  return <Icon size={size} aria-hidden="true" />;
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${isDark ? "dark" : "light"}`}
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className="theme-toggle-aura" aria-hidden="true" />
      <span className="theme-toggle-orb" aria-hidden="true">
        <span className="theme-toggle-icon theme-toggle-icon--sun" data-active={!isDark}><Sun size={17} /></span>
        <span className="theme-toggle-icon theme-toggle-icon--moon" data-active={isDark}><Moon size={17} /></span>
      </span>
    </button>
  );
}

function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Simple IT SRQ home">
      <span className="brand-mono-mark" aria-hidden="true">
        <span className="brand-mono-s">S</span>
      </span>
      <svg style={{ display: "none" }} className="brand-legacy-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <defs>
          {/* Tile background — diagonal brand → deeper brand. */}
          <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="55%" stopColor="var(--brand-hover, #0A4F8A)" />
            <stop offset="100%" stopColor="#072E54" />
          </linearGradient>
          {/* Specular highlight along the top-left edge for depth. */}
          <linearGradient id="logo-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.30" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          {/* "S" gradient — pearl white → very subtle warm so the
              letterform reads sculpted, not flat-printed. */}
          <linearGradient id="logo-s" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#f3f4f6" />
          </linearGradient>
          {/* Status dot — amber accent w/ inner glow. */}
          <radialGradient id="logo-dot" cx="0.35" cy="0.35" r="0.7">
            <stop offset="0%"   stopColor="#FFE9A8" />
            <stop offset="55%"  stopColor="#FFD66B" />
            <stop offset="100%" stopColor="#E0A92E" />
          </radialGradient>
          {/* Subtle drop shadow under the S — reads as "lit from above". */}
          <filter id="logo-s-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" />
            <feOffset dy="0.6" result="off" />
            <feComponentTransfer><feFuncA type="linear" slope="0.45" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Faint corner-bracket pattern that sits behind the S to
              suggest "terminal / systems" without being noisy. */}
          <pattern id="logo-grid" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Base tile + 1px inner stroke for crispness on light bg. */}
        <rect x="0" y="0" width="36" height="36" rx="9" fill="url(#logo-bg)" />
        <rect x="0.5" y="0.5" width="35" height="35" rx="8.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.10" />
        <rect x="0" y="0" width="36" height="36" rx="9" fill="url(#logo-grid)" />
        <rect x="0" y="0" width="36" height="36" rx="9" fill="url(#logo-shine)" />

        {/* Corner brackets — IT/terminal cue, very subtle. */}
        <g stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1" strokeLinecap="round" fill="none">
          <path d="M 4 6 L 4 4 L 6 4" />
          <path d="M 32 4 L 30 4" />
          <path d="M 4 30 L 4 32 L 6 32" />
          <path d="M 32 30 L 32 32 L 30 32" />
        </g>

        {/* Geometric "S" — three rigid bars + alternating connectors,
            same path as public/favicon.svg shifted +2 to center inside
            the 36×36 viewBox. Built from straight 90° segments only so
            it stays crisp at any render size and reads architectural
            (Linear / Vercel mark vibe) instead of typeset. */}
        <path
          filter="url(#logo-s-shadow)"
          fill="url(#logo-s)"
          d="M 8 10 L 24 10 L 24 14 L 12 14 L 12 16 L 24 16 L 24 26 L 8 26 L 8 22 L 20 22 L 20 20 L 8 20 Z"
        />
        {/* Inner top-edge highlight on each bar — 0.6px white-translucent
            line for a hint of extrusion. Skip on the smallest renders
            via stroke-width fractional rounding. */}
        <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.6" fill="none">
          <path d="M 8.4 10.5 L 23.6 10.5" />
          <path d="M 12.4 16.5 L 23.6 16.5" />
          <path d="M 8.4 22.5 L 19.6 22.5" />
        </g>

        {/* Status dot — now glowing + ringed for "system online" vibe. */}
        <circle cx="27.5" cy="9.5" r="2.6" fill="#FFD66B" fillOpacity="0.18" />
        <circle cx="27.5" cy="9.5" r="2"   fill="url(#logo-dot)" />
        <circle cx="26.9" cy="8.9" r="0.55" fill="#FFFFFF" fillOpacity="0.85" />
      </svg>
      <span className="brand-text">
        <span className="brand-word">Simple</span>
        <span className="brand-meta">IT <span className="brand-accent">SRQ</span></span>
      </span>
    </Link>
  );
}

function DesktopMenuLink({ item, location, onNavigate }) {
  const active = isNavItemActive(item, location);
  return (
    <Link
      to={item.to}
      className={`nav-menu-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      role="menuitem"
    >
      <span className="nav-menu-icon"><NavIcon name={item.icon} size={17} /></span>
      <span className="nav-menu-copy">
        <span className="nav-menu-title">{item.label}</span>
        {item.description && <span className="nav-menu-desc">{item.description}</span>}
      </span>
    </Link>
  );
}

function DesktopNavSection({ section, location, openGroup, setOpenGroup }) {
  const active = isNavSectionActive(section, location);
  const closeTimerRef = useRef(null);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  if (!section.items?.length) {
    return (
      <Link
        to={section.to}
        className={`nav-top-link${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <NavIcon name={section.icon} size={15} />
        <span>{section.label}</span>
      </Link>
    );
  }

  const open = openGroup === section.id;
  const menuId = `nav-${section.id}-menu`;
  const openCurrentGroup = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenGroup(section.id);
  };
  const closeGroup = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenGroup((current) => (current === section.id ? null : current));
  };
  const scheduleCloseGroup = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpenGroup((current) => (current === section.id ? null : current));
    }, 450);
  };

  const focusFirstMenuItem = () => {
    window.requestAnimationFrame(() => {
      document.querySelector(`#${menuId} a`)?.focus();
    });
  };

  return (
    <div
      className={`nav-group${active ? " is-active" : ""}`}
      data-open={open ? "true" : "false"}
      onMouseEnter={openCurrentGroup}
      onMouseLeave={scheduleCloseGroup}
      onFocusCapture={openCurrentGroup}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeGroup();
      }}
    >
      <button
        type="button"
        className="nav-top-link nav-group-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpenGroup(open ? null : section.id)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openCurrentGroup();
            focusFirstMenuItem();
          }
          if (event.key === "Escape") closeGroup();
        }}
      >
        <NavIcon name={section.icon} size={15} />
        <span>{section.label}</span>
        <ChevronDown className="nav-chevron" size={14} aria-hidden="true" />
      </button>
      <div id={menuId} className="nav-dropdown" role="menu">
        {section.items.map((item) => (
          <DesktopMenuLink
            key={item.id}
            item={item}
            location={location}
            onNavigate={() => setOpenGroup(null)}
          />
        ))}
      </div>
    </div>
  );
}

function MobileNavLink({ item, location, onNavigate, compact = false }) {
  const active = isNavItemActive(item, location);
  const label = item.shortLabel || item.label;
  return (
    <Link
      to={item.to}
      className={`mobile-menu-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <span className="mobile-menu-icon"><NavIcon name={item.icon} size={16} /></span>
      <span className="mobile-menu-copy">
        <span>{label}</span>
        {!compact && item.description && <small>{item.description}</small>}
      </span>
    </Link>
  );
}

function MobileNavSection({ section, location, onNavigate }) {
  if (!section.items?.length) {
    return <MobileNavLink item={section} location={location} onNavigate={onNavigate} compact />;
  }

  return (
    <section className="mobile-nav-section" aria-labelledby={`mobile-${section.id}-title`}>
      <div className="mobile-nav-header" id={`mobile-${section.id}-title`}>
        <NavIcon name={section.icon} size={14} />
        <span>{section.label}</span>
      </div>
      <div className="mobile-nav-stack">
        {section.items.map((item) => (
          <MobileNavLink
            key={item.id}
            item={item}
            location={location}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

function Navbar() {
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
    setOpen(false);
    setOpenGroup(null);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.navMenu = "open";

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event) {
      if (
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
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

  // Signed-in pill (avatar + first name) or a "Sign In" button.
  const portalCta = loading ? null : user ? (
    <Link
      to="/portal"
      className={`link-btn nav-user${portalActive ? " is-active" : ""}`}
      title={`Signed in as ${user.email}`}
      aria-current={portalActive ? "page" : undefined}
    >
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" className="nav-avatar" />
        : <UserIcon size={16} />}
      <span>{user.name ? user.name.split(" ")[0] : "Portal"}</span>
    </Link>
  ) : (
    <Link
      to="/portal"
      className={`link-btn${portalActive ? " is-active" : ""}`}
      aria-current={portalActive ? "page" : undefined}
    >
      <LogIn size={16} style={{ marginRight: 6 }} />
      Sign In
    </Link>
  );

  return (
    <header
      className={`navbar${scrolled ? " navbar--scrolled" : ""}${open ? " navbar--menu-open" : ""}`}
      role="banner"
    >
      <div className="container nav-inner">
        <ReadingProgress />
        <Logo />
        <nav className="nav-links" aria-label="Primary">
          {PRIMARY_NAV.map((section) => (
            <DesktopNavSection
              key={section.id}
              section={section}
              location={location}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
            />
          ))}
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          {portalCta}
          <Link to="/book" className="btn btn-primary">Book a Call</Link>
        </div>
        <div className="nav-mobile-actions">
          <ThemeToggle />
          {/* Mobile-visible portal CTA — Safari user-test feedback was that
              "Sign In" was buried at the bottom of the hamburger menu and
              effectively invisible. Surfacing a compact pill here ensures
              the auth path is one tap away on every mobile viewport. */}
          {!loading && (
            user ? (
              <Link
                to="/portal"
                className={`nav-mobile-cta nav-mobile-cta--user${portalActive ? " is-active" : ""}`}
                aria-current={portalActive ? "page" : undefined}
                aria-label={`Open portal — signed in as ${user.email}`}
              >
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" className="nav-avatar" />
                  : <UserIcon size={16} />}
              </Link>
            ) : (
              <Link
                to="/portal"
                className={`nav-mobile-cta${portalActive ? " is-active" : ""}`}
                aria-label="Sign in"
                aria-current={portalActive ? "page" : undefined}
              >
                <LogIn size={14} />
                <span>Sign in</span>
              </Link>
            )
          )}
          <button
            ref={menuButtonRef}
            className="menu-btn"
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-primary-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-primary-menu"
          ref={menuRef}
          className="mobile-menu"
          aria-label="Mobile primary"
        >
          {PRIMARY_NAV.map((section) => (
            <MobileNavSection
              key={section.id}
              section={section}
              location={location}
              onNavigate={() => setOpen(false)}
            />
          ))}

          <div className="mobile-nav-divider" />
          <section className="mobile-nav-section mobile-nav-section--account" aria-labelledby="mobile-account-title">
            <div className="mobile-nav-header" id="mobile-account-title">
              <UserIcon size={14} aria-hidden="true" />
              <span>Account</span>
            </div>
            <MobileNavLink
              item={portalItem}
              location={location}
              onNavigate={() => setOpen(false)}
            />
            <Link
              to="/book"
              className="btn btn-primary mobile-menu-cta"
              onClick={() => setOpen(false)}
            >
              <Calendar size={16} aria-hidden="true" /> Book a Call
            </Link>
          </section>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p className="footer-desc">Local IT support, helpdesk, computer repair, security cameras, and enterprise IT — for businesses and homes across Sarasota, Bradenton, and Venice. A real team that picks up the phone.</p>
          <div style={{ marginTop: 20 }}>
            <a className="footer-email" href="mailto:hello@simpleitsrq.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text-1)', textDecoration: 'none', transition: 'all 0.2s ease' }}>
              <AtSign size={16} color="var(--brand)" /> hello@simpleitsrq.com
            </a>
          </div>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <h4>{column.title}</h4>
            <ul>
              {column.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div hidden>
          <h4>Resources</h4>
          <ul>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/glossary">Glossary</Link></li>
            <li><Link to="/exposure-scan">Free Exposure Scan</Link></li>
            <li><Link to="/tools">Recommended Tools</Link></li>
            {/* Vendor Stack is /stack (the page with the cost calculator).
                /partners is the partner-program page — different surface,
                kept as a separate link below to avoid the previous semantic
                404 where visitors clicked "Our Vendor Stack" expecting the
                tools and landed on the partners page instead. */}
            <li><Link to="/stack">Our Vendor Stack</Link></li>
            <li><Link to="/industries">Industries we serve</Link></li>
            <li><Link to="/partners">Partner Program</Link></li>
            <li><Link to="/book">Book a Call</Link></li>
            <li><Link to="/support">Support</Link></li>
          </ul>
        </div>
        <div>
          <h4>Service Area</h4>
          <ul className="footer-cities">
            {SERVICE_AREA_LINKS.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className={item.id === "service-area" ? "footer-cities-all" : undefined}
                >
                  <NavIcon name={item.icon} size={12} /> {item.label}
                </Link>
              </li>
            ))}
            <li><Link to="/service-area" className="footer-cities-all">View all markets →</Link></li>
          </ul>
          <p className="footer-area-note">Serving Southwest Florida — Sarasota and Manatee counties. Phone and email replies during business hours; on-site by scheduled appointment.</p>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>(c) {new Date().getFullYear()} Simple IT SRQ. All rights reserved.</span>
          <span>
            <Link to="/privacy">Privacy</Link> &middot;{" "}
            <Link to="/terms">Terms</Link> &middot;{" "}
            <Link to="/accessibility">Accessibility</Link> &middot;{" "}
            <a href="https://astatus.simpleitsrq.com" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="live-dot" style={{ width: 6, height: 6 }} /> System Status
            </a> &middot;{" "}
            {/* Reopens the cookie-consent banner so visitors can change
                their analytics/marketing choice without clearing
                localStorage. Required by GDPR + CCPA "withdraw consent"
                language in our Privacy Policy §3 / §7. */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("sirq:reopen-consent"))}
              style={{
                background: "none", border: "none", padding: 0,
                color: "inherit", cursor: "pointer",
                font: "inherit", textDecoration: "underline",
              }}
            >
              Cookie preferences
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.replace("#", ""));
      setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const navHeight = document.querySelector(".navbar")?.getBoundingClientRect().height || 0;
        const top = el.getBoundingClientRect().top + window.scrollY - navHeight - 16;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [pathname, hash]);
  return null;
}

function MobileStickyCTA() {
    // On first mount, detect and store preferred contact method for analytics
    useEffect(() => {
      const pref = detectPreferredContact();
      // Store in cookie for analytics (expires in 30 days)
      document.cookie = `preferred_contact=${pref}; path=/; max-age=2592000; SameSite=Lax`;
      // Optionally, fire analytics event
      trackEvent("preferred_contact_detected", { method: pref });
    }, []);
  const { pathname } = useLocation();
  // Hide where the CTA would be redundant (already-booking page) or
  // disruptive (signed-in portal area doesn't need a marketing CTA).
  if (pathname === "/book" || pathname.startsWith("/portal")) return null;

  // Bottom action bar — four channels in thumb-reach instead of one
  // single CTA. Each tap fires a GA4 event so the conversion report
  // tells us which channel mobile visitors actually use. The mailto/
  // tel: hrefs work on every mobile platform without an SDK.
  const tap = (channel) => () => trackEvent("mobile_cta_tap", { channel, source_path: pathname });

  return (
    <nav className="mobile-action-bar" role="navigation" aria-label="Quick contact">
      <a
        href="tel:+14072421456"
        className="mobile-action-bar__btn"
        onClick={tap("call")}
        aria-label="Call (407) 242-1456"
      >
        <Phone size={18} aria-hidden="true" />
        <span>Call</span>
      </a>
      <a
        href="sms:+14072421456?body=Hi%20Simple%20IT%20SRQ%20%E2%80%94%20"
        className="mobile-action-bar__btn"
        onClick={tap("sms")}
        aria-label="Text (407) 242-1456"
      >
        <MessageSquare size={18} aria-hidden="true" />
        <span>Text</span>
      </a>
      <a
        href="mailto:hello@simpleitsrq.com"
        className="mobile-action-bar__btn"
        onClick={tap("email")}
        aria-label="Email hello@simpleitsrq.com"
      >
        <Mail size={18} aria-hidden="true" />
        <span>Email</span>
      </a>
      <Link
        to="/book"
        className="mobile-action-bar__btn mobile-action-bar__btn--primary"
        onClick={tap("book")}
      >
        <Calendar size={18} aria-hidden="true" />
        <span>Book</span>
      </Link>
    </nav>
  );
}

function AnalyticsMount() {
  // GA4 Consent Mode v2 — syncs our consent banner choice to gtag on
  // mount and on every banner change, then fires page_view on every
  // react-router navigation. Component-with-hooks instead of inline
  // hooks in Layout so the router context is definitely available.
  useAnalyticsConsent();
  useAnalyticsPageviews();
  useClarity();
  useEngagementTracking();
  return null;
}

function Layout({ children }) {
  const location = useLocation();
  const isInternalOps =
    location.pathname.startsWith("/portal/ops") ||
    location.pathname.startsWith("/portal/opsec");

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {!isInternalOps && <Navbar />}
      <ScrollToHash />
      {!isInternalOps && <VisitorTracker />}
      {!isInternalOps && <AnalyticsMount />}
      {children}
      {!isInternalOps && <Footer />}
      {!isInternalOps && <MobileStickyCTA />}
      {!isInternalOps && <ExitIntentMount />}
      <ScrollToTop />
      {!isInternalOps && <CookieConsent />}
      {!isInternalOps && <AutoAds />}
      {!isInternalOps && <LiveChat />}
      {!isInternalOps && <AIChat />}
      {!isInternalOps && <Analytics />}
      {!isInternalOps && <SpeedInsights />}
    </>
  );
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.dataset.theme || "light"
      : "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // localStorage may be disabled (private mode, sandboxed iframe) — that's
      // fine, the theme just won't persist across sessions.
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B0D10" : "#111827");
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    toggle: () => {
      selectionHaptic();
      setTheme((t) => (t === "dark" ? "light" : "dark"));
    },
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

function ReadingProgress() {
  const { pathname } = useLocation();
  const enabled = pathname.startsWith("/blog/");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return undefined;
    }

    const handleScroll = () => {
      const winScroll = document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      setProgress(scrolled);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled]);

  if (!enabled) return null;
  return <div className="reading-progress" style={{ width: `${progress}%` }} />;
}

function AnimatedRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage("fadeOut");
      const t = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("fadeIn");
        window.scrollTo(0, 0);
      }, 180);
      return () => clearTimeout(t);
    }
  }, [location, displayLocation]);

  return (
    <div className={`page-transition ${transitionStage}`}>
      <Routes location={displayLocation}>
        <Route path="/" element={<main id="main"><Home /></main>} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/sarasota-it-support" element={<LocalLanding />} />
        <Route path="/bradenton-it-support" element={<LocalLanding />} />
        <Route path="/lakewood-ranch-it-support" element={<LocalLanding />} />
        <Route path="/nokomis-it-support" element={<LocalLanding />} />
        <Route path="/venice-it-support" element={<LocalLanding />} />
        <Route path="/bradenton-34207-it-support" element={<LocalLanding />} />
        {/* Industry-vertical landing pages use one-segment URLs such as
            /medical-it-sarasota and /construction-it-bradenton. React
            Router params cannot match partial path segments reliably, so
            the resolver route lives just before the final 404 catch-all
            and validates the slug inside IndustryLanding. */}
        <Route path="/industries" element={<IndustriesHub />} />
        <Route path="/service-area" element={<ServiceArea />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/book" element={<Book />} />
        <Route path="/support" element={<Support />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/services" element={<Services />} />
        <Route path="/stack" element={<Stack />} />
        <Route path="/tools-we-use" element={<Stack />} />
        <Route path="/advertise" element={<Advertise />} />
        <Route path="/sponsor" element={<Advertise />} />
        <Route path="/compare" element={<CompareIndex />} />
        <Route path="/compare/:slug" element={<CompareDetail />} />
        <Route path="/why" element={<WhyIndex />} />
        <Route path="/why/:slug" element={<WhyVs />} />
        <Route path="/leadgen" element={<Leadgen />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/glossary/:slug" element={<GlossaryEntry />} />
        <Route path="/exposure-scan" element={<ExposureScan />} />
        <Route path="/password-check" element={<PasswordCheck />} />
        <Route path="/portal" element={<ClientPortal />} />
        <Route path="/portal/leadgen" element={<LeadgenDashboard />} />
        <Route path="/portal/ops" element={<AdminOps />} />
        <Route path="/portal/opsec" element={<AdminOps />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />
        <Route path="/:slug" element={<IndustryLanding />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <BrowserRouter>
        <Layout>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <AnimatedRoutes />
          </Suspense>
          </ErrorBoundary>
        </Layout>
      </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
