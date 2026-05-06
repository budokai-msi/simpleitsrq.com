import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

console.log("=== oauth_states columns ===");
console.log(await sql.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='oauth_states' ORDER BY ordinal_position`));

console.log("\n=== security_events columns ===");
console.log(await sql.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='security_events' ORDER BY ordinal_position`));

console.log("\n=== sessions columns ===");
console.log(await sql.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sessions' ORDER BY ordinal_position`));

console.log("\n=== latest auth.login events ===");
console.log(await sql.query(`SELECT ts, kind, severity, detail FROM security_events WHERE kind LIKE 'auth.login%' ORDER BY ts DESC LIMIT 10`));
