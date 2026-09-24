/** Public surface of the Room Geometry + Quantity Propagation foundation. */
export * from "./types";
export {
  deriveRoomGeometry,
  openingArea,
  openingTrimWidth,
  DEFAULT_FLOOR_WASTE_PCT,
  OPENING_PRESETS,
} from "./derive";
export {
  DEPENDENCY_RULES,
  resolveDependency,
  unitAccepts,
  unitForMeasurement,
} from "./dependencies";
export type { DependencyRule, LineLike, SurfaceSpec } from "./dependencies";
export { planQuantityPropagation } from "./propagate";
export type {
  BlockedLineQuantity,
  DerivedLineQuantity,
  DerivedSurface,
  PropagationPlan,
} from "./propagate";
export { autoApplicableDerivations, derivationSummary } from "./autoApply";
