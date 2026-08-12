import { json } from './_lib/http.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';
import { clientIp, rateLimit } from './_lib/security.js';

async function requireUser(request) {
  const session = await getSession(request);
  if (!session?.user?.id) return { error: json(401, { ok: false, error: 'unauthorized' }) };
  return { session, user: session.user };
}

async function ensureWorkspace(user) {
  let [workspace] = await sql`
    SELECT w.* FROM lead_workspaces w
    JOIN lead_workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ${user.id}
    ORDER BY (m.role = 'owner') DESC, w.created_at ASC
    LIMIT 1
  `;
  if (workspace) return workspace;
  [workspace] = await sql`
    INSERT INTO lead_workspaces(name, owner_user_id)
    VALUES (${`${user.name || user.email || 'My'} workspace`}, ${user.id})
    RETURNING *
  `;
  await sql`
    INSERT INTO lead_workspace_members(workspace_id, user_id, role)
    VALUES (${workspace.id}, ${user.id}, 'owner')
    ON CONFLICT DO NOTHING
  `;
  return workspace;
}

function scoreBusiness(row) {
  let score = 25;
  const reasons = [];
  if (row.website) { score += 20; reasons.push('Has website'); }
  if (row.phone) { score += 15; reasons.push('Has phone'); }
  if (Number(row.email_count || 0) > 0) { score += 25; reasons.push('Deliverable email'); }
  if (row.industry_group) { score += 5; reasons.push('Industry classified'); }
  if (row.is_chain) { score -= 25; reasons.push('Chain penalty'); }
  if (row.source_url) { score += 5; reasons.push('Source provenance'); }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D';
  return { score, grade, reasons };
}

async function overview(workspace) {
  const [markets, exclusions, attribution, health, campaigns] = await Promise.all([
    sql`SELECT id, name, zip, industry_group, schedule, next_run_at, last_run_at, updated_at
        FROM lead_saved_markets WHERE workspace_id=${workspace.id} ORDER BY updated_at DESC LIMIT 20`,
    sql`SELECT COUNT(*)::int AS total FROM lead_exclusions WHERE workspace_id=${workspace.id}`,
    sql`SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value_cents),0)::bigint AS value_cents
        FROM lead_pipeline_attribution WHERE workspace_id=${workspace.id} GROUP BY stage`,
    sql`SELECT integration_id, provider, status, last_success_at, last_failure_at, consecutive_failures, latency_ms, last_error, checked_at
        FROM lead_integration_health WHERE workspace_id=${workspace.id} ORDER BY checked_at DESC`,
    sql`SELECT id, name, status, daily_cap, started_at, completed_at, updated_at FROM lead_campaigns ORDER BY updated_at DESC LIMIT 12`,
  ]);
  return { workspace, markets, exclusions: exclusions[0]?.total || 0, attribution, health, campaigns };
}

async function topLeads(workspace) {
  const rows = await sql`
    SELECT b.id, b.name, b.city, b.state, b.zip, b.website, b.phone, b.source_url,
           b.industry_group, b.sub_industry, COALESCE(b.is_chain,false) AS is_chain,
           (SELECT COUNT(*)::int FROM lead_emails e WHERE e.business_id=b.id AND e.opted_out_at IS NULL AND e.bounced_at IS NULL) AS email_count
    FROM lead_businesses b
    WHERE b.status='active'
    ORDER BY b.updated_at DESC
    LIMIT 100
  `;
  const scored = rows.map((row) => ({ ...row, ...scoreBusiness(row) })).sort((a,b) => b.score-a.score).slice(0,30);
  for (const lead of scored) {
    await sql`
      INSERT INTO lead_scores(workspace_id,business_id,score,grade,reasons,model_version,scored_at)
      VALUES(${workspace.id},${lead.id},${lead.score},${lead.grade},${JSON.stringify(lead.reasons)}::jsonb,'rules-v1',now())
      ON CONFLICT(workspace_id,business_id) DO UPDATE SET score=EXCLUDED.score, grade=EXCLUDED.grade, reasons=EXCLUDED.reasons, scored_at=now()
    `;
  }
  return scored;
}

