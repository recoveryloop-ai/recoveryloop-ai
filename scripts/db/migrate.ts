import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
import { createDatabase } from "../../src/server/db/client";

loadLocalEnvironment();

const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

try {
  const migrationsDirectory = "src/server/db/migrations";
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let applied = 0;
  await client.begin(async (sql) => {
    await sql`create table if not exists public.__drizzle_migrations (
      id serial primary key,
      hash text not null unique,
      created_at bigint not null
    )`;

    for (const file of migrationFiles) {
      const source = await readFile(join(migrationsDirectory, file), "utf8");
      const hash = createHash("sha256").update(source).digest("hex");
      const [existing] = await sql<{ exists: boolean }[]>`
        select exists(select 1 from public.__drizzle_migrations where hash = ${hash}) as exists`;
      if (existing?.exists) continue;

      const statements = source
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await sql.unsafe(statement);
      }
      await sql`insert into public.__drizzle_migrations (hash, created_at)
        values (${hash}, ${Date.now()})`;
      applied += 1;
    }
  });
  console.log(JSON.stringify({ status: "PASS", operation: "migration-up", applied }));
} finally {
  await client.end();
}
