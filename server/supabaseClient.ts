import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Prefer service key for server-side operations (storage uploads)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Use service key if available (for storage uploads), otherwise fall back to anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in your .env file.');
}

// Create client with service key for storage operations
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Log which key is being used (without exposing the key itself)
console.log('[Supabase] Client initialized with:', {
  url: supabaseUrl,
  keyType: supabaseServiceKey ? 'SERVICE_KEY' : 'ANON_KEY',
  hasServiceKey: !!supabaseServiceKey
});
