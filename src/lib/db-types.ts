// The small database interface the app uses. Two implementations:
//   db-node.ts  SQLite file via Node's built-in node:sqlite (your own computer / VPS)
//   db-d1.ts    Cloudflare D1 (Workers + Pages)
// Both speak the same SQLite dialect and read the same migrations/*.sql files.

export type Param = string | number | null | Uint8Array;
export type Statement = { sql: string; params: Param[] };
export type RunResult = { changes: number; lastRowId: number };

export interface Driver {
  all<T>(sql: string, params: Param[]): Promise<T[]>;
  run(sql: string, params: Param[]): Promise<RunResult>;
  /** Runs all statements atomically: either every one applies or none do. */
  batch(statements: Statement[]): Promise<void>;
}
