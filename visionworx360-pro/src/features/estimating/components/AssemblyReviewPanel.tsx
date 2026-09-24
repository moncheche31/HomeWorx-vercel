/**
 * ASSEMBLY REVIEW PANEL.
 *
 * Shows the model-generated component list for one estimate line. The
 * contractor includes/excludes components and sets quantities; only after
 * "Approve" may the components become real priced child lines, and every
 * dollar then comes from the Craftsman book — never from the model.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  useExpandLineAssembly,
  useLineAssembly,
  useMaterializeAssembly,
  useReviewAssemblyExpansion,
} from "../hooks/useAssemblyExpansion";
import { isExpansionEnabledForTrade } from "../services/assemblyExpansion.shared";
import { geometryFieldsForTrade } from "../services/assemblyQuantities";
import type { EstimateLineDTO } from "../types";

export function AssemblyExpansionBadge({ line }: { line: EstimateLineDTO }) {
  if (line.assemblyExpansionStatus !== "auto_expanded_unreviewed") return null;
  return (
    <Badge
      variant="outline"
      data-testid="line-assembly-unreviewed"
      className="border-warning/40 font-normal text-warning"
    >
      Auto-expanded, unreviewed
    </Badge>
  );
}

export function AssemblyReviewPanel({
  line,
  readOnly,
}: {
  line: EstimateLineDTO;
  readOnly: boolean;
}) {
  const eligible = isExpansionEnabledForTrade(line.tradeKey, line.description) && !line.parentLineId;
  const { data, isLoading } = useLineAssembly(line.id, eligible);
  const expand = useExpandLineAssembly(line.estimateId);
  const review = useReviewAssemblyExpansion(line.id, line.estimateId);
  const materialize = useMaterializeAssembly(line.estimateId);

  const [included, setIncluded] = useState<Record<string, boolean>>({});
  /** Every box shows a number. `touched` records which ones the contractor changed. */
  const [qty, setQty] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const [geom, setGeom] = useState<Record<string, string>>({});
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    if (!data) return;
    setIncluded(Object.fromEntries(data.components.map((c) => [c.id, c.isIncluded])));
    setQty(
      Object.fromEntries(
        data.components.map((c) => [
          c.id,
          c.resolvedQuantity != null ? String(c.resolvedQuantity) : "",
        ]),
      ),
    );
    setTouched({});
    setPicked(Object.fromEntries(data.components.map((c) => [c.id, c.selectedReferenceId])));

    setGeom(
      Object.fromEntries(
        geometryFieldsForTrade(data.tradeKey).map((f) => {
          const v = data.lineGeometry?.[f.key];
          return [f.key, v == null ? "" : String(v)];
        }),
      ),
    );
  }, [data]);

  if (!eligible) return null;

  const busy = expand.isPending || review.isPending || materialize.isPending;
  const geometryFields = data ? geometryFieldsForTrade(data.tradeKey) : [];

  /* THE PANEL IS A GLANCE, NOT A TAKEOFF. Every included component arrives
     quantified and priced: a clean book row, the engine's own judgment on a
     borderline row, or a labelled material estimate. Nothing here blocks
     approval — the radios and the quantity boxes are corrections, not gates. */
  const isIncludedNow = (id: string, fallback: boolean) => included[id] ?? fallback;
  const componentsIn = (data?.components ?? []).filter((c) => isIncludedNow(c.id, c.isIncluded));
  const previewTotal = componentsIn.reduce((sum, c) => sum + (c.estimatedCost ?? 0), 0);
  const estimatedCount = componentsIn.filter((c) => c.costSource === "estimate_on_approval").length;
  const autoOff = (data?.components ?? []).filter(
    (c) => c.autoExcludedNoQuantity && !isIncludedNow(c.id, c.isIncluded),
  ).length;


  const geometryPayload = () =>
    Object.fromEntries(
      geometryFields.map((f) => [f.key, geom[f.key]?.trim() ? Number(geom[f.key]) : null]),
    ) as Record<string, number | null>;

  const saveReview = async (markReviewed: boolean) => {
    if (!data) return;
    /* Only a quantity the contractor actually typed is sent. A blank field
       means "use the calculated default", so an approval never silently
       re-stamps an assumption as a contractor measurement. */
    const components = data.components.map((c) => ({
      id: c.id,
      isIncluded: included[c.id] ?? c.isIncluded,
      quantity:
        touched[c.id] && qty[c.id]?.trim()
          ? Number(qty[c.id])
          : c.quantitySource === "contractor"
            ? c.resolvedQuantity
            : null,

      selectedReferenceId: picked[c.id] ?? null,
    }));

    await review.mutateAsync({
      expansionId: data.id,
      estimateLineId: line.id,
      components,
      geometry: geometryPayload(),
      markReviewed,
    });
    if (!markReviewed) {
      toast.success("Assembly changes saved");
      return;
    }
    const result = await materialize.mutateAsync(line.id);
    toast.success(
      `Assembly approved: ${result.linesCreated} component lines added, ${result.pricedFromBook} priced from the book, ${result.contractorResolved} from your book selections, ${result.flaggedNeedsData} flagged for data.`,
    );
  };




  return (
    <section
      data-testid="assembly-review-panel"
      className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-foreground-muted" aria-hidden />
          <p className="text-xs font-medium">
            {data?.assemblyLabel ?? "Complete assembly"}
          </p>
          {data ? (
            <Badge
              variant="outline"
              className={
                data.reviewStatus === "reviewed"
                  ? "font-normal"
                  : "border-warning/40 font-normal text-warning"
              }
            >
              {data.reviewStatus === "reviewed" ? "Reviewed" : "Auto-expanded, unreviewed"}
            </Badge>
          ) : null}
        </div>
        {!readOnly ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              expand
                .mutateAsync({ estimateLineId: line.id, regenerate: !!data })
                .then((d) =>
                  d.components.length
                    ? toast.success(`${d.components.length} assembly components listed`)
                    : toast.error("The assembly list is not available right now"),
                )
                .catch((e: Error) => toast.error(e.message))
            }
          >
            {busy ? (
              <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-1 size-4" aria-hidden />
            )}
            {data ? "Regenerate" : "Expand assembly"}
          </Button>
        ) : null}
      </div>

      {isLoading ? <p className="mt-2 text-[11px] text-foreground-muted">Loading assembly…</p> : null}

      {data && data.parentQuantityIsPlaceholder ? (
        <p
          className="mt-2 rounded-md border border-warning/40 bg-warning/5 px-2 py-1.5 text-[11px] text-warning"
          data-testid="assembly-unconfirmed-base"
        >
          Components estimated from an unconfirmed {line.description.toLowerCase()} size (
          {line.quantity} {line.unitKey ?? ""}) — confirm the actual size for an accurate assembly.
        </p>
      ) : null}

      {data && data.components.length > 0 ? (

        <>
          {data.mode === "ballpark" ? (
            <p className="mt-2 text-[11px] text-foreground-muted" data-testid="assembly-ballpark-note">
              Ballpark estimate: quantities we don&apos;t have a measurement for are assumed from a
              typical rectangular building and labelled below. Nothing here needs your input.
            </p>
          ) : null}

          {geometryFields.length > 0 ? (
            <div className="mt-3 rounded-md border border-border/70 bg-surface px-3 py-2" data-testid="assembly-takeoff">
              <button
                type="button"
                className="text-[11px] font-medium underline"
                data-testid="assembly-refine-toggle"
                onClick={() => setRefining((v) => !v)}
              >
                {refining ? "Hide refinement" : "Refine for a detailed estimate (optional)"}
              </button>
              {refining ? (
                <>
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    Optional. Enter any measurement you actually have for this job and it replaces
                    the ballpark assumption for every component that uses it.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {geometryFields.map((f) => (
                      <label key={f.key} className="text-[11px]">
                        <span className="block text-foreground-muted">
                          {f.label} ({f.unit})
                        </span>
                        <Input
                          aria-label={f.label}
                          type="number"
                          min="0"
                          inputMode="decimal"
                          disabled={readOnly}
                          className="h-9 w-28 tabular-nums"
                          value={geom[f.key] ?? ""}
                          onChange={(e) => setGeom((s) => ({ ...s, [f.key]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  {!readOnly ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={busy}
                      data-testid="assembly-apply-takeoff"
                      onClick={() => void saveReview(false)}
                    >
                      Calculate quantities
                    </Button>
                  ) : null}
                </>
              ) : null}
              {autoOff > 0 ? (
                <p className="mt-2 text-[11px] text-foreground-muted">
                  {autoOff} job-specific component{autoOff === 1 ? " is" : "s are"} switched off
                  because there is no standard ratio for {autoOff === 1 ? "it" : "them"}. Tick one on
                  and enter a figure if this job has that work.
                </p>
              ) : null}
            </div>

          ) : null}


          <ul className="mt-3 space-y-2">

            {data.components.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-2" data-testid="assembly-component">
                <Checkbox
                  id={`inc-${c.id}`}
                  className="mt-1"
                  disabled={readOnly}
                  checked={included[c.id] ?? c.isIncluded}
                  onCheckedChange={(v) => setIncluded((s) => ({ ...s, [c.id]: v === true }))}
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`inc-${c.id}`} className="text-xs font-medium">
                    {c.sequence}. {c.name}
                  </label>
                  <p className="text-[11px] text-foreground-muted">
                    {c.reason ?? ""}
                    {c.inclusion !== "standard" ? ` · ${c.inclusion.replace(/_/g, " ")}` : ""}
                  </p>
                  <p className="text-[11px] text-foreground-muted">
                    {c.bookMatch
                      ? `Book: ${c.bookMatch.description} (${c.bookMatch.unit ?? "—"})${
                          c.bookMatch.isContractorSelected
                            ? " · you chose this row"
                            : c.bookMatch.isAmbiguous
                              ? " · unsure match — pick the right row below"
                              : ""
                        }`
                      : "No book match — will be flagged for pricing data"}
                  </p>

                  {/* An unsure match is a live choice, not a dead end: the
                      contractor picks the right book row and it prices. */}
                  {!readOnly && c.bookCandidates.length > 0 && (!c.bookMatch || c.bookMatch.isAmbiguous || c.bookMatch.isContractorSelected) ? (
                    <fieldset
                      className="mt-1 space-y-1"
                      data-testid="assembly-book-candidates"
                    >
                      <legend className="sr-only">Book row for {c.name}</legend>
                      {c.bookCandidates.map((cand) => (
                        <label
                          key={cand.referenceId}
                          className="flex cursor-pointer items-start gap-2 text-[11px]"
                        >
                          <input
                            type="radio"
                            className="mt-[3px]"
                            name={`book-${c.id}`}
                            checked={(picked[c.id] ?? null) === cand.referenceId}
                            onChange={() => setPicked((s) => ({ ...s, [c.id]: cand.referenceId }))}
                          />
                          <span className="min-w-0">
                            {cand.description}{" "}
                            <span className="text-foreground-muted">
                              ({cand.unit ?? "—"}
                              {cand.material != null ? ` · mat ${cand.material}` : ""}
                              {cand.labor != null ? ` · lab ${cand.labor}` : ""}
                              {cand.craftHours ? ` · ${cand.craftHours}` : ""})
                            </span>
                          </span>
                        </label>
                      ))}
                      {picked[c.id] != null ? (
                        <button
                          type="button"
                          className="text-[11px] underline text-foreground-muted"
                          onClick={() => setPicked((s) => ({ ...s, [c.id]: null }))}
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </fieldset>
                  ) : null}

                </div>


                <div className="w-32 shrink-0 text-right">
                  <Input
                    aria-label={`Quantity for ${c.name}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    className="h-9 w-28 tabular-nums"
                    placeholder="—"
                    disabled={readOnly}
                    value={qty[c.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQty((s) => ({ ...s, [c.id]: v }));
                      setTouched((s) => ({ ...s, [c.id]: true }));
                    }}
                  />
                  <p
                    className="mt-1 text-[10px] text-foreground-muted"
                    data-testid={`assembly-qty-${c.quantitySource}`}
                  >
                    {touched[c.id]
                      ? "Your figure"
                      : c.quantitySource === "contractor"
                        ? "You entered this"
                        : c.quantitySource === "derived"
                          ? `Calculated: ${c.quantityDerivation}`
                          : c.quantitySource === "ballpark_default"
                            ? `Estimated from the parent quantity (${c.quantityDerivation}) — adjust if needed`
                            : "No standard ratio — off unless you enter a figure"}
                  </p>
                  <p className="mt-1 text-[11px] font-medium tabular-nums" data-testid="assembly-component-cost">
                    {c.estimatedCost != null
                      ? `$${c.estimatedCost.toLocaleString()}`
                      : c.costSource === "estimate_on_approval"
                        ? "Est. on approval"
                        : "—"}
                    {c.costSource === "book_preview" ? (
                      <span className="ml-1 font-normal text-foreground-muted">est.</span>
                    ) : null}
                  </p>
                </div>

              </li>
            ))}
          </ul>

          {!readOnly ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-foreground-muted" data-testid="assembly-approve-summary">
                {componentsIn.length} components included · about ${previewTotal.toLocaleString()}
                {estimatedCount > 0
                  ? ` · ${estimatedCount} material price${estimatedCount === 1 ? "" : "s"} estimated at approval`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveReview(false)}>
                  Save changes
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  data-testid="assembly-approve"
                  onClick={() => void saveReview(true)}
                >
                  {busy ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : null}
                  Approve &amp; price components
                </Button>
              </div>
            </div>
          ) : null}


        </>
      ) : null}
    </section>
  );
}
