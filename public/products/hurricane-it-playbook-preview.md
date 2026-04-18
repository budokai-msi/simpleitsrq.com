# Hurricane-Season IT Continuity Playbook

**Preview — June 1st checklist and 72-hour pre-landfall runbook.** Full playbook is 34 pages.

Written by the Simple IT SRQ team for Gulf Coast offices. Tested in the 2024 season across client offices in Sarasota, Bradenton, Venice, and Fort Myers.

---

## The premise

Every hurricane season between June 1st and November 30th, every Gulf Coast business has a non-zero chance of losing power, internet, phones, physical access to the office, or all four simultaneously, for somewhere between 6 hours and 3 weeks.

The businesses that stay in business after the storm are not the ones with heroic IT teams. They are the ones with a boring checklist that was already done on June 1st, and a 72-hour runbook that the office manager can execute without calling IT.

This playbook is those two documents.

---

## 1. June 1st pre-season checklist (full — 14 items)

Run through this list in the first week of June every year. It takes about 4 hours total and prevents 80% of storm-related IT chaos.

| # | Item | Responsible | Verified |
|:---:|---|---|:---:|
| 1 | Confirm off-site backup has successfully completed within the last 48 hours and the most recent restore test was within the last 90 days | IT / MSP | ☐ |
| 2 | Verify cyber-insurance policy is current and the claims hotline is saved in at least two phones on different carriers | Owner | ☐ |
| 3 | Photograph every office space, every server/equipment closet, every workstation configuration, and every piece of critical equipment with serial numbers visible; store photos in cloud storage accessible from personal devices | Office manager | ☐ |
| 4 | Export current asset inventory (workstations, servers, network gear, printers, POS, security cameras, phones) with make/model/serial/purchase date; save to cloud storage | IT / MSP | ☐ |
| 5 | Confirm all staff can access work email and essential SaaS from a personal device — test, don't assume | IT / MSP | ☐ |
| 6 | Verify MFA backup codes are printed and stored in a fire/water-resistant location; every staff member has either backup codes or a second device registered | Office manager | ☐ |
| 7 | Verify UPS batteries are ≤ 3 years old; replace any that are 3+ years (Florida heat shortens battery life) | IT / MSP | ☐ |
| 8 | Verify generator (if applicable) has been load-tested this calendar year; fuel supply is documented | Facilities | ☐ |
| 9 | Confirm main business phone number can forward to a cell phone (document the unlock code or portal URL for changing forwarding remotely) | Owner | ☐ |
| 10 | Update emergency contact list: every staff member, their emergency contact, their personal cell, and their expected evacuation destination | HR | ☐ |
| 11 | Confirm at least two staff members (not just the owner) have administrative access to Microsoft 365 / Google Workspace, the website host, and the main business bank account | Owner | ☐ |
| 12 | Document the landlord's emergency contact if you rent, and the procedure to re-enter the building after a storm closure | Owner | ☐ |
| 13 | Inventory client/patient communication channels: how will you reach customers if the office is closed? (Email blast? Text service? Social media? Phone tree?) | Marketing / Office manager | ☐ |
| 14 | Schedule a 30-minute all-staff review of this playbook; confirm everyone knows where the runbook lives | Owner | ☐ |

**If any of 1–6 are ☐ on June 1st, resolve them before June 15th. The rest can slip to early July at the latest.**

---

## 2. 72-hour pre-landfall runbook (full — 3 phases)

Executed when the National Hurricane Center issues a Hurricane Watch (typically 48 hours before expected landfall) or a Tropical Storm Warning for our area.

### Phase A — T-minus 72 hours (Hurricane Watch issued)

- Monitor NHC updates every 6 hours; subscribe to county emergency management SMS alerts
- Email all staff: confirm their status, their evacuation plan, and where they will be
- Pre-order critical supplies if you do not have them on-site: 3+ days of potable water, non-perishable food for staff who may shelter at the office, batteries, flashlights, tarps, fuel for generator
- Verify backup is still completing successfully; run a manual backup of anything critical that is not on the automated schedule
- Print the following and place in a waterproof envelope: employee contact list, client/patient emergency list, insurance policy claim numbers, bank account numbers, vendor contact list
- Announce to customers/clients: "We are watching Storm [Name]. Our office may close. Updates at [channel]."

