import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Link } from "./lib/Link";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { Globe, AtSign, Share2, Menu, Sun, Moon, LogIn, User as UserIcon, MapPin, Phone, MessageSquare, Mail, Calendar, LayoutGrid, ShoppingBag, Tag, BookOpen, Shield, ShieldAlert, Wrench, FileText, Info, Briefcase } from "lucide-react";
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
import LiveChat from "./components/LiveChat.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import "./App.css";

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
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const PrivacyPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.TermsPage })));
const AccessibilityPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.AccessibilityPage })));
const Tools = lazy(() => import("./pages/Tools"));
const Store = lazy(() => import("./pages/Store"));
const Services = lazy(() => import("./pages/Services"));
const WispStarter = lazy(() => import("./pages/WispStarter"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminAffiliates = lazy(() => import("./pages/AdminAffiliates"));
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
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <defs>
          <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-hover, #0A4F8A)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="36" height="36" rx="9" fill="url(#logo-bg)" />
        <path
          d="M23.5 12.4c-1.2-1.4-3.1-2.2-5.3-2.2-3.7 0-6.4 2.1-6.4 5.1 0 2.7 1.9 4.1 5.2 4.8l1.7.4c1.9.4 2.7 1 2.7 2 0 1.2-1.2 2-3.2 2-1.9 0-3.4-.7-4.6-1.9l-1.9 2.3c1.6 1.7 3.9 2.7 6.4 2.7 4 0 6.6-2.1 6.6-5.3 0-2.7-1.7-4.1-5.2-4.8l-1.8-.4c-1.7-.4-2.5-.9-2.5-1.9 0-1.1 1.1-1.9 2.9-1.9 1.6 0 2.9.6 3.9 1.6l1.5-2.1z"
          fill="#FFFFFF"
        />
        <circle cx="27.5" cy="9.5" r="2" fill="#FFD66B" />
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
        <ReadingProgress />
        <Logo />
        <nav className="nav-links" aria-label="Primary">
          <Link to="/#solutions">Services</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/support" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="live-dot" /> Support
          </Link>
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
          <div className="mobile-nav-header">Services</div>
          <Link to="/#solutions" onClick={() => setOpen(false)}><LayoutGrid size={16} /> All Services</Link>
          <Link to="/services" onClick={() => setOpen(false)}><ShoppingBag size={16} /> Buy a Service</Link>
          <Link to="/pricing" onClick={() => setOpen(false)}><Tag size={16} /> Pricing</Link>
          <Link to="/industries" onClick={() => setOpen(false)}><Briefcase size={16} /> Industries we serve</Link>
          <Link to="/stack" onClick={() => setOpen(false)}><Shield size={16} /> Vendor Stack</Link>
          
          <div className="mobile-nav-divider" />
          <div className="mobile-nav-header">Resources</div>
          <Link to="/blog" onClick={() => setOpen(false)}><BookOpen size={16} /> Blog</Link>
          <Link to="/exposure-scan" onClick={() => setOpen(false)}><ShieldAlert size={16} /> Free Exposure Scan</Link>
          <Link to="/tools" onClick={() => setOpen(false)}><Wrench size={16} /> Recommended Tools</Link>
          <Link to="/store" onClick={() => setOpen(false)}><FileText size={16} /> Templates & Playbooks</Link>
          <Link to="/glossary" onClick={() => setOpen(false)}><Info size={16} /> Glossary</Link>
          
          <div className="mobile-nav-divider" />
          <div className="mobile-nav-header">Account</div>
          <Link to="/portal" onClick={() => setOpen(false)}>
            <UserIcon size={16} /> {user ? "My Portal" : "Sign In"}
          </Link>
          <Link to="/support" onClick={() => setOpen(false)}><Shield size={16} /> Support</Link>
          <div style={{ marginTop: 12 }}>
            <Link to="/book" className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={() => setOpen(false)}>
              <Calendar size={16} /> Book a Call
            </Link>
          </div>
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
          <p className="footer-desc">Local IT support, helpdesk, computer repair, security cameras, and enterprise IT — for businesses and homes across Sarasota, Bradenton, and Venice. A real team that picks up the phone.</p>
          <div style={{ marginTop: 20 }}>
            <a className="footer-email" href="mailto:hello@simpleitsrq.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text-1)', textDecoration: 'none', transition: 'all 0.2s ease' }}>
              <AtSign size={16} color="var(--brand)" /> hello@simpleitsrq.com
            </a>
          </div>
        </div>
        <div>
          <h4>What We Do</h4>
          <ul>
            <li><Link to="/#solutions">Helpdesk and IT support</Link></li>
            <li><Link to="/#solutions">Computer repair</Link></li>
            <li><Link to="/#solutions">Security cameras</Link></li>
            <li><Link to="/#solutions">Enterprise domains and migrations</Link></li>
            <li><Link to="/#solutions">Cybersecurity</Link></li>
            <li><Link to="/#solutions">Microsoft 365 and cloud</Link></li>
            <li><Link to="/#solutions">Backups and recovery</Link></li>
          </ul>
        </div>
        <div>
          <h4>Resources</h4>
          <ul>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/glossary">Glossary</Link></li>
            <li><Link to="/exposure-scan">Free Exposure Scan</Link></li>
            <li><Link to="/tools">Recommended Tools</Link></li>
            <li><Link to="/store">Templates &amp; Playbooks</Link></li>
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
            <li><Link to="/sarasota-it-support"><MapPin size={12} /> Sarasota</Link></li>
            <li><Link to="/bradenton-it-support"><MapPin size={12} /> Bradenton</Link></li>
            <li><Link to="/lakewood-ranch-it-support"><MapPin size={12} /> Lakewood Ranch</Link></li>
            <li><Link to="/nokomis-it-support"><MapPin size={12} /> Nokomis</Link></li>
            <li><Link to="/venice-it-support"><MapPin size={12} /> Venice</Link></li>
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
      <ScrollToTop />
      <CookieConsent />
      <AutoAds />
      <LiveChat />
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

function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      const winScroll = document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      setProgress(scrolled);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return <div className="reading-progress" style={{ width: `${progress}%` }} />;
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
              <Route path="/store" element={<Store />} />
              <Route path="/services" element={<Services />} />
              <Route path="/wisp-starter" element={<WispStarter />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/admin/affiliates" element={<AdminAffiliates />} />
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
              <Route path="/:slug" element={<IndustryLanding />} />
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
