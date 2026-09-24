import { analyzeDescription, collectFeatures } from "@/domains/remoteVision/analyze";
import { schemaForScope, signalsFromNarrative } from "@/domains/ballpark";
const TEXT = "Okay, so this project is actually three little handyman projects. The first is the exterior. Remove and replace approximately 56 linear feet of 1x6 fascia, which includes a 1x2 shadow board. All of these three little handyman projects will be labor-only quotes. The fascia will be painted also. The second little handyman project is we're going to put a 2-inch thick rigid foam insulation on the ceiling in the basement there. That basement measures approximately 10 feet by 21 feet. We're going to seal all the seams with tape and then spray foam the perimeter gaps. We're going to screw the rigid foam up to the ceiling with screws and washers. The third little handyman project is that bathroom hole in the wall. That's a plumbing chase. We're going to build an access door, which measures approximately 19 inches by 42 inches tall. We're going to build it out of 1x4 lumber with a quarter-inch thick plywood back, and we're going to put some hinges on it and paint it white to match the trim.";
const r: any = analyzeDescription({ description: TEXT, locale: "en-US", media: [] } as any);
console.log("FEATURES", collectFeatures(r).map((f:any)=>f.featureKey));
const g = r.grounded;
for (const k of ["explicit","incidental"]) for (const i of (g?.[k] ?? [])) console.log(k, i.featureKey, i.quantity, i.unitKey, "|", i.provenance?.source, "|", i.provenance?.rationale);
console.log("QUESTIONS", schemaForScope(signalsFromNarrative(TEXT)).questions.map((q:any)=>q.id));
console.log("REJECTED", (r.grounded?.rejected ?? []).map((x:any)=>[x.featureKey,x.reason]));
console.log("EXCLUSIONS", (r.grounded?.exclusions ?? []).map((x:any)=>[x.label,x.evidence]));
console.log("ROOMSCALING", r.grounded?.roomScaling);
console.log("DIMENSIONS", r.grounded?.dimensions);
import { buildCurrentProjectScopeContext } from "@/domains/workScope";
import { GARAGE_CONVERSION_SCHEMA } from "@/domains/ballpark/questions";
const ctx = buildCurrentProjectScopeContext({
  projectId: "p1",
  narrativeText: TEXT,
  groundedItems: (g?.explicit ?? []).map((i:any)=>({ key:i.featureKey, title:i.label, description:i.evidence })),
} as any, GARAGE_CONVERSION_SCHEMA);
console.log("APP QUESTIONS", ctx.questions.map(q=>q.id), "domains", ctx.domains);
