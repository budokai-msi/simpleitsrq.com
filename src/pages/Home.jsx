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
          <div className="eyebrow" style={{ marginBottom: "1rem" }}>Local computer repair & business IT</div>
          <h1 id="hero-title" className="display">Computer repair and business IT support that starts with the problem.</h1>
          <p className="lede">Bring us a slow workstation, failing drive, Wi-Fi issue, Microsoft 365 problem, or a business that needs ongoing IT ownership. We diagnose what is happening, explain the options, and handle the work we can deliver well.</p>
          <div className="home-hero__actions">
            <Link to="/services#computer-repair" className="btn btn-primary btn-lg">Get repair help <ArrowRight size={16} /></Link>
            <Link to="/services#managed-it" className="btn btn-secondary btn-lg">Talk about business IT <ArrowRight size={16} /></Link>
            <Link to="/leadgen" className="btn btn-secondary btn-lg">Explore Leadgen <ArrowRight size={16} /></Link>
          </div>
          <ul className="home-hero__proof" aria-label="Service area and focus">
            <li><MapPin size={15} /> Sarasota & Bradenton</li>
            <li><Wrench size={15} /> Repair before replacement when practical</li>
            <li><Wifi size={15} /> Networks, users & day-to-day IT</li>
          </ul>
        </div>
        <aside className="home-hero__panel" aria-label="Choose the kind of help you need">
          <div className="home-hero__panel-head"><span>Start here</span><strong>Choose what you need</strong></div>
          <div className="home-hero__path-list">
            <Link to="/services#computer-repair" className="home-hero__path"><span><strong>Something is broken</strong><small>PC and workstation diagnostics, storage, memory, thermal issues, Windows problems, upgrades, and repair guidance.</small></span><ArrowRight size={16}/></Link>
            <Link to="/services#managed-it" className="home-hero__path"><span><strong>The business needs ongoing IT help</strong><small>Users, computers, Wi-Fi, Microsoft 365, vendors, documentation, and recurring support.</small></span><ArrowRight size={16}/></Link>
            <Link to="/leadgen" className="home-hero__path"><span><strong>You need better prospect research</strong><small>Leadgen finds local businesses, organizes the market, surfaces useful signals, and helps you qualify the prospects worth contacting.</small></span><ArrowRight size={16}/></Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

const SERVICES = [
  { Icon: Wrench, title: "Computer repair & diagnostics", body: "We diagnose the failure first, then repair, upgrade, or recommend replacement based on the condition of the machine and what makes sense to spend.", to: "/services#computer-repair" },
  { Icon: Wifi, title: "Network & IT troubleshooting", body: "Help with unreliable Wi-Fi, connectivity, Microsoft 365 access, workstations, printers, and the vendor problems that tend to bounce between providers.", to: "/services#managed-it" },
  { Icon: Building2, title: "Managed IT", body: "Ongoing support for the computers, users, network, Microsoft 365, documentation, and vendors your business depends on every day.", to: "/services#managed-it" },
];

function Services() {
  return <section className="section" id="solutions"><div className="container"><div className="section-head"><span className="eyebrow">Computer & business IT services</span><h2 className="title-1">Help for broken computers and everyday business IT.</h2><p className="section-sub">You do not need to diagnose the problem before contacting us. Tell us what is happening, what has already been tried, and how much it is affecting the business. We will help narrow down the next step.</p></div><div className="solution-grid">{SERVICES.map(({Icon,title,body,to}) => <Link key={title} to={to} className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Icon size={18}/></span><h3 className="solution-card-title">{title}</h3></div><p className="solution-card-desc">{body}</p><span className="solution-card-link">See what we handle <ArrowRight size={14}/></span></Link>)}</div></div></section>;
}

function LeadgenStrip() {
  return <section className="section section-alt"><div className="container"><div className="section-head"><span className="eyebrow">Leadgen software</span><h2 className="title-1">Find local businesses. See why they are worth a closer look.</h2><p className="section-sub">Scan a ZIP code and industry, compare businesses by contact and digital signals, expand the records that look promising, enrich what is missing, and export the prospects you choose.</p></div><Link to="/leadgen" className="btn btn-primary btn-lg">Try the market scanner <ArrowRight size={16}/></Link></div></section>;
}

