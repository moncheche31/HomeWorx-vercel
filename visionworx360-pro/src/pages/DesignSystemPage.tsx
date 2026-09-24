import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Filter, Mic, Search } from "lucide-react";
import { toast } from "sonner";

import { BrandMark, CompactBrand } from "@/components/brand/BrandMark";
import {
  DangerNotice,
  InformationNotice,
  PermissionDeniedState,
  SuccessNotice,
  WarningNotice,
  ConfigurationErrorState,
} from "@/components/feedback/Notice";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { OfflineBanner } from "@/components/feedback/OfflineBanner";
import { InlineError } from "@/components/feedback/InlineError";
import { FullPageError } from "@/components/feedback/FullPageError";
import { VoiceActionButton, type VoiceActionState } from "@/components/voice/VoiceActionButton";
import { ConfidenceBadge } from "@/components/confidence/ConfidenceBadge";
import { CONFIDENCE_LEVELS } from "@/types/confidence";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import {
  formatCurrency,
  formatDate,
  formatFeetInches,
  formatNumber,
  formatPercent,
  formatTime,
  useLocale,
} from "@/i18n/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const voiceStates: VoiceActionState[] = [
  "idle",
  "listening",
  "paused",
  "processing",
  "complete",
  "permission_denied",
  "error",
  "disabled",
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
      <h2
        id={`${id}-h`}
        className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
      >
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
      <div className="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">{children}</div>
    </section>
  );
}

function Swatch({
  name,
  varName,
  fgVarName,
}: {
  name: string;
  varName: string;
  fgVarName?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <div
        className="flex h-16 items-end justify-end p-2 text-[10px] font-medium"
        style={{
          backgroundColor: `var(${varName})`,
          color: fgVarName ? `var(${fgVarName})` : undefined,
        }}
      >
        {fgVarName ? "Aa" : ""}
      </div>
      <div className="border-t border-border bg-surface px-2 py-1.5">
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        <code className="truncate text-[10px] text-foreground-muted">{varName}</code>
      </div>
    </div>
  );
}

