import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    // Supabase's session pooler uses TLS; `require` keeps the connection
    // encrypted without depending on the serverless runtime's CA bundle.
    ssl: { rejectUnauthorized: false },
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
