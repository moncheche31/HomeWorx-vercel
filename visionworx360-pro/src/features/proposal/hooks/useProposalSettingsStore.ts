import { useCallback, useEffect, useState } from "react";
import {
  defaultProposalSettings,
  type ProposalLevelKey,
  type ProposalSectionKey,
  type ProposalSettings,
  type ProposalTemplateKey,
  type ProposalTheme,
} from "@/domains/proposal";

const KEY = "vwx.proposal.settings";

/**
 * Local-first persistence (same approach as Modules 009 / 010B / 011 / 013).
 * The proposal never writes to the scope or estimate tables — theme choice,
 * visibility toggles and acceptance live with the device.
 */
export function useProposalSettingsStore(projectId: string) {
  const storageKey = `${KEY}.${projectId}`;
  const [settings, setSettings] = useState<ProposalSettings>(() => defaultProposalSettings());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as ProposalSettings) : null;
      // Legacy records have no template — default them to contractor so the
      // existing proposal output is unchanged.
      setSettings(
        parsed && parsed.version === 1
          ? { ...defaultProposalSettings(), ...parsed, template: parsed.template ?? "contractor" }
          : defaultProposalSettings(),
      );
    } catch {
      setSettings(defaultProposalSettings());
    }
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: ProposalSettings) => {
      setSettings(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — settings still work in memory */
      }
    },
    [storageKey],
  );

  const update = useCallback(
    (patch: Partial<ProposalSettings>) => persist({ ...settings, ...patch }),
    [persist, settings],
  );

  const setTheme = useCallback((theme: ProposalTheme) => update({ theme }), [update]);

  /** Presentation-only: swaps copy/sections, never project or pricing data. */
  const setTemplate = useCallback(
    (template: ProposalTemplateKey) => update({ template }),
    [update],
  );

  const toggleLevel = useCallback(
    (level: ProposalLevelKey) => {
      const has = settings.visibleLevels.includes(level);
      const next = has
        ? settings.visibleLevels.filter((l) => l !== level)
        : [...settings.visibleLevels, level];
      update({ visibleLevels: next.length > 0 ? next : settings.visibleLevels });
    },
    [settings.visibleLevels, update],
  );

  const toggleSection = useCallback(
    (section: ProposalSectionKey) => {
      if (section === "cover") return;
      const hidden = settings.hiddenSections.includes(section);
      update({
        hiddenSections: hidden
          ? settings.hiddenSections.filter((s) => s !== section)
          : [...settings.hiddenSections, section],
      });
    },
    [settings.hiddenSections, update],
  );

  const accept = useCallback(
    (name: string) => update({ acceptedByName: name, acceptedAt: new Date().toISOString() }),
    [update],
  );

  const clearAcceptance = useCallback(
    () => update({ acceptedByName: null, acceptedAt: null }),
    [update],
  );

  const reset = useCallback(() => persist(defaultProposalSettings()), [persist]);

  return {
    settings,
    hydrated,
    update,
    setTheme,
    setTemplate,
    toggleLevel,
    toggleSection,
    accept,
    clearAcceptance,
    reset,
  };
}
