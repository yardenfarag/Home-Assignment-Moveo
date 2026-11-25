import { describe, expect, it, vi } from "vitest";
import { buildCountyQueryUrl, fetchFemaCountyByPoint, parseCountyResponse } from "./femaNri";

/** Real response for Denver's city-center point (NRI v1.20). */
const denverResponse = {
  features: [
    {
      attributes: {
        STCOFIPS: "08031",
        COUNTY: "Denver",
        STATEABBRV: "CO",
        NRI_VER: "December 2025",
        AREA: 156.2874729,
        HRCN_AFREQ: null,
        TRND_AFREQ: 0.1598618749736841,
        HAIL_AFREQ: 8.290857574357961,
        IFLD_AFREQ: 0.8214285714285714,
        CFLD_AFREQ: null,
        ISTM_AFREQ: 0.015665323352972604,
        WNTW_AFREQ: 13.73781288571919,
        CWAV_AFREQ: 1.2629637216824057,
        HWAV_AFREQ: 0.999741105488073,
        SWND_AFREQ: 1.1887802966092247,
      },
    },
  ],
};

describe("parseCountyResponse", () => {
  it("extracts the county and hazard frequencies (null = not applicable)", () => {
    const record = parseCountyResponse(denverResponse);
    expect(record).toMatchObject({
      countyFips: "08031",
      countyName: "Denver",
      stateCode: "CO",
      nriVersion: "December 2025",
      countyAreaSqMi: 156.2874729,
      hrcnAfreq: null,
      cfldAfreq: null,
      wntwAfreq: 13.73781288571919,
      hailAfreq: 8.290857574357961,
    });
    expect(record.rawAttributes.STCOFIPS).toBe("08031");
  });

  it("fails clearly when no county contains the point", () => {
    expect(() => parseCountyResponse({ features: [] })).toThrow(/No FEMA county/);
  });

  it("rejects a missing hazard field", () => {
    const attributes: Record<string, unknown> = { ...denverResponse.features[0].attributes };
    delete attributes.HAIL_AFREQ;
    expect(() => parseCountyResponse({ features: [{ attributes }] })).toThrow();
  });
});

describe("buildCountyQueryUrl", () => {
  it("queries by lon,lat point and requests only the fields we use", () => {
    const url = new URL(buildCountyQueryUrl(39.7392, -104.9903));
    expect(url.searchParams.get("geometry")).toBe("-104.9903,39.7392");
    expect(url.searchParams.get("outFields")).toContain("IFLD_AFREQ");
    expect(url.searchParams.get("outFields")).toContain("AREA");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
  });
});

describe("fetchFemaCountyByPoint", () => {
  it("wraps errors in the unified format with the FEMA emoji", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    await expect(fetchFemaCountyByPoint(0, 0, { fetchImpl })).rejects.toThrow(
      /FemaResponseError \|\| .*No FEMA county.* \|\| fetchFemaCountyByPoint \|\| 🦡/,
    );
  });
});
