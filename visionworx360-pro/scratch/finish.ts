import { createClient } from "@supabase/supabase-js";
import { buildProjectPricing } from "@/features/estimating/services/estimateCommit.server";
import { analyzeDescription, buildAssumptions, buildScenarios } from "@/domains/remoteVision";
import { buildRemoteVisionCommit, buildBallparkSnapshot, buildCommitSession } from "@/domains/remoteVision/commitPayload";
import { writeFileSync } from "fs";

const PROJECT = "7fade42d-8ae2-4f30-a1e7-7cf2725060d8";
const ORG = "41cf1d3e-7bca-4fd6-a2a3-d971bf2f6a3d";
const raw: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const pricing = await buildProjectPricing(raw, PROJECT, ORG);
writeFileSync("/tmp/pricing.json", JSON.stringify(pricing));
console.log("pricing keys", pricing ? Object.keys(pricing) : null);
