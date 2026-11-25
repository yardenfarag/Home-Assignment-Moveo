import { describe, expect, it } from "vitest";
import type { FemaCountyRecord } from "../data/femaNri";
import type { FemaSignals } from "../scoring/types";
import type { Db } from "./client";
import { FEMA_SIGNAL_BY_FIELD, femaRowFromRecord, femaSignalsFromRow, saveFemaRecord } from "./femaRepository";

const record = {
  countyFips: "08031",
  countyName: "Denver",
  stateCode: "CO",
  nriVersion: "December 2025",
  countyAreaSqMi: 156.3,
  rawAttributes: { STCOFIPS: "08031" },
  hrcnAfreq: null,
  trndAfreq: 0.16,
  hailAfreq: 8.29,
  ifldAfreq: 0.82,
  cfldAfreq: null,
  istmAfreq: 0.016,
  wntwAfreq: 13.7,
  cwavAfreq: 1.26,
  hwavAfreq: 1,
  swndAfreq: 1.19,
} satisfies FemaCountyRecord;

/**
 * A fake Supabase client that records writes in order and can fail one table.
 * @param failTable - the table whose write returns an error.
 * @returns the client and the log of writes.
 */
function fakeDb(failTable?: "hubs" | "fema_nri") {
  const writes: string[] = [];
  /** The result of a write to a table. */
  const result = (table: string) => ({ error: table === failTable ? { message: "boom" } : null });
  const db = {
    from: (table: string) => ({
      update: () => ({
        eq: async () => {
          writes.push(`${table}.update`);
          return result(table);
        },
      }),
      upsert: async () => {
        writes.push(`${table}.upsert`);
        return result(table);
      },
    }),
  } as unknown as Db;
  return { db, writes };
}

describe("saveFemaRecord", () => {
  it("writes the hub's county copy first and the fema_nri row last", async () => {
    const { db, writes } = fakeDb();
    await saveFemaRecord("denver", record, db);
    expect(writes).toEqual(["hubs.update", "fema_nri.upsert"]);
  });

  it("stores no FEMA row when the hub update fails, so the next ingest retries the hub", async () => {
    const { db, writes } = fakeDb("hubs");
    await expect(saveFemaRecord("denver", record, db)).rejects.toThrow(/SupabaseUpdateError \|\| Could not set county on hub denver: boom/);
    expect(writes).toEqual(["hubs.update"]);
  });

  it("reports a failed fema_nri write (the hub then has no FEMA row and is retried)", async () => {
    const { db } = fakeDb("fema_nri");
    await expect(saveFemaRecord("denver", record, db)).rejects.toThrow(/SupabaseUpsertError/);
  });
});

describe("FEMA columns are derived from FEMA_HAZARD_FIELDS", () => {
  it("maps every hazard to its column, and back to the scoring signal", () => {
    const row = femaRowFromRecord("denver", record);
    expect(row).toMatchObject({ hub_id: "denver", county_fips: "08031", hrcn_afreq: null, hail_afreq: 8.29, swnd_afreq: 1.19 });
    const stored = { ...row, created_at: "", updated_at: "" } as Parameters<typeof femaSignalsFromRow>[0];
    expect(femaSignalsFromRow(stored)).toEqual({
      countyAreaSqMi: 156.3,
      hurricane: null,
      tornado: 0.16,
      hail: 8.29,
      inlandFlood: 0.82,
      coastalFlood: null,
      iceStorm: 0.016,
      winterWeather: 13.7,
      coldWave: 1.26,
      heatWave: 1,
      strongWind: 1.19,
    });
  });

  it("covers every FEMA signal exactly once", () => {
    const names = Object.values(FEMA_SIGNAL_BY_FIELD);
    const signalKeys: (keyof FemaSignals)[] = ["countyAreaSqMi", ...names];
    expect(new Set(names).size).toBe(names.length); // no field maps to the same signal twice
    expect(Object.keys(femaSignalsFromRow({ ...femaRowFromRecord("x", record), created_at: "", updated_at: "" } as never)).sort()).toEqual(signalKeys.sort());
  });
});
