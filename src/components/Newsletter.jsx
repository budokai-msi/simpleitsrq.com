import { useState } from "react";
import { Mail, Check } from "lucide-react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!email) return;
    // Placeholder: hook up to ConvertKit / Buttondown / Resend audience later.
    setDone(true);
  };

  return (
    <aside className="newsletter" aria-labelledby="newsletter-title">
      <div className="newsletter-icon"><Mail size={24} /></div>
      <div className="newsletter-body">
        <h3 id="newsletter-title" className="newsletter-title">The Simple IT Brief</h3>
        <p className="newsletter-sub">
          One email a month. Plain-English security, AI, and cloud news for Sarasota and Bradenton business owners. No spam, unsubscribe with one click.
        </p>
        {done ? (
          <p className="newsletter-success"><Check size={16} color="#107C10" /> You're on the list.</p>
        ) : (
          <form className="newsletter-form" onSubmit={submit} noValidate>
            <input
              type="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="Email address"
            />
            <button type="submit" className="btn btn-primary">Subscribe</button>
          </form>
        )}
      </div>
    </aside>
  );
}
