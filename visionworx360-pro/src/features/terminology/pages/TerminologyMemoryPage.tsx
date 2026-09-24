import { useMemo, useState } from "react";
import { BookMarked, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CORRECTION_CONTEXTS,
  applyTerminologyMemory,
  validateProposedCorrection,
  type CorrectionContext,
} from "@/domains/terminologyMemory";
import {
  useTerminologyCorrectionMutations,
  useTerminologyCorrectionsQuery,
} from "../hooks/useTerminologyCorrections";

/**
 * Correction memory, in plain language: "when the app says X, I mean Y".
 * Teach it once here (or from a scope screen) and every later project checks
 * this list before writing its own wording.
 */
export function TerminologyMemoryPage() {
  const query = useTerminologyCorrectionsQuery();
  const m = useTerminologyCorrectionMutations();

  const [wrongTerm, setWrongTerm] = useState("");
  const [correctedTerm, setCorrectedTerm] = useState("");
  const [triggerPhrase, setTriggerPhrase] = useState("");
  const [contextScope, setContextScope] = useState<CorrectionContext>("any");
  const [tradeKey, setTradeKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const corrections = query.data ?? [];

  /* Live proof the rule does what he expects, before he saves it. */
  const preview = useMemo(() => {
    if (!wrongTerm.trim() || !correctedTerm.trim()) return null;
    const { term } = applyTerminologyMemory(
      [
        {
          id: "preview",
          wrongTerm,
          correctedTerm,
          triggerPhrase: triggerPhrase.trim() || null,
          contextScope,
          tradeKey: tradeKey.trim() || null,
          captureMethod: "explicit_correction",
          isActive: true,
        },
      ],
      {
        candidateTerm: `Install ${wrongTerm.trim()} (approximately 48 linear feet)`,
        narration: triggerPhrase,
        context: contextScope,
        tradeKey: tradeKey.trim() || null,
      },
    );
    return term;
  }, [wrongTerm, correctedTerm, triggerPhrase, contextScope, tradeKey]);

  const onSave = async () => {
    const verdict = validateProposedCorrection({ wrongTerm, correctedTerm });
    if (!verdict.ok) {
      setError(verdict.reason);
      return;
    }
    setError(null);
    try {
      await m.save.mutateAsync({
        wrongTerm: wrongTerm.trim(),
        correctedTerm: correctedTerm.trim(),
        triggerPhrase: triggerPhrase.trim() || null,
        contextScope,
        tradeKey: tradeKey.trim() || null,
        captureMethod: "explicit_correction",
      });
      setWrongTerm("");
      setCorrectedTerm("");
      setTriggerPhrase("");
      setTradeKey("");
      setContextScope("any");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that correction.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BookMarked className="size-5 text-primary" aria-hidden />
          Correction memory
        </h1>
        <p className="text-sm text-muted-foreground">
          Teach the app your wording once. Every new scope checks these corrections before it
          writes its own words or picks a cost-book category.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a correction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wrong-term">When the app says</Label>
              <Input
                id="wrong-term"
                value={wrongTerm}
                onChange={(e) => setWrongTerm(e.target.value)}
                placeholder="baseboard and casing trim"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="corrected-term">I mean</Label>
              <Input
                id="corrected-term"
                value={correctedTerm}
                onChange={(e) => setCorrectedTerm(e.target.value)}
                placeholder="vinyl trim around the deck edge"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trigger-phrase">Only when I say (optional)</Label>
              <Input
                id="trigger-phrase"
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder="vinyl trim"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-key">Only on this trade (optional)</Label>
              <Input
                id="trade-key"
                value={tradeKey}
                onChange={(e) => setTradeKey(e.target.value)}
                placeholder="siding"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="context-scope">Applies to</Label>
              <Select
                value={contextScope}
                onValueChange={(v) => setContextScope(v as CorrectionContext)}
              >
                <SelectTrigger id="context-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_CONTEXTS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === "any" ? "Any work" : c === "interior" ? "Interior work" : "Exterior work"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {preview ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Preview: <span className="text-foreground">{preview}</span>
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button onClick={onSave} disabled={m.save.isPending}>
            {m.save.isPending ? "Saving…" : "Save correction"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved corrections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : corrections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No corrections saved yet. The first one you add starts teaching the app your
              vocabulary.
            </p>
          ) : (
            corrections.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">
                    <span className="line-through text-muted-foreground">{c.wrongTerm}</span>{" "}
                    <span aria-hidden>→</span>{" "}
                    <span className="font-medium">{c.correctedTerm}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {c.contextScope === "any" ? "Any work" : `${c.contextScope} work`}
                    </Badge>
                    {c.tradeKey ? <Badge variant="outline">{c.tradeKey}</Badge> : null}
                    {c.triggerPhrase ? (
                      <Badge variant="outline">when I say “{c.triggerPhrase}”</Badge>
                    ) : null}
                    <Badge variant="outline">used {c.appliedCount}×</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={c.isActive}
                    aria-label="Correction active"
                    onCheckedChange={(isActive) =>
                      m.setActive.mutate({ id: c.id, isActive })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete correction"
                    onClick={() => m.remove.mutate({ id: c.id })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
