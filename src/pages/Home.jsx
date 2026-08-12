import { ArrowRight, Mail, MapPin, Clock, Wrench, Wifi, Building2, Send, Loader2, AlertCircle, CheckCircle2, MonitorCog, HardDrive, Users, Network, BadgeCheck } from "lucide-react";
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
          <div className="eyebrow" style={{ marginBottom: "1rem" }}>Local computer repair & business IT · Sarasota & Bradenton</div>
          <h1 id="hero-title" className="display">Computer repair and managed IT support for Sarasota & Bradenton businesses.</h1>
          <p className="lede">Simple IT SRQ helps local businesses keep computers, workstations, Microsoft 365, Wi‑Fi, and office networks working. We handle hardware diagnostics and repair, day-to-day IT issues, and ongoing managed IT support when you need a local technology partner.</p>
          <div className="home-hero__actions">
            <Link to="/services#computer-repair" className="btn btn-primary btn-lg">Computer repair <ArrowRight size={16} /></Link>
            <Link to="/services#managed-it" className="btn btn-secondary btn-lg">Managed IT support <ArrowRight size={16} /></Link>
            <Link to="/leadgen" className="btn btn-secondary btn-lg">Leadgen product <ArrowRight size={16} /></Link>
          </div>
          <ul className="home-hero__proof" aria-label="Service area and focus">
            <li><MapPin size={15} /> Sarasota & Bradenton area</li>
            <li><Wrench size={15} /> Hardware repair & diagnostics</li>
            <li><Wifi size={15} /> Business networks & ongoing IT</li>
          </ul>
        </div>
        <aside className="home-hero__panel" aria-label="Choose a service">
          <div className="home-hero__panel-head"><span>Start here</span><strong>What needs attention?</strong></div>
          <div className="home-hero__path-list">
            <Link to="/services#computer-repair" className="home-hero__path"><span><strong>Computer repair & diagnostics</strong><small>Slow systems, failed drives, memory problems, upgrades, thermal issues, and workstation troubleshooting.</small></span><ArrowRight size={16}/></Link>
            <Link to="/services#managed-it" className="home-hero__path"><span><strong>Business IT & network support</strong><small>Microsoft 365, users, endpoints, Wi‑Fi, printers, switching, connectivity, and vendor coordination.</small></span><ArrowRight size={16}/></Link>
            <Link to="/leadgen" className="home-hero__path"><span><strong>Leadgen software</strong><small>Standalone local prospecting software for discovering, qualifying, enriching, and syncing leads.</small></span><ArrowRight size={16}/></Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

const SERVICES = [
  { Icon: HardDrive, title: "Computer repair & hardware diagnostics", body: "Desktop and workstation diagnostics, failed or unhealthy drives, memory issues, upgrades, overheating, slow systems, Windows problems, and practical repair-or-replace guidance.", to: "/services#computer-repair" },
  { Icon: Network, title: "Network & Wi‑Fi troubleshooting", body: "Office connectivity problems, unreliable Wi‑Fi, switches, routers, printers, endpoint connectivity, and the day-to-day network issues that interrupt work.", to: "/services#managed-it" },
  { Icon: Users, title: "Managed IT for local businesses", body: "Ongoing help for organizations that want one local IT partner for workstations, users, Microsoft 365, networks, troubleshooting, maintenance, and technology coordination.", to: "/services#managed-it" },
  { Icon: MonitorCog, title: "Microsoft 365 & workstation support", body: "User setup, account access, Outlook and Office issues, endpoint setup, device replacements, and workstation problems that slow down your staff.", to: "/services#managed-it" },
];

function Services() {
  return (
    <section className="section" id="solutions" aria-labelledby="solutions-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Local IT services</span>
          <h2 id="solutions-title" className="title-1">Practical help for the technology your business depends on.</h2>
          <p className="section-sub">We focus on repair, diagnostics, business networks, Microsoft 365, endpoints, and ongoing managed IT. If a project falls outside that scope, we tell you before you spend money.</p>
        </div>
        <div className="solution-grid">{SERVICES.map(({Icon,title,body,to}) => <Link key={title} to={to} className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><Icon size={18}/></span><h3 className="solution-card-title">{title}</h3></div><p className="solution-card-desc">{body}</p><span className="solution-card-link">See details <ArrowRight size={14}/></span></Link>)}</div>
      </div>
    </section>
  );
}

function WhyLocal() {
  const points = [
    ["Local coverage", "Sarasota and Bradenton businesses get support from someone who understands the local market and can work on the actual equipment when remote support is not enough."],
    ["Repair before replacement", "We diagnose the problem first. If a drive, memory module, workstation, or network component can be repaired or upgraded sensibly, we explain that option before recommending replacement."],
    ["One IT relationship", "For managed IT customers, the goal is simple: fewer scattered vendors, faster troubleshooting, and one place to start when computers, Microsoft 365, or the network stops behaving."],
  ];
  return <section className="section section-alt" aria-labelledby="why-local-title"><div className="container"><div className="section-head"><span className="eyebrow">Why Simple IT SRQ</span><h2 id="why-local-title" className="title-1">Local IT support without an oversized service menu.</h2><p className="section-sub">You do not need a giant technology catalog. You need the common business problems fixed properly and someone who will tell you what is worth doing next.</p></div><div className="solution-grid">{points.map(([title,body])=><article key={title} className="solution-card"><div className="solution-card-head"><span className="solution-card-icon"><BadgeCheck size={18}/></span><h3 className="solution-card-title">{title}</h3></div><p className="solution-card-desc">{body}</p></article>)}</div></div></section>;
}

