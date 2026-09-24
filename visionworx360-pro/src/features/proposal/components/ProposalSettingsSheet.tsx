import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PRICING_DISCLOSURES,
  type PricingDisclosure,
} from "@/domains/estimating/pricingModes";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PROPOSAL_LEVELS,
  PROPOSAL_SECTION_ORDER,
  type ProposalLevelKey,
  type ProposalSectionKey,
  type ProposalSettings,
  PROPOSAL_FINISH_LEVELS,
  PROPOSAL_TEMPLATES,
  type ProposalFinishLevel,
  type ProposalTemplateKey,
} from "@/domains/proposal";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ProposalSettings;
  onToggleLevel: (level: ProposalLevelKey) => void;
  onToggleSection: (section: ProposalSectionKey) => void;
  onUpdate: (patch: Partial<ProposalSettings>) => void;
  onReset: () => void;
  template: ProposalTemplateKey;
  onTemplateChange: (template: ProposalTemplateKey) => void;
  defaultWarranty: string;
  defaultVision: string;
}

/** Contractor control over what the customer sees. */
export function ProposalSettingsSheet({
  open,
  onOpenChange,
  settings,
  onToggleLevel,
  onToggleSection,
  onUpdate,
  onReset,
  template,
  onTemplateChange,
  defaultWarranty,
  defaultVision,
}: Props) {
  const { t } = useTranslation("proposal");
  const sections = PROPOSAL_SECTION_ORDER.filter((s) => s !== "cover");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{t("subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          <div className="space-y-2">
            <Label htmlFor="proposal-template">{t("settings.template")}</Label>
            <Select
              value={template}
              onValueChange={(v) => onTemplateChange(v as ProposalTemplateKey)}
            >
              <SelectTrigger id="proposal-template" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPOSAL_TEMPLATES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`template.${key}.label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground-muted">{t(`template.${template}.description`)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposal-brand-name">{t("settings.brandName")}</Label>
            <Input
              id="proposal-brand-name"
              className="min-h-11"
              placeholder={t("settings.brandNamePlaceholder")}
              value={settings.brandNameOverride ?? ""}
              onChange={(e) => onUpdate({ brandNameOverride: e.target.value || null })}
            />
            <Label htmlFor="proposal-brand-tagline">{t("settings.brandTagline")}</Label>
            <Input
              id="proposal-brand-tagline"
              className="min-h-11"
              value={settings.brandTaglineOverride ?? ""}
              onChange={(e) => onUpdate({ brandTaglineOverride: e.target.value || null })}
            />
            <p className="text-xs text-foreground-muted">{t("settings.brandHint")}</p>
          </div>

          {/*
            Contractor authority: itemised labor/material disclosure is never
            forced on the customer document.
          */}
          <div className="space-y-2">
            <Label htmlFor="proposal-pricing-disclosure">{t("settings.pricingDisclosure")}</Label>
            <Select
              value={settings.pricingDisclosure ?? "auto"}
              onValueChange={(v) =>
                onUpdate({
                  pricingDisclosure: v === "auto" ? null : (v as PricingDisclosure),
                })
              }
            >
              <SelectTrigger id="proposal-pricing-disclosure" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("settings.pricingDisclosureAuto")}</SelectItem>
                {PRICING_DISCLOSURES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`settings.disclosure.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground-muted">{t("settings.pricingDisclosureHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposal-as-illustrated-finish">{t("settings.asIllustratedFinish")}</Label>
            <Select
              value={settings.asIllustratedFinishOverride ?? "auto"}
              onValueChange={(v) =>
                onUpdate({
                  asIllustratedFinishOverride: v === "auto" ? null : (v as ProposalFinishLevel),
                })
              }
            >
              <SelectTrigger id="proposal-as-illustrated-finish" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("settings.asIllustratedAuto")}</SelectItem>
                {PROPOSAL_FINISH_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`asIllustrated.finish.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="proposal-as-illustrated-amount">{t("settings.asIllustratedAmount")}</Label>
            <Input
              id="proposal-as-illustrated-amount"
              className="min-h-11"
              type="number"
              inputMode="numeric"
              min={0}
              value={settings.asIllustratedAmountOverride ?? ""}
              onChange={(e) =>
                onUpdate({
                  asIllustratedAmountOverride:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
            <p className="text-xs text-foreground-muted">{t("settings.asIllustratedHint")}</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("settings.levels")}</legend>
            {PROPOSAL_LEVELS.map((level) => (
              <div key={level} className="flex min-h-11 items-center justify-between gap-3">
                <Label htmlFor={`level-${level}`}>{t(`levels.${level}`)}</Label>
                <Switch
                  id={`level-${level}`}
                  checked={settings.visibleLevels.includes(level)}
                  onCheckedChange={() => onToggleLevel(level)}
                />
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("settings.sections")}</legend>
            {sections.map((section) => (
              <div key={section} className="flex min-h-11 items-center justify-between gap-3">
                <Label htmlFor={`section-${section}`}>{t(`sections.${section}`)}</Label>
                <Switch
                  id={`section-${section}`}
                  checked={!settings.hiddenSections.includes(section)}
                  onCheckedChange={() => onToggleSection(section)}
                />
              </div>
            ))}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="proposal-vision">{t("settings.vision")}</Label>
            <Textarea
              id="proposal-vision"
              rows={4}
              value={settings.visionText ?? defaultVision}
              onChange={(e) => onUpdate({ visionText: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposal-warranty">{t("settings.warranty")}</Label>
            <Textarea
              id="proposal-warranty"
              rows={5}
              value={settings.warrantyText ?? defaultWarranty}
              onChange={(e) => onUpdate({ warrantyText: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onReset}>
              {t("settings.reset")}
            </Button>
            <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t("settings.close")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
