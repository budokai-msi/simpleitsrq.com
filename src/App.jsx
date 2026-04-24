import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { Globe, AtSign, Share2, Menu, Sun, Moon, LogIn, User as UserIcon, MapPin, Phone, MessageSquare, Mail, Calendar } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
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
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./App.css";

// Lazy-load everything that isn't the homepage so the initial bundle stays
// small. The homepage is the most-visited route and stays eager.
const BlogIndex = lazy(() => import("./pages/BlogIndex"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const LocalLanding = lazy(() => import("./pages/LocalLanding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Book = lazy(() => import("./pages/Book"));
const Support = lazy(() => import("./pages/Support"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const PrivacyPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.TermsPage })));
const AccessibilityPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.AccessibilityPage })));
const Tools = lazy(() => import("./pages/Tools"));
const Store = lazy(() => import("./pages/Store"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const SecurityAcademy = lazy(() => import("./pages/SecurityAcademy"));
const PasswordCheck = lazy(() => import("./pages/PasswordCheck"));
const ServiceArea = lazy(() => import("./pages/ServiceArea"));
const Partners = lazy(() => import("./pages/Partners"));
const CyberInsuranceQuote = lazy(() => import("./pages/CyberInsuranceQuote"));
const Stack = lazy(() => import("./pages/Stack"));
const ComplianceAuditReferral = lazy(() => import("./pages/ComplianceAuditReferral"));
const Glossary = lazy(() => import("./pages/Glossary"));
const GlossaryEntry = lazy(() => import("./pages/GlossaryEntry"));
const ExposureScan = lazy(() => import("./pages/ExposureScan"));
const LiveThreats = lazy(() => import("./pages/LiveThreats"));
const Advertise = lazy(() => import("./pages/Advertise"));
const CompareIndex = lazy(() => import("./pages/CompareIndex"));
const CompareDetail = lazy(() => import("./pages/CompareDetail"));

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
    "/cyber-insurance-quote",
    "/compliance-audit-referral",
    "/support",
  ]);
  if (skip.has(pathname)) return false;
  // /store index is fine; /store/:slug product detail pages have their own buy CTA.
  if (/^\/store\/[^/]+/.test(pathname)) return false;
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
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <div className="route-spinner" aria-label="Loading" />
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span className="theme-toggle-icon" data-active={theme === "light"}><Sun size={16} /></span>
      <span className="theme-toggle-icon" data-active={theme === "dark"}><Moon size={16} /></span>
    </button>
  );
}

