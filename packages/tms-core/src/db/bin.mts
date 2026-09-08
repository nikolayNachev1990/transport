#!/usr/bin/env node
import { isMigrationCommand, runMigrationCommand } from "./cli.mjs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function requireArg(name: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  if (arg === undefined) {
    console.error(`Missing required argument: --${name}=<value>`);
    process.exit(1);
  }
  return arg.slice(prefix.length);
}

function optionalArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === undefined || !isMigrationCommand(command)) {
    console.error("Usage: tms-migrate <migrate:latest|migrate:rollback|seed:run> --migrations-dir=<dir> [--seeds-dir=<dir>]");
    process.exit(1);
    return;
  }

  const migrationsDir = requireArg("migrations-dir");
  const seedsDir = optionalArg("seeds-dir");
  const connectionString = requireEnv("DATABASE_URL");

  const result = await runMigrationCommand(command, {
    connectionString,
    migrationsDir,
    ...(seedsDir !== undefined && { seedsDir }),
  });
  console.log(`${command}: ${result.length > 0 ? result.join(", ") : "(nothing to do)"}`);
}

void main();
