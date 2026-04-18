# Employee Onboarding + Offboarding IT Runbook

**Preview — Day-0 new hire checklist and involuntary-termination 90-minute runbook.** Full runbook is 22 pages.

Written for offices between 10 and 80 people where the office manager, not IT, runs the list.

---

## 1. Day-0 new hire IT checklist (full — 22 items)

> **Hire:** __________________________
> **Start date:** __________
> **Role:** __________________________
> **Reporting to:** __________________________
> **Office location:** __________________________

### Before Day-0 (ideally 3 business days prior)

| # | Item | Owner | Completed |
|:---:|---|---|:---:|
| 1 | Employment paperwork signed (offer letter, W-4, I-9, handbook acknowledgment, acceptable-use policy, confidentiality agreement) | HR | ☐ |
| 2 | Role template selected: which SaaS seats, which AD group, which physical access level? | Manager | ☐ |
| 3 | Hardware ordered or pulled from inventory: laptop, docking station, monitors, headset, phone if applicable | IT / Office manager | ☐ |
| 4 | Laptop provisioned: OS up to date, EDR installed and reporting, drive encrypted, company-managed via MDM | IT / MSP | ☐ |
| 5 | Microsoft 365 / Google Workspace account created, licensed, in the right distribution groups | IT / MSP | ☐ |
| 6 | Email signature template populated and set as default | IT / Office manager | ☐ |
| 7 | Calendar access configured (shared calendars, booking link if customer-facing, team calendar invite) | Manager | ☐ |
| 8 | SaaS seats added: list every app the role needs, create or invite the user in each | IT / MSP + Office manager | ☐ |

### Day-0 (first morning)

| # | Item | Owner | Completed |
|:---:|---|---|:---:|
| 9 | Physical office tour (desk, bathroom, break room, emergency exits, fire extinguisher, AED if present) | Office manager | ☐ |
| 10 | Physical access: key, fob, or keypad code issued; access logged in the access inventory | Office manager | ☐ |
| 11 | Parking and transit instructions | Office manager | ☐ |
| 12 | Laptop unboxed with the hire, first login walk-through, MFA setup during the walk-through (not after) | IT / Office manager | ☐ |
| 13 | Password manager account created and first login completed; at least 3 core SaaS credentials saved during the session | IT / Office manager | ☐ |
| 14 | Security awareness training module assigned (must be completed before end of week 1) | HR / IT | ☐ |
| 15 | Phishing-test baseline sent (measure click rate before training kicks in) | IT | ☐ |

### Day-0 (first afternoon)

| # | Item | Owner | Completed |
|:---:|---|---|:---:|
| 16 | Team introductions (in person or video) | Manager | ☐ |
| 17 | First project / task assigned; expectations clear for end of week 1 | Manager | ☐ |
| 18 | Payroll confirmed: direct deposit info submitted, first paycheck date communicated | HR | ☐ |
| 19 | Benefits enrollment window open; deadline communicated; contact person for questions identified | HR | ☐ |
| 20 | Expense reimbursement process walked through, including expense app login | Office manager | ☐ |
| 21 | Emergency contact form completed | HR | ☐ |
| 22 | 30-day check-in scheduled with manager | Manager | ☐ |

**Rule:** Items 4, 12, and 13 are the three most commonly skipped steps. They are also the three most commonly cited as root causes in incidents. Do not skip them.

---

## 2. Involuntary-termination runbook (full — 90-minute version)

Run this when an employee is being terminated for cause or when the termination requires same-day access revocation (security concern, conflict, legal). This is the single riskiest IT process a small business runs. Every minute of delay between the conversation and full access revocation is a window for malicious action.

### T-minus 15 minutes (before the conversation)

The person taking these actions should be IT / MSP and NOT in the conversation:

1. On a pre-arranged signal from HR (text message to agreed code word), begin at T-zero.
2. Have ready: employee's full email address, AD username, phone number, list of their SaaS access, list of their physical access items.

### T-zero through T+15 minutes (during the conversation)

The conversation typically runs 15–30 minutes. Access is revoked during the conversation, not after.

