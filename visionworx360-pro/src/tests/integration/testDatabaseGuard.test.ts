import { describe, expect, it } from "vitest";
import { assertLocalTestDatabase, testDatabaseTargetProblems } from "./testDatabaseGuard";

const LEGACY_PRODUCTION_URL = "https://lwybxokduogiewxciecq.supabase.co";

describe("integration tests require an explicit local test database", () => {
  it("accepts the local harness (Postgres + PostgREST on loopback)", () => {
    expect(
      testDatabaseTargetProblems(
        {
          VW_IT_PG_URL: "postgres://supabase_admin:postgres@127.0.0.1:54329/postgres",
          VW_IT_POSTGREST_URL: "http://localhost:54330",
        },
        false,
      ),
    ).toEqual([]);
  });

  it("refuses a hosted Supabase project", () => {
    expect(() =>
      assertLocalTestDatabase({ VW_IT_POSTGREST_URL: "https://some-project.supabase.co" }, false),
    ).toThrow(/BLOCKED: .*hosted Supabase project/);
  });

  it("refuses a non-loopback host unless explicitly allowed", () => {
    const targets = { VW_IT_PG_URL: "postgres://u:p@10.0.0.5:5432/postgres" };
    expect(testDatabaseTargetProblems(targets, false)).toEqual(["VW_IT_PG_URL host 10.0.0.5 is not local"]);
    expect(testDatabaseTargetProblems(targets, true)).toEqual([]);
  });

  it("refuses the legacy Lovable production project even when non-local targets are allowed", () => {
    expect(() => assertLocalTestDatabase({ VW_IT_POSTGREST_URL: LEGACY_PRODUCTION_URL }, true)).toThrow(
      /legacy Lovable production project/,
    );
  });

  it("refuses the legacy production database host and pooler login even when allowed", () => {
    expect(
      testDatabaseTargetProblems(
        {
          VW_IT_PG_URL: "postgres://postgres:pw@db.lwybxokduogiewxciecq.supabase.co:5432/postgres",
          VW_IT_POSTGREST_URL: "postgres://postgres.lwybxokduogiewxciecq:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
        },
        true,
      ),
    ).toEqual([
      "VW_IT_PG_URL points at the legacy Lovable production project",
      "VW_IT_POSTGREST_URL points at the legacy Lovable production project",
    ]);
  });

  it("refuses an unparseable target", () => {
    expect(testDatabaseTargetProblems({ VW_IT_PG_URL: "not a url" }, false)).toEqual([
      "VW_IT_PG_URL is not a valid URL",
    ]);
  });
});
