import 'dotenv/config';
import { sql } from '../../api/_lib/db.js';

const r = await sql`SELECT 1 as ok`;
console.log('DB OK:', r[0].ok);
process.exit(0);
