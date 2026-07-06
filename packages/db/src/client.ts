import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Creates a Drizzle client bound to the full schema.
 * `casing: "snake_case"` lets us write camelCase property names in the schema
 * and have Drizzle map them to snake_case columns automatically.
 */
export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const queryClient = postgres(connectionString);
  return drizzle(queryClient, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;

// Lazily-initialized singleton: the connection is only opened on first property
// access, so importing @oggvo/db (e.g. for the schema or types) never requires
// DATABASE_URL to be set.
let _db: Database | undefined;
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    _db ??= createDb();
    return Reflect.get(_db, prop, receiver);
  },
});
