# Cyber-Insurance Questionnaire Answer Kit

**Preview — 12 of 40 questions, with model answers rated good / better / best.** Full kit includes all 40 questions, red-flag answers to avoid, and the evidence checklist.

---

## How to use the kit

Each question is presented with three model answers:
- **BEST** — demonstrates mature posture; tends to keep or reduce premium
- **BETTER** — acceptable; neutral premium impact
- **GOOD** — truthful baseline; acceptable but may signal room for improvement

We also flag **AVOID** answers — the phrasing that auditors and underwriters interpret as a red flag, sometimes triggering a policy decline.

Copy the answer closest to your reality, edit to match the truth (do not lie to your insurer — misrepresentation voids coverage), and paste into your renewal form.

---

## Sample questions

### Q1. Do you require multi-factor authentication (MFA) for all remote access, including email?

**BEST:** Yes. MFA is enforced for 100% of user accounts across email, VPN, cloud applications, and administrative portals. Phishing-resistant factors (FIDO2 security keys or Authenticator apps with number-matching) are required for all privileged accounts. SMS-based MFA is explicitly disabled organization-wide. Policy is enforced via Conditional Access rules that block any sign-in not meeting MFA requirements. Compliance is verified monthly via centralized report.

**BETTER:** Yes. MFA is required on all email, VPN, and cloud application accounts. Authenticator app or hardware token are the primary methods; SMS is available only for accounts that cannot use app-based MFA, documented case by case. All privileged accounts use phishing-resistant MFA.

**GOOD:** Yes. MFA is enabled for all user accounts on email and the primary business systems. Enforcement is verified quarterly.

**AVOID:** "MFA is available and strongly encouraged." / "MFA is enabled where possible." / "Most users have MFA enabled." Any of these phrasings triggers a follow-up and often a premium increase.

---

### Q2. Do you have endpoint detection and response (EDR) deployed on all company-owned devices?

**BEST:** Yes. EDR (vendor: ____________) is deployed on 100% of company-owned endpoints. Installation is automated via MDM; any device missing the agent for more than 24 hours triggers an automated alert to the Security Officer. Telemetry is reviewed by a 24/7 SOC (internal or MDR vendor: ____________). Mean time to investigate alerts is < 1 hour.

**BETTER:** Yes. EDR is deployed on all company-owned workstations and servers. Deployment is verified monthly. Alerts are triaged by the IT team during business hours; critical alerts generate after-hours notifications to the on-call contact.

**GOOD:** Yes. Business-grade endpoint security with behavioral detection is installed on all company-owned devices. Alerts are reviewed by internal IT.

**AVOID:** "Antivirus is installed on all PCs." / "Windows Defender is on by default." Traditional signature-based antivirus is not EDR; answering yes with antivirus in place is misrepresentation that can void claim payout.

---

### Q3. How often do you perform backups, and are backups stored offline or immutable?

**BEST:** Business-critical data is backed up hourly with daily snapshots retained for 30 days, weekly snapshots for 12 weeks, monthly snapshots for 24 months. Backups are written to cloud storage with immutability enabled (S3 Object Lock, Azure Immutable Blob, or equivalent). A documented restore test is performed quarterly; the last successful test was on ____________. At least one copy is geographically separated from the primary site.

**BETTER:** Critical data is backed up daily to cloud storage with version history retained for 90 days. Backups are monitored for completion; failures generate alerts. Restore tests are performed at least semi-annually.

**GOOD:** Full backups are performed nightly to cloud storage. Backups are verified weekly.

**AVOID:** "Users back up their own files to OneDrive." / "We have backups." Non-specific answers signal immaturity.

---

### Q4. Do you have a written Incident Response Plan? When was it last tested?

**BEST:** Yes. Our written IRP is version-controlled and reviewed annually. It defines roles, notification paths, regulatory reporting timelines, and a communication decision tree. We conduct a tabletop exercise at least annually; the most recent exercise was ____________ and the retrospective is on file. External counsel (____________) and a forensics partner (____________) are pre-identified and contacted as part of the plan.

**BETTER:** Yes. We have a documented IRP covering detection, containment, eradication, recovery, and notification. It was last reviewed ____________. We have pre-identified external counsel and a forensics partner.

**GOOD:** Yes. We have a written IRP that defines escalation procedures and key contacts.

**AVOID:** "We would respond quickly if anything happened." / "We have general security practices in place." No written plan is an automatic premium increase on most carriers.

---

### Q5. Do you regularly train employees on security awareness, including phishing?

**BEST:** Yes. All employees complete security awareness training on Day 1 and annually thereafter. We run a phishing simulation program (vendor: ____________) monthly; click-rate and report-rate are tracked per department. Current click rate is ____ % (industry avg: 4.8%). Employees who click receive same-day remedial training.

**BETTER:** Yes. Annual security awareness training is mandatory for all employees, tracked via learning management system. Phishing simulations are run at least quarterly.

**GOOD:** Yes. Employees complete annual security awareness training.