export function DesignSystemPage() {
  const { t, i18n } = useTranslation(["design-system", "common", "navigation", "voice"]);
  const [voice, setVoice] = useState<VoiceActionState>("idle");
  const locale = useLocale();

  const swatch = (key: string) => t(`sections.colors.swatches.${key}`);

  const colorGroups = [
    {
      heading: t("sections.colors.groups.surfaces"),
      items: [
        { name: swatch("background"), varName: "--background", fg: "--foreground" },
        { name: swatch("surface"), varName: "--surface", fg: "--foreground" },
        { name: swatch("surfaceMuted"), varName: "--surface-muted", fg: "--foreground" },
        { name: swatch("surfaceElevated"), varName: "--surface-elevated", fg: "--foreground" },
      ],
    },
    {
      heading: t("sections.colors.groups.brand"),
      items: [
        { name: swatch("primary"), varName: "--primary", fg: "--primary-foreground" },
        { name: swatch("accent"), varName: "--accent", fg: "--accent-foreground" },
        { name: swatch("secondary"), varName: "--secondary", fg: "--secondary-foreground" },
        { name: swatch("border"), varName: "--border" },
      ],
    },
    {
      heading: t("sections.colors.groups.status"),
      items: [
        { name: swatch("success"), varName: "--success", fg: "--success-foreground" },
        { name: swatch("warning"), varName: "--warning", fg: "--warning-foreground" },
        { name: swatch("danger"), varName: "--danger", fg: "--danger-foreground" },
        { name: swatch("information"), varName: "--information", fg: "--information-foreground" },
      ],
    },
    {
      heading: t("sections.colors.groups.confidence"),
      items: [
        { name: swatch("verified"), varName: "--confidence-verified", fg: "--primary-foreground" },
        { name: swatch("high"), varName: "--confidence-high", fg: "--primary-foreground" },
        { name: swatch("medium"), varName: "--confidence-medium", fg: "--primary-foreground" },
        { name: swatch("low"), varName: "--confidence-low", fg: "--primary-foreground" },
        {
          name: swatch("needsConfirmation"),
          varName: "--confidence-needs-confirmation",
          fg: "--primary-foreground",
        },
      ],
    },
  ];

  const rows = [
    {
      name: t("sections.rows.alvarez.name"),
      meta: t("sections.rows.alvarez.meta"),
      amount: 12480,
      level: "high" as const,
    },
    {
      name: t("sections.rows.nguyen.name"),
      meta: t("sections.rows.nguyen.meta"),
      amount: 48200,
      level: "medium" as const,
    },
    {
      name: t("sections.rows.baker.name"),
      meta: t("sections.rows.baker.meta"),
      amount: 8900,
      level: "needs_confirmation" as const,
    },
  ];

  return (
    <main className="min-h-dvh bg-background pb-16">
      <header className="safe-top border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <CompactBrand />
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="compact" />
            <Link
              to="/"
              className="text-sm font-medium text-foreground-muted underline-offset-4 hover:underline"
            >
              {t("backHome")}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground-muted sm:text-base">
            {t("description")}
          </p>
        </div>

        {/* Localization */}
        <Section
          id="localization"
          title={t("sections.localization.title")}
          description={t("sections.localization.description")}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.localization.standard")}
                </p>
                <LanguageSwitcher />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.localization.compact")}
                </p>
                <LanguageSwitcher variant="compact" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.localization.currentLanguage")}
                </p>
                <p className="text-sm font-medium text-foreground">{i18n.language}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("sections.localization.formatting")}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {[
                  { k: "currency", v: formatCurrency(24875.5, locale) },
                  { k: "number", v: formatNumber(1248.5, locale) },
                  { k: "percent", v: formatPercent(0.184, locale) },
                  { k: "date", v: formatDate(new Date(), locale) },
                  { k: "time", v: formatTime(new Date(), locale) },
                  { k: "measurement", v: formatFeetInches(8.5, locale) },
                ].map((f) => (
                  <div key={f.k} className="rounded-md border border-border p-3">
                    <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                      {t(`sections.localization.${f.k}`)}
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums text-base text-foreground">{f.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("sections.localization.longLabel")}
              </p>
              <Button className="min-h-11 max-w-full whitespace-normal text-left">
                {t("sections.localization.longLabelSample")}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.localization.voiceStates")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {voiceStates.map((s) => (
                    <VoiceActionButton key={s} state={s} variant="compact" />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.localization.confidenceStates")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONFIDENCE_LEVELS.map((l) => (
                    <ConfidenceBadge key={l} level={l} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Brand */}
        <Section
          id="brand"
          title={t("sections.brand.title")}
          description={t("sections.brand.description")}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-border bg-surface-muted p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("sections.brand.fullLogo")}
              </p>
              <BrandMark variant="full" className="max-w-full" />
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.brand.compact")}
                </p>
                <CompactBrand className="text-xl" />
              </div>
              <div className="rounded-md border border-border bg-surface-muted p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.brand.ecosystem")}
                </p>
                <BrandMark ecosystem="homeworx" variant="full" className="max-w-full" />
                <p className="mt-3 text-xs text-foreground-muted">
                  {t("sections.brand.ecosystemNote")}
                </p>
              </div>
              <div className="theme-homeworx rounded-md border border-border bg-surface p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                  {t("sections.brand.swap")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button className="min-h-11 bg-accent text-accent-foreground hover:bg-accent/90">
                    {t("sections.brand.accentButton")}
                  </Button>
                  <ConfidenceBadge level="verified" />
                  <span className="text-xs text-foreground-muted">
                    <code>--accent-brand</code> {t("sections.brand.swapNote")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Typography */}
        <Section id="typography" title={t("sections.typography.title")}>
          <div className="space-y-3">
            <p className="text-4xl font-semibold tracking-tight text-foreground">Display 36/40</p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">Page title 30</p>
            <p className="text-xl font-semibold text-foreground">Section title 20</p>
            <p className="text-base font-semibold text-foreground">Card title 16</p>
            <p className="text-base text-foreground">Body 16</p>
            <p className="text-sm text-foreground-muted">Caption 14</p>
            <p className="text-[11px] text-foreground-muted">Caption 11</p>
            <p className="font-mono text-2xl tabular-nums font-semibold text-foreground">
              {formatNumber(1248.5, locale)}
            </p>
            <p className="font-mono text-2xl tabular-nums font-semibold text-foreground">
              {formatCurrency(12480, locale)}
            </p>
            <Button className="min-h-11">{t("sections.buttons.primary")}</Button>
          </div>
        </Section>

        {/* Colors */}
        <Section id="colors" title={t("sections.colors.title")}>
          <div className="space-y-6">
            {colorGroups.map((g) => (
              <div key={g.heading}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{g.heading}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {g.items.map((it) => (
                    <Swatch
                      key={it.varName}
                      name={it.name}
                      varName={it.varName}
                      fgVarName={it.fg}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Spacing */}
        <Section id="spacing" title={t("sections.spacing.title")}>
          <div className="space-y-2">
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <div key={n} className="flex items-center gap-3 text-xs text-foreground-muted">
                <span className="w-12 font-mono">{n * 4}px</span>
                <span className="block h-2 rounded bg-primary" style={{ width: `${n * 16}px` }} />
              </div>
            ))}
          </div>
        </Section>

        {/* Buttons */}
        <Section id="buttons" title={t("sections.buttons.title")}>
          <div className="flex flex-wrap gap-3">
            <Button className="min-h-11">{t("sections.buttons.primary")}</Button>
            <Button variant="secondary" className="min-h-11">
              {t("sections.buttons.secondary")}
            </Button>
            <Button variant="destructive" className="min-h-11">
              {t("sections.buttons.destructive")}
            </Button>
            <Button variant="outline" className="min-h-11">
              {t("sections.buttons.outline")}
            </Button>
            <Button variant="ghost" className="min-h-11">
              {t("sections.buttons.ghost")}
            </Button>
            <Button
              size="icon"
              aria-label={t("sections.buttons.record")}
              className="min-h-11 min-w-11"
            >
              <Mic aria-hidden />
            </Button>
            <Button disabled className="min-h-11">
              {t("sections.buttons.disabled")}
            </Button>
          </div>
        </Section>

        {/* Form controls */}
        <Section id="forms" title={t("sections.forms.title")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-input">{t("sections.forms.jobName")}</Label>
              <Input
                id="ds-input"
                placeholder={t("sections.forms.jobPlaceholder")}
                className="min-h-11"
              />
              <p className="text-xs text-foreground-muted">{t("sections.forms.helper")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-textarea">{t("sections.forms.notes")}</Label>
              <Textarea id="ds-textarea" placeholder={t("sections.forms.notesPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-select">{t("sections.forms.trade")}</Label>
              <Select>
                <SelectTrigger id="ds-select" className="min-h-11">
                  <SelectValue placeholder={t("sections.forms.choose")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plumbing">{t("sections.forms.plumbing")}</SelectItem>
                  <SelectItem value="electrical">{t("sections.forms.electrical")}</SelectItem>
                  <SelectItem value="framing">{t("sections.forms.framing")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-search">{t("sections.forms.search")}</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
                  aria-hidden
                />
                <Input
                  id="ds-search"
                  placeholder={t("sections.forms.searchPlaceholder")}
                  className="min-h-11 pl-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ds-check" />
              <Label htmlFor="ds-check">{t("sections.forms.includeTax")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="ds-switch" />
              <Label htmlFor="ds-switch">{t("sections.forms.offlineMode")}</Label>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">{t("sections.forms.priority")}</p>
              <RadioGroup defaultValue="normal" className="flex flex-wrap gap-4">
                {(["low", "normal", "high"] as const).map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <RadioGroupItem id={`ds-radio-${v}`} value={v} />
                    <Label htmlFor={`ds-radio-${v}`}>{t(`sections.forms.${v}`)}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">{t("sections.forms.filterChips")}</p>
              <div className="flex flex-wrap gap-2">
                {(["open", "inReview", "approved"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    <Filter className="size-3" aria-hidden />
                    {t(`sections.forms.chips.${c}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Cards + badges */}
        <Section id="cards" title={t("sections.cards.title")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("sections.cards.estimateNumber")}</CardTitle>
                <CardDescription>{t("sections.cards.estimateDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="font-mono tabular-nums text-xl font-semibold text-foreground">
                  {formatCurrency(12480, locale)}
                </span>
                <Badge>{t("sections.cards.draft")}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("sections.cards.confidenceSignals")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {CONFIDENCE_LEVELS.map((l) => (
                  <ConfidenceBadge key={l} level={l} />
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Alerts / notices */}
        <Section id="alerts" title={t("sections.alerts.title")}>
          <div className="grid gap-3 md:grid-cols-2">
            <SuccessNotice
              title={t("sections.alerts.successTitle")}
              description={t("sections.alerts.successDesc")}
            />
            <WarningNotice
              title={t("sections.alerts.warningTitle")}
              description={t("sections.alerts.warningDesc")}
            />
            <DangerNotice
              title={t("sections.alerts.dangerTitle")}
              description={t("sections.alerts.dangerDesc")}
            />
            <InformationNotice
              title={t("sections.alerts.infoTitle")}
              description={t("sections.alerts.infoDesc")}
            />
            <InlineError message={t("common:actions.tryAgain")} />
          </div>
        </Section>

        {/* Toast + Dialog + Drawer */}
        <Section id="overlays" title={t("sections.overlays.title")}>
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              onClick={() =>
                toast.success(t("sections.overlays.toastTitle"), {
                  description: t("sections.overlays.toastDesc"),
                })
              }
            >
              {t("sections.overlays.showToast")}
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary" className="min-h-11">
                  {t("sections.overlays.openDialog")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("sections.overlays.dialogTitle")}</DialogTitle>
                  <DialogDescription>{t("sections.overlays.dialogDesc")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" className="min-h-11">
                    {t("common:actions.cancel")}
                  </Button>
                  <Button className="min-h-11">{t("common:actions.signOut")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" className="min-h-11">
                  {t("sections.overlays.openDrawer")}
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>{t("sections.overlays.drawerTitle")}</DrawerTitle>
                  <DrawerDescription>{t("sections.overlays.drawerDesc")}</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-4 text-sm text-foreground-muted">
                  {t("sections.overlays.drawerBody")}
                </div>
                <DrawerFooter>
                  <Button className="min-h-11">{t("common:actions.save")}</Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>
        </Section>

        {/* Tabs + progress + skeleton */}
        <Section id="tabs" title={t("sections.tabs.title")}>
          <Tabs defaultValue="scope">
            <TabsList>
              <TabsTrigger value="scope">{t("sections.tabs.scope")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("sections.tabs.pricing")}</TabsTrigger>
              <TabsTrigger value="review">{t("sections.tabs.review")}</TabsTrigger>
            </TabsList>
            <TabsContent value="scope" className="pt-3 text-sm">
              {t("sections.tabs.scopeBody")}
            </TabsContent>
            <TabsContent value="pricing" className="pt-3 text-sm">
              {t("sections.tabs.pricingBody")}
            </TabsContent>
            <TabsContent value="review" className="pt-3 text-sm">
              {t("sections.tabs.reviewBody")}
            </TabsContent>
          </Tabs>
          <div className="mt-6 space-y-3">
            <Progress value={62} />
            <LoadingSkeleton lines={3} />
            <Skeleton className="h-10 w-full" />
            <LoadingSpinner label={t("sections.tabs.fetching")} />
          </div>
        </Section>

        {/* Feedback states */}
        <Section id="feedback" title={t("sections.feedback.title")}>
          <div className="grid gap-3 md:grid-cols-2">
            <EmptyState
              title={t("sections.feedback.emptyTitle")}
              description={t("sections.feedback.emptyDesc")}
              action={<Button className="min-h-11">{t("sections.feedback.newWalkthrough")}</Button>}
            />
            <RetryPanel
              onRetry={() => toast(t("sections.feedback.retrying"))}
              description={t("sections.feedback.retryDesc")}
              referenceId="ref_abc123"
            />
            <PermissionDeniedState />
            <ConfigurationErrorState />
            <OfflineBanner />
            <SuccessNotice title={t("sections.feedback.syncedTitle")} />
          </div>
          <div className="mt-4 rounded-md border border-dashed border-border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              {t("sections.feedback.fullPagePreview")}
            </p>
            <div className="overflow-hidden rounded-md border border-border">
              <FullPageError
                title={t("sections.feedback.fullPageTitle")}
                description={t("sections.feedback.fullPageDesc")}
                referenceId="ref_demo"
              />
            </div>
          </div>
        </Section>

        {/* Voice */}
        <Section
          id="voice"
          title={t("sections.voice.title")}
          description={t("sections.voice.description")}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {voiceStates.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setVoice(s)}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium ${
                  voice === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-foreground hover:bg-secondary"
                }`}
              >
                {t(`voice:states.${s}.text`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <VoiceActionButton state={voice} />
            <VoiceActionButton state={voice} variant="compact" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {voiceStates.map((s) => (
              <div
                key={s}
                className="flex flex-col items-center gap-2 rounded-md border border-border p-3"
              >
                <VoiceActionButton state={s} variant="compact" />
                <span className="text-xs text-foreground-muted">{s}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Confidence */}
        <Section id="confidence" title={t("sections.confidence.title")}>
          <div className="flex flex-wrap gap-2">
            {CONFIDENCE_LEVELS.map((l) => (
              <ConfidenceBadge key={l} level={l} />
            ))}
          </div>
        </Section>

        {/* Data */}
        <Section id="data" title={t("sections.data.title")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                {t("sections.data.total")}
              </dt>
              <dd className="mt-1 font-mono tabular-nums text-2xl font-semibold text-foreground">
                {formatCurrency(24875.5, locale)}
              </dd>
            </div>
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                {t("sections.data.margin")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{formatPercent(0.184, locale)}</dd>
            </div>
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                {t("sections.data.area")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold">
                {formatNumber(1240, locale)}{" "}
                <span className="text-base text-foreground-muted">
                  {t("sections.data.areaUnit")}
                </span>
              </dd>
            </div>
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                {t("sections.data.walkthrough")}
              </dt>
              <dd className="mt-1 text-2xl font-semibold">{formatDate(new Date(), locale)}</dd>
            </div>
          </dl>
        </Section>

        {/* Data list rows */}
        <Section id="rows" title={t("sections.rows.title")}>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {rows.map((r) => (
              <li
                key={r.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-surface px-4 py-3 sm:flex sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="truncate text-xs text-foreground-muted">{r.meta}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ConfidenceBadge level={r.level} showLabel={false} />
                  <span className="font-mono tabular-nums text-sm font-semibold text-foreground">
                    {formatCurrency(r.amount, locale)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Nav shells */}
        <Section
          id="nav"
          title={t("sections.nav.title")}
          description={t("sections.nav.description")}
        >
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border">
              <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
                <CompactBrand />
                <span className="text-xs text-foreground-muted">
                  {t("sections.nav.desktopHeader")}
                </span>
              </div>
              <div className="flex">
                <div className="w-40 border-r border-border bg-surface p-2 text-xs">
                  <p className="rounded bg-secondary px-2 py-1 font-medium text-primary">
                    {t("navigation:home")}
                  </p>
                  <p className="mt-1 px-2 py-1 text-foreground-muted">
                    {t("sections.nav.estimates")}
                  </p>
                  <p className="mt-1 px-2 py-1 text-foreground-muted">
                    {t("sections.nav.settings")}
                  </p>
                </div>
                <div className="flex-1 p-3 text-xs text-foreground-muted">Content area</div>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
