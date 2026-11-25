import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentInputError } from "./agentInputError";
import { BoundaryError } from "./boundaryError";
import { toUserError, USER_ERRORS } from "./userErrors";

describe("toUserError — every failure becomes a friendly, actionable message (A4)", () => {
  it("keeps the specific message of an invalid question", () => {
    const error = toUserError(new AgentInputError("That's a bit long for me — please keep it under 1,000 characters."));
    expect(error).toMatchObject({ code: "invalid_request", status: 400, retryable: false });
    expect(error.message).toMatch(/under 1,000 characters/);
  });

  it("maps a request-shape (Zod) error to invalid_request with the generic friendly text", () => {
    const zodError = z.object({ message: z.string() }).safeParse({}).error!;
    expect(toUserError(zodError)).toMatchObject({ code: "invalid_request", message: USER_ERRORS.invalid_request.message });
  });

  it("maps 'no data yet' and model failures", () => {
    const noData = new BoundaryError({ name: "NoDataError", message: "x", functionName: "f", boundary: "database" });
    const llm = new BoundaryError({ name: "AgentAnswerValidationError", message: "x", functionName: "f", boundary: "llm" });
    expect(toUserError(noData)).toMatchObject({ code: "no_data", status: 503, retryable: true });
    expect(toUserError(llm)).toMatchObject({ code: "agent_failed", status: 502, retryable: true });
  });

  it("never leaks internals for unknown errors", () => {
    const error = toUserError(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2"));
    expect(error.code).toBe("internal_error");
    expect(JSON.stringify(error)).not.toMatch(/ECONNREFUSED|hunter2/);
  });

  it("every message comes with a hint", () => {
    for (const copy of Object.values(USER_ERRORS)) expect(copy.hint.length).toBeGreaterThan(10);
  });
});
