import { Link } from "../lib/Link";
import { Check, X, ArrowRight, ShieldCheck, MapPin, Wrench, Wifi } from "lucide-react";
import { services } from "../data/services";
import PricingSection from "../components/PricingSection";
import Breadcrumbs from "../components/Breadcrumbs";
import { useSEO } from "../lib/seo";
import { trackEvent } from "../lib/analytics";

function ServiceCard({ svc }) {
  return (
    <article id={svc.slug} className="svc-card reveal-up">
      <header className="svc-card-head">
        <div className="svc-card-meta"><span className={`svc-audience svc-audience-${svc.audience.toLowerCase()}`}>{svc.audience}</span><span className="svc-duration">{svc.duration}</span></div>
        <h2 className="svc-card-title">{svc.title}</h2>
        <p className="svc-card-tagline">{svc.tagline}</p>
      </header>
      {svc.price > 0 ? <div className="svc-price-block"><span className="svc-price">{svc.priceFrom ? <span className="svc-price-from">from </span> : null}${svc.price.toLocaleString()}</span><p className="svc-price-note">{svc.priceNote}</p></div> : <div className="svc-price-block"><span className="svc-price">Assessment first</span><p className="svc-price-note">{svc.priceNote}</p></div>}
      <div className="svc-includes"><h3>What we can help with</h3><ul>{svc.contents.map((c)=><li key={c}><Check size={14} color="var(--success)"/><span>{c}</span></li>)}</ul></div>
      {svc.notInScope?.length ? <details className="svc-not-included"><summary>What is outside this service</summary><ul>{svc.notInScope.map((n)=><li key={n}><X size={14}/><span>{n}</span></li>)}</ul></details> : null}
      {svc.bookingNote ? <p className="svc-booking-note"><ShieldCheck size={14}/>{svc.bookingNote}</p> : null}
      <div className="svc-cta"><Link to={svc.buyLink || (svc.slug === "managed-it" ? "/book?topic=managed-it" : "/book?topic=computer-repair")} className="btn btn-primary svc-buy-btn" onClick={()=>trackEvent("generate_lead",{source:"services",service_slug:svc.slug})}>Tell us what you need <ArrowRight size={16}/></Link></div>
    </article>
  );
}

const FAQ = [
  { q:"What kinds of computer problems do you work on?", a:"We diagnose common PC and workstation problems including storage, memory, Windows, performance, power, thermal, and peripheral issues. We do not advertise board-level microsoldering or promise recovery from physically failed storage." },
  { q:"Where do you provide business IT support?", a:"Our core service area is Sarasota and Bradenton, with nearby Lakewood Ranch businesses handled when practical." },
  { q:"Can I contact you if I am not sure which service I need?", a:"Yes. Describe what is happening and how it affects you or the business. We can usually tell whether it belongs under repair, a one-time IT project, or ongoing managed support." },
];

export default function Services(){
  useSEO({title:"Computer Repair & Business IT Support | Sarasota & Bradenton",description:"Computer repair, hardware diagnostics, network troubleshooting, Microsoft 365 help and ongoing business IT support in Sarasota and Bradenton.",canonical:"https://simpleitsrq.com/services",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"},{name:"Services",url:"https://simpleitsrq.com/services"}],faqs:FAQ});
  return <main id="main" className="services-main">
    <section className="section services-hero"><div className="container"><Breadcrumbs items={[{ name: "Services", url: "/services" }]} /><span className="eyebrow">Computer repair & business IT</span><h1 className="display">Repair when something fails. Ongoing IT support when the business needs it.</h1><p className="lede">You do not need to know the technical cause before calling. Tell us what is not working, what changed, and what the problem is costing you in time or disruption. We will help narrow down the right kind of work.</p><div className="services-trust-row"><span><MapPin size={14}/> Sarasota / Bradenton area</span><span><Wrench size={14}/> We come to you - on-site and mobile service</span><span><ShieldCheck size={14}/> Scope and next steps explained before the work grows</span></div></div></section>
    <section className="section section-alt" id="services-catalog"><div className="container"><div className="section-head"><span className="eyebrow">Choose the kind of help you need</span><h2 className="title-1">One-time repair or ongoing business IT.</h2><p className="section-sub">Start with the service that sounds closest to your situation. We can redirect the request if the problem belongs somewhere else.</p></div><div className="services-grid">{services.map((svc)=><ServiceCard key={svc.slug} svc={svc}/>)}</div></div></section>
    <PricingSection />
    <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">A simple distinction</span><h2 className="title-1">Fix the machine, or take responsibility for the environment.</h2><p className="section-sub">Repair is about a specific failure. Managed IT is for businesses that want someone to stay involved with the users, devices, network, Microsoft 365, vendors, and recurring problems.</p></div><div className="solution-grid"><div className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Wrench size={18}/></span><h3 className="solution-card-title">Computer repair</h3></div><p className="solution-card-desc">Diagnose the problem, repair or upgrade what makes sense, and give you a clear answer when replacement is the better choice.</p></div><div className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Wifi size={18}/></span><h3 className="solution-card-title">Business IT support</h3></div><p className="solution-card-desc">Keep the computers, users, network, Microsoft 365, documentation, and vendors working together over time.</p></div></div><div style={{marginTop:24}}><Link to="/book" className="btn btn-primary btn-lg">Describe your situation <ArrowRight size={16}/></Link></div></div></section>
  </main>;
}