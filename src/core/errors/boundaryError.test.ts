import { describe, expect, it } from "vitest";
import { BoundaryError, describeUnknownError, formatBoundaryMessage } from "./boundaryError";

describe("formatBoundaryMessage", () => {
  it("builds 'Name || message || function || emoji'", () => {
    expect(
      formatBoundaryMessage({
        name: "SupabaseQueryError",
        message: "relation does not exist",
        functionName: "listActiveHubs",
        boundary: "database",
      }),
    ).toBe("SupabaseQueryError || relation does not exist || listActiveHubs || 🐘");
  });
});

describe("BoundaryError", () => {
  it("keeps name, boundary, function, plain detail and cause", () => {
    const cause = new Error("socket hang up");
    const error = new BoundaryError({
      name: "OpenMeteoFetchError",
      message: "HTTP 429 for hub dallas",
      functionName: "fetchDailyWeather",
      boundary: "openMeteo",
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("OpenMeteoFetchError");
    expect(error.message).toBe("OpenMeteoFetchError || HTTP 429 for hub dallas || fetchDailyWeather || 🐸");
    expect(error.detail).toBe("HTTP 429 for hub dallas");
    expect(error.boundary).toBe("openMeteo");
    expect(error.functionName).toBe("fetchDailyWeather");
    expect(error.cause).toBe(cause);
  });
});

describe("describeUnknownError", () => {
  it("handles Error, string and objects", () => {
    expect(describeUnknownError(new Error("boom"))).toBe("boom");
    expect(describeUnknownError("plain")).toBe("plain");
    expect(describeUnknownError({ code: 42 })).toBe('{"code":42}');
  });
});
