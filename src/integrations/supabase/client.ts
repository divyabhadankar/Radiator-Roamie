// Supabase client — Radiator Routes
// Project: abaypbqynikfcdzrfelp
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://abaypbqynikfcdzrfelp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_rFpB15J24KX6ES18ATCVbw_s0Lknqip";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
