// src/pages/ClientPortal.jsx
//
// Two-mode page:
//   1. Signed out → "Client Sign In" card with Google + GitHub buttons and a
//      summary of what clients can do inside the portal. Keeps the same
//      Fluent UI shell used by every other portal view.
//   2. Signed in → tabbed dashboard (Overview, Open tickets, Closed tickets,
//      Invoices, Profile) backed by /api/portal/* endpoints.
//
// Fluent UI is kept inside the lazy portal chunk — this page is the only
// consumer of FluentProvider, so the runtime never ships with the homepage.

import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FluentProvider,
  Title2,
  Title3,
  Subtitle2,
  Body1,
  Body2,
  Caption1,
  Button,
  Avatar,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  TabList,
  Tab,
  Input,
  Field,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Textarea,
  Dropdown,
  Option,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  Receipt24Regular,
  TicketDiagonal24Regular,
  CalendarClock24Regular,
  PersonSupport24Regular,
  ShieldCheckmark24Regular,
  Open16Regular,
  ArrowRight16Regular,
  SignOut24Regular,
  Person24Regular,
  DocumentText24Regular,
  Eye24Regular,
  Globe24Regular,
  DocumentEdit24Regular,
  Sparkle24Regular,
  Checkmark24Regular,
  Dismiss24Regular,
  Alert16Regular,
  ShieldTask24Regular,
  Delete24Regular,
} from "@fluentui/react-icons";
import { useTheme } from "../lib/theme";
import { brandedLightTheme, brandedDarkTheme } from "../lib/fluentTheme";
import { useAuth } from "../lib/authContext.js";
import { useSEO } from "../lib/seo";
import { csrfFetch } from "../lib/csrf";

// Shared formatters — hoisted to module scope so React's purity rules don't
// flag them as impure calls during render (Date.now inside a component body
// is the actual complaint).
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
const ago = (iso) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

// ---------- styles ----------
const useStyles = makeStyles({
  shell: {
    maxWidth: "1100px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: "24px",
    paddingRight: "24px",
    paddingTop: "48px",
    paddingBottom: "72px",
    "@media (max-width: 720px)": {
      paddingLeft: "14px",
      paddingRight: "14px",
      paddingTop: "24px",
      paddingBottom: "40px",
    },
  },

  // signed-out card
  signInWrap: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "24px",
    "@media (min-width: 840px)": {
      gridTemplateColumns: "1.1fr 0.9fr",
    },
  },
  signInCard: {
    padding: "32px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  signInHeader: {
    marginBottom: "24px",
  },
  providerList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "24px",
  },
  providerBtn: {
    justifyContent: "center",
    height: "48px",
    fontSize: "15px",
    fontWeight: 600,
  },
  providerBtnPrimary: {
    // Force the primary provider button (Continue with Google) to the brand
    // blue so it reads as the primary action. Without this the default Fluent
    // primary button can render as a muted gray on some platforms.
    backgroundColor: "#0F6CBD",
    color: "#ffffff",
    borderColor: "#0F6CBD",
    "&:hover": { backgroundColor: "#0C5AA6", borderColor: "#0C5AA6", color: "#ffffff" },
    "&:active": { backgroundColor: "#094A88", borderColor: "#094A88", color: "#ffffff" },
  },
  signInFoot: {
    marginTop: "20px",
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    lineHeight: "18px",
  },
  signInSide: {
    padding: "32px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  featureList: {
    marginTop: "18px",
    display: "grid",
    gap: "14px",
  },
  feature: {
    display: "flex",
    gap: "14px",
    alignItems: "center",
  },
  featureIcon: {
    width: "40px",
    height: "40px",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: "#EAF3FB",
    color: "#0F6CBD",
    "& svg": { width: "22px", height: "22px" },
  },

  // dashboard
  dashHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
    "@media (max-width: 720px)": {
      gap: "10px",
      marginBottom: "16px",
    },
  },
  dashHeadLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    "@media (max-width: 720px)": {
      gap: "10px",
    },
  },
  dashGreeting: {
    margin: 0,
    lineHeight: 1.2,
    "@media (max-width: 720px)": {
      fontSize: "17px !important",
    },
  },
  dashEmail: {
    color: tokens.colorNeutralForeground3,
    fontSize: "13px",
    "@media (max-width: 720px)": {
      fontSize: "12px",
      wordBreak: "break-all",
    },
  },
  tabs: {
    marginBottom: "20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    "@media (max-width: 720px)": {
      overflowX: "auto",
      flexWrap: "nowrap",
      WebkitOverflowScrolling: "touch",
      marginBottom: "16px",
    },
  },
  panel: {
    marginTop: "24px",
    "@media (max-width: 720px)": {
      marginTop: "16px",
    },
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "12px",
    "@media (max-width: 720px)": {
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
    },
    "@media (max-width: 420px)": {
      gridTemplateColumns: "1fr",
    },
  },
  statCard: {
    padding: "18px 20px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 720px)": {
      padding: "14px 16px",
    },
  },
  statLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: 700,
    marginTop: "4px",
    color: tokens.colorNeutralForeground1,
    "@media (max-width: 720px)": {
      fontSize: "22px",
    },
  },

  // list (tickets / invoices)
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "12px",
  },
  listRow: {
    padding: "16px 18px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    gap: "16px",
    alignItems: "center",
    justifyContent: "space-between",
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      borderColor: tokens.colorNeutralStroke1,
    },
    ":focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "2px",
    },
    "@media (max-width: 720px)": {
      padding: "12px 14px",
      gap: "10px",
      flexDirection: "column",
      alignItems: "flex-start",
    },
  },
  listMain: {
    minWidth: 0,
    flex: 1,
  },
  listTitle: {
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    "@media (max-width: 720px)": {
      whiteSpace: "normal",
      wordBreak: "break-word",
    },
  },
  listMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    marginTop: "4px",
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    "@media (max-width: 720px)": {
      gap: "6px",
      fontSize: "11px",
    },
  },
  listAside: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  },
  emptyState: {
    marginTop: "16px",
    padding: "32px",
    textAlign: "center",
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground3,
  },

  // profile form
  profileForm: {
    display: "grid",
    gap: "16px",
    maxWidth: "520px",
    marginTop: "12px",
  },
  profileActions: {
    display: "flex",
    gap: "10px",
    marginTop: "4px",
  },

  // ticket detail modal
  detailSurface: {
    width: "min(720px, 94vw)",
    maxWidth: "720px",
    // Cap to the viewport on mobile so the whole dialog can scroll when the
    // thread + description overflow. Inner thread keeps its own scroll for
    // long conversations on desktop.
    maxHeight: "calc(100vh - 40px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "@media (max-width: 720px)": {
      width: "100vw",
      maxWidth: "100vw",
      maxHeight: "100vh",
      borderRadius: 0,
    },
  },
  detailHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  detailMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
  },
  detailDescription: {
    whiteSpace: "pre-wrap",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: "14px",
    lineHeight: "22px",
    marginTop: "12px",
  },
  threadHeading: {
    fontSize: "13px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginTop: "20px",
    marginBottom: "8px",
  },
  thread: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "320px",
    overflowY: "auto",
    padding: "4px",
  },
  threadMsg: {
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  threadMsgAgent: {
    backgroundColor: tokens.colorBrandBackground2,
    borderColor: tokens.colorBrandStroke2,
  },
  threadMsgSystem: {
    backgroundColor: tokens.colorNeutralBackground3,
    fontStyle: "italic",
  },
  threadHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    marginBottom: "6px",
  },
  threadBody: {
    whiteSpace: "pre-wrap",
    fontSize: "14px",
    lineHeight: "21px",
    color: tokens.colorNeutralForeground1,
  },
  replyBox: {
    marginTop: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  adminBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    marginTop: "12px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },

  // search box above ticket lists
  ticketSearch: {
    maxWidth: "320px",
    marginTop: "12px",
  },

  // quick link tiles below the dashboard
  quickTiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "12px",
    marginTop: "32px",
  },
  quickTile: {
    padding: "16px 18px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    textDecoration: "none",
    color: "inherit",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
});

// ---------- helpers ----------
const STRIPE_BILLING_URL = "https://billing.stripe.com/p/login/5kQ7sE7oL9OEgIM2nPak000";

const STATUS_COLORS = {
  open:         "informative",
  in_progress:  "brand",
  waiting:      "warning",
  resolved:     "success",
  closed:       "subtle",
};
const STATUS_LABELS = {
  open:         "Open",
  in_progress:  "In progress",
  waiting:      "Waiting on you",
  resolved:     "Resolved",
  closed:       "Closed",
};
const PRIORITY_LABELS = {
  low:      "Low",
  normal:   "Normal",
  high:     "High",
  critical: "Critical",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(cents, currency = "usd") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  }
}

// ---------- sign-in view ----------
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6c1.9-5.6 7.1-9.7 13.6-9.7z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.8-2.1 5.2-4.6 6.8l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.8z"/>
      <path fill="#FBBC05" d="M10.4 28.8c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.8-6C.9 17.6 0 20.7 0 24s.9 6.4 2.6 9.2l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.1 2.2-6.5 0-12-4.1-13.9-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
function GitHubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function SignInView({ styles, authError, onLogin, providers }) {
  const hasGoogle = providers.includes("google");
  const hasGitHub = providers.includes("github");
  const hasAuth0 = providers.includes("auth0");

  return (
    <div className={styles.signInWrap}>
      <div className={styles.signInCard}>
        <div className={styles.signInHeader}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: tokens.colorNeutralForeground1 }}>Client Sign In</h1>
          <p style={{ color: tokens.colorNeutralForeground2, marginTop: 10, marginBottom: 0, fontSize: 15, lineHeight: "24px" }}>
            Sign in to view your support tickets, invoices, and account details.
          </p>
        </div>

        {authError && (
          <MessageBar intent="error" style={{ marginBottom: 16 }}>
            <MessageBarBody>
              {authError === "unverified_email" && "Your email isn't verified. Please verify it and try again."}
              {authError === "no_email" && "We couldn't read an email from your account. Add a verified email and retry."}
              {authError === "access_denied" && "Sign-in was cancelled."}
              {authError === "server" && "Something went wrong. Please try again."}
              {!["unverified_email", "no_email", "access_denied", "server"].includes(authError) &&
                `Sign-in error: ${authError}`}
            </MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.providerList}>
          {hasGoogle && (
            <Button
              appearance="primary"
              className={`${styles.providerBtn} ${styles.providerBtnPrimary}`}
              icon={<GoogleGlyph />}
              onClick={() => onLogin("google")}
            >
              Continue with Google
            </Button>
          )}
          {hasGitHub && (
            <Button
              className={styles.providerBtn}
              icon={<GitHubGlyph />}
              onClick={() => onLogin("github")}
            >
              Continue with GitHub
            </Button>
          )}
          {hasAuth0 && (
            <Button
              className={styles.providerBtn}
              style={{ background: "#EB5424", color: "#fff" }}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>}
              onClick={() => onLogin("auth0")}
            >
              Enterprise SSO (Okta / Azure AD)
            </Button>
          )}
          {!hasGoogle && !hasGitHub && !hasAuth0 && (
            <p style={{ color: tokens.colorNeutralForeground3, textAlign: "center", padding: 16, fontSize: 14, margin: 0 }}>
              Sign-in providers are being configured. Check back shortly or
              email <a href="mailto:hello@simpleitsrq.com">hello@simpleitsrq.com</a>.
            </p>
          )}
        </div>

        <p className={styles.signInFoot}>
          By continuing you agree to our <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>. We only store your name,
          email, and profile picture from your sign-in provider.
        </p>
      </div>

      <aside className={styles.signInSide} aria-label="What you get in the portal">
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: tokens.colorBrandForeground1, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <ShieldCheckmark24Regular style={{ width: 14, height: 14 }} /> Inside the portal
        </span>
        <h3 style={{ margin: "10px 0 0", fontSize: 20, fontWeight: 600, color: tokens.colorNeutralForeground1 }}>Everything in one place</h3>
        <div className={styles.featureList}>
          {[
            { Icon: TicketDiagonal24Regular, title: "Open support tickets", desc: "Track what your tech is working on right now." },
            { Icon: DocumentText24Regular, title: "Ticket history", desc: "Read every closed ticket and how it was resolved." },
            { Icon: Receipt24Regular, title: "Invoices and billing", desc: "Download invoices, update your card, view receipts." },
            { Icon: Person24Regular, title: "Your account info", desc: "Company, phone number, contact details — all editable." },
          ].map((f) => (
            <div key={f.title} className={styles.feature}>
              <span className={styles.featureIcon}><f.Icon /></span>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: tokens.colorNeutralForeground1 }}>{f.title}</p>
                <p style={{ color: tokens.colorNeutralForeground3, fontSize: 13, lineHeight: "20px", margin: "3px 0 0" }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ---------- dashboard panels ----------
function Overview({ styles, user, openCount, closedCount, unpaidCount }) {
  return (
    <div className={styles.panel}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: tokens.colorNeutralForeground1 }}>Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}.</h2>
      <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
        Here's a quick look at your account.
      </p>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Open tickets</div>
          <div className={styles.statValue}>{openCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Closed tickets</div>
          <div className={styles.statValue}>{closedCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Unpaid invoices</div>
          <div className={styles.statValue}>{unpaidCount}</div>
        </div>
      </div>

      <div className={styles.quickTiles}>
        <Link to="/support" className={styles.quickTile}>
          <TicketDiagonal24Regular /> <span>File a new ticket</span>
        </Link>
        <Link to="/book" className={styles.quickTile}>
          <CalendarClock24Regular /> <span>Book a meeting</span>
        </Link>
        <a href={STRIPE_BILLING_URL} target="_blank" rel="noopener noreferrer" className={styles.quickTile}>
          <Receipt24Regular /> <span>Manage billing <Open16Regular /></span>
        </a>
        <a href="mailto:hello@simpleitsrq.com" className={styles.quickTile}>
          <PersonSupport24Regular /> <span>Email your team</span>
        </a>
      </div>
    </div>
  );
}

function TicketList({ styles, tickets, loading, emptyLabel, onOpen }) {
  if (loading) {
    return <div style={{ padding: 24 }}><Spinner label="Loading…" /></div>;
  }
  if (!tickets || tickets.length === 0) {
    return <div className={styles.emptyState}>{emptyLabel}</div>;
  }
  return (
    <div className={styles.list}>
      {tickets.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.listRow}
          onClick={() => onOpen?.(t)}
        >
          <div className={styles.listMain}>
            <p className={styles.listTitle}>{t.subject}</p>
            <div className={styles.listMeta}>
              <span>{t.code}</span>
              <span>·</span>
              <span>{t.category}</span>
              <span>·</span>
              <span>Priority: {PRIORITY_LABELS[t.priority] || t.priority}</span>
              <span>·</span>
              <span>Opened {formatDate(t.createdAt)}</span>
              {t.closedAt && (
                <>
                  <span>·</span>
                  <span>Closed {formatDate(t.closedAt)}</span>
                </>
              )}
              {t.submitter && (
                <>
                  <span>·</span>
                  <span>
                    From {t.submitter.name || t.submitter.email}
                    {t.submitter.company ? ` (${t.submitter.company})` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className={styles.listAside}>
            <Badge appearance="filled" color={STATUS_COLORS[t.status] || "informative"}>
              {STATUS_LABELS[t.status] || t.status}
            </Badge>
          </div>
        </button>
      ))}
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function TicketDetailDialog({ styles, code, isAdmin, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const threadRef = useRef(null);

  const load = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(
        `/api/portal?action=ticket&code=${encodeURIComponent(code)}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        setError(res.status === 404 ? "Ticket not found." : "Couldn't load ticket.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Couldn't load ticket.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Initial load + 10s polling + focus refetch while the dialog is mounted.
  // `load` is a stable useCallback whose body runs async; the synchronous
  // setLoading(true) below is the "enter loading state" signal, not a
  // cascading render.
  useEffect(() => {
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load();
    const id = setInterval(load, 10000);
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", load);
    };
  }, [code, load]);

  // Auto-scroll the thread to the newest message whenever messages change.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  const sendReply = useCallback(async () => {
    const body = reply.trim();
    if (!body || !code || submitting) return;
    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/portal?action=ticket-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, body }),
      });
      if (!res.ok) {
        setError("Couldn't send reply.");
      } else {
        setReply("");
        await load();
        onChange?.();
      }
    } catch {
      setError("Couldn't send reply.");
    } finally {
      setSubmitting(false);
    }
  }, [reply, code, submitting, load, onChange]);

  const patchTicket = useCallback(async (patch, setBusy) => {
    if (!code) return;
    setBusy(true);
    try {
      const res = await csrfFetch("/api/portal?action=ticket", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...patch }),
      });
      if (!res.ok) {
        setError("Couldn't update ticket.");
      } else {
        await load();
        onChange?.();
      }
    } catch {
      setError("Couldn't update ticket.");
    } finally {
      setBusy(false);
    }
  }, [code, load, onChange]);

  const updateStatus = useCallback(
    (status) => patchTicket({ status }, setStatusSaving),
    [patchTicket],
  );
  const updatePriority = useCallback(
    (priority) => patchTicket({ priority }, setPrioritySaving),
    [patchTicket],
  );

  const ticket = data?.ticket;
  const messages = data?.messages || [];

  return (
    <Dialog open={!!code} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface className={styles.detailSurface}>
        <DialogBody>
          <DialogTitle>
            <div className={styles.detailHeader}>
              <span>{ticket?.subject || "Loading ticket…"}</span>
              {ticket && (
                <div className={styles.detailMeta}>
                  <span>{ticket.code}</span>
                  <span>·</span>
                  <span>{ticket.category}</span>
                  <span>·</span>
                  <span>Priority: {PRIORITY_LABELS[ticket.priority] || ticket.priority}</span>
                  <span>·</span>
                  <span>Opened {formatDateTime(ticket.createdAt)}</span>
                  {ticket.submitter && (
                    <>
                      <span>·</span>
                      <span>
                        From {ticket.submitter.name || ticket.submitter.email}
                        {ticket.submitter.company ? ` (${ticket.submitter.company})` : ""}
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <Badge appearance="filled" color={STATUS_COLORS[ticket.status] || "informative"}>
                    {STATUS_LABELS[ticket.status] || ticket.status}
                  </Badge>
                </div>
              )}
            </div>
          </DialogTitle>

          <DialogContent>
            {loading && !ticket && (
              <div style={{ padding: 16 }}><Spinner label="Loading ticket…" /></div>
            )}

            {error && (
              <MessageBar intent="error" style={{ marginTop: 12 }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {ticket && (
              <>
                <div className={styles.detailDescription}>{ticket.description}</div>

                {isAdmin && (
                  <div className={styles.adminBar}>
                    <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
                      Status:
                    </span>
                    <Dropdown
                      value={STATUS_LABELS[ticket.status] || ticket.status}
                      selectedOptions={[ticket.status]}
                      onOptionSelect={(_, d) => d.optionValue && updateStatus(d.optionValue)}
                      disabled={statusSaving}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <Option key={value} value={value}>{label}</Option>
                      ))}
                    </Dropdown>
                    {statusSaving && <Spinner size="tiny" />}

                    <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3, marginLeft: 8 }}>
                      Priority:
                    </span>
                    <Dropdown
                      value={PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      selectedOptions={[ticket.priority]}
                      onOptionSelect={(_, d) => d.optionValue && updatePriority(d.optionValue)}
                      disabled={prioritySaving}
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <Option key={value} value={value}>{label}</Option>
                      ))}
                    </Dropdown>
                    {prioritySaving && <Spinner size="tiny" />}
                  </div>
                )}

                <div className={styles.threadHeading}>Conversation</div>
                <div className={styles.thread} ref={threadRef}>
                  {messages.length === 0 && (
                    <div style={{ color: tokens.colorNeutralForeground3, fontSize: 13, padding: 8 }}>
                      No replies yet. {isAdmin ? "Post the first agent note below." : "We'll reply shortly."}
                    </div>
                  )}
                  {messages.map((m) => {
                    const cls =
                      m.author === "agent"
                        ? `${styles.threadMsg} ${styles.threadMsgAgent}`
                        : m.author === "system"
                        ? `${styles.threadMsg} ${styles.threadMsgSystem}`
                        : styles.threadMsg;
                    return (
                      <div key={m.id} className={cls}>
                        <div className={styles.threadHead}>
                          <span>
                            <strong>{m.authorName || m.author}</strong>
                            {" · "}
                            {m.author === "agent" ? "Support" : m.author === "system" ? "System" : "Client"}
                          </span>
                          <span>{formatDateTime(m.createdAt)}</span>
                        </div>
                        <div className={styles.threadBody}>{m.body}</div>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.replyBox}>
                  <Field label={isAdmin ? "Reply as support" : "Add a reply"}>
                    <Textarea
                      value={reply}
                      onChange={(_, d) => setReply(d.value)}
                      resize="vertical"
                      rows={4}
                      placeholder={isAdmin ? "Agent reply — this emails the client." : "Message your tech — this emails the support team."}
                    />
                  </Field>
                </div>
              </>
            )}
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Close</Button>
            <Button
              appearance="primary"
              onClick={sendReply}
              disabled={!reply.trim() || submitting || !ticket}
            >
              {submitting ? "Sending…" : "Send reply"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function InvoiceList({ styles, invoices, loading }) {
  if (loading) {
    return <div style={{ padding: 24 }}><Spinner label="Loading…" /></div>;
  }
  if (!invoices || invoices.length === 0) {
    return (
      <div className={styles.emptyState}>
        No invoices yet. You can also manage billing directly in{" "}
        <a href={STRIPE_BILLING_URL} target="_blank" rel="noopener noreferrer">
          Stripe
        </a>.
      </div>
    );
  }
  return (
    <div className={styles.list}>
      {invoices.map((inv) => (
        <div key={inv.id} className={styles.listRow}>
          <div className={styles.listMain}>
            <p className={styles.listTitle}>
              Invoice {inv.number} — {formatMoney(inv.amountCents, inv.currency)}
            </p>
            <div className={styles.listMeta}>
              <span>Issued {formatDate(inv.issuedAt)}</span>
              {inv.dueAt && <><span>·</span><span>Due {formatDate(inv.dueAt)}</span></>}
              {inv.paidAt && <><span>·</span><span>Paid {formatDate(inv.paidAt)}</span></>}
              {inv.description && <><span>·</span><span>{inv.description}</span></>}
            </div>
          </div>
          <div className={styles.listAside}>
            <Badge appearance="filled" color={
              inv.status === "paid" ? "success" :
              inv.status === "open" ? "warning" :
              inv.status === "void" || inv.status === "uncollectible" ? "danger" :
              "informative"
            }>
              {inv.status}
            </Badge>
            {inv.hostedUrl && (
              <Button
                size="small"
                as="a"
                href={inv.hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                icon={<Open16Regular />}
                iconPosition="after"
              >
                View
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfilePanel({ styles, user, onSaved }) {
  const [name, setName] = useState(user.name || "");
  const [company, setCompany] = useState(user.company || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await csrfFetch("/api/portal?action=me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({ type: "success", msg: "Profile saved." });
      onSaved?.(data.user);
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.profileForm} onSubmit={save}>
      <Field label="Email" hint="Tied to your sign-in provider.">
        <Input value={user.email} disabled />
      </Field>
      <Field label="Full name">
        <Input value={name} onChange={(_, d) => setName(d.value)} />
      </Field>
      <Field label="Company">
        <Input value={company} onChange={(_, d) => setCompany(d.value)} placeholder="Your company" />
      </Field>
      <Field label="Phone">
        <Input value={phone} onChange={(_, d) => setPhone(d.value)} placeholder="(407) 242-1456" />
      </Field>
      {status && (
        <MessageBar intent={status.type === "success" ? "success" : "error"}>
          <MessageBarBody>{status.msg}</MessageBarBody>
        </MessageBar>
      )}
      <div className={styles.profileActions}>
        <Button type="submit" appearance="primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ---------- admin: visitors panel ----------
// ---------- admin: new invoice dialog ----------
function NewInvoiceDialog({ styles, open, onClose, onSent }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [items, setItems] = useState([{ description: "", amount: "" }]);
  const [step, setStep] = useState("form");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setEmail(""); setName(""); setMemo("");
    setItems([{ description: "", amount: "" }]);
    setStep("form"); setDraft(null); setBusy(false); setError(null);
  };

  const addItem = () => setItems((prev) => [...prev, { description: "", amount: "" }]);
  const updateItem = (i, field, val) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [field]: val } : it)));
  const removeItem = (i) => setItems((prev) => prev.filter((_, j) => j !== i));

  const createDraft = useCallback(async () => {
    setError(null);
    const cleanItems = items
      .filter((it) => it.description.trim() && Number(it.amount) > 0)
      .map((it) => ({ description: it.description.trim(), amount: Math.round(Number(it.amount) * 100) }));
    if (!email || cleanItems.length === 0) {
      setError("Email and at least one line item with a dollar amount are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch("/api/portal?action=create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, memo: memo || undefined, items: cleanItems }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error + (data.detail ? ": " + data.detail : ""));
      } else {
        setDraft(data.invoice);
        setStep("review");
      }
    } catch (err) {
      setError(err.message || "Failed to create draft.");
    } finally {
      setBusy(false);
    }
  }, [email, name, memo, items]);

  const sendInvoice = useCallback(async () => {
    if (!draft?.id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/portal?action=send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: draft.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error + (data.detail ? ": " + data.detail : ""));
      } else {
        setStep("sent");
        setDraft(data.invoice);
        onSent?.();
      }
    } catch (err) {
      setError(err.message || "Failed to send.");
    } finally {
      setBusy(false);
    }
  }, [draft, onSent]);

  const totalCents = items.reduce((s, it) => s + (Math.round(Number(it.amount || 0) * 100)), 0);

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) { reset(); onClose(); } }}>
      <DialogSurface className={styles.detailSurface}>
        <DialogBody>
          <DialogTitle>
            {step === "form" && "New Invoice"}
            {step === "review" && "Review Draft Invoice"}
            {step === "sent" && "Invoice Sent"}
          </DialogTitle>
          <DialogContent>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: 12 }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {step === "form" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Customer email" required>
                  <Input value={email} onChange={(_, d) => setEmail(d.value)} placeholder="client@company.com" type="email" />
                </Field>
                <Field label="Customer name (optional)">
                  <Input value={name} onChange={(_, d) => setName(d.value)} placeholder="Acme Corp" />
                </Field>
                <Field label="Memo / description (optional)">
                  <Input value={memo} onChange={(_, d) => setMemo(d.value)} placeholder="Monthly IT support - April 2026" />
                </Field>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: tokens.colorNeutralForeground2 }}>Line items</div>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                      <Field label={i === 0 ? "Description" : undefined} style={{ flex: 1 }}>
                        <Input value={it.description} onChange={(_, d) => updateItem(i, "description", d.value)} placeholder="IT support" />
                      </Field>
                      <Field label={i === 0 ? "Amount ($)" : undefined} style={{ width: 120 }}>
                        <Input value={it.amount} onChange={(_, d) => updateItem(i, "amount", d.value)} placeholder="500.00" type="number" step="0.01" min="0" />
                      </Field>
                      {items.length > 1 && (
                        <Button appearance="subtle" size="small" onClick={() => removeItem(i)} icon={<Dismiss24Regular />} />
                      )}
                    </div>
                  ))}
                  <Button appearance="subtle" size="small" onClick={addItem}>+ Add line item</Button>
                  {totalCents > 0 && (
                    <div style={{ marginTop: 8, fontWeight: 600, fontSize: 15, color: tokens.colorNeutralForeground1 }}>
                      Total: ${(totalCents / 100).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === "review" && draft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: 16, background: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium }}>
                  <div style={{ fontSize: 13, color: tokens.colorNeutralForeground3 }}>Draft invoice created in Stripe</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>${(draft.amountDue / 100).toFixed(2)} USD</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>To: {draft.customerEmail}</div>
                  {draft.hostedUrl && (
                    <a href={draft.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, marginTop: 8, display: "inline-block" }}>
                      Preview invoice in Stripe
                    </a>
                  )}
                </div>
                <MessageBar intent="warning">
                  <MessageBarBody>
                    Clicking Send will finalize this invoice and email it to the customer. This uses your <strong>live</strong> Stripe key. The customer will receive a real payment link.
                  </MessageBarBody>
                </MessageBar>
              </div>
            )}

            {step === "sent" && draft && (
              <div style={{ textAlign: "center", padding: 24 }}>
                <Checkmark24Regular style={{ color: tokens.colorPaletteGreenForeground1, width: 48, height: 48 }} />
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 12 }}>Invoice sent</div>
                <div style={{ fontSize: 14, color: tokens.colorNeutralForeground3, marginTop: 4 }}>
                  {draft.number || draft.id} — ${((draft.amountDue || 0) / 100).toFixed(2)} USD
                </div>
                {draft.hostedUrl && (
                  <a href={draft.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, marginTop: 8, display: "inline-block" }}>
                    View in Stripe
                  </a>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => { reset(); onClose(); }}>
              {step === "sent" ? "Done" : "Cancel"}
            </Button>
            {step === "form" && (
              <Button appearance="primary" onClick={createDraft} disabled={busy}>
                {busy ? "Creating…" : "Create draft"}
              </Button>
            )}
            {step === "review" && (
              <Button appearance="primary" onClick={sendInvoice} disabled={busy} style={{ backgroundColor: tokens.colorPaletteRedBackground3 }}>
                {busy ? "Sending…" : "Send invoice (live)"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// ---------- admin: blog drafts panel ----------
function DraftsPanel({ styles }) {
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal?action=drafts", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (err) {
      setError(err.message || "Could not load drafts.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback
  useEffect(() => { load(); }, [load]);

  const publish = useCallback(async (id) => {
    setBusyId(id);
    setStatus(null);
    try {
      const res = await csrfFetch("/api/portal?action=publish-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = data.hint ? ` — ${data.hint}` : "";
        setStatus({ type: "error", msg: `${data.error || "Publish failed"}${hint}` });
      } else {
        setStatus({
          type: "success",
          msg: data.alreadyInFile
            ? "Already in posts.js — marked as published."
            : `Published. Commit: ${data.commitSha ? data.commitSha.slice(0, 7) : "created"}. Vercel will redeploy.`,
        });
        await load();
      }
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Publish failed." });
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const reject = useCallback(async (id) => {
    setBusyId(id);
    setStatus(null);
    try {
      const res = await csrfFetch("/api/portal?action=reject-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setStatus({ type: "error", msg: "Reject failed." });
      } else {
        setStatus({ type: "success", msg: "Draft rejected." });
        await load();
      }
    } catch {
      setStatus({ type: "error", msg: "Reject failed." });
    } finally {
      setBusyId(null);
    }
  }, [load]);

  if (loading) {
    return <div style={{ padding: 24 }}><Spinner label="Loading drafts…" /></div>;
  }
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!drafts || drafts.length === 0) {
    return (
      <div className={styles.emptyState}>
        No drafts yet. The daily cron agent runs at 06:00 ET and writes into the
        draft_posts table.
      </div>
    );
  }

  const pending = drafts.filter((d) => d.status === "draft" || d.status === "approved");
  const done    = drafts.filter((d) => d.status === "published" || d.status === "rejected");

  return (
    <div>
      {status && (
        <MessageBar intent={status.type === "success" ? "success" : "error"} style={{ marginBottom: 12 }}>
          <MessageBarBody>{status.msg}</MessageBarBody>
        </MessageBar>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Button
          appearance="subtle"
          size="small"
          onClick={async () => {
            setStatus({ type: "success", msg: "Checking GitHub access…" });
            try {
              const res = await fetch("/api/portal?action=github-health", { credentials: "same-origin" });
              const data = await res.json();
              if (data.ok) {
                const rl = data.rateLimit?.remaining != null ? ` · API quota: ${data.rateLimit.remaining}/${data.rateLimit.limit}` : "";
                setStatus({
                  type: "success",
                  msg: `GitHub OK — authenticated as ${data.user?.login} · file ${data.path} on ${data.repo}@${data.branch} reachable (sha ${data.fileAccess?.sha?.slice(0, 7)})${rl}`,
                });
              } else {
                const parts = [];
                parts.push(`token set: ${data.tokenSet}`);
                if (data.user?.login) parts.push(`user: ${data.user.login}`);
                if (data.user?.error) parts.push(`user error: ${data.user.error}`);
                if (data.fileAccess?.status) parts.push(`file access: HTTP ${data.fileAccess.status}`);
                if (data.fileAccess?.error) parts.push(`file error: ${data.fileAccess.error}`);
                if (data.hint) parts.push(data.hint);
                setStatus({ type: "error", msg: `GitHub diagnostic: ${parts.join(" — ")}` });
              }
            } catch (err) {
              setStatus({ type: "error", msg: `Diagnostic call failed: ${String(err?.message || err).slice(0, 200)}` });
            }
          }}
        >
          Check GitHub access
        </Button>
      </div>

      <h4 style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 6px", color: tokens.colorNeutralForeground2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Pending review
      </h4>
      {pending.length === 0 && (
        <div className={styles.emptyState}>Nothing waiting. All caught up.</div>
      )}
      <div className={styles.list}>
        {pending.map((d) => (
          <div key={d.id} className={styles.listRow} style={{ cursor: "default", alignItems: "flex-start" }}>
            <div className={styles.listMain}>
              <p className={styles.listTitle}>{d.title}</p>
              <div className={styles.listMeta}>
                <span>#{d.id}</span>
                <span>·</span>
                <span>{d.slug}</span>
                <span>·</span>
                <span>{d.category}</span>
                <span>·</span>
                <span>{formatDateTime(d.createdAt)}</span>
                {d.model && <><span>·</span><span>{d.model}</span></>}
              </div>
              <p style={{ color: tokens.colorNeutralForeground3, fontSize: 13, lineHeight: "20px", margin: "8px 0 0" }}>
                {d.excerpt}
              </p>
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, cursor: "pointer", color: tokens.colorNeutralForeground3 }}>
                  Show body ({d.body.length} chars)
                </summary>
                <pre style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  padding: 12,
                  marginTop: 6,
                  border: `1px solid ${tokens.colorNeutralStroke2}`,
                  borderRadius: tokens.borderRadiusMedium,
                  backgroundColor: tokens.colorNeutralBackground2,
                  maxHeight: 320,
                  overflowY: "auto",
                }}>{d.body}</pre>
              </details>
            </div>
            <div className={styles.listAside} style={{ flexDirection: "column", gap: 8 }}>
              <Button
                appearance="primary"
                icon={<Checkmark24Regular />}
                onClick={() => publish(d.id)}
                disabled={busyId === d.id}
              >
                {busyId === d.id ? "Publishing…" : "Publish"}
              </Button>
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                onClick={() => reject(d.id)}
                disabled={busyId === d.id}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: "24px 0 6px", color: tokens.colorNeutralForeground2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            History
          </h4>
          <div className={styles.list}>
            {done.map((d) => (
              <div key={d.id} className={styles.listRow} style={{ cursor: "default" }}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>{d.title}</p>
                  <div className={styles.listMeta}>
                    <span>#{d.id}</span>
                    <span>·</span>
                    <span>{d.slug}</span>
                    <span>·</span>
                    <span>{d.status === "published" ? `Published ${formatDateTime(d.publishedAt)}` : `Rejected ${formatDateTime(d.reviewedAt)}`}</span>
                  </div>
                </div>
                <Badge appearance="filled" color={d.status === "published" ? "success" : "subtle"}>
                  {d.status}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VisitorsPanel({ styles, onBlockIp }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blockBusyIp, setBlockBusyIp] = useState(null);
  const [visitorView, setVisitorView] = useState("overview");

  const handleBlock = useCallback(async (ip) => {
    if (!onBlockIp || blockBusyIp) return;
    setBlockBusyIp(ip);
    try { await onBlockIp(ip, "manual block from visitors panel"); } catch { /* best effort */ }
    finally { setBlockBusyIp(null); }
  }, [onBlockIp, blockBusyIp]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal?action=visitors", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message || "Could not load visitors.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ padding: 24 }}><Spinner label="Loading visitors…" /></div>;
  }
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!data) return null;

  const fmt = (iso) => new Date(iso).toLocaleString();

  const vpill = (v, label) => (
    <button key={v} style={{
      padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: visitorView === v ? 600 : 400, cursor: "pointer", border: "none",
      background: visitorView === v ? tokens.colorBrandBackground : "transparent",
      color: visitorView === v ? "#fff" : tokens.colorNeutralForeground2,
    }} onClick={() => setVisitorView(v)}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {vpill("overview", "Overview")}
        {vpill("traffic", "Live Traffic")}
        {vpill("threats", "Threat Actors")}
        {vpill("blocked", "Blocked IPs")}
        <Button appearance="subtle" size="small" onClick={load} style={{ marginLeft: "auto" }}>Refresh</Button>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Visits (24h)</div>
          <div className={styles.statValue}>{data.stats.total24h}</div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            {data.stats.unique24h} unique
          </span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Visits (7d)</div>
          <div className={styles.statValue}>{data.stats.total7d}</div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            {data.stats.unique7d} unique
          </span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Top country (7d)</div>
          <div className={styles.statValue}>
            {data.topCountries[0]?.country || "—"}
          </div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            {data.topCountries[0]?.hits || 0} hits
          </span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Top page (7d)</div>
          <div className={styles.statValue} style={{ fontSize: 18, wordBreak: "break-all" }}>
            {data.topPages[0]?.path || "—"}
          </div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            {data.topPages[0]?.hits || 0} hits
          </span>
        </div>
        <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
          <div className={styles.statLabel}>Threat actors</div>
          <div className={styles.statValue} style={{ color: data.threatActors?.length ? "#DC2626" : undefined }}>
            {data.threatActors?.length || 0}
          </div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            {data.blockedIps?.length || 0} IPs blocked
          </span>
        </div>
        <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
          <div className={styles.statLabel}>OSINT matches</div>
          <div className={styles.statValue} style={{ color: data.osintSummary?.matchedIps ? "#DC2626" : undefined }}>
            {data.osintSummary?.matchedIps || 0}
          </div>
          <span style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
            of {data.osintSummary?.totalChecked || 0} IPs checked vs. Spamhaus / ET
          </span>
        </div>
      </div>

      {(visitorView === "overview" || visitorView === "traffic") && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 24 }}>
        <section>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Top pages (7d)</h3>
          <div className={styles.list}>
            {data.topPages.map((p) => (
              <div key={p.path} className={styles.listRow}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>{p.path}</p>
                </div>
                <Badge appearance="filled" color="informative">{p.hits}</Badge>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Top countries (7d)</h3>
          <div className={styles.list}>
            {data.topCountries.map((c) => (
              <div key={c.country} className={styles.listRow}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>{c.country}</p>
                </div>
                <Badge appearance="filled" color="informative">{c.hits}</Badge>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Top referrers (7d)</h3>
          <div className={styles.list}>
            {data.topReferrers.map((r) => (
              <div key={r.referrer} className={styles.listRow}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle} title={r.referrer}>{r.referrer}</p>
                </div>
                <Badge appearance="filled" color="informative">{r.hits}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>}

      {(visitorView === "overview" || visitorView === "traffic") && <><h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 0", color: tokens.colorNeutralForeground1 }}>Recent visits</h3>
      <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
        Last 100 page views. IP + geo come from Vercel edge headers.
      </p>
      <div className={styles.list}>
        {data.recent.map((v, i) => (
          <div key={i} className={styles.listRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <p className={styles.listTitle} style={{ flex: 1 }}>
                {v.path}
                {v.userEmail && (
                  <> — <span style={{ color: tokens.colorBrandForeground1 }}>{v.userEmail}</span></>
                )}
              </p>
              <Badge appearance="outline" color={
                v.consent === "analytics" ? "success" :
                v.consent === "essential" ? "warning" : "subtle"
              }>
                {v.consent}
              </Badge>
            </div>
            <div className={styles.listMeta} style={{ flexWrap: "wrap", gap: 6 }}>
              <span>{fmt(v.ts)}</span>
              <span>·</span>
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>{v.ip || "?"}</span>
              {v.country && <><span>·</span><span>{[v.city, v.region, v.country].filter(Boolean).join(", ")}</span></>}
              <span>·</span>
              <span><strong>{v.browser}</strong> / {v.os} / {v.device}</span>
              {v.intel?.org && <><span>·</span><span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>{v.intel.org}</span></>}
              {v.intel?.abuseScore != null && (
                <Badge appearance="filled" color={v.intel.abuseScore >= 75 ? "danger" : v.intel.abuseScore >= 25 ? "warning" : "success"} style={{ fontSize: 10 }}>
                  Abuse: {v.intel.abuseScore}%
                </Badge>
              )}
              {v.intel?.isDatacenter && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>DC</Badge>}
              {v.intel?.isTor && <Badge appearance="filled" color="danger" style={{ fontSize: 10 }}>TOR</Badge>}
              {v.intel?.isVpn && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>VPN</Badge>}
              {v.intel?.isProxy && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>PROXY</Badge>}
              {v.blocked && <Badge appearance="filled" color="danger" style={{ fontSize: 10 }}>BLOCKED</Badge>}
              {v.osintMatches?.map((m, k) => (
                <Badge key={k} appearance="filled" color="danger" style={{ fontSize: 10 }} title={`${m.feed} · ${m.cidr}`}>
                  OSINT: {m.feed.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
            <div className={styles.listMeta} style={{ flexWrap: "wrap", gap: 6, opacity: 0.85 }}>
              {v.platform && <span>Platform: <strong>{v.platform}</strong></span>}
              {v.screen && <span>Screen: {v.screen}{v.dpr ? ` @${v.dpr}x` : ""}{v.colorDepth ? ` ${v.colorDepth}bit` : ""}</span>}
              {v.cores && <span>CPU: {v.cores} cores</span>}
              {v.mem && <span>RAM: {v.mem}GB</span>}
              {v.touch != null && <span>Touch: {v.touch}pt</span>}
              {v.connection && <span>Net: {v.connection}</span>}
              {v.tz && <span>TZ: {v.tz}</span>}
              {v.lang && <span>Lang: {v.langs || v.lang}</span>}
              {v.referrer && <span>Ref: {(() => { try { return new URL(v.referrer, "https://x.invalid").hostname; } catch { return v.referrer; } })()}</span>}
            </div>
            {v.deviceHash && (
              <div style={{ fontFamily: "monospace", fontSize: 10, color: tokens.colorNeutralForeground3, letterSpacing: "0.02em" }}>
                Device ID: {v.deviceHash}
              </div>
            )}
            {v.userAgent && (
              <div style={{ fontSize: 10, color: tokens.colorNeutralForeground3, wordBreak: "break-all", lineHeight: "14px" }}>
                {v.userAgent}
              </div>
            )}
          </div>
        ))}
      </div>

      </>}

      {/* --- Threat actors (honeypot hits) --- */}
      {(visitorView === "overview" || visitorView === "threats") && data.threatActors && data.threatActors.length > 0 && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 8px", color: "#DC2626" }}>
            Threat actors ({data.threatActors.length})
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, margin: "0 0 8px" }}>
            Hostile-origin visitors routed to honeypot. They never saw the real site.
          </p>
          <div className={styles.list}>
            {data.threatActors.map((t, i) => (
              <div key={i} className={styles.listRow} style={{ borderColor: "#DC2626", borderLeftWidth: 3, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p className={styles.listTitle}>{t.method} {t.path}</p>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Badge appearance="filled" color="danger">{t.threatClass}</Badge>
                    {t.blocked && <Badge appearance="filled" color="danger">BLOCKED</Badge>}
                    {!t.blocked && onBlockIp && (
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<Delete24Regular />}
                        onClick={() => handleBlock(t.ip)}
                        disabled={blockBusyIp === t.ip}
                        title="Block this IP"
                      >
                        {blockBusyIp === t.ip ? "…" : "Block"}
                      </Button>
                    )}
                  </div>
                </div>
                <div className={styles.listMeta} style={{ flexWrap: "wrap", gap: 6 }}>
                  <span>{fmt(t.ts)}</span>
                  <span>·</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{t.ip}</span>
                  <span>·</span>
                  <span>{[t.city, t.country].filter(Boolean).join(", ")}</span>
                  {t.intel?.org && <><span>·</span><span>{t.intel.org}</span></>}
                  {t.intel?.isp && t.intel.isp !== t.intel.org && <><span>·</span><span>{t.intel.isp}</span></>}
                  {t.intel?.abuseScore != null && (
                    <Badge appearance="filled" color={t.intel.abuseScore >= 75 ? "danger" : t.intel.abuseScore >= 25 ? "warning" : "subtle"} style={{ fontSize: 10 }}>
                      Abuse: {t.intel.abuseScore}% ({t.intel.abuseReports} reports)
                    </Badge>
                  )}
                  {t.intel?.isDatacenter && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>DC</Badge>}
                  {t.intel?.isTor && <Badge appearance="filled" color="danger" style={{ fontSize: 10 }}>TOR</Badge>}
                  {t.intel?.isVpn && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>VPN</Badge>}
                  {t.osintMatches?.map((m, k) => (
                    <Badge key={k} appearance="filled" color="danger" style={{ fontSize: 10 }} title={`${m.feed} · ${m.cidr}`}>
                      OSINT: {m.feed.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
                {t.deviceHash && <div style={{ fontFamily: "monospace", fontSize: 10, color: tokens.colorNeutralForeground3 }}>Device: {t.deviceHash}</div>}
                {t.ua && <div style={{ fontSize: 10, color: tokens.colorNeutralForeground3, wordBreak: "break-all" }}>{t.ua}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* --- Session anomalies --- */}
      {(visitorView === "overview" || visitorView === "threats") && data.sessionAnomalies && data.sessionAnomalies.length > 0 && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 8px", color: "#D97706" }}>
            Session anomalies ({data.sessionAnomalies.length})
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, margin: "0 0 8px" }}>
            IP or user-agent changed mid-session. Could be mobile network switch or hijack attempt.
          </p>
          <div className={styles.list}>
            {data.sessionAnomalies.map((s, i) => (
              <div key={i} className={styles.listRow} style={{ borderColor: "#D97706", borderLeftWidth: 3 }}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>
                    {s.event}{s.userEmail ? ` — ${s.userEmail}` : ""}
                  </p>
                  <div className={styles.listMeta}>
                    <span>{fmt(s.ts)}</span>
                    <span>·</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11 }}>{s.ip}</span>
                    <span>·</span>
                    <span>{[s.city, s.country].filter(Boolean).join(", ")}</span>
                  </div>
                  {s.detail && (
                    <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3, marginTop: 4 }}>
                      {s.detail.reason?.join(", ")}
                      {s.detail.originalIp && ` | was: ${s.detail.originalIp}`}
                      {s.detail.newIp && ` → now: ${s.detail.newIp}`}
                    </div>
                  )}
                </div>
                <Badge appearance="filled" color="warning">anomaly</Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {/* --- Blocked IPs --- */}
      {(visitorView === "overview" || visitorView === "blocked") && data.blockedIps && data.blockedIps.length > 0 && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 8px", color: tokens.colorNeutralForeground1 }}>
            Blocked IPs ({data.blockedIps.length})
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, margin: "0 0 8px" }}>
            Permanently blocked. Auto-blocked by abuse score, scanner traps, or manual action.
          </p>
          <div className={styles.list}>
            {data.blockedIps.map((b, i) => (
              <div key={i} className={styles.listRow} style={{ borderColor: tokens.colorNeutralForeground3, borderLeftWidth: 3 }}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle} style={{ fontFamily: "monospace", fontSize: 13 }}>{b.ip}</p>
                  <div className={styles.listMeta} style={{ flexWrap: "wrap", gap: 6 }}>
                    <span>{b.reason}</span>
                    <span>·</span>
                    <span>Blocked {fmt(b.blockedAt)}</span>
                    {b.intel?.org && <><span>·</span><span>{b.intel.org}</span></>}
                    {b.intel?.abuseScore != null && (
                      <Badge appearance="filled" color={b.intel.abuseScore >= 75 ? "danger" : b.intel.abuseScore >= 25 ? "warning" : "subtle"} style={{ fontSize: 10 }}>
                        Abuse: {b.intel.abuseScore}%
                      </Badge>
                    )}
                    {b.intel?.isDatacenter && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>DC</Badge>}
                    {b.intel?.isTor && <Badge appearance="filled" color="danger" style={{ fontSize: 10 }}>TOR</Badge>}
                    {b.osintMatches?.map((m, k) => (
                      <Badge key={k} appearance="filled" color="danger" style={{ fontSize: 10 }} title={`${m.feed} · ${m.cidr}`}>
                        OSINT: {m.feed.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }} />
    </div>
  );
}

// ---------- admin: testimonials CRUD ----------
// Minimal form: list, edit-inline, approve toggle, delete. No WYSIWYG
// — quotes are plain text. Intentionally refuses to pre-populate anything.
function TestimonialsAdmin() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // null | newForm | existing row
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal?action=testimonials", { credentials: "same-origin" });
      const data = await res.json();
      setItems(Array.isArray(data?.testimonials) ? data.testimonials : []);
    } catch { setItems([]); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a stable useCallback
  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    setSaving(true); setMsg(null);
    try {
      const res = await csrfFetch("/api/portal?action=testimonial-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.ok !== true) throw new Error(data.error || `http_${res.status}`);
      setMsg({ kind: "ok", text: form.id ? "Updated." : "Added." });
      setEditing(null);
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: String(e.message || e) });
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this testimonial? This cannot be undone.")) return;
    try {
      await csrfFetch("/api/portal?action=testimonial-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } catch { /* best effort */ }
  };

  const toggleApprove = (t) => save({
    id: t.id,
    quote: t.quote, authorName: t.authorName, authorRole: t.authorRole,
    authorCompany: t.authorCompany, city: t.city, productSlug: t.productSlug,
    rating: t.rating, approved: !t.approved,
  });

  const card = {
    padding: 18,
    background: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: 10,
    marginBottom: 14,
  };
  const approved = (items || []).filter((t) => t.approved).length;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Testimonials</h4>
          <p style={{ margin: 0, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
            {items == null ? "Loading…" : `${items.length} total · ${approved} approved · only approved show on the public site.`}
          </p>
        </div>
        <Button appearance="primary" size="small" onClick={() => setEditing({ quote: "", authorName: "", authorRole: "", authorCompany: "", city: "", productSlug: "", rating: 5, approved: false })}>
          Add testimonial
        </Button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, padding: 8, borderRadius: 6, fontSize: 12, background: msg.kind === "ok" ? "#ECFDF5" : "#FEF2F2", color: msg.kind === "ok" ? "#065F46" : "#7F1D1D" }}>
          {msg.text}
        </div>
      )}

      {editing && (
        <TestimonialForm
          initial={editing}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {items && items.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((t) => (
            <div key={t.id} style={{ padding: 12, background: tokens.colorNeutralBackground2, borderRadius: 8, border: `1px solid ${tokens.colorNeutralStroke2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>
                  {t.authorName}
                  {t.authorRole && <span style={{ fontWeight: 400, color: tokens.colorNeutralForeground3 }}> · {t.authorRole}</span>}
                  {t.authorCompany && <span style={{ fontWeight: 400, color: tokens.colorNeutralForeground3 }}> · {t.authorCompany}</span>}
                </strong>
                <Badge appearance="filled" color={t.approved ? "success" : "warning"} style={{ fontSize: 10 }}>
                  {t.approved ? "LIVE" : "PENDING"}
                </Badge>
              </div>
              <p style={{ fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}>"{t.quote}"</p>
              <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {t.city && <span>{t.city}</span>}
                {t.productSlug && <span>Product: {t.productSlug}</span>}
                {t.rating != null && <span>Rating: {t.rating}/5</span>}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <Button size="small" appearance="secondary" onClick={() => setEditing(t)}>Edit</Button>
                <Button size="small" appearance={t.approved ? "secondary" : "primary"} onClick={() => toggleApprove(t)}>
                  {t.approved ? "Unpublish" : "Approve + publish"}
                </Button>
                <Button size="small" appearance="subtle" onClick={() => remove(t.id)} style={{ color: "#DC2626" }}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <p style={{ marginTop: 14, fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          No testimonials yet. Add one with real client consent — nothing renders on /store or /store/:slug until at least one row is approved here.
        </p>
      )}
    </div>
  );
}

function TestimonialForm({ initial, saving, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => { e.preventDefault(); onSave(form); };
  return (
    <form onSubmit={submit} style={{ marginTop: 14, padding: 14, background: tokens.colorNeutralBackground2, borderRadius: 8, border: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <Field label="Quote (required)">
        <Textarea required value={form.quote} onChange={(_, d) => set("quote")(d.value)} rows={3} placeholder="A real client-supplied quote. Get consent first." />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Author name (required)">
          <Input required value={form.authorName} onChange={(_, d) => set("authorName")(d.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Role">
          <Input value={form.authorRole || ""} onChange={(_, d) => set("authorRole")(d.value)} placeholder="Practice Manager" />
        </Field>
        <Field label="Company">
          <Input value={form.authorCompany || ""} onChange={(_, d) => set("authorCompany")(d.value)} placeholder="Sarasota Dental Group" />
        </Field>
        <Field label="City">
          <Input value={form.city || ""} onChange={(_, d) => set("city")(d.value)} placeholder="Sarasota" />
        </Field>
        <Field label="Product slug (optional — testimonial shows on that product page)">
          <Input value={form.productSlug || ""} onChange={(_, d) => set("productSlug")(d.value)} placeholder="hipaa-starter-kit" />
        </Field>
        <Field label="Rating (1–5)">
          <Input type="number" min={1} max={5} value={String(form.rating || 5)} onChange={(_, d) => set("rating")(Number(d.value) || null)} />
        </Field>
      </div>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={!!form.approved} onChange={(e) => set("approved")(e.target.checked)} />
        Approved (will appear on the public site)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <Button appearance="primary" type="submit" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Add testimonial"}</Button>
        <Button appearance="secondary" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ---------- admin: ops console ----------
// One-click buttons for admin actions that would otherwise require curl
// or a Vercel env-var trip: Stripe Payment Link creation, audit-chain
// migration, audit-chain verification, OSINT feed refresh.
//
// Layout: a live health card at the top, buttons grouped by workflow
// stage (Setup / Operations / Verification), a one-click "Run full
// setup" orchestrator that chains migrations → reset → osint → verify,
// and a confirmation gate on destructive actions.
const opsCard = {
  padding: 18,
  background: tokens.colorNeutralBackground1,
  border: `1px solid ${tokens.colorNeutralStroke2}`,
  borderRadius: 10,
  marginBottom: 14,
};
const opsPre = {
  marginTop: 10,
  padding: 12,
  fontSize: 11,
  fontFamily: "monospace",
  lineHeight: 1.5,
  background: tokens.colorNeutralBackground2,
  border: `1px solid ${tokens.colorNeutralStroke2}`,
  borderRadius: 6,
  maxHeight: 360,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};
const opsSectionHeader = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: tokens.colorNeutralForeground3,
  margin: "20px 0 10px",
};

function StatusPill({ ok, label }) {
  return (
    <Badge
      appearance="filled"
      color={ok ? "success" : "warning"}
      style={{ fontSize: 11, marginRight: 6, marginBottom: 4 }}
    >
      {ok ? "✓" : "•"} {label}
    </Badge>
  );
}

function OutputBlock({ action, output }) {
  const out = output[action];
  if (!out) return null;
  const data = out.data || out;
  const ok = out.status == null ? true : out.status < 400 && data.ok !== false;
  return (
    <>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Badge appearance="filled" color={ok ? "success" : "danger"} style={{ fontSize: 10 }}>
          {ok ? "OK" : "FAIL"}
        </Badge>
        {out.status != null && (
          <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>HTTP {out.status}</span>
        )}
      </div>
      <pre style={opsPre}>{JSON.stringify(data, null, 2)}</pre>
    </>
  );
}

// Classify auditVerify() output into a single-word health label + severity.
// Order matters: migrationNeeded wins over legacy (zero-chain) wins over
// broken (hash mismatch) wins over valid.
function classifyAuditChain(data) {
  if (!data) return { label: "Unknown", tone: "warning" };
  if (data.migrationNeeded) return { label: "Migration Needed", tone: "warning" };
  if (data.ok === false || (Array.isArray(data.breaks) && data.breaks.length > 0)) {
    return { label: "Broken", tone: "danger" };
  }
  const chained = Number(data.chainedRows || 0);
  const total = Number(data.totalRows || 0);
  if (total > 0 && chained === 0) return { label: "Legacy", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

// Freshness buckets per the spec — <24h fresh, 24-72h stale, >72h stale-warn.
function freshnessPill(isoTs) {
  if (!isoTs) return { label: "Never", tone: "danger" };
  const ageHours = (Date.now() - new Date(isoTs).getTime()) / 3_600_000;
  if (ageHours < 24) return { label: "Fresh", tone: "success" };
  if (ageHours < 72) return { label: "Stale", tone: "warning" };
  return { label: "Stale-warn", tone: "danger" };
}

function relativeTime(isoTs) {
  if (!isoTs) return "never";
  const diff = Date.now() - new Date(isoTs).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function OpsConsole() {
  const [running, setRunning] = useState(null);
  const [output, setOutput] = useState({});
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Widget data for the Operational Status section. Loaded in parallel on
  // mount; each widget has its own refresh button so a slow feed-fetch
  // can't block the audit/revenue cards from rendering.
  const [auditData, setAuditData] = useState(null);
  const [auditLoadedAt, setAuditLoadedAt] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [osintData, setOsintData] = useState(null);
  const [osintLoading, setOsintLoading] = useState(false);
  const [osintRefreshing, setOsintRefreshing] = useState(false);
  const [revenueData, setRevenueData] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [adsenseData, setAdsenseData] = useState(null);
  const [adsenseLoading, setAdsenseLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/portal?action=ops-status", { credentials: "same-origin" });
      setStatus(await res.json());
    } catch { /* status is best-effort — failures leave the card in "unknown" */ }
    finally { setStatusLoading(false); }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/portal?action=audit-verify", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      setAuditData(data);
      setAuditLoadedAt(new Date().toISOString());
    } catch {
      setAuditData({ ok: false, error: "fetch_failed" });
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadOsint = useCallback(async () => {
    setOsintLoading(true);
    try {
      const res = await fetch("/api/portal?action=osint-status", { credentials: "same-origin" });
      setOsintData(await res.json().catch(() => ({})));
    } catch {
      setOsintData({ ok: false });
    } finally {
      setOsintLoading(false);
    }
  }, []);

  const loadRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const res = await fetch("/api/portal?action=revenue-summary", { credentials: "same-origin" });
      setRevenueData(await res.json().catch(() => ({})));
    } catch {
      setRevenueData({ ok: false, configured: false });
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  const loadAdsense = useCallback(async () => {
    setAdsenseLoading(true);
    try {
      const res = await fetch("/api/portal?action=adsense-health&range=7d", { credentials: "same-origin" });
      setAdsenseData(await res.json().catch(() => ({})));
    } catch {
      setAdsenseData({ noData: true });
    } finally {
      setAdsenseLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadStatus is a stable useCallback
  useEffect(() => { loadStatus(); }, [loadStatus]);
  // Auto-load the three operational-status widgets on mount. Wrapped in an
  // alive-flag IIFE so the lint-time "no setState in effect body" rule
  // sees only post-await updates — same pattern NewsletterAdmin uses.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await Promise.all([loadAudit(), loadOsint(), loadRevenue(), loadAdsense()]);
    })();
    return () => { alive = false; };
  }, [loadAudit, loadOsint, loadRevenue, loadAdsense]);

  const run = useCallback(async (action, method = "POST") => {
    setRunning(action);
    try {
      const res = await csrfFetch(`/api/portal?action=${action}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      });
      const data = await res.json().catch(() => ({}));
      setOutput((o) => ({ ...o, [action]: { status: res.status, data } }));
      return { status: res.status, data };
    } catch (e) {
      const err = { error: String(e.message || e) };
      setOutput((o) => ({ ...o, [action]: err }));
      return err;
    } finally {
      setRunning(null);
    }
  }, []);

  // Runs the whole bootstrap path end-to-end. Stops on the first failing
  // step so the admin can see exactly where it broke instead of cascading
  // errors. Refreshes the status card after every step.
  const runFullSetup = useCallback(async () => {
    setRunning("full-setup");
    const trail = [];
    const steps = [
      { action: "run-audit-migration", method: "POST", label: "Run migrations" },
      { action: "reset-audit-chain",   method: "POST", label: "Reset chain" },
      { action: "osint-refresh",       method: "POST", label: "Refresh OSINT" },
      { action: "audit-verify",        method: "GET",  label: "Verify chain" },
    ];
    for (const s of steps) {
      const r = await run(s.action, s.method);
      trail.push({ step: s.label, status: r.status, ok: r.data?.ok !== false && r.status < 400 });
      if (r.status >= 400 || r.data?.ok === false) break;
    }
    setOutput((o) => ({ ...o, "full-setup": { trail } }));
    await loadStatus();
    setRunning(null);
  }, [run, loadStatus]);

  // Reset is destructive — nulls hash columns on every chained row. Gate
  // with a confirm() so an accidental click doesn't wipe the chain.
  const runWithConfirm = useCallback((action, message) => {
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    run(action, "POST");
  }, [run]);

  // Trigger the existing osint-refresh mutation from the OSINT widget's
  // "Refresh now" button, then re-pull osint-status so the freshness
  // pills reflect the new fetched_at timestamps. csrfFetch handles the
  // double-submit header for us.
  const refreshOsintWidget = useCallback(async () => {
    setOsintRefreshing(true);
    try {
      await csrfFetch("/api/portal?action=osint-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await loadOsint();
    } catch { /* swallowed — widget stays on last-known data */ }
    finally { setOsintRefreshing(false); }
  }, [loadOsint]);

  const card = opsCard;
  const pre = opsPre;
  const sectionHeader = opsSectionHeader;

  const mig = status?.migrations || {};
  const feedsLabel = status?.osint?.totalCidrs
    ? `${status.osint.totalCidrs.toLocaleString()} CIDRs cached`
    : "0 CIDRs cached";

  // Derived widget values — memoize-on-render since the inputs are tiny.
  const auditClass = classifyAuditChain(auditData);
  const firstBreakId = Array.isArray(auditData?.breaks) && auditData.breaks.length > 0
    ? auditData.breaks[0].id
    : null;
  const auditTotalRows = Number(auditData?.totalRows || 0);
  const auditChainedRows = Number(auditData?.chainedRows || 0);

  const osintFeeds = Array.isArray(osintData?.feeds) ? osintData.feeds : [];

  const revenueConfigured = revenueData?.configured !== false;
  const paidDollars = ((revenueData?.paid_total_cents || 0) / 100);
  const mrrDollars = ((revenueData?.mrr_cents || 0) / 100);
  const fmtUsd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div>
      <p style={{ color: tokens.colorNeutralForeground3, fontSize: 13, margin: "0 0 16px" }}>
        One-click admin operations. Every button hits the matching <code>/api/portal?action=...</code> endpoint under your current session. Output is shown inline — no page reload.
      </p>

      {/* ── Live health card ── */}
      <div style={{ ...card, background: tokens.colorNeutralBackground2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>System status</h4>
            <p style={{ margin: 0, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              Auto-loaded from <code>/api/portal?action=ops-status</code>. Refresh after each action.
            </p>
          </div>
          <Button appearance="subtle" size="small" onClick={loadStatus} disabled={statusLoading}>
            {statusLoading ? "Loading…" : "Refresh status"}
          </Button>
        </div>
        {status && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap" }}>
            <StatusPill ok={mig.auditChainInstalled} label="Audit chain (001)" />
            <StatusPill ok={mig.auditChainFixApplied} label="Schema fix (002)" />
            <StatusPill ok={mig.threatFeedsInstalled} label="Threat feeds (003)" />
            <StatusPill ok={(status.osint?.totalCidrs || 0) > 0} label={feedsLabel} />
            <StatusPill ok={(status.chain?.chainedRows || 0) > 0} label={`${status.chain?.chainedRows || 0} chained / ${status.chain?.totalRows || 0} events`} />
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <Button appearance="primary" onClick={runFullSetup} disabled={running === "full-setup"}>
            {running === "full-setup" ? "Running setup…" : "Run full setup (migrations → reset → OSINT → verify)"}
          </Button>
        </div>
        {output["full-setup"] && (
          <pre style={pre}>{JSON.stringify(output["full-setup"], null, 2)}</pre>
        )}
      </div>

      {/* ── Operational status widgets ── */}
      <div style={sectionHeader}>Operational status — auto-loaded on open</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        {/* Widget 1 — Audit-chain integrity */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Audit chain integrity</h4>
              <p style={{ margin: 0, fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                Tamper-evident SHA-256 hash chain over <code>security_events</code>.
              </p>
            </div>
            <Badge appearance="filled" color={auditClass.tone} style={{ fontSize: 11 }}>
              {auditClass.label}
            </Badge>
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Chain length</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{auditChainedRows.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: tokens.colorNeutralForeground3 }}>of {auditTotalRows.toLocaleString()} events</div>
            </div>
            <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Last verified</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{auditLoadedAt ? relativeTime(auditLoadedAt) : "—"}</div>
            </div>
          </div>
          {auditClass.label === "Broken" && firstBreakId != null && (
            <div style={{ marginTop: 10, padding: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>Chain broken at row id {String(firstBreakId)}</div>
              <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3, marginTop: 2 }}>
                {auditData.breaks[0].reason}
              </div>
              <div style={{ marginTop: 8 }}>
                <Button
                  appearance="secondary"
                  size="small"
                  onClick={() => runWithConfirm("reset-audit-chain", "This nulls prev_hash/row_hash on every currently-chained row. The event payload stays but the hash chain restarts. Proceed?")}
                  disabled={running === "reset-audit-chain"}
                >
                  {running === "reset-audit-chain" ? "Resetting…" : "Reset chain"}
                </Button>
              </div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Button appearance="subtle" size="small" onClick={loadAudit} disabled={auditLoading}>
              {auditLoading ? "Verifying…" : "Re-verify"}
            </Button>
          </div>
        </div>

        {/* Widget 2 — OSINT feed freshness */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>OSINT feed freshness</h4>
              <p style={{ margin: 0, fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                Cached CIDRs from Spamhaus + Emerging Threats.
              </p>
            </div>
            <Button
              appearance="subtle"
              size="small"
              onClick={refreshOsintWidget}
              disabled={osintRefreshing || osintLoading}
            >
              {osintRefreshing ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>
          {osintFeeds.length === 0 ? (
            <p style={{ marginTop: 12, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              {osintLoading ? "Loading feeds…" : "No feeds cached yet. Run OSINT refresh to prime the cache."}
            </p>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.7fr 0.8fr", gap: 6, padding: "4px 6px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>
                <span>Feed</span>
                <span>Last refresh</span>
                <span style={{ textAlign: "right" }}>CIDRs</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {osintFeeds.map((f) => {
                const pill = freshnessPill(f.last_fetched);
                return (
                  <div
                    key={f.feed_name}
                    style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.7fr 0.8fr", gap: 6, padding: "6px", alignItems: "center", background: tokens.colorNeutralBackground2, borderRadius: 4, marginBottom: 4 }}
                  >
                    <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.feed_name}</span>
                    <span style={{ color: tokens.colorNeutralForeground3 }}>{relativeTime(f.last_fetched)}</span>
                    <span style={{ textAlign: "right", fontWeight: 600 }}>{Number(f.cidr_count || 0).toLocaleString()}</span>
                    <span style={{ textAlign: "right" }}>
                      <Badge appearance="filled" color={pill.tone} style={{ fontSize: 10 }}>{pill.label}</Badge>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Widget 3 — Stripe revenue summary (last 30 days) */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Stripe revenue (30d)</h4>
              <p style={{ margin: 0, fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                Live Stripe pull — paid invoices + active subscriptions.
              </p>
            </div>
            {!revenueConfigured ? (
              <Badge appearance="filled" color="warning" style={{ fontSize: 11 }}>Stripe not configured</Badge>
            ) : (
              <Button appearance="subtle" size="small" onClick={loadRevenue} disabled={revenueLoading}>
                {revenueLoading ? "Loading…" : "Refresh"}
              </Button>
            )}
          </div>
          {!revenueConfigured ? (
            <p style={{ marginTop: 12, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              Set <code>STRIPE_SECRET_KEY</code> in Vercel env vars to enable this widget.
            </p>
          ) : revenueData?.ok ? (
            <>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Paid (last 30 days)</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtUsd(paidDollars)}</div>
                <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                  across {revenueData.paid_count || 0} invoice{revenueData.paid_count === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Active subs</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{revenueData.active_subs_count || 0}</div>
                </div>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Est. MRR</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtUsd(mrrDollars)}</div>
                </div>
              </div>
            </>
          ) : (
            <p style={{ marginTop: 12, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              {revenueLoading ? "Loading…" : (revenueData?.error || "Unable to load Stripe data.")}
            </p>
          )}
        </div>

        {/* Widget 4 — AdSense health (fill rate, blocked, timeout) */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>AdSense health (7d)</h4>
              <p style={{ margin: 0, fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                Beacon-fed fill rate from real visitors — answers "are ads serving?" without curl.
              </p>
            </div>
            <Button appearance="subtle" size="small" onClick={loadAdsense} disabled={adsenseLoading}>
              {adsenseLoading ? "Loading…" : "Refresh"}
            </Button>
          </div>
          {adsenseData?.noData ? (
            <p style={{ marginTop: 12, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              No beacons received yet. Visit /glossary in a fresh browser to seed the first measurement.
            </p>
          ) : adsenseData?.summary ? (
            <>
              <p style={{ marginTop: 10, fontSize: 12, color: tokens.colorNeutralForeground1, lineHeight: 1.5 }}>
                {adsenseData.headline}
              </p>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Filled</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#107C10" }}>{adsenseData.summary.fillPct}%</div>
                </div>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Blocked</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#D97706" }}>{adsenseData.summary.blockedPct}%</div>
                </div>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Timeout</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#DC2626" }}>{adsenseData.summary.timeoutPct}%</div>
                </div>
                <div style={{ padding: 8, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Sessions</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{adsenseData.summary.sessions}</div>
                </div>
              </div>
            </>
          ) : (
            <p style={{ marginTop: 12, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
              {adsenseLoading ? "Loading…" : "No data."}
            </p>
          )}
        </div>
      </div>

      {/* ── Setup (run in order the first time) ── */}
      <div style={sectionHeader}>Setup — run in order the first time</div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>1. Run database migrations (001 + 002 + 003)</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Creates the tamper-evident chain columns on <code>security_events</code>, drops the <code>CHAR(64)</code> padding, and installs the <code>threat_feeds</code> OSINT cache. Every statement is idempotent — safe to re-run.
        </p>
        <Button appearance="primary" onClick={() => run("run-audit-migration")} disabled={running === "run-audit-migration"}>
          {running === "run-audit-migration" ? "Running…" : "Run migrations"}
        </Button>
        <OutputBlock output={output} action="run-audit-migration" />
      </div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#B75A00" }}>2. Reset pre-fix chain <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>· destructive · one-shot</span></h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Nulls <code>prev_hash</code> and <code>row_hash</code> on every currently-chained row so pre-fix rows become <em>pre-chain</em> (verify skips them) and the chain restarts clean from the next event. The event payload itself is untouched. Run this <strong>once</strong> after the migration, then leave it alone.
        </p>
        <Button
          appearance="secondary"
          onClick={() => runWithConfirm("reset-audit-chain", "This nulls prev_hash/row_hash on every currently-chained row. The event payload stays but the hash chain restarts. Proceed?")}
          disabled={running === "reset-audit-chain"}
        >
          {running === "reset-audit-chain" ? "Running…" : "Reset chain"}
        </Button>
        <OutputBlock output={output} action="reset-audit-chain" />
      </div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>3. Prime the OSINT feed cache</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Pulls Spamhaus DROP + EDROP and Emerging Threats compromised-IPs into <code>threat_feeds</code>. After this runs, every Visitors-panel IP gets a live OSINT match badge. Daily cron at 11:00 UTC refreshes automatically — this button is for the first run and on-demand bumps.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button appearance="primary" onClick={() => run("osint-refresh")} disabled={running === "osint-refresh"}>
            {running === "osint-refresh" ? "Refreshing…" : "Refresh now"}
          </Button>
          <Button appearance="secondary" onClick={() => run("osint-status", "GET")} disabled={running === "osint-status"}>
            {running === "osint-status" ? "Loading…" : "Feed details"}
          </Button>
        </div>
        <OutputBlock output={output} action="osint-refresh" />
        <OutputBlock output={output} action="osint-status" />
      </div>

      {/* ── Verification ── */}
      <div style={sectionHeader}>Verification — run anytime</div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>Verify audit-log chain</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Walks the security-events hash chain and reports any breaks. <code>ok: true, breaks: []</code> is the healthy answer. Any break = tampering OR a code/schema mismatch.
        </p>
        <Button appearance="primary" onClick={() => run("audit-verify", "GET")} disabled={running === "audit-verify"}>
          {running === "audit-verify" ? "Running…" : "Verify chain"}
        </Button>
        <OutputBlock output={output} action="audit-verify" />
      </div>

      {/* ── Revenue Signals ── */}
      <div style={sectionHeader}>Revenue signals — what's earning</div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>Blog + affiliate + store performance (30 days)</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Top blog posts by views, affiliate clicks per post, CTR, clicks by Amazon / Gusto / 1Password network, and the last 20 outbound clicks. Tells you which posts to write more of.
        </p>
        <Button appearance="primary" onClick={() => run("revenue-signals", "GET")} disabled={running === "revenue-signals"}>
          {running === "revenue-signals" ? "Loading…" : "Load revenue signals"}
        </Button>
        {output["revenue-signals"]?.data?.ok && (
          <>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Blog views (30d)</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{(output["revenue-signals"].data.totals?.blogViews || 0).toLocaleString()}</div>
              </div>
              <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Affiliate clicks (30d)</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{(output["revenue-signals"].data.totals?.affiliateClicks || 0).toLocaleString()}</div>
              </div>
              <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Overall CTR</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{output["revenue-signals"].data.totals?.overallCtr || 0}%</div>
              </div>
            </div>
            {output["revenue-signals"].data.postLeaderboard?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top posts by affiliate clicks</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  {output["revenue-signals"].data.postLeaderboard.slice(0, 10).map((p) => (
                    <div key={p.slug} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 8px", background: tokens.colorNeutralBackground2, borderRadius: 4 }}>
                      <span style={{ fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.slug}</span>
                      <span>{p.views.toLocaleString()} views</span>
                      <span style={{ fontWeight: 600, color: p.clicks > 0 ? tokens.colorBrandForeground1 : undefined }}>{p.clicks} clicks</span>
                      <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3, minWidth: 50, textAlign: "right" }}>{p.ctr}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {output["revenue-signals"].data.clicksByNetwork?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Clicks by affiliate network</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {output["revenue-signals"].data.clicksByNetwork.map((n) => (
                    <Badge key={n.network} appearance="filled" color="brand">
                      {n.network}: {n.clicks}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <OutputBlock output={output} action="revenue-signals" />
      </div>

      {/* ── Countermeasures ── */}
      <div style={sectionHeader}>Countermeasures — what the system did on its own</div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>View recent auto-actions</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Shows the last 50 auto-blocks from the scanner-trap / 3-in-1h realtime / 5-in-24h cron / OSINT match paths, plus every IP currently under admin-immunity. Use this view to spot false-positives before they burn a customer.
        </p>
        <Button appearance="primary" onClick={() => run("countermeasures", "GET")} disabled={running === "countermeasures"}>
          {running === "countermeasures" ? "Loading…" : "Load countermeasures"}
        </Button>
        {output["countermeasures"]?.data?.ok && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Auto-blocks (7d)</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{output["countermeasures"].data.autoBlocks?.length || 0}</div>
            </div>
            <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>OSINT-triggered blocks (7d)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (output["countermeasures"].data.osintBlocks?.length || 0) > 0 ? "#DC2626" : undefined }}>{output["countermeasures"].data.osintBlocks?.length || 0}</div>
            </div>
            <div style={{ padding: 10, background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.colorNeutralForeground3 }}>Active admin immunities</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{output["countermeasures"].data.immunities?.length || 0}</div>
            </div>
          </div>
        )}
        <OutputBlock output={output} action="countermeasures" />
      </div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>Grant manual admin-IP immunity</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Pre-authorize an IP before a trip (hotel network, coworking space, tethered phone) so the auto-block paths don't lock you out. Also removes the IP from the blocklist if it's currently there. Default 7-day TTL.
        </p>
        <Button
          appearance="secondary"
          onClick={() => {
            const ip = typeof window !== "undefined" ? window.prompt("IP address to grant immunity:") : null;
            if (!ip) return;
            const days = typeof window !== "undefined" ? window.prompt("TTL in days (1–90):", "7") : "7";
            csrfFetch("/api/portal?action=grant-immunity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ip: ip.trim(), days: Number(days) || 7 }),
            })
              .then((r) => r.json())
              .then((data) => setOutput((o) => ({ ...o, "grant-immunity": { status: 200, data } })));
          }}
          disabled={running === "grant-immunity"}
        >
          Grant immunity
        </Button>
        <OutputBlock output={output} action="grant-immunity" />
      </div>

      {/* ── Content — testimonials ── */}
      <div style={sectionHeader}>Content — testimonials</div>
      <TestimonialsAdmin />

      {/* ── Operations ── */}
      <div style={sectionHeader}>Operations — commerce + integrations</div>

      <div style={card}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>Create / reuse Stripe Payment Links</h4>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: tokens.colorNeutralForeground3 }}>
          Ensures every store SKU (currently 7 including the new $29 SaaS Incident Response Playbook) has a Stripe Product + Price + Payment Link. Idempotent — reuses existing ones. Copy each <code>url</code> from the output into the matching Vercel env var, then redeploy.
        </p>
        <Button appearance="primary" onClick={() => run("create-payment-links")} disabled={running === "create-payment-links"}>
          {running === "create-payment-links" ? "Running…" : "Create all Payment Links"}
        </Button>
        <OutputBlock output={output} action="create-payment-links" />
      </div>

      {/* ── Newsletter ── */}
      <div style={sectionHeader}>Newsletter — The Simple IT Brief</div>
      <NewsletterAdmin card={card} />

      <p style={{ color: tokens.colorNeutralForeground3, fontSize: 11, marginTop: 16 }}>
        Every action is <code>requireAdmin()</code> gated server-side. This console only proxies clicks — there is no elevated state on the frontend.
      </p>
    </div>
  );
}

// ---------- admin: newsletter send ----------
// Sends a one-shot newsletter to everyone on newsletter_subscribers who
// has confirmed + not unsubscribed. Subject + markdown body, preview,
// confirm modal. Subscribers are fetched from the same table that the
// public /api/contact confirm flow writes to — nothing else to wire up.
function NewsletterAdmin({ card }) {
  const [count, setCount] = useState(null);
  const [subject, setSubject] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/portal?action=newsletter-count", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setCount(data.count);
    } catch { /* leave count null */ }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/portal?action=newsletter-count", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (alive && res.ok && data.ok) setCount(data.count);
      } catch { /* leave count null */ }
    })();
    return () => { alive = false; };
  }, []);

  const send = useCallback(async () => {
    setConfirming(false);
    setSending(true);
    setErr("");
    setResult(null);
    try {
      const res = await csrfFetch("/api/portal?action=newsletter-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, markdown }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error || `http_${res.status}`);
      } else {
        setResult(data);
        setSubject("");
        setMarkdown("");
        await loadCount();
      }
    } catch (e) {
      setErr(e.message || "send_failed");
    } finally {
      setSending(false);
    }
  }, [subject, markdown, loadCount]);

  const disabled = sending || !subject.trim() || markdown.trim().length < 20;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Send newsletter</h4>
          <p style={{ margin: 0, fontSize: 12, color: tokens.colorNeutralForeground3 }}>
            {count == null
              ? "Loading subscriber count…"
              : `${count} confirmed subscriber${count === 1 ? "" : "s"} · will receive this blast`}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Subject line">
          <Input
            value={subject}
            onChange={(_, d) => setSubject(d.value)}
            placeholder="March 2026 — What happened in IT this month"
            maxLength={200}
            disabled={sending}
          />
        </Field>
        <Field label="Body (markdown: # H1, ## H2, **bold**, *italic*, [link](url), - lists)">
          <Textarea
            value={markdown}
            onChange={(_, d) => setMarkdown(d.value)}
            rows={12}
            placeholder={"# Hi there\n\nThis month we covered…\n\n- Thing 1\n- Thing 2\n\nRead more at [our blog](https://simpleitsrq.com/blog)."}
            disabled={sending}
          />
        </Field>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            appearance="primary"
            onClick={() => setConfirming(true)}
            disabled={disabled || count === 0}
          >
            {sending ? "Sending…" : count === 0 ? "No subscribers" : "Send newsletter"}
          </Button>
          {err && <span style={{ fontSize: 12, color: "#DC2626" }}>Failed: {err}</span>}
          {result && (
            <span style={{ fontSize: 12, color: "#065F46" }}>
              Sent: {result.sent} · Failed: {result.failed}{result.log_id ? ` · log ${String(result.log_id).slice(0, 8)}` : ""}
            </span>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={(_, d) => !d.open && setConfirming(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Send to {count ?? "?"} subscriber{count === 1 ? "" : "s"}?</DialogTitle>
            <DialogContent>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                This will email <strong>{count ?? "every confirmed subscriber"}</strong> right now. It cannot be undone — once a batch hits Resend there is no recall.
              </p>
              <p style={{ marginTop: 12, fontSize: 13, color: tokens.colorNeutralForeground3 }}>
                Subject: <strong>{subject || "(empty)"}</strong>
              </p>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button appearance="primary" onClick={send}>Yes, send to {count ?? 0}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

// ---------- admin: CTI command center ----------
function SecurityPanel({
  styles,
  loadHpCreds,
  hpCreds,
  hpLoading,
  blockIp,
  blockBusy,
  investigate,
  investigateIp,
  investigateData,
  investigateLoading,
  setInvestigateIp,
  setInvestigateData,
}) {
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(true);
  const [enumData, setEnumData] = useState(null);
  const [enumLoading, setEnumLoading] = useState(false);
  const [credIntel, setCredIntel] = useState(null);
  const [credIntelLoading, setCredIntelLoading] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [subTab, setSubTab] = useState("overview");
  const [range, setRange] = useState("7d");
  const [showInvestigate, setShowInvestigate] = useState(false);

  const loadIntel = useCallback(async () => {
    setIntelLoading(true);
    try {
      const res = await fetch(`/api/portal?action=threat-intel&range=${range}`, { credentials: "same-origin" });
      if (res.ok) setIntel(await res.json());
    } catch { /* best effort */ }
    finally { setIntelLoading(false); }
  }, [range]);

  const loadEnum = useCallback(async () => {
    setEnumLoading(true);
    try {
      const res = await fetch(`/api/portal?action=enum-intel&range=${range}`, { credentials: "same-origin" });
      if (res.ok) setEnumData(await res.json());
    } catch { /* best effort */ }
    finally { setEnumLoading(false); }
  }, [range]);

  const loadCredIntel = useCallback(async () => {
    setCredIntelLoading(true);
    try {
      const res = await fetch(`/api/portal?action=cred-intel&range=${range}`, { credentials: "same-origin" });
      if (res.ok) setCredIntel(await res.json());
    } catch { /* best effort */ }
    finally { setCredIntelLoading(false); }
  }, [range]);

  const loadGeo = useCallback(async () => {
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/portal?action=geo-intel&range=${range}`, { credentials: "same-origin" });
      if (res.ok) setGeoData(await res.json());
    } catch { /* best effort */ }
    finally { setGeoLoading(false); }
  }, [range]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadIntel is a stable useCallback
  useEffect(() => { loadIntel(); }, [loadIntel]);
  useEffect(() => { if (subTab === "credentials") loadHpCreds?.(); }, [subTab, loadHpCreds]);
  useEffect(() => { if (subTab === "enumeration") loadEnum(); }, [subTab, loadEnum]);
  useEffect(() => { if (subTab === "cred-intel")  loadCredIntel(); }, [subTab, loadCredIntel]);
  useEffect(() => { if (subTab === "geo")         loadGeo(); }, [subTab, loadGeo]);

  const pillStyle = (active) => ({
    padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", border: "none",
    background: active ? tokens.colorBrandBackground : "transparent",
    color: active ? "#fff" : tokens.colorNeutralForeground2,
  });
  const rangePill = (v, label) => (
    <button key={v} style={{ ...pillStyle(range === v), padding: "4px 10px", fontSize: 11 }} onClick={() => setRange(v)}>{label}</button>
  );

  return (
    <div>
      {/* ── Sub-nav ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {["overview", "enumeration", "campaigns", "credentials", "cred-intel", "geo", "countermeasures", "ops"].map((t) => (
          <button key={t} style={pillStyle(subTab === t)} onClick={() => setSubTab(t)}>
            {t === "overview" ? "Status"
              : t === "enumeration" ? "Site mapping"
              : t === "campaigns" ? "Coordinated attacks"
              : t === "credentials" ? "Captured passwords"
              : t === "cred-intel" ? "Login attempts"
              : t === "geo" ? "By country"
              : t === "countermeasures" ? "Automatic actions"
              : "Ops Console"}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {rangePill("24h", "24h")}{rangePill("7d", "7d")}{rangePill("30d", "30d")}
          <Button appearance="subtle" size="small" onClick={loadIntel} disabled={intelLoading} style={{ marginLeft: 8 }}>Refresh</Button>
        </div>
      </div>

      {intelLoading && !intel && <div style={{ padding: 24 }}><Spinner label="Loading threat intelligence…" /></div>}

      {/* ════ OVERVIEW (STATUS) TAB ════ */}
      {subTab === "overview" && intel && (
        <>
          {/* ── Big status header: what's happening right now ── */}
          {(() => {
            const n = intel.narrative || {};
            const colors = {
              calm:         { bg: "rgba(16, 124, 16, 0.08)",  border: "#107C10", label: "CALM",           labelColor: "#107C10" },
              elevated:     { bg: "rgba(217, 119, 6, 0.08)",  border: "#D97706", label: "ELEVATED",       labelColor: "#D97706" },
              under_attack: { bg: "rgba(220, 38, 38, 0.08)",  border: "#DC2626", label: "UNDER ATTACK",   labelColor: "#DC2626" },
            };
            const c = colors[n.statusLevel] || colors.calm;
            return (
              <div style={{
                padding: "20px 24px",
                borderRadius: 12,
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderLeft: `4px solid ${c.border}`,
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "4px 10px", borderRadius: 999,
                    background: c.border, color: "#fff",
                  }}>{c.label}</span>
                  {n.activeAttackers > 0 && (
                    <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
                      {n.activeAttackers} active attacker{n.activeAttackers > 1 ? "s" : ""} · last hour
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                  {n.statusHeadline || "No activity data yet."}
                </p>
              </div>
            );
          })()}

          {/* ── Incidents worth your attention ── */}
          {intel.narrative?.incidents?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: tokens.colorNeutralForeground2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Worth your attention
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {intel.narrative.incidents.map((inc, i) => {
                  const sev = {
                    critical: { color: "#DC2626", label: "Critical" },
                    warning:  { color: "#D97706", label: "Heads up" },
                    info:     { color: "#0F6CBD", label: "FYI" },
                  }[inc.severity] || { color: "#6b7280", label: "Info" };
                  return (
                    <div key={i} style={{
                      padding: "16px 18px",
                      borderRadius: 10,
                      background: tokens.colorNeutralBackground1,
                      border: `1px solid ${tokens.colorNeutralStroke2}`,
                      borderLeft: `4px solid ${sev.color}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <Badge appearance="filled" color={inc.severity === "critical" ? "danger" : inc.severity === "warning" ? "warning" : "brand"} style={{ fontSize: 10 }}>
                          {sev.label}
                        </Badge>
                        <strong style={{ fontSize: 14 }}>{inc.title}</strong>
                        {inc.ts && <span style={{ marginLeft: "auto", fontSize: 11, color: tokens.colorNeutralForeground3 }}>{ago(inc.ts)}</span>}
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: tokens.colorNeutralForeground1, lineHeight: 1.5 }}>
                        {inc.explanation}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 12px", fontSize: 12, color: tokens.colorNeutralForeground2, marginTop: 8 }}>
                        <span style={{ color: "#107C10", fontWeight: 600 }}>We did:</span>
                        <span>{inc.weDid}</span>
                        <span style={{ color: tokens.colorBrandForeground1, fontWeight: 600 }}>You should:</span>
                        <span>{inc.youShould}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── What we stopped for you (positive framing) ── */}
          {intel.narrative?.stopped && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: tokens.colorNeutralForeground2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                What we handled this {range === "24h" ? "day" : range === "7d" ? "week" : "month"}
              </h4>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                padding: "16px 18px",
                borderRadius: 10,
                background: "rgba(16, 124, 16, 0.04)",
                border: "1px solid rgba(16, 124, 16, 0.2)",
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#107C10" }}>{intel.narrative.stopped.blocks}</div>
                  <div style={{ fontSize: 12, color: tokens.colorNeutralForeground2 }}>malicious IPs blocked</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#107C10" }}>{intel.narrative.stopped.exploitAttempts}</div>
                  <div style={{ fontSize: 12, color: tokens.colorNeutralForeground2 }}>exploit attempts stopped</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#107C10" }}>{intel.narrative.stopped.hostileGeoHits}</div>
                  <div style={{ fontSize: 12, color: tokens.colorNeutralForeground2 }}>hostile-country probes</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#107C10" }}>{intel.narrative.stopped.credAttempts}</div>
                  <div style={{ fontSize: 12, color: tokens.colorNeutralForeground2 }}>fake-login attempts</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Details section (collapsed by default) ── */}
          <details style={{ marginTop: 24 }}>
            <summary style={{
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: tokens.colorNeutralForeground2,
              padding: "10px 14px",
              background: tokens.colorNeutralBackground2,
              borderRadius: 8,
              userSelect: "none",
            }}>
              Deep details (raw stats, hourly chart, top ASNs)
            </summary>
            <div style={{ padding: "16px 0" }}>
          <div className={styles.cardGrid}>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
              <div className={styles.statLabel}>Threats ({range})</div>
              <div className={styles.statValue} style={{ color: "#DC2626" }}>{intel.summary.totalThreats}</div>
            </div>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #D97706" }}>
              <div className={styles.statLabel}>Campaigns detected</div>
              <div className={styles.statValue} style={{ color: "#D97706" }}>{intel.summary.campaignCount}</div>
            </div>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #059669" }}>
              <div className={styles.statLabel}>IPs blocked</div>
              <div className={styles.statValue}>{intel.summary.blockedIps}</div>
            </div>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #7C3AED" }}>
              <div className={styles.statLabel}>Creds captured</div>
              <div className={styles.statValue} style={{ color: "#7C3AED" }}>{intel.summary.credCaptures}</div>
              <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>{intel.summary.uniquePasswords} unique passwords</span>
            </div>
          </div>

          {/* Attack velocity — hot IPs right now */}
          {intel.attackVelocity?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#DC2626" }}>Active attackers (last hour)</h4>
              <div className={styles.list}>
                {intel.attackVelocity.map((v, i) => (
                  <div key={i} className={styles.listRow} style={{ borderColor: "#DC2626", borderLeftWidth: 3 }}>
                    <div className={styles.listMain}>
                      <p className={styles.listTitle} style={{ fontFamily: "monospace" }}>{v.ip}</p>
                      <div className={styles.listMeta}><span>{v.hits1h} hits in last hour</span>
                        {v.intel?.org && <><span>·</span><span>{v.intel.org}</span></>}
                        {v.intel?.abuse_score != null && <Badge appearance="filled" color="danger" style={{ fontSize: 10 }}>Abuse: {v.intel.abuse_score}%</Badge>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="small" appearance="subtle" icon={<Eye24Regular />} onClick={() => { investigate(v.ip); setShowInvestigate(true); }}>Investigate</Button>
                      <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => blockIp(v.ip, `high velocity: ${v.hits1h} hits/hr`)} disabled={blockBusy}>Block</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Threat class breakdown */}
          {intel.threatClasses?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Threat breakdown</h4>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {intel.threatClasses.map((t) => (
                  <div key={t.class} style={{ padding: "8px 16px", background: tokens.colorNeutralBackground2, borderRadius: 8, fontSize: 13 }}>
                    <strong style={{ color: t.class === "scanner" ? "#DC2626" : t.class === "hostile_geo" ? "#D97706" : tokens.colorNeutralForeground1 }}>{t.class}</strong>
                    <span style={{ marginLeft: 8, color: tokens.colorNeutralForeground3 }}>{t.hits}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top attacking ASNs */}
          {intel.topAsns?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top attacking organizations</h4>
              <div className={styles.list}>
                {intel.topAsns.slice(0, 8).map((a, i) => (
                  <div key={i} className={styles.listRow}>
                    <div className={styles.listMain}>
                      <p className={styles.listTitle}>{a.org || "Unknown"}</p>
                      <div className={styles.listMeta}>
                        <span>{a.ipCount} IPs · {a.totalHits} hits</span>
                        {a.isDatacenter && <Badge appearance="outline" color="warning" style={{ fontSize: 10 }}>Datacenter</Badge>}
                        {a.avgAbuse > 0 && <Badge appearance="filled" color={a.avgAbuse >= 50 ? "danger" : "warning"} style={{ fontSize: 10 }}>Avg abuse: {a.avgAbuse}%</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity heatmap by UTC hour */}
          {intel.tzDistribution?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Attack activity by hour (UTC)</h4>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 60, padding: "0 4px" }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const entry = intel.tzDistribution.find((t) => t.hour === h);
                  const hits = entry?.hits || 0;
                  const max = Math.max(...intel.tzDistribution.map((t) => t.hits), 1);
                  const pct = (hits / max) * 100;
                  return (
                    <div key={h} title={`${h}:00 UTC — ${hits} hits`} style={{ flex: 1, minWidth: 8, background: hits > 0 ? `rgba(220, 38, 38, ${0.2 + pct / 140})` : tokens.colorNeutralBackground2, height: `${Math.max(4, pct)}%`, borderRadius: 2, cursor: "default" }} />
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: tokens.colorNeutralForeground3, marginTop: 2, padding: "0 4px" }}>
                <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
              </div>
            </div>
          )}

          {/* Critical events */}
          {intel.recentCritical?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#DC2626" }}>Critical & error events</h4>
              <div className={styles.list}>
                {intel.recentCritical.slice(0, 10).map((e, i) => (
                  <div key={i} className={styles.listRow} style={{ borderColor: e.severity === "critical" ? "#DC2626" : "#D97706", borderLeftWidth: 3 }}>
                    <div className={styles.listMain}>
                      <p className={styles.listTitle}>{e.kind}</p>
                      <div className={styles.listMeta}>
                        <span>{ago(e.ts)}</span>
                        {e.ip && <><span>·</span><span style={{ fontFamily: "monospace", fontSize: 11 }}>{e.ip}</span></>}
                        {e.path && <><span>·</span><span>{e.path}</span></>}
                      </div>
                    </div>
                    <Badge appearance="filled" color={e.severity === "critical" ? "danger" : "warning"}>{e.severity}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
            </div>
          </details>
        </>
      )}

      {/* ════ CAMPAIGNS TAB ════ */}
      {subTab === "campaigns" && intel && (
        <>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 13, margin: "0 0 16px" }}>
            Attacks grouped by device fingerprint. Multiple IPs with the same fingerprint = one actor rotating proxies. Inspired by Ch.25 §5 of the playbook.
          </p>
          {intel.campaigns?.length === 0 && (
            <div className={styles.emptyState}>No multi-IP campaigns detected in this time range.</div>
          )}
          {intel.campaigns?.map((c, i) => (
            <div key={i} className={styles.listRow} style={{ borderColor: "#7C3AED", borderLeftWidth: 3, flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 12, padding: 16, background: tokens.colorNeutralBackground2, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <Badge appearance="filled" color="important" style={{ marginRight: 8 }}>{c.ipCount} IPs</Badge>
                  <Badge appearance="filled" color="danger">{c.totalHits} hits</Badge>
                  {c.countries?.map((co) => <Badge key={co} appearance="outline" color="informative" style={{ marginLeft: 4, fontSize: 10 }}>{co}</Badge>)}
                </div>
                <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>{ago(c.firstSeen)} → {ago(c.lastSeen)}</span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: tokens.colorNeutralForeground3 }}>Threat types:</span>{" "}
                {c.threatClasses?.join(", ")}
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: tokens.colorNeutralForeground3 }}>Paths probed:</span>{" "}
                <span style={{ fontFamily: "monospace", fontSize: 11 }}>{c.pathsProbed?.slice(0, 8).join(", ")}{c.pathsProbed?.length > 8 ? ` +${c.pathsProbed.length - 8} more` : ""}</span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: tokens.colorNeutralForeground3 }}>IPs:</span>{" "}
                {c.ips?.map((ip) => (
                  <button key={ip} style={{ fontFamily: "monospace", fontSize: 11, background: "none", border: "none", color: tokens.colorBrandForeground1, cursor: "pointer", textDecoration: "underline", marginRight: 6 }}
                    onClick={() => { investigate(ip); setShowInvestigate(true); }}>{ip}</button>
                ))}
              </div>
              {c.intel?.length > 0 && (
                <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                  Orgs: {[...new Set(c.intel.map((i) => i.org).filter(Boolean))].join(", ") || "—"}
                  {c.intel.some((i) => i.is_datacenter) && <Badge appearance="outline" color="warning" style={{ fontSize: 9, marginLeft: 4 }}>DC</Badge>}
                  {c.intel.some((i) => i.is_tor) && <Badge appearance="filled" color="danger" style={{ fontSize: 9, marginLeft: 4 }}>TOR</Badge>}
                </div>
              )}
              <div style={{ fontFamily: "monospace", fontSize: 10, color: tokens.colorNeutralForeground3 }}>
                Fingerprint: {c.deviceHash}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ════ CREDENTIALS TAB ════ */}
      {subTab === "credentials" && (
        <>
          {hpLoading && <div style={{ padding: 24 }}><Spinner label="Loading credentials…" /></div>}
          {!hpLoading && hpCreds && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
                  <div className={styles.statLabel}>Total captures</div>
                  <div className={styles.statValue} style={{ color: "#DC2626" }}>{hpCreds.total || 0}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #D97706" }}>
                  <div className={styles.statLabel}>Unique IPs</div>
                  <div className={styles.statValue} style={{ color: "#D97706" }}>{hpCreds.uniqueIps || 0}</div>
                </div>
              </div>
              {hpCreds.credentials?.length > 0 && (
                <div className={styles.list} style={{ marginTop: 16 }}>
                  {hpCreds.credentials.map((c, i) => (
                    <div key={i} className={styles.listRow} style={{ borderColor: "#DC2626", borderLeftWidth: 3, flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p className={styles.listTitle} style={{ fontFamily: "monospace", fontSize: 13 }}>{c.ip}</p>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <Badge appearance="filled" color="danger">{c.country}</Badge>
                          <Button appearance="subtle" size="small" icon={<Delete24Regular />} onClick={() => blockIp(c.ip, `honeypot credential: ${c.email}`)} disabled={blockBusy}>Block</Button>
                          <Button appearance="subtle" size="small" icon={<Eye24Regular />} onClick={() => { investigate(c.ip); setShowInvestigate(true); }}>Investigate</Button>
                        </div>
                      </div>
                      <div className={styles.listMeta} style={{ flexWrap: "wrap", gap: 6 }}>
                        <span>Captured: <strong>{c.email}</strong></span>
                        {c.passwordShape && (
                          <><span>·</span><span title={c.passwordHash ? `SHA-256: ${c.passwordHash.slice(0, 12)}…` : ""}>pw: <strong>{c.passwordShape.firstChar}{"•".repeat(Math.max(0, (c.passwordShape.length || 1) - 1))}</strong> ({c.passwordShape.length} chars)</span></>
                        )}
                        <span>·</span><span>Page: {c.page}</span>
                        {c.org && <><span>·</span><span>{c.org}</span></>}
                        {c.abuseScore != null && <Badge appearance="filled" color={c.abuseScore >= 75 ? "danger" : c.abuseScore >= 25 ? "warning" : "subtle"} style={{ fontSize: 10 }}>Abuse: {c.abuseScore}%</Badge>}
                        <span>·</span><span>{fmt(c.ts)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {hpCreds.credentials?.length === 0 && <div className={styles.emptyState}>No credentials captured yet.</div>}
            </>
          )}
        </>
      )}

      {/* ════ COUNTERMEASURES TAB ════ */}
      {subTab === "countermeasures" && intel && (
        <>
          <div className={styles.cardGrid}>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #059669" }}>
              <div className={styles.statLabel}>Total blocked IPs</div>
              <div className={styles.statValue}>{intel.summary.blockedIps}</div>
            </div>
            <div className={styles.statCard} style={{ borderLeft: "3px solid #2563EB" }}>
              <div className={styles.statLabel}>Auto-actions ({range})</div>
              <div className={styles.statValue}>{intel.autoActions?.length || 0}</div>
            </div>
          </div>

          <h4 style={{ margin: "20px 0 8px", fontSize: 15, fontWeight: 600 }}>Automated countermeasure log</h4>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 12, margin: "0 0 8px" }}>
            Actions taken by the cron agent: threat feed ingests, auto-blocks on repeat offenders, session cleanups.
          </p>
          {intel.autoActions?.length === 0 && <div className={styles.emptyState}>No automated actions in this time range.</div>}
          <div className={styles.list}>
            {intel.autoActions?.map((a, i) => (
              <div key={i} className={styles.listRow}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>
                    <Badge appearance="outline" color={a.action === "ip_blocked" ? "danger" : a.action.includes("feed") ? "brand" : "subtle"} style={{ marginRight: 6, fontSize: 10 }}>{a.action}</Badge>
                    {a.target}
                  </p>
                  <div className={styles.listMeta}>
                    <span>{a.reason}</span><span>·</span><span>{ago(a.ts)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════ ENUMERATION TAB ════ */}
      {subTab === "enumeration" && (
        <>
          {enumLoading && !enumData && <div style={{ padding: 24 }}><Spinner label="Analyzing enumeration patterns…" /></div>}
          {enumData && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
                  <div className={styles.statLabel}>Exploit attempts</div>
                  <div className={styles.statValue} style={{ color: "#DC2626" }}>{enumData.summary.exploitAttempts}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #D97706" }}>
                  <div className={styles.statLabel}>Unique paths probed</div>
                  <div className={styles.statValue}>{enumData.summary.distinctPaths}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #7C3AED" }}>
                  <div className={styles.statLabel}>First-time attackers</div>
                  <div className={styles.statValue} style={{ color: "#7C3AED" }}>{enumData.summary.freshIps}</div>
                  <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>{enumData.summary.recurringIps} recurring</span>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #059669" }}>
                  <div className={styles.statLabel}>Scanned hits</div>
                  <div className={styles.statValue}>{enumData.summary.totalThreats}</div>
                </div>
              </div>

              {enumData.exploitAttempts?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#DC2626" }}>Active exploit attempts</h4>
                  <div className={styles.list}>
                    {enumData.exploitAttempts.map((e, i) => (
                      <div key={i} className={styles.listRow} style={{ borderColor: "#DC2626", borderLeftWidth: 3 }}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace" }}>{e.cve}</p>
                          <div className={styles.listMeta}>
                            <span>{e.name}</span><span>·</span>
                            <span><strong>{e.hits}</strong> hits from {e.uniqueIps} IPs</span>
                            {e.lastSeen && <><span>·</span><span>last seen {ago(e.lastSeen)}</span></>}
                          </div>
                        </div>
                        <Badge appearance="filled" color="danger">EXPLOIT</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enumData.tools?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Scanner / tool fingerprints</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {enumData.tools.map((t) => (
                      <div key={t.id} style={{ padding: "8px 12px", background: tokens.colorNeutralBackground2, borderRadius: 8, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "monospace" }}>{t.id}</span>
                        <Badge appearance="outline">{t.hits}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enumData.cms?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Targeted products / CMS</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {enumData.cms.map((c) => (
                      <div key={c.id} style={{ padding: "6px 14px", background: tokens.colorNeutralBackground2, borderRadius: 999, fontSize: 13 }}>
                        <strong>{c.id}</strong>
                        <span style={{ marginLeft: 8, color: tokens.colorNeutralForeground3 }}>{c.hits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enumData.topEnumerators?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top enumerators (by path breadth)</h4>
                  <div className={styles.list}>
                    {enumData.topEnumerators.map((e, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace" }}>{e.ip}</p>
                          <div className={styles.listMeta}>
                            <span><strong>{e.uniquePaths}</strong> unique paths</span><span>·</span>
                            <span>{e.hits} hits</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="small" appearance="subtle" icon={<Eye24Regular />} onClick={() => { investigate(e.ip); setShowInvestigate(true); }}>Investigate</Button>
                          <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => blockIp(e.ip, `enumerator: ${e.uniquePaths} unique paths / ${e.hits} hits`)} disabled={blockBusy}>Block</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enumData.topPaths?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top probed paths</h4>
                  <div className={styles.list}>
                    {enumData.topPaths.map((p, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace", fontSize: 13 }}>{p.path}</p>
                        </div>
                        <Badge appearance="outline">{p.hits} hits</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════ CREDENTIAL INTEL TAB ════ */}
      {subTab === "cred-intel" && (
        <>
          {credIntelLoading && !credIntel && <div style={{ padding: 24 }}><Spinner label="Analyzing credential attempts…" /></div>}
          {credIntel && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #DC2626" }}>
                  <div className={styles.statLabel}>Attempts</div>
                  <div className={styles.statValue} style={{ color: "#DC2626" }}>{credIntel.summary.totalAttempts}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #D97706" }}>
                  <div className={styles.statLabel}>Unique attackers</div>
                  <div className={styles.statValue}>{credIntel.summary.uniqueIps}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #7C3AED" }}>
                  <div className={styles.statLabel}>Distinct usernames</div>
                  <div className={styles.statValue} style={{ color: "#7C3AED" }}>{credIntel.summary.uniqueUsernames}</div>
                </div>
                <div className={styles.statCard} style={{ borderLeft: "3px solid #059669" }}>
                  <div className={styles.statLabel}>Patterns</div>
                  <div style={{ fontSize: 11, marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {Object.entries(credIntel.summary.patternCounts || {}).map(([k, v]) => (
                      <span key={k}><strong>{v}</strong> {k}</span>
                    ))}
                  </div>
                </div>
              </div>

              {credIntel.topUsernames?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top usernames tried</h4>
                  <div className={styles.list}>
                    {credIntel.topUsernames.map((u, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace", fontSize: 13 }}>{u.username}</p>
                        </div>
                        <Badge appearance="outline" color={u.hits > 50 ? "danger" : u.hits > 10 ? "warning" : "subtle"}>{u.hits}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {credIntel.pwLengthHistogram?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Password length distribution</h4>
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 80, padding: "0 4px" }}>
                    {credIntel.pwLengthHistogram.map((b) => {
                      const max = Math.max(...credIntel.pwLengthHistogram.map((x) => x.hits), 1);
                      const pct = (b.hits / max) * 100;
                      return (
                        <div key={b.length} title={`${b.length} chars — ${b.hits} attempts`}
                             style={{ flex: 1, minWidth: 14, background: `rgba(124, 58, 237, ${0.3 + pct / 150})`, height: `${Math.max(4, pct)}%`, borderRadius: 2 }} />
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: tokens.colorNeutralForeground3, marginTop: 2, padding: "0 4px" }}>
                    <span>0</span><span>8</span><span>16</span><span>24</span><span>32+</span>
                  </div>
                </div>
              )}

              {credIntel.ipBreakdown?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Per-IP attack pattern</h4>
                  <div className={styles.list}>
                    {credIntel.ipBreakdown.map((b, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace" }}>
                            {b.ip}{" "}
                            <Badge appearance="filled" color={
                              b.pattern === "stuffing" ? "danger"
                              : b.pattern === "brute-force" ? "danger"
                              : b.pattern === "spray" ? "warning"
                              : "subtle"
                            } style={{ fontSize: 10, marginLeft: 6 }}>{
                              b.pattern === "stuffing" ? "Credential stuffing"
                              : b.pattern === "brute-force" ? "Password guessing"
                              : b.pattern === "spray" ? "Password spraying"
                              : "Probing"
                            }</Badge>
                          </p>
                          <div className={styles.listMeta}>
                            <span>{b.total} attempts</span><span>·</span>
                            <span>{b.distinctUsers} users</span><span>·</span>
                            <span>max {b.maxPerUser}/user</span><span>·</span>
                            <span>{b.spanSeconds}s window</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="small" appearance="subtle" icon={<Eye24Regular />} onClick={() => { investigate(b.ip); setShowInvestigate(true); }}>Investigate</Button>
                          <Button size="small" appearance="subtle" icon={<Delete24Regular />} onClick={() => blockIp(b.ip, `${b.pattern}: ${b.total} attempts on ${b.distinctUsers} users`)} disabled={blockBusy}>Block</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════ GEO TAB ════ */}
      {subTab === "geo" && (
        <>
          {geoLoading && !geoData && <div style={{ padding: 24 }}><Spinner label="Loading geographic intel…" /></div>}
          {geoData && (
            <>
              {geoData.byCountry?.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Attacks by country</h4>
                  <div className={styles.list}>
                    {geoData.byCountry.slice(0, 10).map((c, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle}>{c.country}</p>
                          <div className={styles.listMeta}>
                            <span>{c.ips} unique IPs</span>
                          </div>
                        </div>
                        <Badge appearance="filled" color={c.hits > 500 ? "danger" : c.hits > 100 ? "warning" : "subtle"}>{c.hits}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geoData.conversionByCountry?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Visit→threat conversion rate</h4>
                  <p style={{ color: tokens.colorNeutralForeground3, fontSize: 12, margin: "0 0 8px" }}>
                    What fraction of visits from each country turned hostile. Countries above 50% are candidates for geofencing.
                  </p>
                  <div className={styles.list}>
                    {geoData.conversionByCountry.slice(0, 15).map((c, i) => (
                      <div key={i} className={styles.listRow} style={{
                        borderColor: c.pct >= 50 ? "#DC2626" : c.pct >= 20 ? "#D97706" : "transparent",
                        borderLeftWidth: c.pct >= 20 ? 3 : 1,
                      }}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle}>{c.country}</p>
                          <div className={styles.listMeta}>
                            <span>{c.threatIps} / {c.visitIps} IPs hostile</span>
                          </div>
                        </div>
                        <Badge appearance="filled" color={c.pct >= 50 ? "danger" : c.pct >= 20 ? "warning" : "subtle"}>{c.pct ?? 0}%</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geoData.byCidr?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top attacking /24 subnets</h4>
                  <p style={{ color: tokens.colorNeutralForeground3, fontSize: 12, margin: "0 0 8px" }}>
                    Multiple IPs in the same /24 = same actor / same datacenter. Block the whole range if you see more than 5 IPs in one /24.
                  </p>
                  <div className={styles.list}>
                    {geoData.byCidr.map((c, i) => (
                      <div key={i} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle} style={{ fontFamily: "monospace" }}>{c.cidr}</p>
                          <div className={styles.listMeta}>
                            <span>{c.ips} IPs · {c.hits} hits</span>
                            {c.countries?.length > 0 && <><span>·</span><span>{c.countries.join(", ")}</span></>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geoData.byCity?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Top attacking cities</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {geoData.byCity.slice(0, 20).map((c, i) => (
                      <div key={i} style={{ padding: "6px 12px", background: tokens.colorNeutralBackground2, borderRadius: 8, fontSize: 12 }}>
                        <strong>{c.city}</strong>, {c.country}
                        <span style={{ marginLeft: 6, color: tokens.colorNeutralForeground3 }}>{c.hits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════ OPS CONSOLE TAB ════ */}
      {subTab === "ops" && <OpsConsole />}

      {/* ── IP Investigation dialog (shared across tabs) ── */}
      {showInvestigate && (
        <Dialog open={showInvestigate} onOpenChange={(_, d) => { if (!d.open) { setShowInvestigate(false); setInvestigateData(null); setInvestigateIp(null); } }}>
          <DialogSurface className={styles.detailSurface}>
            <DialogBody>
              <DialogTitle>IP Investigation — {investigateIp}</DialogTitle>
              <DialogContent>
                {investigateLoading && <Spinner label="Investigating…" />}
                {!investigateLoading && investigateData && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {investigateData.intel && (
                      <div style={{ padding: 16, background: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium }}>
                        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>OSINT Intel</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                          <div><span style={{ color: tokens.colorNeutralForeground3 }}>Org:</span> {investigateData.intel.org || "—"}</div>
                          <div><span style={{ color: tokens.colorNeutralForeground3 }}>ISP:</span> {investigateData.intel.isp || "—"}</div>
                          <div><span style={{ color: tokens.colorNeutralForeground3 }}>Abuse Score:</span> {investigateData.intel.abuseScore ?? "—"}%</div>
                          <div><span style={{ color: tokens.colorNeutralForeground3 }}>Datacenter:</span> {investigateData.intel.isDatacenter ? "Yes" : "No"}</div>
                        </div>
                      </div>
                    )}
                    {investigateData.osintMatches?.length > 0 && (
                      <MessageBar intent="error">
                        <MessageBarBody>
                          <strong>OSINT match ({investigateData.osintMatches.length}):</strong>{" "}
                          {investigateData.osintMatches.map((m, i) => (
                            <span key={i} style={{ marginRight: 8 }}>
                              {m.feed} ({m.category}, {m.cidr})
                            </span>
                          ))}
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {investigateData.blocked && <MessageBar intent="warning"><MessageBarBody>Blocked: {investigateData.blocked.reason}</MessageBarBody></MessageBar>}
                    {investigateData.visits?.length > 0 && (
                      <div>
                        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Visits ({investigateData.visits.length})</h4>
                        <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                          {investigateData.visits.slice(0, 20).map((v, i) => (
                            <div key={i} style={{ padding: "4px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>{fmt(v.ts)} — {v.path}{v.browser && ` (${v.browser} / ${v.os})`}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {investigateData.threats?.length > 0 && (
                      <div>
                        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#DC2626" }}>Threats ({investigateData.threats.length})</h4>
                        <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
                          {investigateData.threats.slice(0, 20).map((t, i) => (
                            <div key={i} style={{ padding: "4px 0", borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>{fmt(t.ts)} — {t.method} {t.path} <Badge appearance="filled" color="danger" style={{ fontSize: 9 }}>{t.threatClass}</Badge></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {investigateData.deviceHashes?.length > 0 && (
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: tokens.colorNeutralForeground3 }}>Fingerprints: {investigateData.deviceHashes.join(", ")}</div>
                    )}
                  </div>
                )}
                {!investigateLoading && !investigateData && investigateIp && <div className={styles.emptyState}>No data found.</div>}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => { setShowInvestigate(false); setInvestigateData(null); setInvestigateIp(null); }}>Close</Button>
                {!investigateData?.blocked && (
                  <Button appearance="primary" icon={<Delete24Regular />} onClick={() => { blockIp(investigateIp, "manual block from investigation"); setShowInvestigate(false); }} disabled={blockBusy}>Block IP</Button>
                )}
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}

// ---------- dashboard view ----------
function Dashboard({ styles, user, onLogout, refreshUser }) {
  // Deep link: ?tab=drafts jumps straight to the Drafts panel after a review
  // email click. Only admin tabs are honored — anything else falls back to
  // overview so a stray query param can't confuse a regular client.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    if (t === "open" || t === "closed" || t === "invoices" || t === "profile") return t;
    if (user.isAdmin && (t === "drafts" || t === "visitors")) return t;
    return "overview";
  });
  const [openTickets, setOpenTickets] = useState(null);
  const [closedTickets, setClosedTickets] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [loadingOpen, setLoadingOpen] = useState(true);
  const [loadingClosed, setLoadingClosed] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTicket, setActiveTicket] = useState(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  // Keep the ref in sync with the latest search value. Assigning to
  // ref.current in an effect (not in render) satisfies react-hooks/refs and
  // still lets callbacks below read the freshest query without re-creating.
  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; }, [search]);

  const loadOpen = useCallback(async () => {
    setLoadingOpen(true);
    try {
      const q = searchRef.current.trim();
      const url =
        "/api/portal?action=tickets&status=open" +
        (q ? `&q=${encodeURIComponent(q)}` : "");
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      setOpenTickets(data.tickets || []);
    } catch {
      setOpenTickets([]);
    } finally {
      setLoadingOpen(false);
    }
  }, []);

  const loadClosed = useCallback(async () => {
    setLoadingClosed(true);
    try {
      const q = searchRef.current.trim();
      const url =
        "/api/portal?action=tickets&status=closed" +
        (q ? `&q=${encodeURIComponent(q)}` : "");
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      setClosedTickets(data.tickets || []);
    } catch {
      setClosedTickets([]);
    } finally {
      setLoadingClosed(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await fetch("/api/portal?action=invoices", { credentials: "same-origin" });
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadOpen();
    loadClosed();
    loadInvoices();
  }, [loadOpen, loadClosed, loadInvoices]);

  // Only poll while on a tab that actually looks at tickets/invoices. Profile,
  // Drafts, and Visitors don't need a 20s refresh loop hammering the DB.
  const shouldPoll = tab === "overview" || tab === "open" || tab === "closed" || tab === "invoices";

  // Initial load + refresh when refreshAll identity changes (i.e. one of its
  // loaders was re-memoized). The setState calls inside refreshAll are the
  // load-start flags, not cascading renders — the lint plugin can't tell
  // them apart.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    if (!shouldPoll) return undefined;
    const id = setInterval(refreshAll, 20000);
    const onFocus = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", refreshAll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", refreshAll);
    };
  }, [shouldPoll, refreshAll]);

  // Debounced search: refetch ticket lists 300ms after the user stops typing.
  useEffect(() => {
    const id = setTimeout(() => {
      loadOpen();
      loadClosed();
    }, 300);
    return () => clearTimeout(id);
  }, [search, loadOpen, loadClosed]);

  // --- Security Ops: honeypot credentials, block IP, investigation ---
  const [hpCreds, setHpCreds] = useState(null);
  const [hpLoading, setHpLoading] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [investigateIp, setInvestigateIp] = useState(null);
  const [investigateData, setInvestigateData] = useState(null);
  const [investigateLoading, setInvestigateLoading] = useState(false);

  const loadHpCreds = useCallback(async () => {
    setHpLoading(true);
    try {
      const res = await fetch("/api/portal?action=honeypot-creds", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHpCreds(data);
    } catch {
      setHpCreds({ credentials: [], intel: {} });
    } finally {
      setHpLoading(false);
    }
  }, []);

  const blockIp = useCallback(async (ip, reason = "manual: admin panel") => {
    setBlockBusy(true);
    try {
      const res = await csrfFetch("/api/portal?action=block-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, reason }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh visitors data after blocking
      refreshAll();
    } catch (err) {
      console.error("[portal] block-ip failed", err);
    } finally {
      setBlockBusy(false);
    }
  }, [refreshAll]);

  const investigate = useCallback(async (ip) => {
    setInvestigateIp(ip);
    setInvestigateLoading(true);
    setInvestigateData(null);
    try {
      const res = await fetch(`/api/portal?action=investigate&ip=${encodeURIComponent(ip)}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInvestigateData(data);
    } catch (err) {
      console.error("[portal] investigate failed", err);
    } finally {
      setInvestigateLoading(false);
    }
  }, []);

  const openCount   = openTickets   ? openTickets.length   : "…";
  const closedCount = closedTickets ? closedTickets.length : "…";
  const unpaidCount = invoices
    ? invoices.filter((i) => i.status === "open").length
    : "…";

  return (
    <>
      <header className={styles.dashHead}>
        <div className={styles.dashHeadLeft}>
          <Avatar
            name={user.name || user.email}
            image={user.avatarUrl ? { src: user.avatarUrl } : undefined}
            size={48}
          />
          <div>
            <h2 className={styles.dashGreeting} style={{ fontSize: 20, fontWeight: 600, color: tokens.colorNeutralForeground1 }}>
              {user.name || "Your account"}
            </h2>
            <div className={styles.dashEmail}>{user.email}</div>
          </div>
        </div>
        <Button
          appearance="subtle"
          icon={<SignOut24Regular />}
          onClick={onLogout}
        >
          Sign out
        </Button>
      </header>

      <TabList
        selectedValue={tab}
        onTabSelect={(_, d) => setTab(d.value)}
        className={styles.tabs}
      >
        <Tab value="overview">Overview</Tab>
        <Tab value="open">Open tickets</Tab>
        <Tab value="closed">Ticket history</Tab>
        <Tab value="invoices">Invoices</Tab>
        <Tab value="profile">Profile</Tab>
        {user.isAdmin && (
          <Tab value="drafts" icon={<DocumentEdit24Regular />}>
            Drafts
          </Tab>
        )}
        {user.isAdmin && (
          <Tab value="visitors" icon={<Eye24Regular />}>
            Visitors
          </Tab>
        )}
        {user.isAdmin && (
          <Tab value="security" icon={<ShieldTask24Regular />}>
            Security
          </Tab>
        )}
      </TabList>

      {tab === "overview" && (
        <Overview
          styles={styles}
          user={user}
          openCount={openCount}
          closedCount={closedCount}
          unpaidCount={unpaidCount}
        />
      )}
      {tab === "open" && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Open tickets</h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            {user.isAdmin
              ? "Every active ticket across all clients. Click a row to reply or change status."
              : "Active support requests assigned to your account. Click a row to see updates."}
          </p>
          {user.isAdmin && (
            <div className={styles.ticketSearch}>
              <Field label="Search" hint="Subject, code, client name, email, or company">
                <Input
                  value={search}
                  onChange={(_, d) => setSearch(d.value)}
                  placeholder="Marlee, offsec, SRQ-…"
                />
              </Field>
            </div>
          )}
          <TicketList
            styles={styles}
            tickets={openTickets}
            loading={loadingOpen}
            emptyLabel="No open tickets. Need something? File one from the Support page."
            onOpen={(t) => setActiveTicket(t.code)}
          />
        </div>
      )}
      {tab === "closed" && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Ticket history</h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Everything that's been resolved or closed.
          </p>
          {user.isAdmin && (
            <div className={styles.ticketSearch}>
              <Field label="Search">
                <Input
                  value={search}
                  onChange={(_, d) => setSearch(d.value)}
                  placeholder="Marlee, offsec, SRQ-…"
                />
              </Field>
            </div>
          )}
          <TicketList
            styles={styles}
            tickets={closedTickets}
            loading={loadingClosed}
            emptyLabel="No closed tickets yet."
            onOpen={(t) => setActiveTicket(t.code)}
          />
        </div>
      )}
      {tab === "invoices" && (
        <div className={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Invoices</h3>
              <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
                {user.isAdmin ? "All invoices across clients. Click New to send one." : "Invoices issued to your account."}
              </p>
            </div>
            {user.isAdmin && (
              <Button appearance="primary" icon={<Receipt24Regular />} onClick={() => setShowNewInvoice(true)}>
                New invoice
              </Button>
            )}
          </div>
          <InvoiceList styles={styles} invoices={invoices} loading={loadingInvoices} />
          {user.isAdmin && (
            <NewInvoiceDialog
              styles={styles}
              open={showNewInvoice}
              onClose={() => setShowNewInvoice(false)}
              onSent={() => { setShowNewInvoice(false); loadInvoices(); }}
            />
          )}
        </div>
      )}
      {tab === "profile" && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Your information</h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Update the contact details we use to reach you.
          </p>
          <ProfilePanel
            styles={styles}
            user={user}
            onSaved={() => refreshUser()}
          />
        </div>
      )}
      {tab === "drafts" && user.isAdmin && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>
            <Sparkle24Regular style={{ verticalAlign: -4, marginRight: 6 }} />
            Blog drafts
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Daily Claude Haiku drafts from <code>api/cron/agent.js</code>. Publish commits
            the post to <code>src/data/posts.js</code> via the GitHub API, which triggers a
            Vercel redeploy.
          </p>
          <DraftsPanel styles={styles} />
        </div>
      )}
      {tab === "visitors" && user.isAdmin && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>
            <Globe24Regular style={{ verticalAlign: -4, marginRight: 6 }} />
            Visitor intelligence
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Everyone who has been on simpleitsrq.com. IP and geo come from
            Vercel edge headers; the rest from the server-side tracker.
          </p>
          <VisitorsPanel styles={styles} onBlockIp={blockIp} />
        </div>
      )}
      {tab === "security" && user.isAdmin && (
        <div className={styles.panel}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>
            <ShieldTask24Regular style={{ verticalAlign: -4, marginRight: 6 }} />
            Security operations
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Honeypot-captured credentials, blocked IPs, and per-IP investigation.
          </p>
          <SecurityPanel
            styles={styles}
            loadHpCreds={loadHpCreds}
            hpCreds={hpCreds}
            hpLoading={hpLoading}
            blockIp={blockIp}
            blockBusy={blockBusy}
            investigate={investigate}
            investigateIp={investigateIp}
            investigateData={investigateData}
            investigateLoading={investigateLoading}
            setInvestigateIp={setInvestigateIp}
            setInvestigateData={setInvestigateData}
          />
        </div>
      )}

      <TicketDetailDialog
        styles={styles}
        code={activeTicket}
        isAdmin={!!user.isAdmin}
        onClose={() => setActiveTicket(null)}
        onChange={refreshAll}
      />
    </>
  );
}

// ---------- page shell ----------
function ClientPortalContent() {
  const styles = useStyles();
  const { user, loading, login, logout, refresh, providers } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const authError = searchParams.get("auth_error");

  // Strip the ?auth_error query param after we've shown it once.
  useEffect(() => {
    if (authError) {
      const t = setTimeout(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("auth_error");
        setSearchParams(next, { replace: true });
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [authError, searchParams, setSearchParams]);

  if (loading) {
    return (
      <main id="main">
        <div className={styles.shell} style={{ textAlign: "center", paddingTop: 120 }}>
          <Spinner label="Loading your portal…" />
        </div>
      </main>
    );
  }

  return (
    <main id="main">
      <div className={styles.shell}>
        {user ? (
          <Dashboard
            styles={styles}
            user={user}
            onLogout={logout}
            refreshUser={refresh}
          />
        ) : (
          <SignInView
            styles={styles}
            authError={authError}
            onLogin={login}
            providers={providers}
          />
        )}
      </div>
    </main>
  );
}

export default function ClientPortal() {
  useSEO({
    title: "Client Portal | Simple IT SRQ",
    description:
      "Sign in to see your open support tickets, ticket history, invoices, and account details with Simple IT SRQ.",
    canonical: "https://simpleitsrq.com/portal",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Client Portal", url: "https://simpleitsrq.com/portal" },
    ],
  });
  const { theme } = useTheme();
  return (
    <FluentProvider
      className="fluent-root"
      theme={theme === "dark" ? brandedDarkTheme : brandedLightTheme}
    >
      <ClientPortalContent />
    </FluentProvider>
  );
}
