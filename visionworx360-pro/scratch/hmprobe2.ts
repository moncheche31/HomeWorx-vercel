import { admitScope } from "@/domains/scopeAdmission";
import { actionForSubject, isContextOnlyMention, subjectForFeatureKey } from "@/domains/remoteVision/ontology";
import { splitClauses } from "@/domains/workRecognition/recognize";
const TEXT = "Okay, so this project is actually three little handyman projects. The first is the exterior. Remove and replace approximately 56 linear feet of 1x6 fascia, which includes a 1x2 shadow board. All of these three little handyman projects will be labor-only quotes. The fascia will be painted also. The second little handyman project is we're going to put a 2-inch thick rigid foam insulation on the ceiling in the basement there. That basement measures approximately 10 feet by 21 feet. We're going to seal all the seams with tape and then spray foam the perimeter gaps. We're going to screw the rigid foam up to the ceiling with screws and washers. The third little handyman project is that bathroom hole in the wall. That's a plumbing chase. We're going to build an access door, which measures approximately 19 inches by 42 inches tall. We're going to build it out of 1x4 lumber with a quarter-inch thick plywood back, and we're going to put some hinges on it and paint it white to match the trim.";
for (const fk of ["insulation.install","doors.replace","paint.interior","mechanical.plumbing"]) {
  const s = subjectForFeatureKey(fk)!;
  console.log("=== ", fk, s?.subjectKey);
  for (const c of splitClauses(TEXT)) {
    if (!s.aliases.some(a => new RegExp("\\b"+a.replace(/\s+/g,"\\s+"),"i").test(c))) continue;
    console.log("  clause:", JSON.stringify(c.slice(0,90)), "| ctx:", isContextOnlyMention(s,c), "| action:", actionForSubject(s,c));
  }
}
