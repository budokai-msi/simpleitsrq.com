import { useState, useMemo } from "react";
import {
  BookOpen,
  ExternalLink,
  Inbox,
  Mail,
  Send,
  Ticket,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { EmptyState, SignalPill, StatusChip, analyzeMicrosoftDocs, fmtNumber, postJson } from "./shared";

function LeadsInboxTab({ data, error, reload }) {
  const leads = data?.leads || [];
  const counts = data?.counts || {};
  const [selectedLead, setSelectedLead] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(null);

  const activeLead = selectedLead || leads[0] || null;
  const msDocs = useMemo(() => analyzeMicrosoftDocs(activeLead?.message), [activeLead]);

  const selectLead = (l) => {
    setSelectedLead(l);
    setReplySubject(l ? `Re: Simple IT SRQ Inquiry — ${l.company || l.name || "Onsite IT Support"}` : "");
    setReplyBody(l ? `Hi ${l.name ? l.name.split(" ")[0] : "there"},\n\nThanks for reaching out!\n\nYes, we offer one-time onsite projects with no monthly contracts required, and we can come directly to your office.\n\nWe can send an engineer out to assist with your Microsoft accounts, Outlook, OneDrive, and personal/work device separation.\n\nWe have afternoon openings (12pm–5pm) starting next Tuesday onward, as well as weekend options (Saturday or Sunday).\n\nLet us know which day works best for you and we'll get you on the schedule!\n\nBest regards,\nSimple IT SRQ Team` : "");
    setEmailStatus(null);
    setTicketStatus(null);
  };

  const sendEmail = async () => {
    if (!activeLead || !activeLead.email || !replyBody.trim()) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await postJson("send-lead-email", {
        lead_id: activeLead.id,
        to: activeLead.email,
        subject: replySubject,
        body: replyBody,
      });
      setEmailStatus({ ok: true, text: `Email sent via Resend (ID: ${res.id})` });
      if (reload) reload();
    } catch (e) {
      setEmailStatus({ ok: false, text: String(e.message || e) });
    } finally {
      setSendingEmail(false);
    }
  };

  const createTicket = async () => {
    if (!activeLead) return;
    setCreatingTicket(true);
    setTicketStatus(null);
    try {
      const res = await postJson("create-lead-ticket", {
        lead_id: activeLead.id,
        title: `Onsite Project: ${activeLead.company || activeLead.name || "Website Inquiry"}`,
        category: "Microsoft 365 / Workstation Cleanup",
        priority: "normal",
        description: activeLead.message || "Lead conversion",
      });
      setTicketStatus({ ok: true, text: `Ticket ${res.code} created!` });
      if (reload) reload();
    } catch (e) {
      setTicketStatus({ ok: false, text: String(e.message || e) });
    } finally {
      setCreatingTicket(false);
    }
  };

  const fmtDate = (ts) => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };

  return (
    <div className="ops-grid">
      <section className="admin-aff-card ops-panel ops-panel--wide">
        <div className="ops-panel__head">
          <h2>Email & Lead Dispatcher Inbox</h2>
          <SignalPill state={(counts.new || 0) ? "good" : "neutral"}>
            {fmtNumber(counts.new || 0)} new · {fmtNumber(counts.contacted || 0)} contacted · {fmtNumber(counts.won || 0)} won
          </SignalPill>
        </div>
        <p className="ops-panel__copy">
          Track inbound inquiries, send direct email replies via Resend (`contact@simpleitsrq.com`), generate client portal tickets with 1 click, and view AI Microsoft documentation suggestions.
        </p>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!error && leads.length === 0 ? <EmptyState>No leads yet - form submissions appear here in real time.</EmptyState> : null}

        {leads.length ? (
          <div className="admin-leadgen-inbox-grid" style={{ marginTop: 16 }}>
            {/* Left Column: Lead List */}
            <div style={{ overflowX: "auto" }}>
              <table className="admin-aff-table ops-table">
                <thead>
                  <tr><th>Lead</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {leads.map((l, i) => {
                      const isSelected = activeLead?.id === l.id;
                      return (
                        <motion.tr
                          key={l.id}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -15 }}
                          transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 30 }}
                          whileHover={{ scale: 1.005, backgroundColor: "var(--lg-row-hover-active, rgba(99, 102, 241, 0.08))" }}
                          whileTap={{ scale: 0.98 }}
                          style={{
                            background: isSelected ? "var(--lg-row-hover, #f1f5f9)" : "transparent",
                            cursor: "pointer",
                            position: "relative",
                            borderLeft: isSelected ? "3px solid var(--brand, #6366f1)" : "3px solid transparent",
                          }}
                          onClick={() => selectLead(l)}
                        >
                          <td>
                            <strong>{l.name || l.email}</strong>
                            {l.company ? <><br /><span style={{ fontSize: 11, opacity: 0.8 }}>{l.company}</span></> : null}
                            <br /><span className="admin-leadgen-muted" style={{ fontSize: 10 }}>{fmtDate(l.created_at)}</span>
                          </td>
                          <td>
                            <StatusChip status={l.status || "new"} />
                          </td>
                          <td>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); selectLead(l); }}>
                              Manage
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Right Column: Selected Lead Workbench */}
            <AnimatePresence mode="wait">
              {activeLead ? (
                <motion.div
                  key={activeLead.id}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  style={{ padding: 18, border: "1px solid var(--border, #cbd5e1)", borderRadius: 12, background: "var(--surface, #fff)", boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{activeLead.name || "Inbound Lead"}</h3>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)" }}>
                      {activeLead.company} {activeLead.email ? `· ${activeLead.email}` : ""} {activeLead.phone ? `· ${activeLead.phone}` : ""}
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" disabled={creatingTicket} onClick={createTicket}>
                    <Ticket size={14} /> {creatingTicket ? "Creating..." : "1-Click Create Ticket"}
                  </button>
                </div>

                {ticketStatus ? (
                  <p style={{ color: ticketStatus.ok ? "#10b981" : "#ef4444", fontSize: 12, margin: "4px 0 10px", fontWeight: 600 }}>{ticketStatus.text}</p>
                ) : null}

                {/* Lead Message Box — High Contrast Dark/Light Styling */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "var(--surface-2, #1e293b)",
                    border: "1px solid var(--border, #334155)",
                    marginBottom: 16,
                  }}
                >
                  <strong
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      color: "var(--text-2, #94a3b8)",
                      letterSpacing: "0.06em",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Inquiry Content:
                  </strong>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                      color: "var(--text-1, #f8fafc)",
                      fontWeight: 500,
                    }}
                  >
                    {activeLead.message || "No message body provided."}
                  </p>
                </div>

                {/* AI Microsoft Doc Suggestions */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "color-mix(in srgb, var(--brand, #6366f1) 12%, var(--surface-2, #1e293b))",
                    border: "1px solid color-mix(in srgb, var(--brand, #6366f1) 35%, transparent)",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 8,
                      color: "var(--brand, #818cf8)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <BookOpen size={16} /> Official Microsoft Documentation
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {msDocs.map((doc) => (
                      <div key={doc.title} style={{ fontSize: 12 }}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontWeight: 650,
                            color: "var(--brand-hover, #a5b4fc)",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <BookOpen size={13} /> {doc.title} <ExternalLink size={11} />
                        </a>
                        <p style={{ margin: "2px 0 0", color: "var(--text-2, #cbd5e1)", fontSize: 11 }}>{doc.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Email Reply Composer */}
                <div style={{ display: "grid", gap: 10 }}>
                  <strong style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: "var(--text-1, #f8fafc)" }}>
                    <Mail size={15} /> Reply to Lead
                  </strong>
                  <input
                    type="text"
                    className="admin-leadgen-input"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    placeholder="Subject..."
                    style={{ background: "var(--surface-2, #1e293b)", color: "var(--text-1, #f8fafc)", borderColor: "var(--border, #334155)" }}
                  />
                  <textarea
                    rows={7}
                    className="admin-leadgen-input admin-leadgen-textarea"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type email reply..."
                    style={{ background: "var(--surface-2, #1e293b)", color: "var(--text-1, #f8fafc)", borderColor: "var(--border, #334155)" }}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={sendingEmail || !activeLead.email}
                        onClick={sendEmail}
                      >
                        <Send size={14} /> {sendingEmail ? "Sending via Resend..." : "Send via Resend"}
                      </button>
                      {activeLead.email ? (
                        <a
                          href={`mailto:${encodeURIComponent(activeLead.email)}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`}
                          className="btn btn-secondary btn-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Mail size={14} /> Open in Email Client (Mailto)
                        </a>
                      ) : null}
                    </div>
                    {emailStatus ? (
                      <span style={{ color: emailStatus.ok ? "#10b981" : "#ef4444", fontSize: 12, fontWeight: 600 }}>
                        {emailStatus.text}
                      </span>
                    ) : null}
                  </div>
                </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted, #94a3b8)", fontSize: 14 }}
                >
                  Select a lead from the list to view details
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </section>
    </div>
  );
}

