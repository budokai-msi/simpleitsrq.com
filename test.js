import { sql } from './api/_lib/db.js';
async function main() {
  const users = await sql`SELECT id, email, role, plan, is_admin FROM users LIMIT 10`;
  console.log(users);
}
main();
