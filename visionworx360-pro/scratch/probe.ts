import { analyzeDescription } from "@/domains/remoteVision/analyze";
import { buildScenarios } from "@/domains/remoteVision/scenarios";
const text = `We're gonna be removing the two closets in this bedroom. Each closet is about six feet width. Then we're gonna remove that green wall. It's about six foot length of wall. We need to install a double LVL beam, about 26 foot. Two columns to support it. Then built-in bookcases on the backside of that range hood.`;
const res = await analyzeDescription({ providerId: "test", locale: "en-US", description: text, media: [], confirmedMeasurements: [] } as any);
for (const bucket of ["structuralChanges","cabinets","mechanicalChanges","appliances","finishes","other"] as const) {
  for (const f of ((res as any)[bucket] ?? [])) console.log(bucket, f.featureKey, f.quantity, f.pricingQuantity, f.unitKey, f.provenance?.source);
}
const sc = buildScenarios(res as any, [], "en-US" as any);
console.log(JSON.stringify(sc, null, 1).slice(0, 3000));
