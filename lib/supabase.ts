// Supabase client — initialised once with env-var keys
// Falls back gracefully to null if keys are missing (app uses localStorage only)

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "";
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
