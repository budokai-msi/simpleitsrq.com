# AI Acceptable Use Policy + Governance Kit

**Preview — executive summary, sample policy clauses, and the 2026 cyber-insurance question pack.** Full kit is 38 pages plus a pre-populated tool-inventory spreadsheet.

---

## Why your carrier started asking this in Q1 2026

Every one of the four biggest small-business cyber carriers (Chubb, Travelers, Beazley, Hiscox) added an AI-governance block to its 2026 renewal form. The questions vary but share a core:

- *Do you have a written AI Acceptable Use Policy?*
- *Does the policy cover generative AI tools (ChatGPT, Copilot, Claude, Gemini)?*
- *Is the policy signed by all employees annually?*
- *Have you inventoried every AI tool with access to company or client data?*
- *How do you log AI-assisted decisions that affect clients?*

Answering "no" or "informal" to any of those raises premiums — Coalition's Q1-2026 sample had a median bump of **14%** for accounts with no AI policy on file. Answering "yes, here it is" with an actual dated, signed document keeps you at baseline and sometimes improves the rate.

This kit gives you the document, the signatures, the inventory, and the audit trail.

---

## 1. AI Acceptable Use Policy (page 1 of 12, fillable)

> **[Company Name] AI Acceptable Use Policy**
>
> **Version:** 1.0
> **Effective date:** ____________
> **Next review date:** ____________ (quarterly)
> **Owner:** ____________, AI Governance Lead (may be same as Security Officer)
>
> **Scope:** This policy applies to every employee, contractor, and vendor of [Company Name] who uses any generative-AI tool — including large language models, text-to-image models, code-completion assistants, and voice-generation services — while performing work on behalf of [Company Name] or while logged into any [Company Name] system, device, or account.
>
> **Intent:** AI tools make your work faster. Used wrong, they also make the company liable for data leaks, client confidentiality breaches, and inaccurate advice given under our name. This policy defines which tools are approved, what data is never to be entered into them, and how we review mistakes.

---

## 2. Sample policy clause: data classification for AI prompts

The policy breaks every piece of information your staff might type into an AI tool into four tiers. Two of the tiers go into the full kit with the specific wording; here is Tier 1 as a sample.

> **Tier 1 — NEVER ENTER into any public or consumer-tier AI tool:**
>
> - Patient identifiers, diagnoses, or treatment notes (PHI under HIPAA)
> - Social Security Numbers, driver's-license numbers, passport numbers
> - Full payment-card numbers (PAN), card-verification values (CVV), or full bank account numbers
> - Client-matter specifics that are attorney-client privileged (names, case numbers, litigation strategy)
> - Source code containing hard-coded credentials, API keys, or proprietary algorithms
> - Tax returns, W-2s, 1099s, K-1s, financial statements under engagement letter
> - Minors' identifying information (names, addresses, school affiliations)
>
> **If you are unsure whether something is Tier 1, treat it as Tier 1.** The AI Governance Lead can re-classify it later if the tool is approved for that data class.

---

## 3. Pre-populated AI tool inventory (sample rows)

The full .xlsx/Sheets has 20+ rows. Three sample rows shown; the full kit covers M365 Copilot (consumer + Enterprise), ChatGPT (Free, Plus, Team, Enterprise, API), Claude (free, Pro, Team, API), Gemini (Workspace Starter, Standard, Enterprise, Business), Notion AI (Plus, Business, Enterprise), plus GitHub Copilot, Cursor, Perplexity, Replit Ghostwriter, Jasper, ElevenLabs, Suno, and RunwayML.

| Tool | Data region | Trains on your inputs? | Tier allowed up to | Approved? |
|------|-------------|-----------------------|--------------------|-----------|
| ChatGPT Free | US / shared | Yes (opt-out possible) | Tier 4 (public only) | ❌ |
| Microsoft 365 Copilot (E3) | US tenant region | No | Tier 1 (with BAA) | ✅ |
| Claude API (via Anthropic) | US / configurable | No | Tier 1 | ✅ |

---

## 4. Cyber-insurance questionnaire answer pack (sample)

The 14-question answer pack covers every AI-specific item we've seen on 2026 carrier forms. Three samples:

> **Q. Does your organization have a written AI Acceptable Use Policy?**
> **Model answer (rated BEST):** "Yes. Policy version [X.Y] was adopted on [DATE]. Reviewed quarterly by the AI Governance Lead. All employees sign at hire and annually. Current signature rate: 100% of [N] staff. Evidence available on request."
>
> **Q. Do you use generative-AI tools with access to client or patient data?**
> **Model answer (rated BEST):** "Yes, with controls. Approved tools are documented in our AI Tool Inventory. Only enterprise-tier instances with no-training agreements are used for Tier 1 or Tier 2 data. HIPAA-covered use is limited to [M365 Copilot Enterprise with BAA / Claude API with BAA]. Patient-identifying data is never entered into public-tier tools."
>
> **Q. How do you log AI-assisted decisions affecting clients?**
> **Model answer (rated BEST):** "Client-facing AI usage is logged through [system X] with a 12-month retention. The AI Governance Lead conducts a monthly sample review. Logs are included in the annual compliance package we provide at renewal."

The full pack includes 11 more questions plus red-flag answers to avoid (the ones that trigger a decline).

---

## 5. What's in the complete kit

- `ai-acceptable-use-policy.docx` — 12-page fillable policy
- `ai-tool-inventory.xlsx` + Google Sheets link — 20+ tools pre-populated
- `model-specific-guidance/` — 6 PDF one-pagers (Copilot, ChatGPT, Claude, Gemini, Notion AI, GitHub Copilot)
- `prohibited-use-enumeration.pdf` — 18 specific forbidden scenarios
- `prompt-logging-matrix.pdf` + CSV template
- `ai-incident-response-addendum.docx` — for prompt injection, data leak, hallucination incidents
- `insurance-questionnaire-answers.docx` — 14 pre-written answers
- `hipaa-ai-addendum.docx` — BAA + PHI rules
- `employee-training-one-pager.pdf` — sign annually
- `governance-review-calendar.ics` — quarterly reminders

**Lifetime updates.** Carriers will keep adding questions to this block — when they do, we update the kit and email existing buyers the new version. No resubscription.

**30-day refund, no questions.**
