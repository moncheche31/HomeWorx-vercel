import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/feedback/EmptyState";
import {
  KNOWLEDGE_ENTRIES,
  getKnowledgeEngine,
  type Bilingual,
  type KnowledgeConfidence,
  type KnowledgeItem,
  type KnowledgeLocale,
  type KnowledgeNote,
  type KnowledgeQuery,
  type ResolvedKnowledgeEntry,
} from "@/domains/knowledge";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE: Record<KnowledgeConfidence, string> = {
  high: "border-[color:var(--confidence-high)]/40 bg-[color:var(--confidence-high)]/10 text-[color:var(--confidence-high)]",
  medium:
    "border-[color:var(--confidence-medium)]/50 bg-[color:var(--confidence-medium)]/15 text-[color:var(--confidence-medium)]",
  optional:
    "border-[color:var(--confidence-verified)]/40 bg-[color:var(--confidence-verified)]/10 text-[color:var(--confidence-verified)]",
  contractor_decision_required:
    "border-[color:var(--confidence-low)]/50 bg-[color:var(--confidence-low)]/15 text-[color:var(--confidence-low)]",
};

function useLocale(): KnowledgeLocale {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("es") ? "es-US" : "en-US";
}

function ConfidencePill({ level }: { level: KnowledgeConfidence }) {
  const { t } = useTranslation("knowledge");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        CONFIDENCE_TONE[level],
      )}
      title={t(`confidence.${level}.explanation`)}
    >
      {t(`confidence.${level}.label`)}
    </span>
  );
}

function ItemRow({
  item,
  locale,
  customerView,
}: {
  item: KnowledgeItem & { reason?: Bilingual };
  locale: KnowledgeLocale;
  customerView: boolean;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {customerView ? item.customerLabel[locale] : item.label[locale]}
        </p>
        {!customerView ? <ConfidencePill level={item.confidence} /> : null}
      </div>
      <p className="mt-1 text-sm text-foreground-muted">
        {customerView
          ? item.customerValueStatement[locale]
          : (item.reason ?? item.contractorRationale)[locale]}
      </p>
    </li>
  );
}

