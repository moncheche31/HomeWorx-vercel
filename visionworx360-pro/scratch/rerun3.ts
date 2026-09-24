import { analyzeDescription, collectFeatures } from "../src/domains/remoteVision/analyze";
import { recognizeWork } from "../src/domains/workRecognition";
const NEW = `Okay, what we're doing here is we're demoing the old deck. It's a 10 by 14 deck, and we're going to rebuild it in the same spot. Another 10 by 14 deck with composite decking, vinyl railings, vinyl trim, vinyl lattice underneath the deck. The railings will be, as I said, vinyl railings with black aluminum balusters. I'm going to rebuild it in the same spot as it is. Again, it's a 10 by 14 rebuild of a deck, so just to recap, it's a 10 by 14 rebuild of a deck in the same spot. Only this time it's going to be composite decking with vinyl railings.`;
for (const [label, text] of [["by", NEW], ["x", NEW.replace(/10 by 14/g, "10x14")]] as const) {
  const w = recognizeWork({ text });
  console.log("==", label, "work:", w.items.map(i => `${i.workTypeKey}=${i.quantity}${i.unitKey ?? ""}${i.isAllowance ? "(allow)" : ""}`).join(", "));
  const r: any = analyzeDescription({ description: text, media: [], locale: "en-US" } as never);
  console.log("   features:", collectFeatures(r).map((f: any) => `${f.featureKey}=${f.quantity}`).join(", "));
}
