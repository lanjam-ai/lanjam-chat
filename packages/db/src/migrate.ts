import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

async function runMigrations() {
  console.log("Running migrations...");
  const db = createDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
