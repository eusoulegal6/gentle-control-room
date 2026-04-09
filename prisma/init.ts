import "dotenv/config";

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function resolveDatabasePath(databaseUrl: string) {
  if (databaseUrl === ":memory:") {
    return databaseUrl;
  }

  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for sqlite init script: ${databaseUrl}`);
  }

  return path.resolve(process.cwd(), databaseUrl.slice("file:".length));
}

function getMigrationFiles(migrationsRoot: string) {
  if (!existsSync(migrationsRoot)) {
    return [];
  }

  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsRoot, entry.name, "migration.sql"))
    .filter((filePath) => existsSync(filePath))
    .sort((left, right) => left.localeCompare(right));
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const databasePath = resolveDatabasePath(databaseUrl);

  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  const migrationsRoot = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFiles = getMigrationFiles(migrationsRoot);

  db.pragma("journal_mode = WAL");

  try {
    for (const migrationFile of migrationFiles) {
      db.exec(readFileSync(migrationFile, "utf8"));
    }
  } finally {
    db.close();
  }

  console.log(`Applied ${migrationFiles.length} SQL migration file(s) to ${databaseUrl}.`);
}

main();
