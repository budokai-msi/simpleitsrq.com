# SaaS Incident Response Playbook

**Preview — the three worksheets and the vendor-breach decision tree.** Full playbook is 14 pages (fillable PDF + editable Word versions included).

Written by the Simple IT SRQ team. Updated 2026-04-19 — the morning two SaaS vendors (Vercel and Notion) both hit the Hacker News front page with incidents within three hours of each other.

---

## The premise

In 2026, your real security perimeter isn't your firewall — it's the 10 to 20 SaaS apps your business runs on. Microsoft 365 or Google Workspace for email. A CRM. An accounting system. A knowledge tool. A scheduling tool. A payment processor. A dozen more. Any one of them can have a bad day. When one does, the businesses that come out fine are the ones whose owner or office manager can run a 30-minute check without improvising.

This playbook is that check. It's not a compliance document. It's what we hand to clients the morning after a vendor breach hits the news.

---

## 1. SaaS Inventory Worksheet (preview — full version has 40 rows)

Fill this out once. Update it every quarter, or every time someone joins or leaves the company.

| # | Vendor | What data they hold | Admin account | MFA on? | OAuth grants reviewed? | Rotates what? |
|:---:|---|---|---|:---:|:---:|---|
| 1 | Microsoft 365 / Google Workspace | Email, docs, calendar, contacts | __________ | ☐ | ☐ | App passwords, OAuth tokens |
| 2 | CRM (HubSpot / Pipedrive / Salesforce) | Client list, deal pipeline | __________ | ☐ | ☐ | API keys |
| 3 | Accounting (QuickBooks / Xero) | Financial records, bank connections | __________ | ☐ | ☐ | API keys, bank credentials |
| 4 | Payroll / HR (Gusto / Rippling) | SSNs, bank accounts, wages | __________ | ☐ | ☐ | API keys |
| 5 | Knowledge base (Notion / Confluence / ClickUp) | Internal docs, runbooks | __________ | ☐ | ☐ | Public page audit, API tokens |
| 6 | Communication (Slack / Teams) | Internal messages, files | __________ | ☐ | ☐ | OAuth apps, webhook URLs |
| 7 | File sharing / e-signature (Dropbox / DocuSign) | Signed contracts, client files | __________ | ☐ | ☐ | Share links, API keys |
| 8 | Payment processor (Stripe / Square) | Cardholder data, payout accounts | __________ | ☐ | ☐ | API keys, webhook secrets |
| 9 | Marketing (Mailchimp / ConvertKit) | Subscriber emails, campaign data | __________ | ☐ | ☐ | API keys, DKIM keys |
| 10 | Hosting (Vercel / Netlify / AWS) | Code, environment variables, customer metadata | __________ | ☐ | ☐ | All env vars, deploy tokens |

*Rows 11–40 cover industry-specific tools, AI tools, developer tools, monitoring, and the long tail. Included as fillable template with sample data for Florida legal, medical, and real-estate practices.*

**If the spreadsheet above takes you more than 30 minutes the first time, that is itself a finding.** It means there are vendors in your stack nobody has named, which is exactly how supply-chain incidents get missed.

---

## 2. Vendor-Breach Decision Tree (full — one page)

Run this the morning news breaks that a vendor had an incident. It takes 5 minutes if you've already filled out the inventory in Section 1.

```
START
  │
  ▼
Is the vendor anywhere in your stack? ───NO──► Save the headline. Done.
  │
  YES
  │
  ▼
Does the vendor hold client data
or process payments on your behalf? ──NO──► Rotate the API key anyway
  │                                         (10 min). Monitor their status
  YES                                       page for 48 hours. Done.
  │
  ▼
Has the vendor published a
formal incident disclosure? ──────NO──────► WAIT. Do not rotate yet.
  │                                         Wait for the disclosure to
  YES                                       confirm scope. Rotating on a
  │                                         rumor can break production
  │                                         AND mask the real event.
  ▼
Does the disclosure say                                              
"environment variables,                                              
API keys, or secrets                                                 
may have been accessed"? ────────NO───────► Rotate defensively only
  │                                         the secrets tied to this
  YES                                       vendor. Confirm via vendor-
  │                                         recommended rotation URL.
  ▼
FULL ROTATION PROCEDURE (Section 3 of the playbook)
  1. Rotate every API key / webhook secret / OAuth token tied to the vendor
  2. Redeploy dependent services with new secrets
  3. Invalidate all active sessions for admin accounts on the vendor
  4. Review vendor audit log (if accessible) for unexpected activity
     in the window before disclosure
  5. Send a client notification if client data may have been exposed
     (use template in Section 7)
  6. Document the incident in your own compliance log
```

**Threshold rule:** do not rotate secrets on a rumor. Rotation during active debugging can mask the vendor's real investigation. Rotate after the vendor formally confirms scope, OR after 24 hours without disclosure and unusual activity in your own logs.

