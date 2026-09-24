/**
 * Handyman / small-service work domain — public surface.
 *
 * See `docs/handyman-coverage.md` for what is priced from internal data, what
 * is recognised but flagged pricing-needed, and what waits for a licensed
 * pricing dataset.
 */

export * from "./types";
export {
  HANDYMAN_TASKS,
  TASK_CATEGORIES,
  COMPANIONS,
  getHandymanTask,
  normalizeTaskText,
  searchHandymanTasks,
} from "./tasks";
export type { TaskSearchResult } from "./tasks";
export {
  contractorCustomSource,
  defaultPricingSources,
  importedDatasetSource,
  internalCuratedSource,
  resolveTaskRate,
} from "./sources";
export type { ContractorTaskRate, ImportedDatasetOptions, ImportedRateRow, RateResolution } from "./sources";
export { matchTask, recognizePunchList, splitPunchList } from "./recognize";
export {
  HANDYMAN_QUESTIONS,
  HANDYMAN_QUESTION_BUDGET,
  getHandymanQuestion,
  selectHandymanQuestions,
} from "./questions";
export type { HandymanQuestion } from "./questions";
export { DEFAULT_SERVICE_MINIMUMS, buildPunchListEstimate, priceTaskLine } from "./estimate";
export type { PunchListOptions } from "./estimate";
export { suggestedCategoriesFor } from "./tasks";
