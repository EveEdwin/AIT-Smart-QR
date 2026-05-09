import { createClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

const supabaseUrl = env.VITE_SUPABASE_URL ?? "https://invalid.supabase.co";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? "invalid-anon-key";

export const supabaseStorageBucket = env.VITE_SUPABASE_STORAGE_BUCKET ?? "artifacts";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});