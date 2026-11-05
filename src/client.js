import { SUPABASE_URL, SUPABASE_ANON_KEY, configured } from "./config.js";
export { configured };
let supabasePromise;
export async function getClient(){
  if(!configured) throw new Error("This app has not been connected to Supabase yet.");
  if(!supabasePromise) supabasePromise=import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(m=>m.createClient(SUPABASE_URL,SUPABASE_ANON_KEY));
  return supabasePromise;
}