function LeadgenStrip() {
  return <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">Standalone software product</span><h2 className="title-1">Leadgen turns a ZIP code into a qualified local prospect list.</h2><p className="section-sub">Discover local businesses, qualify the useful prospects, enrich contact data, and sync selected leads into your CRM or automation stack. Leadgen is separate from our local IT service business.</p></div><Link to="/leadgen" className="btn btn-primary btn-lg">Explore Leadgen <ArrowRight size={16}/></Link></div></section>;
}

function BlogPreview() {
  const latest = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  return <section className="section"><div className="container"><div className="section-head"><span className="eyebrow">Blog</span><h2 className="title-1">Technology news with a local business point of view.</h2><p className="section-sub">We follow current IT, security, hardware, network, and software stories and explain what they may mean for businesses around Sarasota and Bradenton.</p></div><div className="blog-grid">{latest.map((p)=><article key={p.slug} className="blog-card"><Link to={`/blog/${p.slug}`} className="blog-card-img"><BlogCover post={p} variant="card"/></Link><div className="blog-card-body"><span className="blog-card-category">{p.category}</span><h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3><p className="blog-card-excerpt">{p.excerpt}</p></div></article>)}</div><div className="blog-cta-row"><Link to="/blog" className="btn btn-secondary btn-lg">View blog</Link></div></div></section>;
}

const ERROR_MESSAGES = { captcha_required:"Please complete the security check before sending.", network_error:"Network hiccup. Try again.", send_failed:"We couldn't send your message just now. Please try again." };
function Contact() {
  const [form,setForm]=useState({name:"",company:"",email:"",phone:"",message:"",_hp:""}); const [status,setStatus]=useState("idle"); const [errorMsg,setErrorMsg]=useState(""); const [token,setToken]=useState("");
  const {containerRef,reset}=useTurnstile(setToken); const update=(k)=>(e)=>setForm((f)=>({...f,[k]:e.target.value}));
  const submit=async(e)=>{e.preventDefault(); if(status==="submitting")return; if(TURNSTILE_SITE_KEY&&!token){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES.captcha_required);return;} selectionHaptic();setStatus("submitting");setErrorMsg(""); try{const r=await csrfFetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,turnstileToken:token})});const d=await r.json().catch(()=>({}));if(r.ok&&d.ok){successHaptic();setStatus("success");trackEvent("generate_lead",{source:"home_contact"});}else{throw new Error(d.error||"send_failed");}}catch(err){errorHaptic();setStatus("error");setErrorMsg(ERROR_MESSAGES[err.message]||ERROR_MESSAGES.send_failed);setToken("");reset();}};
  return <section className="section" id="contact"><div className="container"><div className="section-head"><span className="eyebrow">Need local IT help?</span><h2 className="title-1">Tell us what is broken or what keeps interrupting your team.</h2><p className="section-sub">Computer problem, hardware issue, unreliable network, Microsoft 365 trouble, or ongoing business IT support—we will tell you whether it fits our scope and what the next step should be.</p></div><div className="contact-grid"><div className="form-shell"><form className="form" onSubmit={submit}><label><span>What is happening?</span><textarea rows="6" value={form.message} onChange={update("message")} required placeholder="Example: two office PCs are failing, Wi‑Fi drops every afternoon, or we need ongoing IT support for 15 workstations." /></label><div className="row-2"><label><span>Email</span><input type="email" value={form.email} onChange={update("email")} required /></label><label><span>Name</span><input value={form.name} onChange={update("name")}/></label></div>{TURNSTILE_SITE_KEY&&<div ref={containerRef}/>}<button className="btn btn-primary btn-lg" disabled={status==="submitting"} onPointerDown={tapHaptic}>{status==="submitting"?<><Loader2 size={18} className="spin"/> Sending...</>:<><Send size={16}/> Send request</>}</button>{status==="error"&&<div className="form-banner form-banner-error"><AlertCircle size={18}/>{errorMsg}</div>}{status==="success"&&<div className="form-banner"><CheckCircle2 size={18}/> Message sent. We will reply during business hours.</div>}</form></div><aside className="contact-info"><div className="info-row"><Mail size={18}/><div><strong>Email</strong><br/>hello@simpleitsrq.com</div></div><div className="info-row"><MapPin size={18}/><div><strong>Service area</strong><br/>Sarasota and Bradenton area</div></div><div className="info-row"><Clock size={18}/><div><strong>Core scope</strong><br/>Repair, diagnostics, networks, Microsoft 365, managed IT.</div></div></aside></div></div></section>;
}

export default function Home(){
  useSEO({title:"Computer Repair & Managed IT Sarasota-Bradenton | Simple IT SRQ",description:"Local computer repair, hardware diagnostics, network troubleshooting, Microsoft 365 support and managed IT for Sarasota and Bradenton businesses. Leadgen is our standalone prospecting software.",canonical:"https://simpleitsrq.com/",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"}],organization:true});
  return <><Hero/><Services/><WhyLocal/><GoogleReviews/><LeadgenStrip/><BlogPreview/><Contact/></>;
}
