import { createClient } from "@supabase/supabase-js";
const raw = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const P="7fade42d-8ae2-4f30-a1e7-7cf2725060d8";
const { data } = await raw.from("project_narrative_scopes").select("*").eq("project_id", P);
console.log(JSON.stringify(data, null, 1).slice(0, 4000));
