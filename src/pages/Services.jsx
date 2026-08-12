import { Link } from "../lib/Link";
import { Check, X, ArrowRight, ShieldCheck, MapPin, Wrench, Wifi } from "lucide-react";
import { services } from "../data/services";
import { useSEO } from "../lib/seo";
import { trackEvent } from "../lib/analytics";
import "../styles/services-revenue.css";

function ServiceCard({ svc }) {
  return (
    <article id={svc.slug} className="svc-card reveal-up">
      <header className="svc-card-head">
        <div className="svc-card-meta"><span className={`svc-audience svc-audience-${svc.audience.toLowerCase()}`}>{svc.audience}</span><span className="svc-duration">{svc.duration}</span></div>
        <h2 className="svc-card-title">{svc.title}</h2>
        <p className="svc-card-tagline">{svc.tagline}</p>
      </header>
      {svc.price > 0 ? <div className="svc-price-block"><span className="svc-price">{svc.priceFrom ? <span className="svc-price-from">from </span> : null}${svc.price.toLocaleString()}</span><p className="svc-price-note">{svc.priceNote}</p></div> : <div className="svc-price-block"><span className="svc-price">Assessment first</span><p className="svc-price-note">{svc.priceNote}</p></div>}
      <div className="svc-includes"><h3>What we handle</h3><ul>{svc.contents.map((c)=><li key={c}><Check size={14} color="var(--success)"/><span>{c}</span></li>)}</ul></div>
      {svc.notInScope?.length ? <details className="svc-not-included"><summary>What we do not promise</summary><ul>{svc.notInScope.map((n)=><li key={n}><X size={14}/><span>{n}</span></li>)}</ul></details> : null}
      {svc.bookingNote ? <p className="svc-booking-note"><ShieldCheck size={14}/>{svc.bookingNote}</p> : null}
      <div className="svc-cta"><Link to={svc.slug === "managed-it" ? "/book?topic=managed-it" : "/book?topic=computer-repair"} className="btn btn-primary svc-buy-btn" onClick={()=>trackEvent("generate_lead",{source:"services",service_slug:svc.slug})}>Request service <ArrowRight size={16}/></Link></div>
    </article>
  );
}

const FAQ = [
  { q:"What do you repair?", a:"We diagnose and repair common workstation and PC hardware/software problems, storage and memory issues, Windows problems, performance problems, and related peripherals. We do not advertise board-level microsoldering or guaranteed recovery from physically failed drives." },
  { q:"Where do you provide managed IT?", a:"Our core managed IT and network service area is Sarasota and Bradenton, including nearby Lakewood Ranch businesses when practical." },
  { q:"Do you sell services outside this scope?", a:"No. Leadgen is a separate software product. Other work is discussed only when we know we can deliver it reliably." },
];

export default function Services(){
  useSEO({title:"Computer Repair & Managed IT Sarasota-Bradenton | Simple IT SRQ",description:"Computer repair and hardware diagnostics plus managed IT, Microsoft 365 and network support for businesses in Sarasota and Bradenton.",canonical:"https://simpleitsrq.com/services",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"},{name:"Services",url:"https://simpleitsrq.com/services"}],faqs:FAQ});
  return <main id="main" className="services-main">
    <section className="section services-hero"><div className="container"><span className="eyebrow">Sarasota & Bradenton IT</span><h1 className="display">Two service lines. Clear scope.</h1><p className="lede">We repair and diagnose computers and workstations. We also provide managed IT and network support for local businesses. That is the core service business.</p><div className="services-trust-row"><span><MapPin size={14}/> Sarasota / Bradenton area</span><span><ShieldCheck size={14}/> We tell you when a job is outside our scope</span></div></div></section>
    <section className="section section-alt" id="services-catalog"><div className="container"><div className="services-grid">{services.map((svc)=><ServiceCard key={svc.slug} svc={svc}/>)}</div></div></section>
    <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">What this means</span><h2 className="title-1">Repair when something is broken. Managed IT when the business needs ongoing ownership.</h2></div><div className="solution-grid"><div className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Wrench size={18}/></span><h3 className="solution-card-title">Repair</h3></div><p className="solution-card-desc">Diagnostics, repair, upgrades, workstation recovery and practical replacement advice.</p></div><div className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Wifi size={18}/></span><h3 className="solution-card-title">Managed IT</h3></div><p className="solution-card-desc">Networks, endpoints, Microsoft 365, users, vendors, documentation and ongoing support.</p></div></div><div style={{marginTop:24}}><Link to="/book" className="btn btn-primary btn-lg">Tell us what you need <ArrowRight size={16}/></Link></div></div></section>
  </main>;
}
