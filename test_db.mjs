import { sql } from './api/_lib/db.js';
(async () => {
  try {
    const rows = await sql`SELECT id, name, email, phone, message, source, page, country, region, city, status, notes, created_at FROM leads ORDER BY created_at DESC LIMIT 200`;
    console.log('Rows:', rows.length);
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit();
})();
