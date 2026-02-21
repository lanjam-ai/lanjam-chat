import { type Database, createDb } from "@lanjam/db";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = createDb();
  }
  return db;
}
