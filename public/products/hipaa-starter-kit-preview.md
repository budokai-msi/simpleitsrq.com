# Florida Small-Business HIPAA Starter Kit

**Preview — Table of Contents and first section.** Full kit is 62 pages.

---

## What you get

1. **Administrative Safeguards Checklist** (9 required areas, checkbox-format with evidence columns)
2. **Physical Safeguards Checklist** (4 required areas + Florida hurricane provisions)
3. **Technical Safeguards Checklist** (5 required areas + MFA / encryption guidance specific to Microsoft 365 and Google Workspace tenants)
4. **Business Associate Agreement (BAA) Template** — signature-ready, vetted against the 2024 OCR guidance
5. **Written Risk Assessment Questionnaire** — 42 questions, same ones cyber-insurance carriers and OCR auditors ask
6. **Notice of Privacy Practices** — Florida-compliant, plain-English version
7. **Patient-facing Signage** — HIPAA rights, privacy practices, and sign-in sheet notice, all print-ready
8. **Password Policy + Acceptable Use Policy** — drop your practice name in the header, you're done
9. **Incident Response One-Pager** — the version you pin to the front-desk wall
10. **Annual Compliance Review Checklist** — what to repeat every 12 months, in order

---

## 1. Administrative Safeguards — quick overview

HIPAA Administrative Safeguards are the *people and process* controls. They are the part OCR auditors focus on first because they are cheapest to enforce and most revealing about whether the practice is actually compliant or just compliance-theater.

There are 9 Administrative Safeguard standards, each with *required* and *addressable* implementation specifications. In plain English:

| # | Safeguard | What you actually have to do |
|---|-----------|------------------------------|
| 1 | Security Management Process | Run a risk assessment, write a sanction policy, review audit logs |
| 2 | Assigned Security Responsibility | Name one human as the Security Officer, put it in writing |
| 3 | Workforce Security | Background-check anyone with PHI access, have offboarding procedures |
| 4 | Information Access Management | Least-privilege access — the receptionist does not get the billing database |
| 5 | Security Awareness and Training | Annual training, with attestation signatures on file |
| 6 | Security Incident Procedures | A written plan for "what we do when something happens" |
| 7 | Contingency Plan | Backup, disaster recovery, and emergency-mode operation plans |
| 8 | Evaluation | Periodic review of whether the above is actually working |
| 9 | Business Associate Contracts | A signed BAA on file for every vendor that touches PHI |

Most Florida dental and medical offices we audit are fine on safeguards 2 and 6 (they name someone and have *something* written), weak on 1, 3, 4, 7, and 8, and completely missing 5 and 9.

### Checklist — Administrative Safeguards

> **How to use:** For each item, fill in the Evidence column with either (a) a document name and location, or (b) the name of the person responsible. Leave no blanks. OCR auditors ask for the Evidence column first.

#### 1.1 Security Management Process

| Required | Item | Evidence |
|:---:|------|----------|
| ☐ | Current written Risk Assessment, reviewed within the last 12 months | |
| ☐ | Documented risk mitigation plan for every risk rated Medium or High | |
| ☐ | Sanction policy for workforce members who violate the policies | |
| ☐ | Audit log review procedure — who reviews, how often, what they look for | |
| ☐ | Last documented audit log review (date + reviewer) | |

#### 1.2 Assigned Security Responsibility

| Required | Item | Evidence |
|:---:|------|----------|
| ☐ | Named Security Officer (one individual, by name) | |
| ☐ | Written job description listing HIPAA responsibilities | |
| ☐ | Backup Security Officer named for when primary is unavailable | |

#### 1.3 Workforce Security

| Required | Item | Evidence |
|:---:|------|----------|
| ☐ | Written authorization and supervision procedures for workforce members with PHI access | |
| ☐ | Workforce clearance procedure (background checks, reference checks) | |
| ☐ | Termination procedure including same-day revocation of all access | |
| ☐ | Current list of every workforce member with PHI access, reviewed in the last 90 days | |

#### 1.4 Information Access Management

| Required | Item | Evidence |
|:---:|------|----------|
| ☐ | Written policy on role-based access (what roles exist, what PHI each role sees) | |
| ☐ | Access authorization procedure — how access is requested, approved, documented | |
| ☐ | Access modification procedure — how access is changed when roles change | |
| ☐ | Annual review of all active accounts against this policy | |

#### 1.5 Security Awareness and Training

| Required | Item | Evidence |
|:---:|------|----------|
| ☐ | Initial HIPAA training for every new hire, before they touch PHI | |
| ☐ | Annual refresher training for every existing workforce member | |
| ☐ | Training attestation signatures on file for every current workforce member | |
| ☐ | Security reminders — ongoing, at least quarterly (emails, posters, meetings) | |
| ☐ | Phishing simulation program, or documented reason why one is not used | |
| ☐ | Log-in monitoring policy — reviewing failed logins, flagging anomalies | |
| ☐ | Password management training — what strength, what rotation, what storage is approved | |