function BlogPreview() {
  const latest = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  return <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">Field notes & analysis</span><h2 className="title-1">Useful IT notes, not recycled headlines.</h2><p className="section-sub">We start with original sources, add our own technical context, and focus on what a small business owner or office manager can actually do next.</p></div><div className="blog-grid">{latest.map((p)=><article key={p.slug} className="blog-card"><Link to={`/blog/${p.slug}`} className="blog-card-img"><BlogCover post={p} variant="card"/></Link><div className="blog-card-body"><span className="blog-card-category">{p.category}</span><h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3><p className="blog-card-excerpt">{p.excerpt}</p></div></article>)}</div><div className="blog-cta-row"><Link to="/blog" className="btn btn-secondary btn-lg">Read the latest notes</Link></div></div></section>;
}

const ERROR_MESSAGES = { captcha_required:"Please complete the security check before sending.", network_error:"Network hiccup. Try again.", send_failed:"We couldn't send your message just now. Please try again." };
function Contact() {
  const [form,setForm]=useState({name:"",company:"",email:"",phone:"",message:"",_hp:""}); const [status,setStatus]=useState("idle"); const [errorMsg,setErrorMsg]=useState(""); const [token,setToken]=useState("");
  const {containerRef,reset}=useTurnstile(setToken); const update=(k)=>(e)=>setForm((f)=>({...f,[k]:e.target.value}));
  const submit=async(e)=>{e.preventDefault(); if(status==="submitting")return; if(TURNSTILE_SITE_KEY&&!token){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES.captcha_required);return;} selectionHaptic();setStatus("submitting");setErrorMsg(""); try{const r=await csrfFetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,turnstileToken:token})});const d=await r.json().catch(()=>({}));if(r.ok&&d.ok){successHaptic();setStatus("success");trackEvent("generate_lead",{source:"home_contact"});}else{throw new Error(d.error||"send_failed");}}catch(err){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES[err.message]||ERROR_MESSAGES.send_failed);setToken("");reset();}};
  return <section className="section" id="contact"><div className="container"><div className="section-head"><span className="eyebrow">Need a second set of eyes?</span><h2 className="title-1">Tell us what is going on.</h2><p className="section-sub">Describe the computer, network, Microsoft 365, or business IT problem in plain language. If it fits our scope, we will explain the next step. If it does not, we will tell you that too.</p></div><div className="contact-grid"><div className="form-shell"><form className="form" onSubmit={submit}><label><span>What is happening?</span><textarea rows="6" value={form.message} onChange={update("message")} required /></label><div className="row-2"><label><span>Email</span><input type="email" value={form.email} onChange={update("email")} required /></label><label><span>Name</span><input value={form.name} onChange={update("name")}/></label></div>{TURNSTILE_SITE_KEY&&<div ref={containerRef}/>}<button className="btn btn-primary btn-lg" disabled={status==="submitting"} onPointerDown={tapHaptic}>{status==="submitting"?<><Loader2 size={18} className="spin"/> Sending...</>:<><Send size={16}/> Send request</>}</button>{status==="error"&&<div className="form-banner form-banner-error"><AlertCircle size={18}/>{errorMsg}</div>}{status==="success"&&<div className="form-banner"><CheckCircle2 size={18}/> Message sent. We will reply during business hours.</div>}</form></div><aside className="contact-info"><div className="info-row"><Mail size={18}/><div><strong>Email</strong><br/>hello@simpleitsrq.com</div></div><div className="info-row"><MapPin size={18}/><div><strong>Service area</strong><br/>Sarasota and Bradenton area</div></div><div className="info-row"><Clock size={18}/><div><strong>Best fit</strong><br/>Computer repair, diagnostics, networks, and ongoing business IT.</div></div></aside></div></div></section>;
}

export default function Home(){
  useSEO({title:"Computer Repair & IT Support in Sarasota & Bradenton | Simple IT SRQ",description:"Local computer repair, hardware diagnostics, network troubleshooting and ongoing business IT support in Sarasota and Bradenton. Tell us what is happening and we will help plan the next step.",canonical:"https://simpleitsrq.com/",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"}],organization:true});
  return <><Hero/><Services/><LeadgenStrip/><GoogleReviews/><BlogPreview/><Contact/></>;
}