---

## 3. Pre-written Breach-Contact Email to Vendor (full)

> **Subject:** [Your company name] — security contact regarding [Vendor]'s [date] incident
>
> Hello security team,
>
> We are a customer of [Vendor product name] (account email: [your admin email], plan: [Business / Pro / etc]). We understand you have disclosed a security incident as of [date / time].
>
> We are running our incident-response procedures on our side and would like to confirm:
>
> 1. Whether our account was in the affected subset.
> 2. What specific data, if any, was accessible to the threat actor.
> 3. The recommended rotation steps for API keys, OAuth tokens, webhook secrets, and environment variables we have configured with your product.
> 4. Your expected timeline for a full post-mortem.
>
> We have already taken the precautionary step of rotating all environment variables referenced in our [Vendor] integration. If you can confirm any additional steps are required, please respond to this email or our breach-contact address: [your breach-contact email].
>
> Thank you,
> [Your name]
> [Your title]
> [Your company]

Pre-written because at 2am, during an actual incident, you do not want to be composing this from scratch. Copy, paste, send.

---

## 4. The Monday-morning Hacker News routine (full — the 10-minute weekly habit)

This is the free version of a threat-intelligence subscription. It takes 10 minutes. It catches vendor incidents before your customers do.

**Every Monday at 8:15am (after email triage, before the first meeting):**

1. Open `news.ycombinator.com/news` — the current top page.
2. Skim the 30 titles. You are looking for three patterns:
   - A SaaS vendor name you recognize (especially Microsoft, Google, Stripe, Notion, Vercel, GitHub, AWS, Cloudflare, Atlassian)
   - Words like *breach*, *leak*, *disclosure*, *vulnerability*, *CVE*, *ransom*
   - Two stories in the same category — when two vendor-security stories trend at once, it is usually a sign of something upstream (a widely-exploited CVE, a campaign)
3. For each match, 30-second assessment:
   - Is this vendor in our inventory from Section 1? If yes — run the decision tree in Section 2.
   - Is this a CVE / vulnerability in software we self-host or run at the edge? If yes — check our patch status.
   - Otherwise — skip.
4. If nothing matched, close the tab. You are done.

Over a year this is about 9 hours. It will catch 1–3 vendor incidents that directly affect your business and it is the only "threat intelligence" small businesses consistently need to pay for or build.

---

## 5. Florida FIPA quick-reference (full)

Florida Information Protection Act of 2014, as amended 2026:

- **Notification timing.** Breach notifications to affected Florida residents must be issued **without unreasonable delay and no later than 30 days** after discovery of the breach. The 2026 amendments tightened this from 45 days.
- **Who to notify.** Every affected Florida resident whose personal information was, or is reasonably believed to have been, accessed by an unauthorized person. If the breach affects more than 500 residents, the Florida Department of Legal Affairs must also be notified **within 30 days**.
- **What counts as personal information.** Full name combined with Social Security number, driver's license number, financial account number, healthcare information, OR account credentials for online accounts. Most SaaS inventory-level breaches don't hit this bar on their own, but combined with any one of these fields, they do.
- **Safe harbor.** Encrypted data where the decryption key was not accessed is exempt from notification. Document your encryption posture now so you can rely on this later.
- **Sample breach-notification letter to affected residents:** included as a template in Section 7 of the full playbook.

This is a quick-reference, not legal advice. For incidents affecting 500+ residents or involving healthcare data, retain counsel before sending notifications.

---

## What's in the full playbook

The sections above are 3 of 14. The full PDF also covers:

- MFA enablement audit (12-item checklist per account)
- Environment-variable rotation runbook for Vercel / Netlify / AWS / Azure / GCP
- OAuth-grant review walkthrough for Microsoft 365 and Google Workspace
- Pre-written client notification email templates (3 variations: "vendor incident — your data not affected", "vendor incident — data may be affected", "confirmed breach — regulatory notification required")
- Post-incident debrief template for your quarterly compliance review
- One-page reference card to print and pin up in the office

Plus the fillable version of every worksheet above (PDF with form fields + editable Word document).

---

## Why this exists

The three most common things we see in our Sarasota and Bradenton MSP engagements when a vendor breach hits:

1. The owner doesn't have a list of every SaaS app, so they can't tell whether they are affected.
2. The vendor's recommended rotation steps are buried in a status page nobody was monitoring.
3. Florida's 30-day notification window starts ticking the moment the breach is *discovered*, and the owner doesn't realize they've started the clock.

This playbook closes all three gaps for $29, which is less than what one missed hour of client work costs you. And it's less than one percent of what you will spend on legal fees if you botch the notification timing.

---

**Ready to buy, or have a question?** The full playbook is available for $29 from the Simple IT SRQ store. Lifetime updates. 30-day refund. Or [reach out](https://simpleitsrq.com/#contact) if you want a quick call to walk through it.
