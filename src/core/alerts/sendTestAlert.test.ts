import { describe, expect, it, vi } from "vitest";
import type { StoredSnapshot } from "../db/scoresRepository";
import { sendTestAlert, type SendTestAlertDeps } from "./sendTestAlert";

const snapshots = [{ hubId: "dallas", overallScore: 72.4, riskLevel: "high" }] as unknown as StoredSnapshot[];

/**
 * Fake data sources.
 * @param overrides - the parts to replace.
 * @returns the deps.
 */
const deps = (overrides: Partial<SendTestAlertDeps> = {}): SendTestAlertDeps => ({
  listActiveHubs: async () => [],
  getLatestSnapshots: async () => snapshots,
  recordEvent: vi.fn(async () => true),
  ...overrides,
});

describe("sendTestAlert", () => {
  it("records the test alert and returns its message", async () => {
    await expect(sendTestAlert(deps())).resolves.toMatch(/^TEST: dallas/);
  });

  it("says plainly when there are no scores yet", async () => {
    await expect(sendTestAlert(deps({ getLatestSnapshots: async () => null }))).rejects.toThrow(/^NoDataError \|\| No scores yet/);
  });

  it("says plainly when the insert failed (a different problem)", async () => {
    await expect(sendTestAlert(deps({ recordEvent: async () => false }))).rejects.toThrow(/^TestAlertError \|\| Could not record the test alert: the event insert failed/);
  });
});
