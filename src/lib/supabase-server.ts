import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client. Do not import from Client Components.
 * Uses anon key by default; pass { admin: true } to use service role.
 */
export function getServerSupabase(opts: { admin?: boolean } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  const key = opts.admin ? svc : anon;
  if (!key)
    throw new Error(
      opts.admin
        ? "Missing SUPABASE_SERVICE_ROLE_KEY"
        : "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  return createClient(url, key, { auth: { persistSession: false } });
}
