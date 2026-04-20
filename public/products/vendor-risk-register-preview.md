# Vendor Risk Register for Small Business

**Preview — 8 of 40+ rows.** Full version is the complete xlsx + Google Sheet with every common Sarasota SMB SaaS vendor pre-filled.

---

## Why this exists

In 2026 every cyber-insurance renewal form has a "list of vendors processing your data" section. For a 15-person office that's easily 20 rows. Filling it out from scratch takes an entire Saturday. This spreadsheet shortens that to 30 minutes of editing pre-populated data.

---

## Preview: 8 sample rows

| # | Vendor | Category | Data held | SOC 2 | Region | Risk (1–5) | Review date | Owner |
|:-:|---|---|---|:-:|---|:-:|:-:|---|
| 1 | Microsoft 365 | Email / docs / files | All business comms, client docs, contracts | Yes | US + EU | 1 | 2026-Q1 | _______ |
| 2 | Google Workspace | Email / docs / files | Same as above if you use Gmail | Yes | US | 1 | 2026-Q1 | _______ |
| 3 | Stripe | Payments | Cardholder data, payout bank acct | Yes | US | 2 | 2026-Q1 | _______ |
| 4 | QuickBooks Online | Accounting | Financial records, payroll, bank connections | Yes | US | 2 | 2026-Q1 | _______ |
| 5 | HubSpot | CRM / marketing | Client names, deal pipeline, contact history | Yes | US + EU | 2 | 2026-Q1 | _______ |
| 6 | Notion | Knowledge base | Internal docs; public-page editor emails (2026 leak) | Limited | US | 3 | 2026-Q2 | _______ |
| 7 | Vercel | Web hosting | Environment vars, deploy logs (April 2026 incident) | Yes | US | 3 | 2026-Q2 | _______ |
| 8 | Clio | Legal case mgmt | Matter files, client PII, time entries | Yes | US | 2 | 2026-Q1 | _______ |

*Rows 9–40 cover: Slack, Zoom, HoneyBook, Gusto, Rippling, DocuSign, Dropbox, Acronis, Cloudflare, Mailchimp, ConvertKit, Calendly, Cal.com, 1Password, Bitwarden, Amazon S3, AWS, Azure, GCP, Figma, Canva, Adobe CC, Xero, FreshBooks, ClickUp, Monday, Airtable, Trello, Asana, Zapier, Make, and more.*

---

## Red/yellow/green scoring rubric (full)

**Green (1–2):** Major SOC 2 Type II-audited vendor, clear data-processing terms, no 2024–2026 incidents affecting data confidentiality.

**Yellow (3):** Either a vendor with a recent incident (but responded well), or a smaller vendor without a formal SOC 2, but with a usable Data Processing Addendum.

**Red (4–5):** Vendor without a SOC 2 or DPA, or with a 2025–2026 incident that hasn't been clearly remediated. Treat as a migration candidate or mitigate with extra controls.

---

## Quarterly review template (full, in the xlsx)

The full kit includes:
- Quarterly review prompt (5 questions to ask for each vendor)
- Template email to send a vendor when requesting their SOC 2 report
- Template to deprecate a vendor without losing client data
- Summary one-pager for an executive / insurance adjuster

---

Available now for $19. Lifetime updates (we add new vendors whenever one hits our clients' stacks — we've updated this three times in the last 90 days as Vercel, Notion, and Okta all had incidents).

[Buy it →](/store/vendor-risk-register)
