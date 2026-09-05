import { detectPreferredContact } from "./lib/detectPreferredContact";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Link } from "./lib/Link";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import {
  AtSign, Menu, X, ChevronDown, Sun, Moon, LogIn, User as UserIcon, MapPin,
  Phone, MessageSquare, Mail, Calendar, LayoutGrid, ShoppingBag, BookOpen,
  Shield, ShieldAlert, Wrench, FileText, Info, Briefcase, Target, Search, Lock,
  Star,
} from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
import {
  FOOTER_COLUMNS,
  PRIMARY_NAV,
  SERVICE_AREA_LINKS,
} from "./data/navigation";
import { cityList } from "./data/cities";
import { initGlobalHaptics, selectionHaptic } from "./lib/haptics";
import { ThemeContext, useTheme } from "./lib/theme";
import { AuthProvider } from "./lib/auth.jsx";
import { useAuth } from "./lib/authContext.js";
import CookieConsent from "./components/CookieConsent.jsx";
import VisitorTracker from "./components/VisitorTracker.jsx";
import { useAnalyticsPageviews, useAnalyticsConsent, trackEvent } from "./lib/analytics.js";
import { useClarity } from "./lib/clarity.js";
import { useEngagementTracking } from "./lib/engagement.js";
import { captureUtmParams } from "./lib/utm.js";
import { AutoAds } from "./components/AdSense.jsx";
import LiveChat from "./components/LiveChat.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
// NOTE: leadgen.css is intentionally NOT imported here. It's ~97KB of
// dashboard-only styles, so each lazy-loaded leadgen route (Leadgen,
// LeadgenDashboard, AdminOps) imports it itself and Vite splits it into a
// CSS chunk that only leadgen visitors download.

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
const CompareIndex = lazy(() => import("./pages/CompareIndex"));
const CompareDetail = lazy(() => import("./pages/CompareDetail"));
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
      className="btn btn-ghost btn-square btn-sm"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}

function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Simple IT SRQ home">
      <span className="brand-mono-mark" aria-hidden="true">
        <span className="brand-mono-s">S</span>
      </span>
      <span className="brand-text">
        <span className="brand-word">Simple</span>
        <span className="brand-meta">IT <span className="brand-accent">SRQ</span></span>
      </span>
    </Link>
  );
}

import { Navbar as MainNavbar } from "./components/Navbar";

function Navbar() {
  return <MainNavbar logo={Logo} themeToggle={ThemeToggle} />;
}

function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="container site-footer-grid">
        <aside className="site-footer-brand">
          <Logo />
          <p className="site-footer-desc">Computer repair and practical business IT support for Sarasota and Bradenton, plus Leadgen for local prospect research. Clear scope, useful answers, and no oversized promises.</p>
          <div style={{ marginTop: 20 }}>
            <a className="site-footer-email" href="mailto:hello@simpleitsrq.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text-1)', textDecoration: 'none' }}>
              <AtSign size={16} color="var(--brand)" /> hello@simpleitsrq.com
            </a>
            <a
              href="https://maps.app.goo.gl/TLXwRHgQSFnUMd3P6"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text-1)', textDecoration: 'none' }}
            >
              <Star size={16} color="var(--brand)" /> Leave a Google review
            </a>
          </div>
        </aside>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title}>
            <h6 className="footer-title">{column.title}</h6>
            <ul>
              {column.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <nav>
          <h6 className="footer-title">Resources</h6>
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
        </nav>
        <nav>
          <h6 className="footer-title">Service Area</h6>
          <ul className="site-footer-cities">
            {SERVICE_AREA_LINKS.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className={item.id === "service-area" ? "site-footer-cities-all" : undefined}
                >
                  <NavIcon name={item.icon} size={12} /> {item.label}
                </Link>
              </li>
            ))}
            <li><Link to="/service-area" className="site-footer-cities-all">View all markets →</Link></li>
          </ul>
          <p className="site-footer-area-note">Serving Southwest Florida - Sarasota and Manatee counties. Phone and email replies during business hours; on-site by scheduled appointment.</p>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <div className="container site-footer-bottom-inner">
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
              className="site-footer-cookie-prefs"
              onClick={() => window.dispatchEvent(new CustomEvent("sirq:reopen-consent"))}
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
        const navHeight = document.querySelector("header[role=banner]")?.getBoundingClientRect().height || 0;
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
        href="tel:+18134343230"
        className="mobile-action-bar__btn"
        onClick={tap("call")}
        aria-label="Call (813) 434-3230"
      >
        <Phone size={18} aria-hidden="true" />
        <span>Call</span>
      </a>
      <a
        href="sms:+18134343230?body=Hi%20Simple%20IT%20SRQ%20-%20"
        className="mobile-action-bar__btn"
        onClick={tap("sms")}
        aria-label="Text (813) 434-3230"
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
  // Capture gclid / UTM params into session+local storage once per
  // landing so every lead form submission on this visit can be tagged
  // with the ad channel that brought the visitor in.
  useEffect(() => {
    captureUtmParams();
  }, []);
  return null;
}

