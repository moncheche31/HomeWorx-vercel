/**
 * PILOT FEATURE GATES
 *
 * Contractor pilot scope freeze. Features listed here exist in the codebase
 * but are intentionally not exposed in the pilot UI because they can produce
 * price paths the pilot cannot yet audit end to end.
 */

/**
 * "Convert to Detailed Estimate" flips the pricing mode and re-derives the
 * canonical band. It stays hidden for the pilot; ballpark is the only quoted
 * surface contractors see.
 */
export const PILOT_CONVERT_TO_DETAILED_ENABLED = false;
