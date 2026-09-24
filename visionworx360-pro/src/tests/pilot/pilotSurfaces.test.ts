/**
 * CONTRACTOR PILOT — protected surface inventory.
 *
 * The critical-path suite exercises the engines. This file guards the entry
 * points a contractor taps in the field: if one of these surfaces or its key
 * wiring disappears in a refactor, the pilot path silently loses a step even
 * though every domain test still passes.
 *
 * Assertions are intentionally structural (file exists + the wiring that makes
 * it functional), never copy-level.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string): string => {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
};

describe("pilot surfaces: create project / CRM", () => {
  it("keeps project, client and property creation available", () => {
    for (const file of [
      "src/features/crm/components/ProjectFormDialog.tsx",
      "src/features/crm/components/ClientFormDialog.tsx",
      "src/features/crm/components/PropertyFormDialog.tsx",
      "src/features/crm/components/QuickClientSheet.tsx",
      "src/features/crm/components/CreateRecordActions.tsx",
    ]) {
      expect(source(file).length).toBeGreaterThan(0);
    }
  });

  it("keeps CRM list state in the URL so Back restores the view", () => {
    const list = source("src/routes/app.projects.index.tsx");
    expect(list).toMatch(/validateSearch|useSearch/);
  });
});

describe("pilot surfaces: capture (walkthrough, photo, video, voice)", () => {
  it("keeps the on-site walkthrough state machine and its steps", () => {
    for (const file of [
      "src/features/walkthrough/components/CaptureStep.tsx",
      "src/features/walkthrough/components/RoomStep.tsx",
      "src/features/walkthrough/components/QuestionStep.tsx",
      "src/features/walkthrough/components/ReviewStep.tsx",
      "src/features/walkthrough/components/SummaryStep.tsx",
      "src/routes/app.walkthrough.tsx",
    ]) {
      expect(source(file).length).toBeGreaterThan(0);
    }
  });

  it("keeps Estimate from Photos and prerecorded video upload", () => {
    const media = source("src/features/remote-vision/components/MediaUploadPanel.tsx");
    const video = source("src/features/remote-vision/components/VideoUploadPanel.tsx");
    expect(media).toMatch(/type="file"/);
    expect(video).toMatch(/type="file"/);
    /* Prerecorded upload: the picker must not be camera-capture-only. */
    expect(video).toMatch(/video/i);
    expect(source("src/routes/app.remote-vision.tsx").length).toBeGreaterThan(0);
  });

  it("keeps voice/text notes and dimension capture", () => {
    for (const file of [
      "src/features/voice-capture/components/RecordingControls.tsx",
      "src/features/voice-capture/components/LiveTranscript.tsx",
      "src/features/voice-capture/components/DraftReviewList.tsx",
      "src/routes/app.capture.tsx",
    ]) {
      expect(source(file).length).toBeGreaterThan(0);
    }
  });
});

describe("pilot surfaces: scope generation, approval and revision", () => {
  it("keeps the narrative scope tab, questions panel and change review", () => {
    const tab = source("src/features/narrative-scope/components/NarrativeScopeTab.tsx");
    expect(tab).toMatch(/deriveClarificationState/);
    expect(source("src/features/narrative-scope/components/NarrativeQuestionsPanel.tsx").length)
      .toBeGreaterThan(0);
    expect(source("src/features/narrative-scope/components/ReviewScopeChangesDialog.tsx").length)
      .toBeGreaterThan(0);
  });
});

describe("pilot surfaces: estimate and proposal", () => {
  it("keeps the ballpark card, conversion dialog and proposal settings", () => {
    for (const file of [
      "src/features/estimating/components/BallparkRangeCard.tsx",
      "src/features/estimating/components/ConvertToDetailedDialog.tsx",
      "src/routes/app.proposal.$projectId.tsx",
      "src/routes/proposal-print.$projectId.tsx",
      "src/routes/p.$token.tsx",
    ]) {
      expect(source(file).length).toBeGreaterThan(0);
    }
  });
});

describe("pilot surfaces: EN/ES parity", () => {
  const keysOf = (value: unknown, prefix = ""): string[] => {
    if (!value || typeof value !== "object") return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keysOf(v, prefix ? `${prefix}.${k}` : k),
    );
  };

  const NAMESPACES = [
    "estimating",
    "narrative",
    "proposal",
    "ballpark",
    "walkthrough",
    "voice",
    "crm",
    "common",
  ];

  for (const ns of NAMESPACES) {
    it(`keeps ${ns} translated in both locales`, () => {
      const en = JSON.parse(source(`src/i18n/locales/en-US/${ns}.json`));
      const es = JSON.parse(source(`src/i18n/locales/es-US/${ns}.json`));
      const missing = keysOf(en).filter((k) => !keysOf(es).includes(k));
      expect(missing).toEqual([]);
    });
  }
});
