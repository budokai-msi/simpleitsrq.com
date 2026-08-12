import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "../lib/Link";
import { ArrowRight } from "lucide-react";
import posts from "../data/posts-meta.json";
import { useSEO } from "../lib/seo";
import BlogCover from "../components/BlogCover";
import BlogSearch from "../components/BlogSearch";
import EmptyState from "../components/EmptyState";
import AdUnit from "../components/AdSense";
import { ADSENSE_SLOTS } from "../lib/adsenseSlots";

const PAGE_SIZE = 12;
const CATEGORIES = ["All", "Cybersecurity", "AI & Productivity", "Cloud", "Privacy", "Business Tech", "Industry News"];

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [active, setActive] = useState("All");
  const sorted = useMemo(() => [...posts].sort((a,b)=>b.date.localeCompare(a.date)), []);
  const [searchResults,setSearchResults]=useState(sorted);
  const [committedQuery,setCommittedQuery]=useState(initialQuery);
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);
  const filtered=useMemo(()=>active==="All"?searchResults:searchResults.filter((p)=>p.category===active),[active,searchResults]);
  const visible=filtered.slice(0,visibleCount);
  const handleQueryChange=useCallback((q)=>{setCommittedQuery(q);setVisibleCount(PAGE_SIZE);setSearchParams((prev)=>{const next=new URLSearchParams(prev);if(q)next.set("q",q);else next.delete("q");return next;},{replace:true});},[setSearchParams]);
  useSEO({title:"IT News & Local Tech Advice | Simple IT SRQ",description:"Original commentary on current IT, hardware, networking and security news for Sarasota and Bradenton businesses, with source attribution and practical next steps.",canonical:"https://simpleitsrq.com/blog",image:"https://simpleitsrq.com/og-image.png",breadcrumbs:[{name:"Home",url:"https://simpleitsrq.com/"},{name:"Blog",url:"https://simpleitsrq.com/blog"}]});
  return <main id="main"><section className="section blog-hero"><div className="container blog-hero__inner"><div className="blog-hero__copy"><span className="eyebrow">Simple IT SRQ Blog</span><h1 className="display">IT news with a local point of view.</h1><p className="lede">We track important technology stories, link to the original sources, and explain what they mean for computers, networks, Microsoft 365 and small-business IT in Sarasota and Bradenton.</p></div></div></section><section className="section section-alt"><div className="container"><BlogSearch posts={sorted} initialQuery={initialQuery} onFilter={setSearchResults} onQueryChange={handleQueryChange}/><div className="blog-filters" role="tablist" aria-label="Categories">{CATEGORIES.map((cat)=><button key={cat} role="tab" aria-selected={active===cat} className={`blog-filter ${active===cat?"is-active":""}`} onClick={()=>{setActive(cat);setVisibleCount(PAGE_SIZE);}}>{cat}</button>)}</div><div className="blog-grid">{visible.flatMap((p,i)=>{const card=<article key={p.slug} className="blog-card"><Link to={`/blog/${p.slug}`} className="blog-card-img" aria-label={p.title}><BlogCover post={p} variant="card"/></Link><div className="blog-card-body"><span className="blog-card-category">{p.category}</span><h3 className="blog-card-title"><Link to={`/blog/${p.slug}`}>{p.title}</Link></h3><p className="blog-card-excerpt">{p.excerpt}</p><div className="blog-card-meta"><time dateTime={p.date}>{new Date(p.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</time><Link to={`/blog/${p.slug}`} className="blog-card-readmore">Read <ArrowRight size={14}/></Link></div></div></article>;return (i+1)%6===0&&i<visible.length-1?[card,<AdUnit key={`ad-${i}`} slot={ADSENSE_SLOTS.inFeed} format="fluid" className="ad-in-feed"/>]:[card];})}</div>{filtered.length===0?<EmptyState icon={committedQuery?"search":"inbox"} title={committedQuery?`No posts match “${committedQuery}”`:"No posts in this category yet"} body="Try another search or check back for the next source-backed analysis."/>:null}{visibleCount<filtered.length?<div className="blog-load-more"><button className="btn btn-secondary btn-lg" onClick={()=>setVisibleCount((n)=>n+PAGE_SIZE)}>Load more</button></div>:null}<section className="blog-convert-cta"><div><span className="eyebrow">Need hands-on help?</span><h2 className="title-2">Computer, network, or managed IT problem?</h2><p>We handle repair, diagnostics, business networks and managed IT in Sarasota and Bradenton.</p></div><div className="blog-convert-cta__actions"><Link to="/services" className="btn btn-primary btn-lg">See IT services <ArrowRight size={16}/></Link><Link to="/leadgen" className="btn btn-secondary btn-lg">Leadgen product <ArrowRight size={16}/></Link></div></section></div></section></main>;
}
