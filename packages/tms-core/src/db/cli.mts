import knexInit from "knex";

export type MigrationCommand = "migrate:latest" | "migrate:rollback" | "seed:run";

const COMMANDS: readonly MigrationCommand[] = ["migrate:latest", "migrate:rollback", "seed:run"];

export function isMigrationCommand(value: string): value is MigrationCommand {
  return (COMMANDS as readonly string[]).includes(value);
}

export interface MigrationCliOptions {
  connectionString: string;
  migrationsDir: string;
  seedsDir?: string;
  // Defaults to knex's standard "knex_migrations" table. A service normally
  // never needs to change this (it owns its whole database); tests that run
  // more than one independent migration set against the same database do.
  migrationsTableName?: string;
}

// Deliberately its own entry point, invoked as a separate command — never
// run automatically at service startup (BRIEF.md: "Миграциите се пускат
// през CLI-то в tms-core, не при старт на услугата").
export async function runMigrationCommand(
  command: MigrationCommand,
  options: MigrationCliOptions,
): Promise<string[]> {
  // knex's DEFAULT_LOAD_EXTENSIONS is [.co .coffee .eg .iced .js .cjs
  // .litcoffee .ls .ts] — no .mjs, so it silently finds zero migrations in
  // an ESM ("type": "module") repo unless told explicitly.
  const knexInstance = knexInit({
    client: "pg",
    connection: options.connectionString,
    migrations: {
      directory: options.migrationsDir,
      loadExtensions: [".mjs"],
      ...(options.migrationsTableName !== undefined && { tableName: options.migrationsTableName }),
    },
    ...(options.seedsDir !== undefined && { seeds: { directory: options.seedsDir, loadExtensions: [".mjs"] } }),
  });

  try {
    if (command === "migrate:latest") {
      const [, applied] = (await knexInstance.migrate.latest()) as [number, string[]];
      return applied;
    }
    if (command === "migrate:rollback") {
      const [, rolledBack] = (await knexInstance.migrate.rollback()) as [number, string[]];
      return rolledBack;
    }
    const [seedFiles] = await knexInstance.seed.run();
    return seedFiles;
  } finally {
    await knexInstance.destroy();
  }
}
