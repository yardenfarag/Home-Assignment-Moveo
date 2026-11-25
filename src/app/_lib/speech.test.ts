import { describe, expect, it } from "vitest";
import { canListen, canSpeak, createRecognizer, speakableText } from "./speech";

describe("speakableText", () => {
  it("reads an answer naturally: no Markdown symbols, words for ≥ → · and ranges", () => {
    const markdown = [
      "**Dallas is High at 72.4**, rank 3 of 36.",
      "",
      "- **Severe storms:** 100 (score 0–100)",
      "- Heavy-rain days ≥ 2 in · see [FEMA](https://hazards.fema.gov/nri/)",
      "- Level: Medium → High",
    ].join("\n");
    expect(speakableText(markdown)).toBe(
      "Dallas is High at 72.4, rank 3 of 36. Severe storms: 100 (score 0 to 100). Heavy-rain days at least 2 in, see FEMA. Level: Medium to High",
    );
  });

  it("skips emoji and a closing 'For example:' (the examples are on-screen chips)", () => {
    expect(
      speakableText("I can only help with weather risk for our 36 hubs. 🐱 I can rank them, compare them, look at past weather, or explain a hub's score. For example:"),
    ).toBe("I can only help with weather risk for our 36 hubs. I can rank them, compare them, look at past weather, or explain a hub's score.");
    expect(speakableText("Ice storms ❄️ come from FEMA only.")).toBe("Ice storms come from FEMA only.");
  });

  it("keeps dates and negative numbers intact", () => {
    expect(speakableText("Weather data 2021-01-01 to 2026-11-24, lows of -18 °F.")).toBe("Weather data 2021-01-01 to 2026-11-24, lows of -18 °F.");
  });
});

describe("without a browser", () => {
  it("reports no speech support and creates no recognizer (so the buttons stay hidden)", () => {
    expect(canListen()).toBe(false);
    expect(canSpeak()).toBe(false);
    expect(createRecognizer({ onText: () => {}, onEnd: () => {}, onError: () => {} })).toBeNull();
  });
});
