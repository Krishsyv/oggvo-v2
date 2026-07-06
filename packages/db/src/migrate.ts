import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies all pending Drizzle migrations from ./drizzle.
 * Run with: pnpm db:migrate
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.warn("Running migrations…");
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.warn("Migrations complete.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
