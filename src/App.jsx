import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { Globe, AtSign, Share2, Menu, Sun, Moon } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
import { selectionHaptic } from "./lib/haptics";
import "./App.css";

// Lazy-load everything that isn't the homepage so the initial bundle stays
// small. The homepage is the most-visited route and stays eager.
const BlogIndex = lazy(() => import("./pages/BlogIndex"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.TermsPage })));
const AccessibilityPage = lazy(() => import("./pages/Legal").then((m) => ({ default: m.AccessibilityPage })));

function RouteFallback() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <div className="route-spinner" aria-label="Loading" />
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.dataset.theme || "light"
      : "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0B0D10" : "#0F6CBD");
  }, [theme]);

  const toggle = () => {
    selectionHaptic();
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

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
  return (
    <header className="navbar" role="banner">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Primary">
          <Link to="/#solutions">Solutions</Link>
          <Link to="/#industries">Industries</Link>
          <Link to="/#compliance">Compliance</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/#contact">Contact</Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <a
            href="https://billing.stripe.com/p/login/5kQ7sE7oL9OEgIM2nPak000"
            target="_blank"
            rel="noopener noreferrer"
            className="link-btn"
          >
            Client Portal
          </a>
          <Link to="/#contact" className="btn btn-primary">Get Started</Link>
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
          <Link to="/#solutions" onClick={() => setOpen(false)}>Solutions</Link>
          <Link to="/#industries" onClick={() => setOpen(false)}>Industries</Link>
          <Link to="/#compliance" onClick={() => setOpen(false)}>Compliance</Link>
          <Link to="/blog" onClick={() => setOpen(false)}>Blog</Link>
          <Link to="/#contact" onClick={() => setOpen(false)}>Contact</Link>
          <a
            href="https://billing.stripe.com/p/login/5kQ7sE7oL9OEgIM2nPak000"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            Client Portal
          </a>
          <Link to="/#contact" className="btn btn-primary" onClick={() => setOpen(false)}>Get Started</Link>
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
          <p className="footer-desc">Managed IT, cybersecurity, and cloud services for the Suncoast. SentinelOne, Microsoft Defender, Intune, Fortinet and Meraki - delivered locally.</p>
          <div className="socials" aria-label="Social media">
            <a href="#" aria-label="LinkedIn"><Globe size={18} /></a>
            <a href="#" aria-label="Facebook"><AtSign size={18} /></a>
            <a href="#" aria-label="Twitter"><Share2 size={18} /></a>
          </div>
        </div>
        <div>
          <h4>Solutions</h4>
          <ul>
            <li><Link to="/#solutions">Managed IT</Link></li>
            <li><Link to="/#solutions">Cybersecurity and MDR</Link></li>
            <li><Link to="/#solutions">Microsoft 365 and Azure</Link></li>
            <li><Link to="/#solutions">Backup and DR</Link></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><Link to="/#industries">Industries</Link></li>
            <li><Link to="/#compliance">Compliance</Link></li>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/#contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li>hello@simpleitsrq.com</li>
            <li>Bradenton, FL</li>
          </ul>
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

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <ScrollToHash />
      {children}
      <Footer />
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<main id="main"><Home /></main>} />
            <Route path="/blog" element={<BlogIndex />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/accessibility" element={<AccessibilityPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
