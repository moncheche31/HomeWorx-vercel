import { useMemo } from "react";
import {
  featureCoverage,
  tradeCoverage,
  unbackedTrades,
  type AllowanceScaleVerdict,
} from "@/domains/qa/tradeCoverage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SCALE_LABEL: Record<AllowanceScaleVerdict, string> = {
  whole_structure: "Whole building",
  room_scale: "Room / component",
  site_structure: "One outdoor structure",
  not_applicable: "Counted — no allowance",
  missing: "Missing",
};

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "secondary" : "destructive"} className="min-w-10 justify-center">
      {value ? "Yes" : "No"}
    </Badge>
  );
}

/**
 * Internal QA surface: the live trade-coverage checklist. It is computed from
 * the real lexicon / ontology / catalog registries, so it can never drift out
 * of date the way a written audit does.
 */
export function TradeCoveragePage() {
  const trades = useMemo(() => tradeCoverage(), []);
  const features = useMemo(() => featureCoverage(), []);
  const gaps = useMemo(() => unbackedTrades(), []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trade coverage audit</h1>
        <p className="text-muted-foreground text-sm">
          Every trade this app claims to estimate, checked against what the engine can actually
          recognize, price, and size. Computed live — no manual upkeep.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gaps needing attention</CardTitle>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every listed trade is recognized and priced.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {gaps.map((t) => (
                <li key={t.tradeKey}>
                  <span className="font-medium">{t.tradeKey}</span>
                  <span className="text-muted-foreground"> — {t.notes.join(" ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By trade</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="py-2 pr-3">Trade</th>
                <th className="py-2 pr-3">Recognized</th>
                <th className="py-2 pr-3">Priced</th>
                <th className="py-2 pr-3">Scale realistic</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.tradeKey} className="border-border/60 border-t align-top">
                  <td className="py-2 pr-3 font-medium">{t.tradeKey}</td>
                  <td className="py-2 pr-3">
                    <YesNo value={t.recognized} />
                  </td>
                  <td className="py-2 pr-3">
                    <YesNo value={t.priced} />
                  </td>
                  <td className="py-2 pr-3">
                    <YesNo value={t.allowanceRealistic} />
                  </td>
                  <td className="text-muted-foreground py-2">{t.notes.join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By recognized work item</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="py-2 pr-3">Work</th>
                <th className="py-2 pr-3">Trade</th>
                <th className="py-2 pr-3">Ontology</th>
                <th className="py-2 pr-3">Priced</th>
                <th className="py-2 pr-3">Allowance</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.featureKey} className="border-border/60 border-t align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-muted-foreground text-xs">{f.featureKey}</div>
                  </td>
                  <td className="py-2 pr-3">{f.tradeKey}</td>
                  <td className="py-2 pr-3">
                    <YesNo value={f.hasOntologySubject} />
                  </td>
                  <td className="py-2 pr-3">
                    <YesNo value={f.priced} />
                  </td>
                  <td className="py-2 pr-3">
                    <div>{SCALE_LABEL[f.allowanceScale]}</div>
                    {f.allowanceQuantity != null && (
                      <div className="text-muted-foreground text-xs">
                        {f.allowanceQuantity.toLocaleString()} {f.unitKey?.replace("_", " ")}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2">{f.notes.join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
