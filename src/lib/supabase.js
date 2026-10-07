import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

supabase
  .from("semesters")
  .select("year, term")
  .order("year")
  .order("term")
  .limit(3)
  .then(({ data, error }) => {
    if (error) {
      console.error("Supabase frontend test failed:", error);
    } else {
      console.log("Supabase frontend test successful:", data);
    }
  });