function Layout({ children }) {
  const location = useLocation();
  const isInternalOps =
    location.pathname.startsWith("/portal/ops") ||
    location.pathname.startsWith("/portal/opsec");
  const isLeadgenProduct = location.pathname === "/leadgen";

  return (
    <>
      <a className="skip-link btn btn-sm" href="#main">Skip to main content</a>
      {!isInternalOps && <Navbar />}
      <ScrollToHash />
      {!isInternalOps && <VisitorTracker />}
      {!isInternalOps && <AnalyticsMount />}
      {children}
      {!isInternalOps && <Footer />}
      {!isInternalOps && !isLeadgenProduct && <MobileStickyCTA />}
      {!isInternalOps && <ExitIntentMount />}
      <ScrollToTop />
      {!isInternalOps && <CookieConsent />}
      {!isInternalOps && <AutoAds />}
      {!isInternalOps && <LiveChat />}
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

function OwnerOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user?.isAdmin) return <NotFound />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      let swapTimer;
      const fadeTimer = window.setTimeout(() => {
        setTransitionStage("fadeOut");
        swapTimer = window.setTimeout(() => {
          setDisplayLocation(location);
          setTransitionStage("fadeIn");
          window.scrollTo(0, 0);
        }, 180);
      }, 0);
      return () => {
        window.clearTimeout(fadeTimer);
        if (swapTimer) window.clearTimeout(swapTimer);
      };
    }
  }, [location, displayLocation]);

  return (
    <div className={`page-transition ${transitionStage}`}>
      <Routes location={displayLocation}>
        <Route path="/" element={<main id="main"><Home /></main>} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        {/* City landing pages are data-driven from src/data/cities.js — add a
            city there and it gets a route, a sitemap entry, and industry × city
            pages automatically. */}
        {cityList.map((c) => (
          <Route key={c.slug} path={`/${c.slug}`} element={<LocalLanding />} />
        ))}
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
        <Route path="/compare" element={<CompareIndex />} />
        <Route path="/compare/:slug" element={<CompareDetail />} />
        <Route path="/why" element={<Navigate to="/compare" replace />} />
        <Route path="/why/:slug" element={<Navigate to="/compare" replace />} />
        <Route path="/advertise" element={<Navigate to="/services" replace />} />
        <Route path="/sponsor" element={<Navigate to="/services" replace />} />
        <Route path="/leadgen" element={<Leadgen />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/glossary/:slug" element={<GlossaryEntry />} />
        <Route path="/exposure-scan" element={<ExposureScan />} />
        <Route path="/password-check" element={<PasswordCheck />} />
        <Route path="/portal" element={<ClientPortal />} />
        <Route path="/portal/leadgen" element={<OwnerOnlyRoute><LeadgenDashboard /></OwnerOnlyRoute>} />
        <Route path="/portal/ops" element={<OwnerOnlyRoute><AdminOps /></OwnerOnlyRoute>} />
        <Route path="/portal/opsec" element={<OwnerOnlyRoute><AdminOps /></OwnerOnlyRoute>} />
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
  useEffect(() => {
    return initGlobalHaptics();
  }, []);

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

