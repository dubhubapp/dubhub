/**
 * Temporary utility to upgrade a user to moderator status
 * Run this script once to grant moderator privileges to a specific user
 */

import "dotenv/config";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY) in your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Replace this with your actual user UUID when ready to run
 * You can get your UUID from the Supabase auth.users table or after signing up
 */
const TARGET_USER_UUID = 'YOUR-UUID-HERE'; // Replace with actual UUID

async function upgradeModerator() {
  try {
    console.log('🚀 Starting moderator upgrade process...');
    
    // Check if the user exists first
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email, username, account_type, moderator')
      .eq('id', TARGET_USER_UUID)
      .single();

    if (checkError) {
      console.error('❌ Error checking user profile:', checkError.message);
      return;
    }

    if (!existingProfile) {
      console.error('❌ No profile found for UUID:', TARGET_USER_UUID);
      return;
    }

    console.log('📋 Current profile:', {
      email: existingProfile.email,
      username: existingProfile.username,
      account_type: existingProfile.account_type,
      moderator: existingProfile.moderator
    });

    if (existingProfile.moderator) {
      console.log('✅ User is already a moderator!');
      return;
    }

    // Update the user to moderator
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ moderator: true })
      .eq('id', TARGET_USER_UUID);

    if (updateError) {
      console.error('❌ Error updating user to moderator:', updateError.message);
      return;
    }

    console.log('🎉 Successfully upgraded user to moderator!');
    console.log('📧 Email:', existingProfile.email);
    console.log('👤 Username:', existingProfile.username);
    console.log('🛡️ Moderator status: true');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function revokeModerator() {
  try {
    console.log('🔄 Revoking moderator status...');
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ moderator: false })
      .eq('id', TARGET_USER_UUID);

    if (updateError) {
      console.error('❌ Error revoking moderator status:', updateError.message);
      return;
    }

    console.log('✅ Successfully revoked moderator status!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Main execution
async function main() {
  if (TARGET_USER_UUID === 'YOUR-UUID-HERE') {
    console.log('⚠️  Please replace TARGET_USER_UUID with your actual user UUID');
    console.log('💡 You can find your UUID in the Supabase auth.users table or after signing up');
    return;
  }

  const action = process.argv[2];
  
  if (action === 'revoke') {
    await revokeModerator();
  } else {
    await upgradeModerator();
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { upgradeModerator, revokeModerator };