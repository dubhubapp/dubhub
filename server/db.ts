import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with error handling and SSL configuration for Supabase
let pool: Pool;
try {
  // Parse DATABASE_URL and configure SSL properly
  const connectionString = process.env.DATABASE_URL;
  const url = new URL(connectionString);
  
  // Remove sslmode from URL - we'll use the ssl object instead
  // This gives us better control over SSL certificate validation
  url.searchParams.delete('sslmode');
  
  // Configure SSL for Supabase
  // Supabase uses valid SSL certificates, but some environments may have
  // certificate chain issues. In development, we allow self-signed certs.
  // In production, use strict SSL verification.
  const isProduction = process.env.NODE_ENV === 'production';
  const sslConfig = isProduction 
    ? { rejectUnauthorized: true }
    : { 
        rejectUnauthorized: false, // Allow self-signed certs in development
      };
  
  console.log('[DB] SSL configuration:', { 
    isProduction, 
    rejectUnauthorized: sslConfig.rejectUnauthorized 
  });
  
  pool = new Pool({ 
    connectionString: url.toString(),
    ssl: sslConfig,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
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