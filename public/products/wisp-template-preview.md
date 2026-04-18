# Written Information Security Program (WISP)

**Preview — Executive summary and sample control matrix.** Full template is 48 pages, fillable.

---

## Why carriers ask for a WISP

Every 2026 cyber-insurance renewal questionnaire now asks some form of: *"Provide your Written Information Security Program."* Answering "we don't have one" raises the premium an average of 24% (per the 2025 Coalition Cyber Report). Answering "here it is" with an actual document keeps you at the baseline rate and sometimes improves it.

The document does not need to be 200 pages. It needs to (a) exist, (b) match what you actually do, and (c) be dated within the last 12 months. This template gives you (a), helps you line up (b), and reminds you about (c).

---

## 1. Executive summary (page 1 of the template, fillable)

> **[Company Name] Written Information Security Program**
>
> **Version:** 1.0
> **Effective date:** ____________
> **Next review date:** ____________ (12 months from effective date)
> **Owner:** ____________, Security Officer
>
> This Written Information Security Program ("Program") documents the administrative, physical, and technical safeguards [Company Name] applies to protect non-public personal information, protected health information, customer financial data, and other sensitive information in our custody. This Program applies to all employees, contractors, and vendors of [Company Name] and to all data, systems, and facilities we own, rent, or otherwise control.
>
> **Scope of data covered:** ____________
>
> **Regulatory frameworks this Program is aligned to:** ☐ HIPAA  ☐ GLBA  ☐ Florida Information Protection Act  ☐ PCI DSS  ☐ SOC 2 (informal)  ☐ Other: __________
>
> **Approval:**
> __________________________ (CEO / Owner signature)
> __________________________ (Security Officer signature)

---

## 2. Risk assessment methodology (page 3 of the template)

The template walks you through the standard NIST-aligned risk assessment the way a compliance consultant would — without the $2,500 bill.

For each asset class, rate:
- **Likelihood** of compromise: Low / Medium / High
- **Impact** if compromised: Low / Medium / High
- **Inherent risk** = Likelihood × Impact
- **Controls in place:** list
- **Residual risk** after controls applied
- **Action:** Accept / Mitigate / Transfer / Avoid

The template includes the table below pre-filled with the 12 asset classes small businesses almost always have, so you can start by editing down rather than staring at a blank page.

| # | Asset class | Examples | Likelihood | Impact |
|---|---|---|---|---|
| 1 | Email + calendaring | Microsoft 365, Google Workspace | H | M |
| 2 | File storage | OneDrive, Google Drive, Dropbox | H | H |
| 3 | Business applications | CRM, practice management, accounting | M | H |
| 4 | Backup storage | Cloud backup, on-prem NAS | L | H |
| 5 | Endpoint devices | Laptops, desktops, tablets, phones | H | M |
| 6 | Network infrastructure | Router, switch, firewall, Wi-Fi APs | M | H |
| 7 | Physical facilities | Office, server closet, records room | L | H |
| 8 | Printed records | Paper files, faxed documents, printouts | L | M |
| 9 | Payment systems | POS, payment portals, bank accounts | M | H |
| 10 | Employee access | AD accounts, SSO identities, VPN credentials | M | H |
| 11 | Third-party vendor access | MSP, bookkeeper, legal, industry-specific SaaS | M | H |
| 12 | Customer-facing web | Website, booking forms, client portals | M | M |

---

## 3. Sample from the Administrative Control Matrix (page 7 of the template)

The template's control matrix has 48 rows total. Excerpt — Access Management subsection:

| Control ID | Control description | Implementation status | Evidence location | Last reviewed |
|:---:|---|:---:|---|:---:|
| AM-1 | Unique user ID for every workforce member with access to sensitive data | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-2 | Role-based access control with least-privilege default | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-3 | Access review performed at least quarterly | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-4 | Account provisioning tied to HR onboarding within 1 business day | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-5 | Account deprovisioning within 4 hours of termination | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-6 | MFA required on all accounts with access to sensitive data | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-7 | MFA enforced via phishing-resistant factor (FIDO2 key, Authenticator app) for admin roles | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |
| AM-8 | Shared account usage prohibited; documented exceptions logged | ☐ Implemented / ☐ Partial / ☐ Not implemented | | |

---

## 4. Incident response plan (page 18 of the template — excerpt)

The template's IR plan is structured as a playbook, not prose. Sample: the first 60 minutes.

> **Phase 1: Detection & Initial Response — first 60 minutes**
>
> **Trigger:** Any workforce member reports or observes: unusual account activity, ransomware screen, unauthorized physical access, lost/stolen device, suspicious email reported by multiple recipients.
>
> **Step 1 (minute 0–5):** Reporting workforce member contacts Security Officer (__________, phone __________) OR after-hours contact (__________, phone __________).
>
> **Step 2 (minute 5–15):** Security Officer makes the containment call:
>   - Suspected ransomware → immediately disconnect affected devices from network (do NOT power off)
>   - Suspected account compromise → force password reset + revoke all active sessions
>   - Suspected physical breach → secure the area, do not let non-response personnel enter
>
> **Step 3 (minute 15–30):** Open the incident log (template: section 19 of this Program). Assign an Incident ID. Record every action with timestamp. Every action.
>
> **Step 4 (minute 30–60):** Notify stakeholders per the notification matrix (section 20). For HIPAA-regulated data, the clock to report to OCR starts at the moment of discovery — not the moment of assessment — so document discovery time precisely.

---

## 5. Vendor risk management (page 28 — excerpt)

> **Third-party vendor inventory**
>
> [Company Name] maintains an inventory of every third party with access to sensitive data. For each vendor, we document:
> - Vendor name and primary contact
> - Data class accessed (PHI, PCI, PII, credentials, etc.)
> - Access type (read-only, read-write, administrative)
> - Contract expiration
> - Signed Business Associate Agreement or equivalent, if applicable
> - SOC 2 or equivalent attestation, if applicable
> - Last reviewed date
>
> **Annual review:** The full vendor list is reviewed annually. Vendors are re-scored on the risk matrix. Any vendor rated High residual risk requires written justification to remain in use.

Full template has a fillable vendor inventory spreadsheet pre-loaded with the 24 most common small-business vendors (Microsoft, Google, QuickBooks, Gusto, the major EHRs, etc.) and their standard attestation links so you can pre-populate most rows in under 20 minutes.

---

## 6. Annual review schedule (template appendix A)

| Month | Review item |
|:---:|---|
| Jan | Full WISP review; update version number; file with Security Officer |
| Apr | Risk assessment re-run |
| Jul | Access control review (all accounts, all vendors) |
| Oct | Incident response tabletop exercise (2 hours, documented) |

---

*End of preview. Full template is 48 pages, includes: Physical Safeguards section, full Technical Safeguards control matrix (96 controls), Data Classification policy, Acceptable Use Policy, Encryption Policy, Backup Policy, full Incident Response playbook, full Vendor Management section, Appendices A–F.*

*Price: $149. Lifetime updates. 30-day refund.*
