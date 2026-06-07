"use client";
import { createClient } from "@supabase/supabase-js";

// Browser client. Uses the PUBLIC anon key — safe to ship to the browser.
// All access is still protected by Row Level Security in the database.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
