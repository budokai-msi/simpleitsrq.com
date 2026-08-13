const pct=(n,d)=>d?Math.round(n/d*100):0;
const avg=(rows,key)=>rows.length?rows.reduce((s,r)=>s+Number(r[key]||0),0)/rows.length:0;

function diversity(counts){
  const total=counts.reduce((s,n)=>s+n,0);
  if(!total||counts.length<2)return 0;
  const entropy=-counts.reduce((s,n)=>{const p=n/total;return s+(p?p*Math.log(p):0)},0);
  return Math.round(entropy/Math.log(counts.length)*100);
}

export function buildMarketAnalytics(rows=[]){
  const total=rows.length,groups=new Map();
  for(const row of rows){const key=row.industry_group||row.industry||"Other";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  const counts=[...groups.values()].map(x=>x.length);
  const segments=[...groups.entries()].map(([industry,items])=>({
    industry,count:items.length,share:pct(items.length,total),
    contactable_rate:pct(items.filter(x=>x.phone||Number(x.email_count)>0).length,items.length),
    independent_rate:pct(items.filter(x=>!x.is_chain).length,items.length),
    digital_gap_rate:pct(items.filter(x=>!x.website||!x.phone).length,items.length),
    average_data_quality:Math.round(avg(items,"data_quality")),
  })).sort((a,b)=>b.count-a.count||a.industry.localeCompare(b.industry));
  return {
    total,
    average_data_quality:Math.round(avg(rows,"data_quality")),
    average_provenance_confidence:Math.round(avg(rows,"provenance_confidence")),
    market_diversity:diversity(counts),
    concentration_hhi:total?Math.round([...groups.values()].reduce((s,x)=>s+(x.length/total)**2,0)*10000):0,
    contactable_rate:pct(rows.filter(x=>x.phone||Number(x.email_count)>0).length,total),
    website_rate:pct(rows.filter(x=>x.website).length,total),
    phone_rate:pct(rows.filter(x=>x.phone).length,total),
    independent_rate:pct(rows.filter(x=>!x.is_chain).length,total),
    duplicate_records_collapsed:rows.reduce((s,r)=>s+Math.max(0,Number(r.duplicate_evidence_count||1)-1),0),
    segments,
  };
}
