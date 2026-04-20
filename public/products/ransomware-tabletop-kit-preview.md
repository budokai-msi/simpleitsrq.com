# Ransomware Tabletop Exercise Kit

**Preview — the list of 5 scenarios, the facilitator structure, and the first 30 minutes of Scenario 1 (Healthcare).** Full kit includes all five scenarios, printable role cards, scoring rubrics, and the evidence package for your insurance file.

---

## Why this exists

Most cyber-insurance policies written in 2026 now require an annual tabletop exercise documented in writing. A professional facilitator charges $2,500–4,500 for a single 2-hour session. This kit lets an office manager or owner run the same exercise in a conference room for $49.

It's also the only way most small-business staff will ever think through "the computer isn't working" as a scenario before it happens.

---

## The 5 scenarios

1. **Healthcare — Orthodontic office (preview below).** Encrypted EHR server at 7:12am. Appointments starting at 8:00. HIPAA clock ticking.
2. **Legal — 14-person law firm.** Client matter files encrypted. Opposing counsel files a motion the same morning.
3. **Real estate — Brokerage with 22 agents.** Transaction database hit the day before a 40-property closing.
4. **Retail — Single-location boutique.** POS + card-processing encrypted. Rush of weekend sales starting in 2 hours.
5. **Professional services — CPA firm mid-April.** Tax-prep workstations encrypted during peak season.

Each scenario is designed to run 90 minutes including debrief.

---

## Facilitator structure (every scenario)

- **Minute 0–5:** Set the scene. Hand out role cards. Start the clock.
- **Minute 5–20:** First-hour decisions. Injections delivered every 3–5 minutes.
- **Minute 20–45:** Second-hour decisions. Pressure increases (clients calling, staff stressed, ransom note arrives).
- **Minute 45–60:** Third-hour decisions. Recovery vs. ransom vs. rebuild.
- **Minute 60–75:** Debrief — what did you catch, what did you miss, what's the 30-day action list?
- **Minute 75–90:** Sign-off + evidence-package preparation.

---

## Scenario 1 preview: "7:12am at the Orthodontic Office" (first 30 min)

### Setup (handed to all participants)

> Your 8-chair orthodontic office opens at 8:00am. You have:
>
> - 4 clinical workstations (chairside)
> - 1 front-desk workstation (scheduling, billing)
> - 1 server in the office closet (EHR, X-ray imaging, schedule database)
> - 1 backup NAS in the closet
> - A Dropbox Business account for shared files
> - Google Workspace for email
>
> It is **7:12am, a Monday.** The front-desk coordinator arrives early. She starts the main workstation. A red window fills the screen: *"Your files have been encrypted. Pay 3.5 BTC within 48 hours or your data is destroyed."* She runs to the owner's office. The owner arrives in 7 minutes.

### Role cards (hand out one per participant)

- **Owner / Head Dentist:** Your liability, your decision. You have patients arriving in 43 minutes.
- **Office Manager:** You know the office operations but not the technology. You have the cyber-insurance policy contact info in your desk.
- **Front-Desk Coordinator:** You know the schedule system. You don't know how to restore from backup.
- **Clinical Lead:** You run chairside operations. You'll need the X-ray imaging for the first three appointments.
- **IT Contact (MSP representative):** You're on speakerphone. You can give advice but you're 40 minutes away.

### Minute 0–5: Injection Card 1 — delivered by facilitator

> **7:19am.** The first patient arrives 11 minutes early. Greet them? Send them home? Stall?
>
> Decision clock: 90 seconds.

The facilitator's guide lists the scoring rubric for this decision:

**Good response:** Greet patient, apologize for a "technical issue," ask them to wait 15 minutes in the lobby. Does not reveal a breach or ransom. Begins calling other morning patients to assess reschedule capacity.

**Bad response:** Turns patient away with "we got hacked" — breach disclosure before investigation, creates public liability exposure. Or seats the patient without addressing the system issue, locking the office into appointments it may not be able to deliver.

### Minute 5–10: Injection Card 2

> **7:24am.** Owner arrives. IT Contact on phone. First question from IT: "Is the ransomware only on the front-desk computer or did it spread to the server?"
>
> Decision clock: 5 minutes.

Facilitator prompts:
- Does anyone unplug the front-desk workstation from the network to contain spread? (should)
- Does anyone check the server manually? (should — but NOT by RDP'ing into it from an infected network)
- Does anyone open the backup NAS to verify its integrity? (tricky — if connected, it may be compromised too)

### Minute 10–30: Injection Cards 3 + 4

> **7:34am.** Second patient arrives. First one is still in the lobby.
>
> **7:38am.** Clinical Lead reports: the chairside workstations can't connect to the server. No imaging is available.
>
> **7:42am.** Ransom note updated: the "48-hour window" is actually 24 hours. A new Bitcoin address is provided. Also: a sample of a patient file has been posted to a leak site as proof of access.

**This is the moment that changes everything.** A data-exfiltration ransomware (not just encryption) now triggers the Florida Information Protection Act 30-day breach-notification clock. The owner has new obligations they didn't have 10 minutes ago.

Facilitator scoring rubric at this point:
- Does the team recognize the notification clock has started? (should — HIPAA Breach Notification Rule + FIPA both apply)
- Does anyone call the cyber-insurance carrier? (should — the policy likely requires notification within 72 hours to retain coverage)
- Does anyone start the outage communication to patients already on the schedule? (should — 90-minute rolling schedule)

---

## What's in the full kit

- All 5 scenarios, fully scripted
- Facilitator guide with timing cues
- Printable role cards (12 per scenario, so 2-12 person teams all covered)
- Scoring rubric (what a good/bad response looks like at each decision point)
- Post-exercise action template
- Evidence package (dated sign-in sheet + summary) — ready to drop into the Cyber-Insurance Evidence Binder
- Announcement email templates
- Debrief meeting structure

---

Available now for $49. Lifetime updates — we refresh scenarios when a major real-world incident changes what "good response" looks like. The Vercel + Notion incidents this week are the source material for Scenario 6, which we'll ship to existing buyers in the next month.

[Buy it →](/store/ransomware-tabletop-kit)