export default async function handler(request) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const ip = clientIp(request);
  if (!rateLimit(`leadgen-workspace:${auth.user.id}:${ip}`, 120, 60_000)) return json(429,{ok:false,error:'rate_limited'});
  const workspace = await ensureWorkspace(auth.user);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'overview';

  if (request.method === 'GET') {
    if (action === 'overview') return json(200,{ok:true,...await overview(workspace)});
    if (action === 'scores') return json(200,{ok:true,leads:await topLeads(workspace)});
    if (action === 'changes') {
      const rows = await sql`SELECT c.*, m.name AS market_name FROM lead_market_changes c JOIN lead_saved_markets m ON m.id=c.saved_market_id WHERE m.workspace_id=${workspace.id} ORDER BY c.detected_at DESC LIMIT 100`;
      return json(200,{ok:true,changes:rows});
    }
    if (action === 'territories') return json(200,{ok:true,territories:await sql`SELECT * FROM lead_territories WHERE workspace_id=${workspace.id} ORDER BY name`});
    if (action === 'exclusions') return json(200,{ok:true,exclusions:await sql`SELECT * FROM lead_exclusions WHERE workspace_id=${workspace.id} ORDER BY created_at DESC`});
    return json(400,{ok:false,error:'invalid_action'});
  }

  if (request.method !== 'POST') return json(405,{ok:false,error:'method_not_allowed'});
  let body; try { body=await request.json(); } catch { return json(400,{ok:false,error:'invalid_json'}); }

  if (action === 'save-market') {
    const zip=String(body.zip||'').replace(/\D/g,'').slice(0,5); if(!/^\d{5}$/.test(zip)) return json(400,{ok:false,error:'invalid_zip'});
    const schedule=['daily','weekly','monthly'].includes(body.schedule)?body.schedule:null;
    const [row]=await sql`INSERT INTO lead_saved_markets(workspace_id,name,zip,industry_group,sub_industry,filters,schedule,next_run_at,created_by)
      VALUES(${workspace.id},${String(body.name||`${zip} market`).slice(0,80)},${zip},${body.industry_group||null},${body.sub_industry||null},${JSON.stringify(body.filters||{})}::jsonb,${schedule},${schedule?new Date().toISOString():null},${auth.user.id}) RETURNING *`;
    return json(200,{ok:true,market:row});
  }
  if (action === 'exclude') {
    const kind=['domain','email','phone','business','keyword'].includes(body.kind)?body.kind:null;
    const value=String(body.value||'').trim().slice(0,240); if(!kind||!value) return json(400,{ok:false,error:'invalid_exclusion'});
    const [row]=await sql`INSERT INTO lead_exclusions(workspace_id,kind,value,reason,created_by) VALUES(${workspace.id},${kind},${value},${String(body.reason||'').slice(0,240)||null},${auth.user.id}) ON CONFLICT(workspace_id,kind,value) DO UPDATE SET reason=EXCLUDED.reason RETURNING *`;
    return json(200,{ok:true,exclusion:row});
  }
  if (action === 'territory') {
    const [row]=await sql`INSERT INTO lead_territories(workspace_id,name,owner_user_id,zip_prefixes,industries) VALUES(${workspace.id},${String(body.name||'Territory').slice(0,80)},${body.owner_user_id||auth.user.id},${Array.isArray(body.zip_prefixes)?body.zip_prefixes:[]},${Array.isArray(body.industries)?body.industries:[]}) ON CONFLICT(workspace_id,name) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id,zip_prefixes=EXCLUDED.zip_prefixes,industries=EXCLUDED.industries,updated_at=now() RETURNING *`;
    return json(200,{ok:true,territory:row});
  }
  if (action === 'attribute') {
    const stage=['lead','qualified','meeting','opportunity','won','lost'].includes(body.stage)?body.stage:null; if(!stage) return json(400,{ok:false,error:'invalid_stage'});
    const [row]=await sql`INSERT INTO lead_pipeline_attribution(workspace_id,business_id,campaign_id,stage,value_cents,currency,external_ref,metadata) VALUES(${workspace.id},${body.business_id||null},${body.campaign_id||null},${stage},${Math.max(0,Number(body.value_cents)||0)},${String(body.currency||'USD').slice(0,8)},${String(body.external_ref||'').slice(0,120)||null},${JSON.stringify(body.metadata||{})}::jsonb) RETURNING *`;
    return json(200,{ok:true,attribution:row});
  }
  return json(400,{ok:false,error:'invalid_action'});
}
