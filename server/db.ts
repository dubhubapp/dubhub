import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

function parseOptionalBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with error handling and SSL configuration for Supabase
let pool: Pool;
try {
  // Respect DATABASE_URL exactly as provided (including any sslmode intent).
  const connectionString = process.env.DATABASE_URL;

  // Optional emergency override for TLS certificate verification behavior.
  // When unset, we omit the ssl object entirely so pg follows DATABASE_URL.
  const envOverrideRejectUnauthorized = parseOptionalBooleanEnv(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  );
  const sslConfig =
    envOverrideRejectUnauthorized === undefined
      ? undefined
      : { rejectUnauthorized: envOverrideRejectUnauthorized };

  pool = new Pool({
    connectionString,
    ...(sslConfig ? { ssl: sslConfig } : {}),
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased timeout for paused databases
  });
  
  // Handle pool errors gracefully
  pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client:', err);
  });
} catch (error) {
  console.error('Failed to create database pool:', error);
  throw error;
}

// Test connection and verify we're connected to the right database
(async () => {
  try {
    const testResult = await pool.query('SELECT current_database(), current_schema()');
    console.log('[DB] Connected to database:', testResult.rows[0]?.current_database);
    console.log('[DB] Current schema:', testResult.rows[0]?.current_schema);
    
    // Check if posts table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'posts'
      );
    `);
    const postsExists = tableCheck.rows[0]?.exists;
    console.log('[DB] Posts table exists:', postsExists);
    
    if (!postsExists) {
      console.error('[DB] ⚠️  WARNING: posts table does not exist in the connected database!');
      console.error('[DB] ⚠️  Make sure DATABASE_URL points to your Supabase PostgreSQL connection string.');
      console.error('[DB] ⚠️  Get your connection string from: Supabase Dashboard > Settings > Database > Connection String > URI');
    }
  } catch (error) {
    console.error('[DB] Error checking database connection:', error);
  }
})();

export { pool };
export const db = drizzle({ client: pool, schema });