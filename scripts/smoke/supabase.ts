import postgres from "postgres";

import {
  describeError,
  directExecution,
  loadLocalEnvironment,
  printResult,
  requireEnvironment,
  type SmokeResult,
} from "./common.js";

export async function smokeSupabase(): Promise<SmokeResult> {
  loadLocalEnvironment();
  let sql: ReturnType<typeof postgres> | undefined;

  try {
    const databaseUrl = requireEnvironment("DATABASE_URL");
    sql = postgres(databaseUrl, {
      max: 1,
      ssl: "require",
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 5,
    });

    const [identity] = await sql<
      Array<{
        database_name: string;
        postgres_version: string;
        can_create_public: boolean;
      }>
    >`
      select
        current_database() as database_name,
        current_setting('server_version') as postgres_version,
        has_schema_privilege(current_user, 'public', 'CREATE') as can_create_public
    `;

    const writeCount = await sql.begin(async (transaction) => {
      await transaction`
        create temporary table recoveryloop_s0_probe (
          id integer primary key,
          label text not null
        ) on commit drop
      `;
      await transaction`
        insert into recoveryloop_s0_probe (id, label)
        values (1, 's0-read-write')
      `;
      const [row] = await transaction<Array<{ count: number }>>`
        select count(*)::integer as count from recoveryloop_s0_probe
      `;
      return row?.count ?? 0;
    });

    if (!identity || writeCount !== 1) {
      throw new Error("DATABASE_READ_WRITE_PROBE_FAILED");
    }

    return {
      provider: "Supabase",
      status: "PASS",
      capability: "Postgres connection, migration privilege, temporary read/write",
      evidence: {
        database: identity.database_name,
        postgres_version: identity.postgres_version,
        can_create_public: identity.can_create_public,
        temporary_write_rows: writeCount,
      },
    };
  } catch (error) {
    const message = describeError(error);
    return {
      provider: "Supabase",
      status: message.startsWith("MISSING_ENV:") ? "BLOCKED" : "FAIL",
      capability: "Postgres connection, migration privilege, temporary read/write",
      blocker: message,
    };
  } finally {
    await sql?.end({ timeout: 2 });
  }
}

if (directExecution(import.meta.url)) {
  printResult(await smokeSupabase());
}
