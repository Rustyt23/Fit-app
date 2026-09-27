// Cloudflare D1 driver, used when the app runs on Cloudflare Workers.
// The database binding is called DB (see wrangler.jsonc); its schema comes from
// migrations/*.sql via `npm run cf:migrate`.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Driver, Param } from "./db-types";

// Minimal D1 types, so we don't need the whole @cloudflare/workers-types package.
type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
};
type D1 = { prepare(sql: string): D1Prepared; batch(statements: D1Prepared[]): Promise<unknown> };

// D1 stores Uint8Array poorly; hand it an ArrayBuffer so it becomes a BLOB.
const bindValue = (v: Param) => (v instanceof Uint8Array ? v.slice().buffer : v);

// Depending on the runtime version, BLOBs come back as ArrayBuffer or number[].
function normalize<T>(row: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof ArrayBuffer) row[k] = new Uint8Array(v);
    else if (Array.isArray(v)) row[k] = Uint8Array.from(v as number[]);
  }
  return row as T;
}

/** The Worker's bindings (D1 database, R2 bucket, vars) for the current request. */
export async function cloudflareEnv(): Promise<Record<string, unknown>> {
  return (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>;
}

export async function createD1Driver(): Promise<Driver> {
  const d1 = (await cloudflareEnv()).DB as D1 | undefined;
  if (!d1) throw new Error('No D1 binding named "DB". Check wrangler.jsonc.');
  const prep = (sql: string, p: Param[]) => d1.prepare(sql).bind(...p.map(bindValue));
  return {
    async all<T>(sql: string, p: Param[]) {
      const { results } = await prep(sql, p).all<Record<string, unknown>>();
      return results.map((r) => normalize<T>(r));
    },
    async run(sql: string, p: Param[]) {
      const { meta } = await prep(sql, p).run();
      return { changes: meta.changes, lastRowId: meta.last_row_id };
    },
    async batch(statements) {
      if (statements.length) await d1.batch(statements.map((s) => prep(s.sql, s.params)));
    },
  };
}
