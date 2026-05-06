import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql.query(
  `SELECT ts, kind, severity, detail
     FROM security_events
    WHERE ts > now() - interval '2 hours'
    ORDER BY ts DESC
    LIMIT 60`
);
console.log(JSON.stringify(r, null, 2));