### Phase B — T-minus 48 hours (Hurricane Warning issued)

- Office closure decision: stay open, close early, or close now. Document the decision and who made it.
- Enable auto-replies on all business email explaining the closure dates and the emergency contact method
- Forward main business phone number to a cell phone (the one that will be with the owner or designated person — NOT a landline)
- Disconnect and elevate: every workstation gets unplugged from power AND network. Anything on the floor moves up at least 3 feet. Servers, routers, firewalls, switches stay powered ON if a UPS is connected and the battery is fresh; otherwise shut down gracefully and elevate.
- Cover or move: anything valuable within line-of-sight of a window gets moved away from windows or covered with a plastic tarp
- Take the current-state photographs again: EVERY room, including server closet and records area. This is your insurance claim evidence if the building is damaged.
- Carry out: laptops, external drives with any PHI/PII, any paper records the business cannot function without, the printed emergency envelope

### Phase C — T-minus 24 hours through landfall

- Last person out: lock everything, take one more round of photos from the parking lot, note odometer reading and fuel gauge of any company vehicles
- Send final staff email: "Office closed. Next update Monday at 8am or sooner if conditions allow. For emergencies, call [number]."
- Update the website banner and Google Business Profile hours to reflect the closure
- From this point on, do not enter the building until (a) the storm has passed, (b) the county issues an all-clear, and (c) you have verified with landlord/facilities that the building has been inspected. Entering a damaged building violates most cyber-insurance policies and most commercial leases.

---

## 3. Post-storm recovery — Day 1 / Day 3 / Day 7 (excerpt)

> **Day 1 (first business day after the storm)**
>
> Do not enter the building if any of the following are present: standing water, visible structural damage, downed power lines within 100 feet, smell of gas, smell of smoke. If any of these are present, the building is not yours to enter — wait for the landlord, the fire department, or a licensed inspector to clear it.
>
> Once cleared, enter with at minimum: a charged phone, a flashlight (even in daylight — power is usually out), closed-toe shoes, and a second person. Do not be alone in a damaged building. Photograph everything before you move anything; "before" photos are what the insurance adjuster wants.
>
> **Priorities in order:**
> 1. Life safety — is the building safe to occupy?
> 2. Power safety — do NOT plug in anything until you have confirmed the circuit that serves it is dry and undamaged
> 3. Data safety — before powering up any server, check for water damage to the equipment
> 4. Connectivity — confirm internet is back before trying to do anything cloud-based
> 5. Communication — inform staff of status; inform clients of status; reset expectations

*(Full Day 1 / Day 3 / Day 7 checklists in the full playbook, each 2–4 pages.)*

---

## 4. Insurance claim photo checklist (excerpt)

What adjusters actually look for, drawn from the 23 post-storm claims we helped clients file in 2024:

- **Whole-building exterior** from all four sides, including roof if visible
- **Every room** wide-angle, then close-ups of any damage
- **Server closet / network closet** — wide then close, including the floor
- **Every workstation** — close enough to read the serial number sticker
- **Network equipment labels** — router, switch, firewall, access points, UPS units
- **Ceiling tile status** in every room (water intrusion often shows here first)
- **HVAC equipment**
- **Landlord-provided utilities** — electrical panel, water shutoff, phone demarc
- **External signage and vehicles**
- **Inventory** — anything with a UPC or serial number that is damaged goes in the claim

Store photos with the storm name and date in the filename, uploaded to a cloud service accessible from your phone. We recommend creating a shared folder BEFORE the storm so the upload target is ready.

---

*End of preview. Full playbook is 34 pages. Includes: post-storm recovery checklists (Day 1, 3, 7, 14, 30), staff/client communication templates, generator fuel-management plan, "six things that actually survived the last three storms" retrospective, plus a Florida-specific appendix on dealing with FEMA and the DEO small-business bridge loan program.*

*Price: $49. Lifetime updates (refreshed every May 15th). 30-day refund.*
