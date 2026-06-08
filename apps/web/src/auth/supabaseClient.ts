import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether multi-tenant auth is configured. When false the app runs without a
 * login wall (single-tenant), matching the API's single-tenant fallback.
 */
export const authEnabled = Boolean(url && anonKey);

// The anon key is public by design; RLS + the API's ownership checks protect data.
export const supabase: SupabaseClient | null = authEnabled
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

/** Authorization header for API calls — {} when auth is disabled or no session. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