*(Continued — the rest of safeguards 1.6 through 1.9, plus the physical and technical safeguard checklists, the BAA template, and the risk assessment questionnaire are in the full kit.)*

---

## 2. Physical Safeguards — Florida special considerations

The standard HIPAA Physical Safeguards checklist covers facility access, workstation use, workstation security, and device/media controls. In Florida, we add four items that the generic template misses:

1. **Hurricane procedure for PHI-bearing devices** — where laptops, servers, and paper charts go when a storm is forecast, and who is responsible for moving them
2. **Flood-zone documentation** — your physical address's FEMA flood zone, and whether the server room is above the 100-year floodplain
3. **Humidity control evidence** — logs or monitor readings for the server room, because Florida moisture causes hardware failures that become PHI-availability incidents
4. **Vehicle storage rule** — explicit prohibition on leaving unencrypted laptops or paper PHI in vehicles (Florida heat destroys drives; parked cars are the #1 HIPAA loss cause in the state)

*(Full Physical Safeguards checklist continues for 7 more pages in the kit.)*

---

## 3. Technical Safeguards — Microsoft 365 and Google Workspace specifics

Most Florida practices run Microsoft 365 or Google Workspace. The kit includes step-by-step settings to flip in each platform to meet Technical Safeguard requirements:

- **Access Control §164.312(a)**: Which licensing tier you need (M365 Business Premium OR Google Workspace Business Plus minimum — the cheaper tiers do not meet audit control requirements)
- **Audit Controls §164.312(b)**: Which built-in logs satisfy audit requirements, and how long to retain them (6 years is the safe answer)
- **Integrity §164.312(c)**: How to configure OneDrive/Drive retention so deleted PHI is recoverable
- **Person or Entity Authentication §164.312(d)**: Exact MFA settings, including phishing-resistant options (FIDO2 keys, not SMS)
- **Transmission Security §164.312(e)**: TLS enforcement settings, S/MIME options, and when sending PHI by email is actually okay

*(Full Technical Safeguards section is 11 pages. Each required standard has a Microsoft 365 step-by-step AND a Google Workspace step-by-step.)*

---

## 4. Business Associate Agreement — preview

*(Full, 6-page, attorney-reviewed BAA template in the kit. Front page preview:)*

> **BUSINESS ASSOCIATE AGREEMENT**
>
> This Business Associate Agreement ("Agreement") is entered into as of **_________** ("Effective Date") between **__________________** ("Covered Entity") and **__________________** ("Business Associate"), each a "Party" and collectively the "Parties."
>
> WHEREAS, the Parties have entered or intend to enter into a service arrangement (the "Services") under which Business Associate may create, receive, maintain, or transmit Protected Health Information ("PHI") as defined at 45 C.F.R. § 160.103 on behalf of Covered Entity; and
>
> WHEREAS, the Parties intend to comply with the applicable provisions of the Health Insurance Portability and Accountability Act of 1996, as amended by the Health Information Technology for Economic and Clinical Health Act ("HITECH"), and the regulations promulgated thereunder (collectively, "HIPAA");
>
> NOW THEREFORE, in consideration of the mutual covenants and agreements contained herein and for other good and valuable consideration, the Parties hereby agree as follows:
>
> *(Continues through Sections 1 – 9: Definitions, Permitted Uses, Safeguards, Subcontractors, Access Rights, Breach Notification, Term and Termination, General Provisions, and Signature.)*

---

## 5. Risk Assessment Questionnaire — sample questions

*(Full questionnaire is 42 questions. A few representative ones:)*

> **Q4.** Where is Protected Health Information stored today? List every system (EHR, practice management, billing, backup drives, email, cloud storage, paper charts). For each: physical location, software name and version, number of records approximately, and person responsible.
>
> **Q11.** For each workforce member with access to PHI: what is their role, what level of access do they have, when was their access last reviewed, and are they current on annual HIPAA training?
>
> **Q19.** Does every device that stores PHI — including laptops, phones, tablets, and external drives — have full-disk encryption enabled? For each device, document the make, model, serial number, encryption method (BitLocker, FileVault, etc.), and encryption recovery key storage location.
>
> **Q27.** Describe your backup strategy. How many copies, on how many different media, how often, tested how often, stored where (including off-site copy)? When was the last successful restore test performed?
>
> **Q35.** Describe your incident response procedure. What happens in the first hour after a suspected breach? Who is called? What is documented? When is the Covered Entity formally notified?

---

*End of preview. This document is 62 pages in the full kit. Price: $79. Lifetime updates. 30-day refund, no questions asked.*

*Buy the full kit at [simpleitsrq.com/store](https://simpleitsrq.com/store) once activated, or join the waitlist there to be notified when it goes live.*
