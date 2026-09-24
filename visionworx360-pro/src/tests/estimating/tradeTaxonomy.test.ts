/**
 * Trade taxonomy coverage.
 *
 * Four vocabularies used to describe the same work: scope authoring, the
 * pricing catalog, the labor rollup and the regional rate table. Nothing
 * asserted they agreed, so catalog keys like `doors` and `handyman` silently
 * rolled up as "unassigned". This test is the contract.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CATALOG_TRADE_KEYS,
  LABOR_TRADES,
  SCOPE_AUTHORING_TRADE_KEYS,
  UNASSIGNED_TRADE,
  normalizeTradeKey,
} from "@/domains/estimating/tradeTaxonomy";
import { SCOPE_TRADES } from "@/features/scope/catalog";

const seed = readFileSync("supabase/seed/knowledge-base-v1.sql", "utf8");

describe("trade taxonomy is one vocabulary, not four", () => {
  it.each(CATALOG_TRADE_KEYS)("maps catalog trade %s to a real labor trade", (key) => {
    const trade = normalizeTradeKey(key);
    expect(trade).not.toBe(UNASSIGNED_TRADE);
    expect(LABOR_TRADES).toContain(trade);
  });

  it.each(SCOPE_AUTHORING_TRADE_KEYS)("maps scope-authoring trade %s", (key) => {
    expect(normalizeTradeKey(key)).not.toBe(UNASSIGNED_TRADE);
  });

  it("declares exactly the scope builder's trade list", () => {
    expect([...SCOPE_AUTHORING_TRADE_KEYS].sort()).toEqual([...SCOPE_TRADES].sort());
  });

  it("declares every trade_key the seeded catalog actually uses", () => {
    const used = new Set(
      [...seed.matchAll(/^ {2}\(1, '[a-z0-9._]+', '([a-z_]+)',/gm)].map((m) => m[1]),
    );
    expect(used.size).toBeGreaterThan(10);
    const undeclared = [...used].filter(
      (key) => !(CATALOG_TRADE_KEYS as readonly string[]).includes(key),
    );
    expect(undeclared).toEqual([]);
  });

  it("still falls back to keyword matching for free text", () => {
    expect(normalizeTradeKey("set backsplash tile at kitchen wall")).toBe("tile");
    expect(normalizeTradeKey("")).toBe(UNASSIGNED_TRADE);
  });
});
