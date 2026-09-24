import { createClient } from "@supabase/supabase-js";
import { analyzeDescription, buildAssumptions, buildScenarios } from "@/domains/remoteVision";
import { buildRemoteVisionCommit } from "@/domains/remoteVision/commitPayload";
import { commitApprovedEstimateImpl } from "@/features/estimating/services/estimateCommit.server";

const PROJECT = "7fade42d-8ae2-4f30-a1e7-7cf2725060d8";
const raw = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
const userSb: any = createClient(process.env.SUPABASE_URL!, key, {
  global: { headers: { apikey: key, Authorization: `Bearer ${process.env.TOKEN}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: proj } = await raw.from("projects")
  .select("id, name, organization_id, created_by").eq("id", PROJECT).maybeSingle();
console.log("project", proj);
const org = (proj as any).organization_id as string;
const userId = (proj as any).created_by as string;

const sb: any = userSb;

const { data: narr } = await raw.from("project_narrative_scopes")
  .select("answers").eq("project_id", PROJECT).maybeSingle();
const replay = JSON.parse(((narr as any)?.answers?.__remoteVisionReplay) ?? "{}");
const text: string = replay.intakeText ?? "";
const confirmed = replay.confirmedMeasurements ?? [];
console.log("narrative:", JSON.stringify(text));

const result = await analyzeDescription({ providerId: "manual", locale: "en-US", description: text, media: [], confirmedMeasurements: confirmed } as any);
const assumptions = buildAssumptions(result as any, "en-US" as any);
const scenarios = buildScenarios(result as any, assumptions as any, "en-US" as any);
const scenario = (scenarios as any[]).find((s) => s.level === "standard") ?? (scenarios as any[])[0];
const payload = buildRemoteVisionCommit({
  projectId: PROJECT,
  grounded: (result as any).grounded ?? null,
  scenario,
  assumptions: assumptions as any,
  intakeText: text,
  narrativeText: text,
  replay: { scenarios },
} as any);
console.log("items", payload.items.length);
console.log("ballpark", payload.ballpark);
console.log(JSON.stringify(payload.items, null, 1));
const out = await commitApprovedEstimateImpl(sb, userId, payload as any);
console.log(out);