**AVOID:** "We send occasional security emails." / "Security is part of our onboarding." Without a documented program, this answer looks like no program exists.

---

### Q6. Do you maintain a current asset inventory?

**BEST:** Yes. A centralized asset inventory is maintained in ____________ covering all hardware, software, cloud services, and third-party access. The inventory is updated in real time via automated discovery; a quarterly reconciliation ensures accuracy. Every asset is tagged with owner, criticality, and data classification.

**BETTER:** Yes. We maintain an asset inventory spreadsheet updated at least quarterly that covers all company-owned devices and major SaaS services.

**GOOD:** Yes. We have a documented inventory of company devices and the primary business systems in use.

**AVOID:** "Our IT provider tracks this for us." — answer this with your own records or get them from your provider. Carriers want to see the insured's own record.

---

### Q7. Who has administrative / privileged access, and how is that access monitored?

**BEST:** We maintain a minimum-necessary privileged access model. As of ____________, we have __ privileged accounts (both human and service accounts), which is ___ % of total accounts. All privileged access requires phishing-resistant MFA. Privileged session activity is logged centrally and reviewed monthly. Privileged accounts use separate credentials from standard user accounts for the same person.

**BETTER:** Administrative access is limited to __ people (list roles). All privileged access requires MFA. Admin activity is logged.

**GOOD:** Administrative access is granted only to IT staff. MFA is required.

**AVOID:** "Managers have admin access to systems they are responsible for." Role-based admin sprawl is one of the most common reasons for claim-payment disputes.

---

### Q8. Have you had any material security incidents in the past 36 months?

**BEST/BETTER/GOOD:** [Truthfully disclose. For each, document: date, scope, affected data, response actions, root cause, remediation completed.]

**AVOID:** Do NOT omit minor incidents that were later investigated. Carriers routinely cross-check disclosures against public breach databases and regulatory filings. Undisclosed incidents = void policy.

---

### Q9. What is your password policy?

**BEST:** All accounts require passwords of ≥ 14 characters OR ≥ 8 characters with MFA (the NIST 800-63B recommendation). Passwords are checked against known-breach lists at creation and rotation. Users cannot reuse any of their last 12 passwords. Password managers are mandated and provided by the company (vendor: ____________).

**BETTER:** Passwords must be ≥ 12 characters. All accounts require MFA. A company-provided password manager is available.

**GOOD:** Our password policy requires complex passwords of at least 10 characters, rotated every 90 days.

**AVOID:** "We enforce 8-character passwords with mandatory 60-day rotation." Frequent rotation without MFA is a flagged anti-pattern in 2026.

---

### Q10. Do you segment your network to isolate critical systems?

**BEST:** Yes. Our network is segmented into ____ VLANs: corporate (users/workstations), server (production systems), guest (visitor Wi-Fi, fully isolated), IoT (printers, cameras, smart devices), and management (network infrastructure access only). Inter-VLAN traffic is filtered at the firewall with default-deny rules and documented exceptions. Guest and IoT networks have no route to the corporate or server VLANs.

**BETTER:** Yes. We segment guest Wi-Fi from the business network. Critical servers are isolated from end-user devices at the firewall layer.

**GOOD:** Yes. Guest Wi-Fi is on a separate network from our business systems.

**AVOID:** "We trust our network perimeter." Flat networks are one of the top three causes of ransomware impact amplification.

---

### Q11. What email security controls do you have in place beyond the platform default?

**BEST:** Our email platform (____________) has SPF, DKIM, and DMARC enforcement (DMARC policy: p=reject). External email banners are applied. Advanced anti-phishing (Microsoft Defender for Office 365 Plan 2 / Google Workspace Enterprise or equivalent) is licensed for all mailboxes. Suspicious-message reporting is integrated into the client (one-click report).

**BETTER:** SPF, DKIM, and DMARC are configured (DMARC policy: p=quarantine). External banners are enabled. The email platform's built-in phishing and malware filtering is active.

**GOOD:** Standard email security (SPF/DKIM) is configured. The platform's built-in spam and phishing filtering is enabled.

**AVOID:** Answers that suggest only the default platform filter. 2026 underwriters expect DMARC at minimum.

---

### Q12. How do you manage software patches and vulnerabilities?

**BEST:** Patches are applied via automated management (workstations: ____________, servers: ____________). Critical-severity patches are applied within 7 days of release; high within 14 days. Quarterly external vulnerability scans and annual internal penetration tests are performed by ____________. Findings are tracked to closure in our ticketing system.

**BETTER:** Workstations update automatically via Windows Update for Business (or equivalent). Servers are patched monthly during a scheduled maintenance window. Critical patches are applied out-of-band within 14 days.

**GOOD:** Operating systems and major applications are kept current. Updates are applied at least monthly.

**AVOID:** "Users are responsible for keeping their machines updated."

---

*End of preview. Full kit includes all 40 questions, evidence checklist, and the "red flag" answers to avoid for each question. Full kit is 38 pages.*

*Price: $99. Lifetime updates (re-released each year to match new carrier questions). 30-day refund.*
