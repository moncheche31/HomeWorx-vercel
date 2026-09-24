import { analyzeDescription } from "../src/domains/remoteVision/analyze";
const text = `Okay, what we're doing here is we're demoing the old deck. It's a 10 by 14 deck, and we're going to rebuild it in the same spot. Another 10 by 14 deck with composite decking, vinyl railings, vinyl trim, vinyl lattice underneath the deck. The railings will be, as I said, vinyl railings with black aluminum balusters. I'm going to rebuild it in the same spot as it is. Again, it's a 10 by 14 rebuild of a deck, so just to recap, it's a 10 by 14 rebuild of a deck in the same spot. Only this time it's going to be composite decking with vinyl railings.`;
const r: any = analyzeDescription({ description: text, locale: "en-US", media: [], dimensions: [], answers: {} } as any);
console.log(Object.keys(r));
for (const g of r.grounded?.explicit ?? []) console.log(g.featureKey, g.quantity, g.pricingQuantity, g.unitKey);