function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Simple IT SRQ home">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#0F6CBD" />
        <text x="16" y="22" textAnchor="middle" fontFamily="Segoe UI, system-ui, sans-serif"
              fontSize="18" fontWeight="700" fill="#FFFFFF">S</text>
      </svg>
      <span className="brand-text">Simple IT <span className="brand-accent">SRQ</span></span>
    </Link>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  // Signed-in pill (avatar + first name) or a "Sign In" button.
  const portalCta = loading ? null : user ? (
    <Link to="/portal" className="link-btn nav-user" title={`Signed in as ${user.email}`}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" className="nav-avatar" />
        : <UserIcon size={16} />}
      <span>{user.name ? user.name.split(" ")[0] : "Portal"}</span>
    </Link>
  ) : (
    <Link to="/portal" className="link-btn">
      <LogIn size={16} style={{ marginRight: 6 }} />
      Sign In
    </Link>
  );

  return (
    <header className="navbar" role="banner">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Primary">
          <Link to="/blog">Blog</Link>
          <Link to="/glossary">Glossary</Link>
          <Link to="/tools">Recommended Tools</Link>
          <Link to="/store">Templates &amp; Playbooks</Link>
          <Link to="/stack">Vendor Stack</Link>
          <Link to="/support">Support</Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          {portalCta}
          <Link to="/book" className="btn btn-primary">Book a Call</Link>
        </div>
        <div className="nav-mobile-actions">
          <ThemeToggle />
          <button className="menu-btn" aria-label="Open menu" onClick={() => setOpen(!open)}>
            <Menu size={20} />
          </button>
        </div>
      </div>
      {open && (
        <div className="mobile-menu" role="menu">
          <Link to="/blog" onClick={() => setOpen(false)}>Blog</Link>
          <Link to="/glossary" onClick={() => setOpen(false)}>Glossary</Link>
          <Link to="/exposure-scan" onClick={() => setOpen(false)}>Free Exposure Scan</Link>
          <Link to="/live-threats" onClick={() => setOpen(false)}>Live Threat Wall</Link>
          <Link to="/tools" onClick={() => setOpen(false)}>Recommended Tools</Link>
          <Link to="/store" onClick={() => setOpen(false)}>Templates &amp; Playbooks</Link>
          <Link to="/stack" onClick={() => setOpen(false)}>Vendor Stack</Link>
          <Link to="/support" onClick={() => setOpen(false)}>Support</Link>
          <Link to="/#industries" onClick={() => setOpen(false)}>Industries</Link>
          <Link to="/#compliance" onClick={() => setOpen(false)}>Compliance</Link>
          <Link to="/#contact" onClick={() => setOpen(false)}>Contact</Link>
          <Link to="/portal" onClick={() => setOpen(false)}>
            {user ? "My Portal" : "Sign In"}
          </Link>
          <Link to="/book" className="btn btn-primary" onClick={() => setOpen(false)}>Book a Call</Link>
        </div>
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
          <p className="footer-desc">Local IT support, cybersecurity, and cloud services for Sarasota, Bradenton, and Venice. A real team that picks up the phone.</p>
          <a className="footer-email" href="mailto:hello@simpleitsrq.com">
            <AtSign size={16} /> hello@simpleitsrq.com
          </a>
        </div>
        <div>
          <h4>What We Do</h4>
          <ul>
            <li><Link to="/#solutions">Everyday IT support</Link></li>
            <li><Link to="/#solutions">Cybersecurity</Link></li>
            <li><Link to="/#solutions">Microsoft 365 and cloud</Link></li>
            <li><Link to="/#solutions">Backups and recovery</Link></li>
          </ul>
        </div>
        <div>
          <h4>Resources</h4>
          <ul>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/tools">Recommended Tools</Link></li>
            <li><Link to="/store">Templates & Playbooks</Link></li>
            <li><Link to="/partners">Our Vendor Stack</Link></li>
            <li><Link to="/#industries">Industries</Link></li>
            <li><Link to="/#compliance">Compliance</Link></li>
            <li><Link to="/book">Book a Call</Link></li>
            <li><Link to="/support">Support</Link></li>
          </ul>
        </div>
        <div>
          <h4>Service Area</h4>
          <ul className="footer-cities">
            <li><Link to="/sarasota-it-support"><MapPin size={12} /> Sarasota</Link></li>
            <li><Link to="/bradenton-it-support"><MapPin size={12} /> Bradenton</Link></li>
            <li><Link to="/lakewood-ranch-it-support"><MapPin size={12} /> Lakewood Ranch</Link></li>
            <li><Link to="/nokomis-it-support"><MapPin size={12} /> Nokomis</Link></li>
            <li><Link to="/venice-it-support"><MapPin size={12} /> Venice</Link></li>
            <li><Link to="/service-area" className="footer-cities-all">View all markets →</Link></li>
          </ul>
          <p className="footer-area-note">Serving Southwest Florida. On-site response within 2 hours for Sarasota + Bradenton.</p>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>(c) {new Date().getFullYear()} Simple IT SRQ. All rights reserved.</span>
          <span>
            <Link to="/privacy">Privacy</Link> &middot;{" "}
            <Link to="/terms">Terms</Link> &middot;{" "}
            <Link to="/accessibility">Accessibility</Link>
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
      const id = hash.replace("#", "");
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname, hash]);
  return null;
}

function MobileStickyCTA() {
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
  return (
    <>
      <Navbar />
      <ScrollToHash />
      <VisitorTracker />
      <AnalyticsMount />
      {children}
      <Footer />
      <MobileStickyCTA />
      <ExitIntentMount />
      <CookieConsent />
      <AutoAds />
      <Analytics />
      <SpeedInsights />
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
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B0D10" : "#0F6CBD");
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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <BrowserRouter>
        <Layout>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<main id="main"><Home /></main>} />
              <Route path="/blog" element={<BlogIndex />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/sarasota-it-support" element={<LocalLanding />} />
              <Route path="/bradenton-it-support" element={<LocalLanding />} />
              <Route path="/lakewood-ranch-it-support" element={<LocalLanding />} />
              <Route path="/nokomis-it-support" element={<LocalLanding />} />
              <Route path="/venice-it-support" element={<LocalLanding />} />
              <Route path="/bradenton-34207-it-support" element={<LocalLanding />} />
              <Route path="/service-area" element={<ServiceArea />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/book" element={<Book />} />
              <Route path="/support" element={<Support />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/store" element={<Store />} />
              <Route path="/store/:slug" element={<ProductDetail />} />
              <Route path="/security-academy" element={<SecurityAcademy />} />
              <Route path="/cyber-insurance-quote" element={<CyberInsuranceQuote />} />
              <Route path="/stack" element={<Stack />} />
              <Route path="/tools-we-use" element={<Stack />} />
              <Route path="/compliance-audit-referral" element={<ComplianceAuditReferral />} />
              <Route path="/advertise" element={<Advertise />} />
              <Route path="/sponsor" element={<Advertise />} />
              <Route path="/compare" element={<CompareIndex />} />
              <Route path="/compare/:slug" element={<CompareDetail />} />
              <Route path="/glossary" element={<Glossary />} />
              <Route path="/glossary/:slug" element={<GlossaryEntry />} />
              <Route path="/exposure-scan" element={<ExposureScan />} />
              <Route path="/live-threats" element={<LiveThreats />} />
              <Route path="/password-check" element={<PasswordCheck />} />
              <Route path="/portal" element={<ClientPortal />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/accessibility" element={<AccessibilityPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </Layout>
      </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
