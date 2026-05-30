import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "../lib/Link";
import { useAuth } from "../lib/authContext.js";
import { csrfFetch } from "../lib/csrf";
import { useSEO } from "../lib/seo";

const STRIPE_BILLING_URL = "https://billing.stripe.com/p/login/5kQ7sE7oL9OEgIM2nPak000";
const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"];
const TICKET_PRIORITIES = ["low", "normal", "high", "critical"];

function labelize(value = "") {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6c1.9-5.6 7.1-9.7 13.6-9.7z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.8-2.1 5.2-4.6 6.8l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.8z" />
      <path fill="#FBBC05" d="M10.4 28.8c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.8-6C.9 17.6 0 20.7 0 24s.9 6.4 2.6 9.2l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.1 2.2-6.5 0-12-4.1-13.9-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
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

function fmtDate(iso) {
  if (!iso) return "Pending";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso) {
  if (!iso) return "Pending";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SignInCard({ providers, login, authError }) {
  return (
    <section className="portal-card portal-signin">
      <p className="eyebrow">Client portal</p>
      <h1>Sign in to see tickets, invoices, and account details.</h1>
      <p className="portal-muted">
        This portal is intentionally plain: support status, billing links, and contact details. Internal admin tools do not load here.
      </p>
      {authError && <div className="portal-alert">Sign-in issue: {authError}</div>}
      <div className="portal-actions">
        {providers.includes("google") && (
          <button type="button" className="btn btn-primary" onClick={() => login("google")}>
            <GoogleGlyph /> Continue with Google
          </button>
        )}
        {providers.includes("github") && (
          <button type="button" className="btn btn-secondary" onClick={() => login("github")}>
            <GitHubGlyph /> Continue with GitHub
          </button>
        )}
        {providers.includes("auth0") && (
          <button type="button" className="btn btn-secondary" onClick={() => login("auth0")}>
            Enterprise SSO
          </button>
        )}
      </div>
      <p className="portal-fineprint">
        By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}

function PortalList({ title, rows, empty }) {
  return (
    <section className="portal-card">
      <h2>{title}</h2>
      {!rows?.length ? (
        <p className="portal-muted">{empty}</p>
      ) : (
        <div className="portal-list">
          {rows.slice(0, 5).map((row) => (
            <div className="portal-row" key={row.id || row.code || row.number}>
              <div>
                <strong>{row.subject || row.number || row.description || "Item"}</strong>
                <span>{row.code || row.status || fmtDate(row.createdAt || row.created_at)}</span>
              </div>
              {row.amountCents != null && <b>{formatMoney(row.amountCents, row.currency)}</b>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminTicketConsole() {
  const [bucket, setBucket] = useState("open");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState({ status: "open", priority: "normal" });
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ action: "tickets", status: bucket });
      if (query) params.set("q", query);
      const res = await fetch(`/api/portal?${params.toString()}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ticket_list_failed");
      const nextTickets = data.tickets || [];
      setTickets(nextTickets);
      setSelectedCode((current) => {
        if (!nextTickets.length) return "";
        if (current && nextTickets.some((ticket) => ticket.code === current)) return current;
        return nextTickets[0].code;
      });
    } catch (err) {
      setTickets([]);
      setSelectedCode("");
      setError(err?.message || "Ticket list failed.");
    } finally {
      setLoading(false);
    }
  }, [bucket, query]);

  const loadTicket = useCallback(async (code) => {
    if (!code) {
      setDetail(null);
      setMessages([]);
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ action: "ticket", code });
      const res = await fetch(`/api/portal?${params.toString()}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ticket_load_failed");
      setDetail(data.ticket || null);
      setMessages(data.messages || []);
      setDraft({
        status: data.ticket?.status || "open",
        priority: data.ticket?.priority || "normal",
      });
    } catch (err) {
      setDetail(null);
      setMessages([]);
      setError(err?.message || "Ticket failed to load.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadTickets();
    });
    return () => {
      cancelled = true;
    };
  }, [loadTickets]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadTicket(selectedCode);
    });
    return () => {
      cancelled = true;
    };
  }, [loadTicket, selectedCode]);

  const submitSearch = (event) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  const saveTicket = async () => {
    if (!detail?.code || busy) return;
    setBusy("save");
    setError("");
    try {
      const res = await csrfFetch("/api/portal?action=ticket", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: detail.code, status: draft.status, priority: draft.priority }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ticket_update_failed");
      await Promise.all([loadTickets(), loadTicket(detail.code)]);
    } catch (err) {
      setError(err?.message || "Ticket update failed.");
    } finally {
      setBusy("");
    }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!detail?.code || !body || busy) return;
    setBusy("reply");
    setError("");
    try {
      const res = await csrfFetch("/api/portal?action=ticket-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: detail.code, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "reply_failed");
      setReply("");
      await Promise.all([loadTickets(), loadTicket(detail.code)]);
    } catch (err) {
      setError(err?.message || "Reply failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="portal-card portal-ticket-console">
      <div className="portal-console-head">
        <div>
          <h2>Admin ticket desk</h2>
          <p className="portal-muted">All submitted support tickets, replies, status, and priority controls.</p>
        </div>
        <div className="portal-ticket-tabs" aria-label="Ticket status bucket">
          <button type="button" className={bucket === "open" ? "is-active" : ""} onClick={() => setBucket("open")}>Open</button>
          <button type="button" className={bucket === "closed" ? "is-active" : ""} onClick={() => setBucket("closed")}>Closed</button>
        </div>
      </div>

      <form className="portal-ticket-search" onSubmit={submitSearch}>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search subject, customer, company, email, or code"
          aria-label="Search tickets"
        />
        <button type="submit" className="btn btn-secondary">Search</button>
        {query && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearchInput("");
              setQuery("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error && <div className="portal-alert" role="alert">Ticket console issue: {error}</div>}

      <div className="portal-ticket-layout">
        <div className="portal-ticket-list" aria-label="Tickets">
          {loading ? (
            <p className="portal-muted">Loading tickets...</p>
          ) : tickets.length ? (
            tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.code}
                className={`portal-ticket-item${selectedCode === ticket.code ? " is-active" : ""}`}
                onClick={() => setSelectedCode(ticket.code)}
              >
                <strong>{ticket.subject || "Untitled ticket"}</strong>
                <span>{ticket.code} - {ticket.submitter?.name || ticket.submitter?.email || "Unknown customer"}</span>
                <small>{labelize(ticket.priority)} - {labelize(ticket.status)} - {fmtDateTime(ticket.createdAt)}</small>
              </button>
            ))
          ) : (
            <p className="portal-muted">No {bucket} tickets found.</p>
          )}
        </div>

        <div className="portal-ticket-detail" aria-live="polite">
          {detailLoading ? (
            <p className="portal-muted">Loading ticket...</p>
          ) : detail ? (
            <>
              <div className="portal-ticket-detail-head">
                <div>
                  <span>{detail.code}</span>
                  <h3>{detail.subject}</h3>
                  <p>{detail.submitter?.name || "Unknown"} - {detail.submitter?.email || "No email"}</p>
                </div>
                <strong>{labelize(detail.status)}</strong>
              </div>

              <div className="portal-ticket-meta">
                <div><span>Company</span><strong>{detail.submitter?.company || "-"}</strong></div>
                <div><span>Phone</span><strong>{detail.submitter?.phone || "-"}</strong></div>
                <div><span>Category</span><strong>{detail.category || "-"}</strong></div>
                <div><span>Opened</span><strong>{fmtDateTime(detail.createdAt)}</strong></div>
              </div>

              <div className="portal-ticket-description">
                <span>Description</span>
                <p>{detail.description}</p>
              </div>

              <div className="portal-ticket-controls">
                <label>
                  <span>Status</span>
                  <select value={draft.status} onChange={(event) => setDraft((d) => ({ ...d, status: event.target.value }))}>
                    {TICKET_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select value={draft.priority} onChange={(event) => setDraft((d) => ({ ...d, priority: event.target.value }))}>
                    {TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{labelize(priority)}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-primary" disabled={busy === "save"} onClick={saveTicket}>
                  {busy === "save" ? "Saving..." : "Save disposition"}
                </button>
              </div>

              <div className="portal-ticket-messages">
                <h4>Conversation</h4>
                {messages.length ? messages.map((message) => (
                  <div className={`portal-ticket-message portal-ticket-message--${message.author}`} key={message.id}>
                    <div>
                      <strong>{message.authorName || labelize(message.author)}</strong>
                      <span>{fmtDateTime(message.createdAt)}</span>
                    </div>
                    <p>{message.body}</p>
                  </div>
                )) : <p className="portal-muted">No replies yet.</p>}
              </div>

              <div className="portal-ticket-reply">
                <textarea
                  rows="5"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a reply to the customer"
                  aria-label="Ticket reply"
                />
                <button type="button" className="btn btn-primary" disabled={!reply.trim() || busy === "reply"} onClick={sendReply}>
                  {busy === "reply" ? "Sending..." : "Send reply"}
                </button>
              </div>
            </>
          ) : (
            <p className="portal-muted">Select a ticket to inspect it.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Dashboard({ user, logout }) {
  const [openTickets, setOpenTickets] = useState(null);
  const [closedTickets, setClosedTickets] = useState(null);
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const fetchJson = async (url) => {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return {};
        return res.json().catch(() => ({}));
      };
      const [open, closed, bills] = await Promise.all([
        fetchJson("/api/portal?action=tickets&status=open"),
        fetchJson("/api/portal?action=tickets&status=closed"),
        fetchJson("/api/portal?action=invoices"),
      ]);
      if (!cancelled) {
        setOpenTickets(open.tickets || []);
        setClosedTickets(closed.tickets || []);
        setInvoices(bills.invoices || []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unpaidInvoices = useMemo(
    () => (invoices || []).filter((invoice) => invoice.status === "open"),
    [invoices],
  );

  return (
    <div className="portal-dashboard">
      <header className="portal-head">
        <div>
          <p className="eyebrow">Signed in</p>
          <h1>{user.name || user.email}</h1>
          <p className="portal-muted">{user.email}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={logout}>Sign out</button>
      </header>

      <section className="portal-stats" aria-label="Account summary">
        <div><span>Open tickets</span><strong>{openTickets ? openTickets.length : "..."}</strong></div>
        <div><span>Closed tickets</span><strong>{closedTickets ? closedTickets.length : "..."}</strong></div>
        <div><span>Unpaid invoices</span><strong>{invoices ? unpaidInvoices.length : "..."}</strong></div>
      </section>

      <div className="portal-grid">
        <PortalList title="Open tickets" rows={openTickets} empty="No open tickets right now." />
        <PortalList title="Recent invoices" rows={invoices} empty="No invoices found for this account." />
      </div>

      <section className="portal-card">
        <h2>Quick actions</h2>
        <div className="portal-actions portal-actions--row">
          <Link className="btn btn-primary" to="/support">Open a support ticket</Link>
          <Link className="btn btn-secondary" to="/book">Book a call</Link>
          <a className="btn btn-secondary" href={STRIPE_BILLING_URL} target="_blank" rel="noopener noreferrer">Manage billing</a>
        </div>
      </section>

      {user.isAdmin ? (
        <>
          <AdminTicketConsole />
          <section className="portal-card">
            <h2>Admin operations</h2>
            <p className="portal-muted">
              Internal dashboard for affiliate clicks, leadgen, content drafts, AdSense, and OpSec. Hidden from public navigation.
            </p>
            <div className="portal-actions portal-actions--row">
              <Link className="btn btn-primary" to="/portal/ops">Open ops dashboard</Link>
              <Link className="btn btn-secondary" to="/portal/ops?tab=affiliate">Affiliate signals</Link>
              <Link className="btn btn-secondary" to="/portal/leadgen">Leadgen workspace</Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function ClientPortalPublic() {
  useSEO({
    title: "Client Portal | Simple IT SRQ",
    description: "Sign in to see your Simple IT SRQ support tickets, invoices, and account details.",
    canonical: "https://simpleitsrq.com/portal",
    robots: "noindex, nofollow",
    image: "https://simpleitsrq.com/og-image.png",
    breadcrumbs: [
      { name: "Home", url: "https://simpleitsrq.com/" },
      { name: "Client Portal", url: "https://simpleitsrq.com/portal" },
    ],
  });

  const { user, loading, login, logout, providers } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth_error");

  return (
    <main id="main" className="portal-page">
      <div className="container">
        {loading ? (
          <section className="portal-card"><p className="portal-muted">Loading your portal...</p></section>
        ) : user ? (
          <Dashboard user={user} logout={logout} />
        ) : (
          <SignInCard providers={providers} login={login} authError={authError} />
        )}
      </div>
    </main>
  );
}
