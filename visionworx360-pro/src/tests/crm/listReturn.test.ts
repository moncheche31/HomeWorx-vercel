/**
 * Explicit "Back to <list>" links must return to the originating list view.
 * Browser Back is native; this covers the remembered-origin path used by the
 * in-app back links, including malformed storage and cross-list isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  rememberListSearch,
  readListSearch,
  clearListSearch,
} from "@/features/crm/navigation/listReturn";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("CRM list return state", () => {
  it("restores the remembered projects list view", () => {
    rememberListSearch("projects", {
      q: "kitchen",
      status: "construction",
      sort: "budget_desc",
      page: 3,
    });
    expect(readListSearch("projects")).toEqual({
      q: "kitchen",
      status: "construction",
      sort: "budget_desc",
      page: 3,
    });
  });

  it("defaults to the base list when nothing was remembered", () => {
    expect(readListSearch("projects")).toEqual({});
    expect(readListSearch("clients")).toEqual({});
    expect(readListSearch("properties")).toEqual({});
  });

  it("keeps each list's state isolated", () => {
    rememberListSearch("projects", { q: "kitchen", status: "approved", page: 2 });
    rememberListSearch("clients", { q: "smith", sort: "name_asc" });
    rememberListSearch("properties", { city: "Austin" });

    expect(readListSearch("clients")).toEqual({ q: "smith", sort: "name_asc" });
    expect(readListSearch("properties")).toEqual({ city: "Austin" });
    expect(readListSearch("projects")).toMatchObject({ q: "kitchen", status: "approved" });
    expect(readListSearch("clients")).not.toHaveProperty("status");
    expect(readListSearch("properties")).not.toHaveProperty("q");
  });

  it("falls back to defaults for malformed or tampered storage", () => {
    window.sessionStorage.setItem("vw360:crm-list:projects", "{not json");
    expect(readListSearch("projects")).toEqual({});

    window.sessionStorage.setItem(
      "vw360:crm-list:projects",
      JSON.stringify({ status: "nope", sort: "'; drop table --", page: -4 }),
    );
    expect(readListSearch("projects")).toEqual({});
  });

  it("clears a remembered view", () => {
    rememberListSearch("clients", { q: "smith" });
    clearListSearch("clients");
    expect(readListSearch("clients")).toEqual({});
  });
});
