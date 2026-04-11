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
} from "@fluentui/react-icons";
import { useTheme } from "../lib/theme";
import { brandedLightTheme, brandedDarkTheme } from "../lib/fluentTheme";
import { useAuth } from "../lib/authContext.js";
import { useSEO } from "../lib/seo";

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
    gap: "12px",
    alignItems: "flex-start",
  },
  featureIcon: {
    width: "36px",
    height: "36px",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },

  // dashboard
  dashHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  dashHeadLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  dashGreeting: {
    margin: 0,
    lineHeight: 1.2,
  },
  dashEmail: {
    color: tokens.colorNeutralForeground3,
    fontSize: "13px",
  },
  tabs: {
    marginBottom: "20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  panel: {
    marginTop: "24px",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "12px",
  },
  statCard: {
    padding: "18px 20px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
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
  },
  listMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    marginTop: "4px",
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
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
              {authError === "unverified_email" && "Your Google email isn't verified. Please verify it and try again."}
              {authError === "no_email" && "We couldn't read an email from your GitHub account. Add a verified email and retry."}
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
              className={styles.providerBtn}
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
          {!hasGoogle && !hasGitHub && (
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
  useEffect(() => {
    if (!code) return;
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
      const res = await fetch("/api/portal?action=ticket-message", {
        method: "POST",
        credentials: "same-origin",
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
      const res = await fetch("/api/portal?action=ticket", {
        method: "PATCH",
        credentials: "same-origin",
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
      const res = await fetch("/api/portal?action=me", {
        method: "PATCH",
        credentials: "same-origin",
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
function VisitorsPanel({ styles }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div>
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 24 }}>
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
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 0", color: tokens.colorNeutralForeground1 }}>Recent visits</h3>
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

      {/* --- Threat actors (honeypot hits) --- */}
      {data.threatActors && data.threatActors.length > 0 && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "32px 0 8px", color: "#DC2626" }}>
            Threat actors ({data.threatActors.length})
          </h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, margin: "0 0 8px" }}>
            Hostile-origin visitors routed to honeypot. They never saw the real site.
          </p>
          <div className={styles.list}>
            {data.threatActors.map((t, i) => (
              <div key={i} className={styles.listRow} style={{ borderColor: "#DC2626", borderLeftWidth: 3 }}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>{t.method} {t.path}</p>
                  <div className={styles.listMeta}>
                    <span>{fmt(t.ts)}</span>
                    <span>·</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11 }}>{t.ip}</span>
                    <span>·</span>
                    <span>{[t.city, t.country].filter(Boolean).join(", ")}</span>
                    <span>·</span>
                    <span>{t.threatClass}</span>
                  </div>
                  {t.deviceHash && <div style={{ fontFamily: "monospace", fontSize: 10, color: tokens.colorNeutralForeground3 }}>Device: {t.deviceHash}</div>}
                </div>
                <Badge appearance="filled" color="danger">blocked</Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {/* --- Session anomalies --- */}
      {data.sessionAnomalies && data.sessionAnomalies.length > 0 && (
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

      <div style={{ marginTop: 16 }}>
        <Button appearance="subtle" onClick={load}>Refresh</Button>
      </div>
    </div>
  );
}

// ---------- dashboard view ----------
function Dashboard({ styles, user, onLogout, refreshUser }) {
  const [tab, setTab] = useState("overview");
  const [openTickets, setOpenTickets] = useState(null);
  const [closedTickets, setClosedTickets] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [loadingOpen, setLoadingOpen] = useState(true);
  const [loadingClosed, setLoadingClosed] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTicket, setActiveTicket] = useState(null);

  const searchRef = useRef(search);
  searchRef.current = search;

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

  // Only poll while on a tab that actually looks at tickets/invoices. Profile
  // and Visitors don't need a 20s refresh loop hammering the DB.
  const shouldPoll = tab === "overview" || tab === "open" || tab === "closed" || tab === "invoices";

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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
          <Tab value="visitors" icon={<Eye24Regular />}>
            Visitors
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
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: tokens.colorNeutralForeground1 }}>Invoices</h3>
          <p style={{ color: tokens.colorNeutralForeground3, fontSize: 14, lineHeight: "22px", margin: "4px 0 0" }}>
            Invoices we've issued to your account.
          </p>
          <InvoiceList styles={styles} invoices={invoices} loading={loadingInvoices} />
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
          <VisitorsPanel styles={styles} />
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
