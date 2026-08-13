import { json } from "./_lib/http.js";
import { analyzeBusinessRecord, deduplicateBusinesses, LEAD_INTELLIGENCE_MODEL } from "./_lib/leadgen-intelligence.js";
import { buildMarketAnalytics } from "./_lib/leadgen-market-analytics.js";
import { clientIp, rateLimit } from "./_lib/security.js";

const MAX_ROWS=100;
const clean=(value,max=320)=>String(value||"").trim().slice(0,max);
function safeRow(row={}){
  return {
    name:clean(row.name,160),address:clean(row.address,220),city:clean(row.city,100),state:clean(row.state,40),zip:clean(row.zip,16),
    website:clean(row.website),phone:clean(row.phone,80),source:clean(row.source,40),source_id:clean(row.source_id,100),source_url:clean(row.source_url),
    industry:clean(row.industry,120),industry_group:clean(row.industry_group,100),sub_industry:clean(row.sub_industry,140),naics:clean(row.naics,24),
    lat:Number.isFinite(Number(row.lat))?Number(row.lat):null,lng:Number.isFinite(Number(row.lng))?Number(row.lng):null,is_chain:Boolean(row.is_chain),
    email_count:Math.max(0,Number(row.email_count||0)||0),email_confidence:Number.isFinite(Number(row.email_confidence))?Number(row.email_confidence):null,
    updated_at:row.updated_at||null,last_crawled_at:row.last_crawled_at||null,
    opportunity_score:Number(row.opportunity_score||0)||0,opportunity_grade:clean(row.opportunity_grade,4),opportunity_reasons:Array.isArray(row.opportunity_reasons)?row.opportunity_reasons.slice(0,8).map(x=>clean(x,160)):[],
  };
}

export async function POST(request){
  const rl=await rateLimit({ip:clientIp(request),bucket:"leadgen_quality",windowSeconds:60,max:30});
  if(!rl.ok)return json(429,{ok:false,error:"rate_limited",message:"Too many intelligence requests. Try again shortly."});
  let body;try{body=await request.json()}catch{return json(400,{ok:false,error:"invalid_json"})}
  if(!Array.isArray(body.rows))return json(400,{ok:false,error:"rows_required"});
  const sourceRows=body.rows.slice(0,MAX_ROWS).map(safeRow);
  const rows=deduplicateBusinesses(sourceRows).map(row=>({...row,...analyzeBusinessRecord(row)}));
  const market=buildMarketAnalytics(rows);
  return json(200,{ok:true,intelligence_model:LEAD_INTELLIGENCE_MODEL,raw_count:sourceRows.length,unique_count:rows.length,market,rows});
}

export async function GET(){return json(200,{ok:true,intelligence_model:LEAD_INTELLIGENCE_MODEL,max_rows:MAX_ROWS});}

export default async function handler(req,res){
  const method=(req.method||"GET").toUpperCase();
  const request=new Request("https://simpleitsrq.com/api/leadgen-quality",{method,headers:{"content-type":req.headers?.["content-type"]||"application/json","x-real-ip":req.headers?.["x-real-ip"]||"","x-forwarded-for":req.headers?.["x-forwarded-for"]||""},body:method==="POST"?(typeof req.body==="string"?req.body:JSON.stringify(req.body||{})):undefined});
  const response=method==="POST"?await POST(request):method==="GET"?await GET():json(405,{ok:false,error:"method_not_allowed"});
  const payload=await response.text();res.status(response.status);for(const [key,value] of response.headers.entries())res.setHeader(key,value);res.send(payload);
}
