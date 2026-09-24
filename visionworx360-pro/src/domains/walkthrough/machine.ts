import { WALKTHROUGH_STEPS, type WalkthroughContext, type WalkthroughStep } from "./types";

/**
 * Pure guided-workflow state machine. No React, no side effects — the UI only
 * renders the controls the current step needs.
 */

export function stepIndex(step: WalkthroughStep): number {
  return WALKTHROUGH_STEPS.indexOf(step);
}

export function canAdvance(step: WalkthroughStep, ctx: WalkthroughContext): boolean {
  switch (step) {
    case "project":
      return ctx.hasProject;
    case "intake":
      return ctx.hasProject && ctx.hasEvidence;
    case "room":
      return ctx.hasProject && ctx.hasRoom;
    case "capture":
      return ctx.hasTranscript;
    case "questions":
      return true;
    case "review":
      return ctx.draftCount > 0;
    case "summary":
      return false;
    default:
      return false;
  }
}

export function nextStep(step: WalkthroughStep, ctx: WalkthroughContext): WalkthroughStep {
  if (!canAdvance(step, ctx)) return step;
  switch (step) {
    case "project":
      return "intake";
    case "intake":
      // Analysis of this project's own evidence decides whether anything needs
      // clarifying; with nothing uncertain we go straight on to room capture.
      return ctx.questionCount > 0 ? "questions" : "room";
    case "room":
      return "capture";
    case "capture":
      // Skip the question flow when the parser left nothing uncertain.
      return ctx.questionCount > 0 ? "questions" : "review";
    case "questions":
      return "review";
    case "review":
      return "summary";
    default:
      return step;
  }
}

export function previousStep(step: WalkthroughStep, ctx: WalkthroughContext): WalkthroughStep {
  switch (step) {
    case "intake":
      return "project";
    case "room":
      return "intake";
    case "capture":
      return "room";
    case "questions":
      return "capture";
    case "review":
      return ctx.questionCount > 0 ? "questions" : "capture";
    case "summary":
      return "review";
    default:
      return step;
  }
}

/** Progress for the step indicator (1-based, excludes the final summary). */
export function stepProgress(step: WalkthroughStep): { current: number; total: number } {
  return { current: stepIndex(step) + 1, total: WALKTHROUGH_STEPS.length };
}

/** Switching rooms mid-walkthrough keeps the project and returns to capture. */
export function startRoom(): WalkthroughStep {
  return "capture";
}
