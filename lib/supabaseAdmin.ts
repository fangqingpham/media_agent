import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — use ONLY in server code (route handlers,
// services). The "server-only" import makes the build FAIL if this file is ever
// imported into client/browser code, protecting the secret key from leaking.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
