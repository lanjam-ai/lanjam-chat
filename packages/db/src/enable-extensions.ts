import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(connectionString);
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
console.log("pgvector extension enabled.");
await sql.end();
