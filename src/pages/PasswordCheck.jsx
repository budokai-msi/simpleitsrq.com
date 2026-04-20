import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, Lock, ArrowRight, Eye, EyeOff, Key } from "lucide-react";
import { useSEO, SITE_URL } from "../lib/seo";
import { resolveAffiliate } from "../data/affiliates";
import { trackAffiliateClick } from "../lib/trackClick";

// Resolve the amazon_search tokens once at module load so the render
// path stays simple + the affiliate tag is baked into the href.
const PW_1PASSWORD = resolveAffiliate("amazon_search:1password business password manager|1Password Business");
const PW_YUBIKEY = resolveAffiliate("amazon_search:yubikey 5c nfc hardware security key|YubiKey 5C NFC");

function AffiliateLink({ aff, children }) {
  if (!aff) return <strong>{children}</strong>;
  return (
    <a
      href={aff.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="affiliate-link"
      title={aff.blurb}
      onClick={() => trackAffiliateClick({
        slug: "password-check", destination: aff.href, label: aff.label, network: aff.vendor,
      })}
    >
      {children}
    </a>
  );
}

// Privacy-preserving breach check using Have I Been Pwned's k-anonymity
// endpoint (api.pwnedpasswords.com/range/{prefix}). The caller sends only
// the first 5 hex characters of the SHA-1 hash; the API returns every
// suffix that has that prefix. The match happens entirely in the browser.
// This is the same technique Firefox Monitor, 1Password Watchtower, and
// Bitwarden use. The password never leaves this tab.
async function sha1Hex(text) {
  const enc = new TextEncoder();
  const bytes = await crypto.subtle.digest("SHA-1", enc.encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function checkBreach(password) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`HIBP returned ${res.status}`);
  const text = await res.text();
  for (const line of text.split("\n")) {
    const [candidate, countRaw] = line.trim().split(":");
    if (candidate === suffix) {
      return { pwned: true, count: parseInt(countRaw, 10) || 0 };
    }
  }
  return { pwned: false, count: 0 };
}

export default function PasswordCheck() {
  const [password, setPassword] = useState("");
  const [state, setState] = useState("idle"); // idle | checking | safe | pwned | error
  const [count, setCount] = useState(0);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useSEO({
    title: "Is your password breached? — Simple IT SRQ free security tool",
    description: "Free, privacy-preserving check against 800+ million known breached passwords. Your password never leaves your browser — we use the same k-anonymity technique 1Password Watchtower uses. Built by Simple IT SRQ for Sarasota small businesses.",
    canonical: `${SITE_URL}/password-check`,
    image: `${SITE_URL}/og-image.png`,
    breadcrumbs: [
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Password Check", url: `${SITE_URL}/password-check` },
    ],
  });

  const onCheck = async (e) => {
    e.preventDefault();
    if (!password) return;
    setState("checking");
    setError(null);
    try {
      const result = await checkBreach(password);
      setCount(result.count);
      setState(result.pwned ? "pwned" : "safe");
    } catch (err) {
      setError(String(err?.message || err));
      setState("error");
    }
  };

  const reset = () => {
    setPassword("");
    setState("idle");
    setCount(0);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <main id="main" className="password-check">
      <section className="section hero hero-clean">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-stack-clean">
          <div className="hero-copy hero-copy-centered">
            <span className="eyebrow"><ShieldCheck size={14} /> Free tool · No signup · No tracking</span>
            <h1 className="display">Is your password <span className="brand-accent">in a breach?</span></h1>
            <p className="lede">
              Paste a password below. We'll check it against 800+ million known-breached passwords in under a second. <strong>Your password never leaves this browser</strong> — we use the same privacy-preserving k-anonymity technique 1Password Watchtower and Firefox Monitor use.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 680 }}>
          <form className="pw-check-form" onSubmit={onCheck}>
            <label htmlFor="pw-input" className="pw-check-label">
              Password to check
            </label>
            <div className="pw-check-input-row">
              <input
                id="pw-input"
                ref={inputRef}
                type={show ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (state !== "idle") setState("idle"); }}
                placeholder="Type or paste — this never leaves your browser"
                className="pw-check-input"
                disabled={state === "checking"}
              />
              <button
                type="button"
                className="pw-check-toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg pw-check-submit"
              disabled={!password || state === "checking"}
            >
              {state === "checking" ? "Checking 800M+ leaked passwords…" : "Check it"}
            </button>
            <p className="pw-check-privacy">
              <Lock size={13} />
              Your password is SHA-1 hashed locally. Only the first 5 characters of the hash ever leave your browser. We never see your password, your email, or your IP in the same request. <a href="https://haveibeenpwned.com/API/v3#PwnedPasswords" target="_blank" rel="noopener noreferrer">How this works</a>.
            </p>
          </form>

          {state === "safe" && (
            <div className="pw-result pw-result-safe" role="status" aria-live="polite">
              <ShieldCheck size={48} />
              <h2>Not found in any known breach.</h2>
              <p>
                That password isn't in any of the 800M+ leaked credentials that Have I Been Pwned has indexed. That's a good sign — but it's not a <em>guarantee</em> the password is strong. A short, guessable password can be safe from dumps and still trivial for a brute-force attacker.
              </p>
              <div className="pw-result-next">
                <h3>Three things that matter more than this check passing</h3>
                <ol>
                  <li><strong>Length over complexity.</strong> A 16-character passphrase beats "P@ssw0rd!" every time.</li>
                  <li><strong>Unique per service.</strong> A strong password reused across 10 sites is one breach away from useless.</li>
                  <li><strong>Two-factor on every admin account.</strong> Hardware keys shut down an entire class of phishing attacks.</li>
                </ol>
              </div>
              <button onClick={reset} className="btn btn-secondary">Check another</button>
            </div>
          )}

          {state === "pwned" && (
            <div className="pw-result pw-result-pwned" role="status" aria-live="polite">
              <AlertTriangle size={48} />
              <h2>Found in {count.toLocaleString()} known breaches.</h2>
              <p>
                That exact password appears in public breach dumps {count.toLocaleString()} time{count === 1 ? "" : "s"}. Attackers' credential-stuffing tools try these first, on every login form, every day. <strong>Change it immediately on every site that uses it.</strong>
              </p>
              <div className="pw-result-next">
                <h3>Do this in the next 15 minutes</h3>
                <ol>
                  <li><strong>Change it on your email account first.</strong> Email is the reset-path for everything else.</li>
                  <li><strong>Change it everywhere else you used it.</strong> Banking, M365/Google Workspace, any SaaS admin account.</li>
                  <li><strong>Turn on multi-factor auth.</strong> Even a compromised password fails when MFA is on.</li>
                  <li><strong>Get a password manager so you never reuse one again.</strong> This is the single most valuable security change most businesses make in a year.</li>
                </ol>
              </div>
              <button onClick={reset} className="btn btn-secondary">Check another</button>
            </div>
          )}

          {state === "error" && (
            <div className="pw-result pw-result-error" role="alert">
              <AlertTriangle size={48} />
              <h2>Couldn't reach the breach database.</h2>
              <p>Try again in a moment. The check is free and unlimited — we just hit a network hiccup. Error: <code>{error}</code></p>
              <button onClick={reset} className="btn btn-secondary">Retry</button>
            </div>
          )}
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What to do next</span>
            <h2 className="title-1">The 20-minute password hygiene upgrade for your whole business</h2>
            <p className="section-sub">
              Every Sarasota and Bradenton small office we support started somewhere. Here's the shortest path from "we share a password on a sticky note" to "we pass a cyber-insurance audit."
            </p>
          </div>
          <div className="solution-grid">
            <article className="solution-card">
              <div className="solution-card-head">
                <span className="solution-card-icon"><Key size={18} /></span>
                <h3 className="solution-card-title">1. Get a password manager for the whole team</h3>
              </div>
              <p className="solution-card-desc">
                One login per staff member. Shared vaults with audit trails. Auto-generated unique passwords on every site. <AffiliateLink aff={PW_1PASSWORD}>1Password Business</AffiliateLink> or Bitwarden with seat-based pricing are both fine — the point is every person has their own login and the admin can revoke access the day someone leaves. Cost: ~$8/user/mo. Payback: a single avoided credential-stuffing incident.
              </p>
            </article>
            <article className="solution-card">
              <div className="solution-card-head">
                <span className="solution-card-icon"><ShieldCheck size={18} /></span>
                <h3 className="solution-card-title">2. Hardware security keys for admin accounts</h3>
              </div>
              <p className="solution-card-desc">
                A <AffiliateLink aff={PW_YUBIKEY}>YubiKey 5C NFC</AffiliateLink> at each admin desk, ~$55 each. Closes the phishing path that software-token MFA doesn't. If you have an owner account, a bookkeeper account, and an M365 admin account on your network — those three seats are where an attacker wants to land. Keys make that impossible.
              </p>
            </article>
            <article className="solution-card">
              <div className="solution-card-head">
                <span className="solution-card-icon"><Lock size={18} /></span>
                <h3 className="solution-card-title">3. Train your staff on what to click</h3>
              </div>
              <p className="solution-card-desc">
                The strongest password in the world still gets phished if your front desk clicks the wrong email. Our <Link to="/security-academy">Security Academy</Link> is a fully-managed training program — monthly 5-minute modules, quarterly phishing simulations, annual compliance report. Starts at $12/user/mo.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-cta">
        <div className="container">
          <div className="cta-card">
            <h2>Running a Florida small business? We put all this in one playbook.</h2>
            <p>
              Our <Link to="/store/saas-incident-response-playbook" style={{ color: "#fff", textDecoration: "underline" }}>SaaS Incident Response Playbook</Link> ($29) is the 14-page printable version of everything above, plus a vendor-breach decision tree, pre-written client notification emails, and the Florida FIPA 30-day quick reference. Designed so your office manager can run the audit once a quarter.
            </p>
            <Link to="/store" className="btn btn-primary btn-lg">
              See the full store <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