| # | Action | System | Target time |
|:---:|---|---|:---:|
| 1 | Disable Microsoft 365 / Google Workspace account (do NOT delete — preserves data) | Identity | T+1 min |
| 2 | Force sign-out on all devices / revoke all active tokens | Identity | T+2 min |
| 3 | Change or rotate any shared service accounts the employee knew the password to | Password manager / docs | T+5 min |
| 4 | Remove from all SaaS products — inventory the full list first, then work through it | Each SaaS | T+5 to T+15 min |
| 5 | Remove from any API keys, cloud console access, version control repositories | Cloud / GitHub / etc. | T+10 min |
| 6 | Disable VPN access | Firewall / VPN | T+5 min |
| 7 | Disable badge / key card / keypad code | Physical access system | T+10 min |
| 8 | Forward email to manager; set autoresponder explaining transition contact | Email | T+15 min |

### T+15 through T+30 minutes (conversation concludes)

1. Employee is escorted out or given supervised time to collect personal items
2. Company hardware is collected: laptop, phone, keys, fob, any external drives, any printouts of confidential information
3. Each returned item is logged with serial number and condition

### T+30 through T+90 minutes

| # | Action | Owner |
|:---:|---|---|
| 1 | Take forensic image or secure the returned laptop before re-imaging | IT / MSP |
| 2 | Review recent email, file access, and SaaS activity for the 30 days prior to termination for any indicators of data exfiltration | IT / MSP + Security Officer |
| 3 | Inform remaining team members according to the communication plan HR prepared | Manager |
| 4 | Update the vendor inventory: which external vendors knew this person and need to be informed they are no longer authorized? | Office manager |
| 5 | Document the entire event with timestamps | HR + IT |

**Critical:** The forensic image (step 1) is what protects the company in every subsequent employment-related legal action. Skipping it to save 20 minutes and $100 of storage is the second-most-common regret in involuntary-termination retrospectives.

---

## 3. Planned-departure 5-day version (excerpt)

For friendly departures (resignation with notice, retirement, internal transfer), run the sequence over 5 business days instead of 90 minutes. Excerpt — Day 1 and Day 5:

> **Day 1 (first day after notice given)**
> - Acknowledge the departure in writing, with end date, final paycheck date, and transition expectations
> - Begin knowledge-transfer documentation: the outgoing person writes a one-page brief on anything only they know
> - Identify the destination for each of their projects, ongoing tasks, and customer relationships
> - Schedule the transition meetings (typically 3–5 sessions with different teammates)
> - No access is revoked today. Trust is preserved during the transition window unless the relationship deteriorates.

> **Day 5 (final day)**
> - Final working session: confirm knowledge transfer is complete, shared drives are cleaned up
> - Exit interview conducted by HR
> - Physical access returned at end of day
> - Company hardware returned at end of day
> - All logical access disabled at end of day (account disabled, not deleted, for data-retention purposes)
> - Thank-you note from the team

---

## 4. SaaS seat inventory template (excerpt)

The full template includes a spreadsheet with 41 rows pre-populated for common SaaS apps. Excerpt:

| App | Seat cost/mo | Admin contact | Active users | Last reviewed | Notes |
|---|:---:|---|:---:|:---:|---|
| Microsoft 365 Business Premium | $22.00 | | | | |
| Google Workspace Business Plus | $18.00 | | | | |
| Gusto (payroll) | var | | | | |
| QuickBooks Online | var | | | | |
| Slack (if used) | $7.25 | | | | |
| Your industry SaaS | | | | | |

Run a seat review every 90 days. On the first review after implementing this runbook, most small offices discover they are paying for 15–30% more seats than they actually use.

---

*End of preview. Full runbook is 22 pages. Includes the complete involuntary-termination runbook with legal-review notes, the full planned-departure 5-day plan, the SaaS seat inventory template with 41 rows pre-populated, the hardware return log, a communication template library (internal and external), and a 90-day post-departure audit checklist.*

*Price: $39. Lifetime updates. 30-day refund.*
