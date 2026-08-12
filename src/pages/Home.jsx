import { ArrowRight, Mail, MapPin, Clock, Wrench, Wifi, Building2, Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "../lib/Link";
import { useState } from "react";
import { useSEO } from "../lib/seo";
import posts from "../data/posts-meta.json";
import BlogCover from "../components/BlogCover";
import GoogleReviews from "../components/GoogleReviews";
import { tapHaptic, selectionHaptic, successHaptic, errorHaptic } from "../lib/haptics";
import { useTurnstile, TURNSTILE_SITE_KEY } from "../lib/useTurnstile";
import { csrfFetch } from "../lib/csrf";
import { trackEvent } from "../lib/analytics";

function Hero() {
  return (
    <section className="home-hero" aria-labelledby="hero-title">
      <div className="container home-hero__grid">
        <div className="home-hero__copy">
          <div className="eyebrow" style={{ marginBottom: "1rem" }}>Simple IT SRQ · Sarasota & Bradenton</div>
          <h1 id="hero-title" className="display">Computer repair, diagnostics, networks, and managed IT.</h1>
          <p className="lede">We fix hardware and workstation problems, troubleshoot business networks, and provide ongoing IT support for organizations in the Sarasota-Bradenton area. Leadgen is our separate software product.</p>
          <div className="home-hero__actions">
            <Link to="/services#computer-repair" className="btn btn-primary btn-lg">Computer repair <ArrowRight size={16} /></Link>
            <Link to="/services#managed-it" className="btn btn-secondary btn-lg">Managed IT <ArrowRight size={16} /></Link>
            <Link to="/leadgen" className="btn btn-secondary btn-lg">Leadgen <ArrowRight size={16} /></Link>
          </div>
          <ul className="home-hero__proof" aria-label="Service area and focus">
            <li><MapPin size={15} /> Sarasota & Bradenton</li>
            <li><Wrench size={15} /> Hardware repair & diagnostics</li>
            <li><Wifi size={15} /> Business IT & networks</li>
          </ul>
        </div>
        <aside className="home-hero__panel" aria-label="What we do">
          <div className="home-hero__panel-head"><span>Simple by design</span><strong>Three clear paths</strong></div>
          <div className="home-hero__path-list">
            <Link to="/services#computer-repair" className="home-hero__path"><span><strong>Repair & diagnostics</strong><small>PCs, workstations, drives, memory, thermal and hardware troubleshooting.</small></span><ArrowRight size={16}/></Link>
            <Link to="/services#managed-it" className="home-hero__path"><span><strong>Managed IT & networks</strong><small>Users, endpoints, Wi-Fi, Microsoft 365, vendors, and ongoing support.</small></span><ArrowRight size={16}/></Link>
            <Link to="/leadgen" className="home-hero__path"><span><strong>Leadgen software</strong><small>Standalone prospecting product for discovering, qualifying, enriching, and syncing local leads.</small></span><ArrowRight size={16}/></Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

const SERVICES = [
  { Icon: Wrench, title: "Computer repair & diagnostics", body: "Hardware diagnostics, Windows/workstation repair, upgrades, storage and memory troubleshooting, cleanup, and repair-or-replace guidance.", to: "/services#computer-repair" },
  { Icon: Wifi, title: "Network & IT troubleshooting", body: "Business Wi-Fi, switching, connectivity, Microsoft 365 access issues, endpoints, printers, and vendor coordination.", to: "/services#managed-it" },
  { Icon: Building2, title: "Managed IT", body: "Ongoing support for Sarasota-Bradenton organizations that need a practical local IT partner without pretending every environment fits a canned package.", to: "/services#managed-it" },
];

function Services() {
  return <section className="section" id="solutions"><div className="container"><div className="section-head"><span className="eyebrow">What we actually do</span><h2 className="title-1">Focused services we can stand behind.</h2><p className="section-sub">No giant menu of promises. If a project is outside our capability, we say so and point you in the right direction.</p></div><div className="solution-grid">{SERVICES.map(({Icon,title,body,to}) => <Link key={title} to={to} className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Icon size={18}/></span><h3 className="solution-card-title">{title}</h3></div><p className="solution-card-desc">{body}</p><span className="solution-card-link">See details <ArrowRight size={14}/></span></Link>)}</div></div></section>;
}

function LeadgenStrip() {
  return <section className="section section-alt"><div className="container"><div className="section-head"><span className="eyebrow">Standalone product</span><h2 className="title-1">Leadgen: local prospecting software.</h2><p className="section-sub">Discover businesses by market, qualify the useful ones, enrich contact data, and sync selected leads into your CRM or automation stack.</p></div><Link to="/leadgen" className="btn btn-primary btn-lg">Open Leadgen <ArrowRight size={16}/></Link></div></section>;
}

function BlogPreview() {
  const latest = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  return <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">Blog</span><h2 className="title-1">IT and security news, translated for local businesses.</h2><p className="section-sub">We follow current technology stories and explain what matters for owners and office managers in Sarasota and Bradenton.</p></div><div className="blog-grid">{latest.map((p)=><article key={p.slug} className="blog-card"><Link to={`/blog/${p.slug}`} className="blog-card-img"><BlogCover post={p} variant="card"/></Link><div className="blog-card-body"><span className="blog-card-category">{p.category}</span><h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3><p className="blog-card-excerpt">{p.excerpt}</p></div></article>)}</div><div className="blog-cta-row"><Link to="/blog" className="btn btn-secondary btn-lg">View blog</Link></div></div></section>;
}

const ERROR_MESSAGES = { captcha_required:"Please complete the security check before sending.", network_error:"Network hiccup. Try again.", send_failed:"We couldn't send your message just now. Please try again." };
function Contact() {
  const [form,setForm]=useState({name:"",company:"",email:"",phone:"",message:"",_hp:""}); const [status,setStatus]=useState("idle"); const [errorMsg,setErrorMsg]=useState(""); const [token,setToken]=useState("");
  const {containerRef,reset}=useTurnstile(setToken); const update=(k)=>(e)=>setForm((f)=>({...f,[k]:e.target.value}));
  const submit=async(e)=>{e.preventDefault(); if(status==="submitting")return; if(TURNSTILE_SITE_KEY&&!token){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES.captcha_required);return;} selectionHaptic();setStatus("submitting");setErrorMsg(""); try{const r=await csrfFetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,turnstileToken:token})});const d=await r.json().catch(()=>({}));if(r.ok&&d.ok){successHaptic();setStatus("success");trackEvent("generate_lead",{source:"home_contact"});}else{throw new Error(d.error||"send_failed");}}catch(err){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES[err.message]||ERROR_MESSAGES.send_failed);setToken("");reset();}};
  return <section className="section" id="contact"><div className="container"><div className="section-head"><span className="eyebrow">Need help?</span><h2 className="title-1">Tell us what is broken.</h2><p className="section-sub">Computer, hardware, network, Microsoft 365, or ongoing business IT support. We will tell you whether it is something we can handle.</p></div><div className="contact-grid"><div className="form-shell"><form className="form" onSubmit={submit}><label><span>What is happening?</span><textarea rows="6" value={form.message} onChange={update("message")} required /></label><div className="row-2"><label><span>Email</span><input type="email" value={form.email} onChange={update("email")} required /></label><label><span>Name</span><input value={form.name} onChange={update("name")}/></label></div>{TURNSTILE_SITE_KEY&&<div ref={containerRef}/>}<button className="btn btn-primary btn-lg" disabled={status==="submitting"} onPointerDown={tapHaptic}>{status==="submitting"?<><Loader2 size={18} className="spin"/> Sending...</>:<><Send size={16}/> Send request</>}</button>{status==="error"&&<div className="form-banner form-banner-error"><AlertCircle size={18}/>{errorMsg}</div>}{status==="success"&&<div className="form-banner"><CheckCircle2 size={18}/> Message sent. We will reply during business hours.</div>}</form></div><aside className="contact-info"><div className="info-row"><Mail size={18}/><div><strong>Email</strong><br/>hello@simpleitsrq.com</div></div><div className="info-row"><MapPin size={18}/><div><strong>Service area</strong><br/>Sarasota and Bradenton area</div></div><div className="info-row"><Clock size={18}/><div><strong>Scope</strong><br/>Repair, diagnostics, networks, managed IT.</div></div></aside></div></div></section>;
}

export default function Home(){
  useSEO({title:"Computer Repair & IT Support Sarasota-Bradenton | Simple IT SRQ",description:"Computer repair, hardware diagnostics, network troubleshooting and managed IT support for Sarasota and Bradenton businesses, plus the standalone Leadgen product.",canonical:"https://simpleitsrq.com/",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"}],organization:true});
  return <><Hero/><Services/><LeadgenStrip/><GoogleReviews/><BlogPreview/><Contact/></>;
}
