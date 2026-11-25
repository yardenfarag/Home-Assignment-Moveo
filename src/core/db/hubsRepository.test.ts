import { describe, expect, it } from "vitest";
import { hubFromRow } from "./hubsRepository";

const baseRow = {
  id: "kansas-city",
  name: "Kansas City",
  state: "MO",
  region: "Midwest",
  latitude: 39.0997,
  longitude: -94.5786,
  timezone: "America/Chicago",
  county_fips: null,
  county_name: null,
  is_active: true,
  created_at: "2026-11-25T00:00:00Z",
  updated_at: "2026-11-25T00:00:00Z",
};

describe("hubFromRow", () => {
  it("maps snake_case rows to camelCase hubs", () => {
    expect(hubFromRow(baseRow)).toEqual({
      id: "kansas-city",
      name: "Kansas City",
      state: "MO",
      region: "Midwest",
      latitude: 39.0997,
      longitude: -94.5786,
      timezone: "America/Chicago",
      countyFips: null,
      countyName: null,
      isActive: true,
    });
  });

  it("rejects an unknown region", () => {
    expect(() => hubFromRow({ ...baseRow, region: "Mountain" })).toThrow();
  });
});
