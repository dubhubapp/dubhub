import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
// Configure fetch API for Neon (required for serverless)
// Note: fetchConnectionCache is deprecated and always true now

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with error handling and SSL configuration
let pool: Pool;
try {
  // Parse DATABASE_URL to add SSL configuration if needed
  const connectionString = process.env.DATABASE_URL;
  
  // Ensure SSL is enabled for Neon (they require SSL)
  // If the connection string doesn't have sslmode, add it
  const url = new URL(connectionString);
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }
  
  pool = new Pool({ 
    connectionString: url.toString(),
    // Disable strict SSL verification in development if needed
    // In production, you should use proper certificates
    ...(process.env.NODE_ENV === 'development' && process.env.ALLOW_INSECURE_SSL === 'true' 
      ? { 
          // This is a workaround for expired certificates in development
          // DO NOT use in production
        } 
      : {})
  });
} catch (error) {
  console.error('Failed to create database pool:', error);
  throw error;
}

export { pool };
export const db = drizzle({ client: pool, schema });