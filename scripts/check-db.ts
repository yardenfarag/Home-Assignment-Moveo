/**
 * @module scripts/check-db
 *
 * Smoke test for the database connection: `npm run db:check`.
 * Reads the hubs table with the secret key and prints a count per region.
 */
import { listActiveHubs } from "../src/core/db/hubsRepository";
import { CENSUS_REGIONS } from "../src/core/domain/hub";
import { runScript } from "./lib/run";

/** Prints how many active hubs exist per Census region. */
async function main(): Promise<void> {
  const hubs = await listActiveHubs();
  console.log(`✅ Connected to Supabase — ${hubs.length} active hubs`);
  for (const region of CENSUS_REGIONS) {
    const names = hubs.filter((hub) => hub.region === region).map((hub) => hub.name);
    console.log(`   ${region.padEnd(10)} ${String(names.length).padStart(2)}  ${names.join(", ")}`);
  }
}

void runScript(main, "scripts/check-db");