function NoteList({ notes, locale }: { notes: KnowledgeNote[]; locale: KnowledgeLocale }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((note) => (
        <li key={note.noteKey} className="text-sm text-foreground-muted">
          • {note.text[locale]}
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className="text-[10px]">
          {count}
        </Badge>
      </div>
      {children}
    </section>
  );
}

function EntryDetail({
  resolved,
  locale,
  customerView,
}: {
  resolved: ResolvedKnowledgeEntry;
  locale: KnowledgeLocale;
  customerView: boolean;
}) {
  const { t } = useTranslation("knowledge");
  const { entry } = resolved;

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{entry.label[locale]}</CardTitle>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {t(`entry.kind.${entry.kind}`)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {t(`entry.source.${entry.sourceType}`)}
          </Badge>
        </div>
        <p className="text-xs uppercase tracking-wide text-foreground-muted">
          {entry.tradeKey} · {entry.categoryKey}
        </p>

        {!customerView ? (
          <p className="text-xs text-foreground-muted">
            <span className="font-medium">{t("entry.triggers")}:</span>{" "}
            {entry.triggerTerms.join(", ")}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5">
        {customerView ? (
          <Section
            title={t("sections.customerValue")}
            count={resolved.customerValueStatements.length}
          >
            <ul className="space-y-1.5">
              {resolved.customerValueStatements.map((s, i) => (
                <li key={i} className="text-sm text-foreground-muted">
                  • {s[locale]}
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <>
            <Section title={t("sections.required")} count={resolved.requiredItems.length}>
              <ul className="space-y-2">
                {resolved.requiredItems.map((i) => (
                  <ItemRow key={i.itemKey} item={i} locale={locale} customerView={false} />
                ))}
              </ul>
            </Section>

            <Section title={t("sections.standard")} count={resolved.standardItems.length}>
              <ul className="space-y-2">
                {resolved.standardItems.map((i) => (
                  <ItemRow key={i.itemKey} item={i} locale={locale} customerView={false} />
                ))}
              </ul>
            </Section>

            <Section title={t("sections.omissions")} count={resolved.commonOmissions.length}>
              <ul className="space-y-2">
                {resolved.commonOmissions.map((i) => (
                  <ItemRow key={i.itemKey} item={i} locale={locale} customerView={false} />
                ))}
              </ul>
            </Section>

            <Section title={t("sections.recommended")} count={resolved.recommendedItems.length}>
              <ul className="space-y-2">
                {resolved.recommendedItems.map((i) => (
                  <ItemRow key={i.itemKey} item={i} locale={locale} customerView={false} />
                ))}
              </ul>
            </Section>

            <Section title={t("sections.upgrades")} count={resolved.upgrades.length}>
              <ul className="space-y-2">
                {resolved.upgrades.map((u) => (
                  <ItemRow key={u.itemKey} item={u} locale={locale} customerView={false} />
                ))}
              </ul>
            </Section>

            <Section title={t("sections.valueEngineering")} count={resolved.valueEngineering.length}>
              <ul className="space-y-2">
                {resolved.valueEngineering.map((v) => (
                  <li key={v.ruleKey} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {t("ve.swap", {
                          from: v.originalLabel[locale],
                          to: v.alternativeLabel[locale],
                        })}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {t(`impact.${v.costImpact}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground-muted">{v.tradeoff[locale]}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t("sections.sequencing")} count={entry.sequencingNotes.length}>
              <NoteList notes={entry.sequencingNotes} locale={locale} />
            </Section>
            <Section title={t("sections.safety")} count={entry.safetyNotes.length}>
              <NoteList notes={entry.safetyNotes} locale={locale} />
            </Section>
            <Section title={t("sections.code")} count={entry.codeReminders.length}>
              <NoteList notes={entry.codeReminders} locale={locale} />
            </Section>
            <Section title={t("sections.permits")} count={entry.permitReminders.length}>
              <NoteList notes={entry.permitReminders} locale={locale} />
            </Section>
            <Section title={t("sections.inspections")} count={entry.inspectionReminders.length}>
              <NoteList notes={entry.inspectionReminders} locale={locale} />
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Internal inspection surface for the deterministic Knowledge Engine. */
export function KnowledgeEnginePage() {
  const { t } = useTranslation("knowledge");
  const locale = useLocale();
  const engine = getKnowledgeEngine();
  const version = engine.version();

  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"contractor" | "customer">("contractor");
  const customerView = view === "customer";

  const results = useMemo<ResolvedKnowledgeEntry[]>(() => {
    if (text.trim().length > 0) {
      const query: KnowledgeQuery = { text };
      return engine
        .search(query)
        .map((m) => engine.getEntry(m.entryKey, query))
        .filter((r): r is ResolvedKnowledgeEntry => r !== null);
    }
    if (selected) {
      const resolved = engine.getEntry(selected);
      return resolved ? [resolved] : [];
    }
    return [];
  }, [engine, text, selected]);

  const searching = text.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{t("page.title")}</h1>
          <Badge variant="outline" className="text-[10px] uppercase">
            {t("page.version", { version: version.version })}
          </Badge>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {t("page.internal")}
          </Badge>
        </div>
        <p className="text-sm text-foreground-muted">{t("page.subtitle")}</p>
        <p className="text-xs text-foreground-muted">
          {t("page.entries", { count: KNOWLEDGE_ENTRIES.length })} ·{" "}
          {t("page.effective", { date: version.effectiveDate })} · {t("page.deterministic")}
        </p>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList className="w-full">
          <TabsTrigger className="min-h-11 flex-1" value="contractor">
            {t("view.contractor")}
          </TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1" value="customer">
            {t("view.customer")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <label htmlFor="knowledge-search" className="text-sm font-medium text-foreground">
          {t("search.label")}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
              aria-hidden
            />
            <Input
              id="knowledge-search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("search.placeholder")}
              className="min-h-11 pl-9"
            />
          </div>
          {text ? (
            <Button variant="ghost" className="min-h-11" onClick={() => setText("")}>
              <X className="size-4" aria-hidden />
              <span className="sr-only">{t("search.clear")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_ENTRIES.map((entry) => (
          <Button
            key={entry.entryKey}
            size="sm"
            variant={selected === entry.entryKey && !searching ? "default" : "outline"}
            className="min-h-11"
            onClick={() => {
              setText("");
              setSelected((prev) => (prev === entry.entryKey ? null : entry.entryKey));
            }}
          >
            {entry.label[locale]}
          </Button>
        ))}
      </div>

      {searching ? (
        <p className="text-sm text-foreground-muted">{t("search.resultsFor", { text })}</p>
      ) : null}

      {results.length === 0 ? (
        <EmptyState
          title={searching ? t("search.noMatch") : t("empty.title")}
          description={searching ? "" : t("empty.body")}
        />
      ) : (
        <div className="space-y-4">
          {results.map((resolved) => (
            <EntryDetail
              key={resolved.entry.entryKey}
              resolved={resolved}
              locale={locale}
              customerView={customerView}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("extensions.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-foreground-muted">{t("extensions.body")}</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "ai",
              "vision",
              "history",
              "regional",
              "codes",
              "permits",
              "supplier",
              "manufacturer",
              "learning",
            ].map((key) => (
              <Badge key={key} variant="outline" className="text-[10px]">
                {t(`extensions.${key}`)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
