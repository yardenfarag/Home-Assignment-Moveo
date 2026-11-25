# Assumptions, uncertainty & scope

What this agent assumes, what it can't know, and what it deliberately doesn't do. The agent repeats the parts that
apply in each answer: code attaches them to the answer's `limitations` list
([src/core/scoring/caveats.ts](../src/core/scoring/caveats.ts)), so they can't be forgotten.

## At a glance
The limits that matter most when you read an answer:
1. **Exposure, not losses.** A high score means bad weather hits often, not that it costs the most money.
2. **City-center points.** Each hub is its metro's center; the real warehouse may be in another county.
3. **Modeled weather, not station readings.** It smooths peaks, so extreme gusts and heavy snow are undercounted.
4. **County-level FEMA data.** County size and mountains distort some hazards (flood, tornado, Seattle's winter).
5. **History only.** No forecasts or live alerts.
6. **One national threshold per hazard.** The same snow means more in Atlanta than in Minneapolis; that isn't modeled.
7. **All hubs weigh the same.** No shipment or revenue data.

## Contents
- [What the score means and doesn't mean](#what-the-score-means-and-doesnt-mean)
- [Location](#location)
- [Data sources & their limits](#data-sources--their-limits)
- [Known scoring limitations](#known-scoring-limitations)
- [Time window](#time-window)
- [Thresholds](#thresholds-checked-against-us-national-weather-service-criteria)
- [Out of scope](#out-of-scope)
- [Agent behavior limits](#agent-behavior-limits)
- [Limits of the evaluation](#limits-of-the-evaluation)
- [Operational limits of the demo deployment](#operational-limits-of-the-demo-deployment)
- [Uncertainty the agent communicates](#uncertainty-the-agent-communicates)

## What the score means and doesn't mean
- **It measures exposure, not loss.** It shows how often hazardous weather hits a hub's location. It does
  **not** include hub volume or revenue, building quality, existing resilience upgrades, insurance,
  or how well the local area copes. "Most exposed" ≠ "most expensive".
- **Local adaptation is not modeled.** The same 5 cm of snow paralyzes Atlanta but not Minneapolis.
  We use one national threshold per hazard (an absolute scale). Southern cold and ice exposure is partly covered by
  FEMA's ice storm and cold wave frequencies. *Later:* per-hub local thresholds.
- **All hubs are treated as equally important.** We have no shipment or revenue data. *Later:* optional volume weighting.
- Scores are **decision support**. Final investment decisions belong to the team.

## Location
- A hub = the metro's **city-center point**. Real warehouses often sit near the airport or on the metro's edge,
  possibly in a different county.
- Weather is read for that point from a ~9–11 km model grid. FEMA data is for the **county** that contains the point.

## Data sources & their limits
| Source | Used for | Limits |
|---|---|---|
| [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) | Daily snowfall, min temperature, precipitation, max wind gust, max apparent temperature, 2021-01-01 → yesterday, in each hub's local calendar day | It's **modeled reanalysis, not station measurements**: it smooths peaks, so wind gusts in particular are underestimated. The last few days are **preliminary** and get revised, so we re-fetch the last 7 every night. The free tier is **non-commercial**: a real deployment needs a paid plan. Data is licensed CC-BY 4.0 (attribution shown in the UI). |
| [FEMA National Risk Index v1.20 (Dec 2025)](https://hazards.fema.gov/nri/data-resources) via its public [ArcGIS county service](https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0) | Annualized frequency of hurricane, tornado, hail, inland and coastal flooding, ice storm, winter weather, cold wave, heat wave, strong wind | County-level. Built from long historical records, so it **changes slowly** and won't reflect last year's events. Riverine flood is now called `IFLD` (Inland Flooding). |

## Known scoring limitations
How these are handled is in [decisions.md](decisions.md) D47–D58. The numbers are in
[`src/core/scoring/config.ts`](../src/core/scoring/config.ts).
- **County-level FEMA data depends on county shape and size.**
  - **Tornado:** FEMA spreads frequency by county area (within-state rank correlation +0.62), so we score **per 1,000 sq mi** (D53).
  - **Inland flood:** since scoring v2 (D123) it's also scored **per 1,000 sq mi**, but no county counts as smaller than the
    median US county (646 sq mi). This fixed huge counties that used to max out (Maricopa/Phoenix 100 → 19, Clark/Las
    Vegas 100 → 19) without blowing up tiny city-counties (pure per-area would have taken St. Louis City from 36 to 100).
    The trade-off: a large county that is urban throughout, like Harris County (Houston, 1,795 sq mi), is now
    **understated**. Houston's flood score stays High (72) thanks to its observed heavy-rain days.
  - **Mountains:** King County (Seattle) includes the Cascades and Salt Lake County the Wasatch, which inflates FEMA winter weather.
    Seattle's winter is flagged **Medium confidence** because the sources disagree (D52).
- **The FEMA flood half still caps at 100 for 11 of 36 hubs** (15 in v1). Metros issue many flood warnings, so FEMA alone
  can't separate them, and among those hubs the flood ranking is decided by observed heavy-rain days (D97, D123).
- **Heavy rain ≠ flooding.** The flood score blends heavy-rain days with FEMA's flood warnings but doesn't cross-check them (D56).
- **Ice storms come from FEMA only.** Observed weather has no ice signal (D56).
- **Heavy-snow days (≥15 cm) and warning-level gusts (≥93 km/h) are reported, not scored.** The modeled data barely
  registers them (D20a, D50).
- **FEMA anchors are national 95th percentiles** among counties where FEMA rates the hazard. Coastal flooding is
  rated for only 588 coastal counties, so its anchor compares coastal counties with each other (D47).
- **Heat:** FEMA heat waves follow local NWS heat-alert criteria (lower thresholds up north), while our observed heat days
  use one national ≥40 °C feels-like threshold. Disagreement there is real and is flagged (e.g. New York, Kansas City).

## Time window
- Scores use a **rolling 5-year window** ending at the newest available day, so they move slightly every night.
- "Last year" means **calendar 2025** unless the user says otherwise. The agent states the period it used.
- 5 years is short for rare events (hurricanes, big ice storms). That's why those rely on FEMA's long-record frequencies.

## Thresholds (checked against US National Weather Service criteria)
NWS sets most warning criteria **per local office**, so there is rarely one national number. We picked one
national value per hazard, close to typical NWS warning levels:

| Day type | Our threshold | NWS reference | Note |
|---|---|---|---|
| Snow day | ≥ 1 cm snowfall | No NWS daily definition | A reasonable "measurable snow" proxy |
| Heavy snow day | ≥ 15 cm (~6 in) | Winter Storm Warning: locally set, roughly 4–12 in ([NWSI 10-513](https://www.weather.gov/media/directives/010_pdfs/pd01005013curr.pdf), [criteria map](https://www.weather.gov/snow-criteria)). Denver: 6 in/12 h ([BOU](https://www.weather.gov/bou/winterguide)) | Southern offices use lower values |
| Extreme cold day | min temp ≤ −18 °C (0 °F) | Extreme Cold Warning (replaced Wind Chill Warning on 2024-10-01, [NWS](https://www.weather.gov/news/243009-cold-hazard-simplification)). Locally set, from about 0 °F (South) to −35 °F (North) | Uses air temperature, not wind chill |
| Heavy rain day | ≥ 50 mm (~2 in) | **No NWS daily rain threshold**: flood warnings are impact-based. NOAA tracks heavy days as the top 1% locally ([USGCRP](https://www.globalchange.gov/indicators/heavy-precipitation)) | Arid hubs rarely reach 50 mm. Their flash-flood exposure comes through FEMA |
| High wind day | gust ≥ 93 km/h (58 mph) | High Wind Warning: sustained ≥ 40 mph or gusts ≥ 58 mph ([NWSI 10-515](https://www.weather.gov/media/directives/010_pdfs/pd01005015curr.pdf)) | Exact match |
| Wind advisory day | gust ≥ 72 km/h (45 mph) | Wind Advisory: sustained 30–39 mph (NWSI 10-515). The 45 mph gust value is our own choice | **The wind signal we actually score on.** The Step 2 check over 5 years: warning-level days were 0–1/yr (13 of 36 hubs at 0, because modeled data smooths peaks, though single storms do show up, e.g. Tampa 153 km/h during Hurricane Milton), while advisory days were 0.2–8.6/yr |
| Extreme heat day | apparent temp max ≥ 40 °C (~105 °F) | Extreme Heat Warning (renamed from Excessive Heat Warning 2025-03-04, [NWS](https://www.weather.gov/news/250310-heat-hazard)): heat index ~105–110 °F, locally set | Open-Meteo's "apparent temperature" is a different formula from the NWS heat index |

## Out of scope
- **Dust storms.** FEMA has no dust hazard. NOAA's [Storm Events Database](https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/)
  has "Dust Storm" events by forecast zone (84 nationwide in 2023, mostly TX/AZ/CA). Dust storm warning criteria:
  visibility ≤ ¼ mile with winds usually ≥ 25 mph ([NWSI 10-515](https://www.weather.gov/media/directives/010_pdfs/pd01005015curr.pdf)).
  Planned as the first post-deploy feature.
- Wildfire smoke, earthquakes, lightning and drought (FEMA has some of these, but they aren't weather-disruption
  hazards in our brief).
- Forecasts and live alerts. This version covers historical exposure only.
- Cities that aren't in our hub list. The agent says so instead of guessing.

## Agent behavior limits
- **The guard is probabilistic.** Jev gives probabilities, not rules, and isn't fully deterministic (scores moved by
  up to 0.09 between repeated runs of the same message). The cutoffs leave wide margins on the 32 test messages
  ([guard-evals.md](guard-evals.md)), but an unusual real question could still be refused, or a cleverly worded off-topic
  one let through. A refused analyst sees example questions and can rephrase. A message that slips through still meets
  the agent's own checks: it declines off-topic questions and can't state a number no tool returned.
- **The guard fails open.** If Jev is down or takes over 2 s, the message goes to the agent unchecked (logged as a
  `guard.decision` event with `failedOpen`).
- **Follow-ups may repeat earlier numbers.** Within a conversation, the agent may reuse numbers from earlier
  tool results (D65). If the nightly re-score changed a value since then, a follow-up could repeat the older one.
  Starting a new conversation always uses the latest scores.
- **Free-text numbers are checked softly.** Numbers in `dataUsed` must come from tools (hard check), but numbers
  inside the prose are only *flagged* when no tool returned them (D61). The evals track those warnings.
- **Cost grows with conversation length.** Earlier tool results are sent with each new question, so a long chat costs
  more per answer (about 35k input tokens by the third turn, measured on the starting model). The chosen model makes
  about 1 tool call per answer, at about $0.01 per answer ([bakeoff.md](bakeoff.md)).
- **A slow model step ends the answer.** Each model step has 25 s and a whole answer 60 s. Past that, the user gets a
  friendly "couldn't answer, please try again" instead of a late answer (D108).

## Limits of the evaluation
- **Small samples.** The model was chosen on 3 runs of 13 cases per finalist. That's enough to see big differences,
  not small ones ([bakeoff.md](bakeoff.md)).
- **Wording checks are pattern matches.** A correct answer phrased in an unexpected way can fail a check. Two such
  false failures were found and fixed in the bakeoff (D109).
- **The judge is an LLM too.** It's checked before every run with planted good and bad answers, and self-contradicting
  verdicts mark it unreliable. Still, the bakeoff showed judges can favor their own model family. That's why the judge
  must come from a different provider than the answering model (D111), and only its faithful-to-data score can fail a
  case (D103).
- **The prompt was developed on the starting model** (Sonnet) and used unchanged for every model in the bakeoff.

## Operational limits of the demo deployment
- **Voice runs on the browser's own speech services.** Speech-to-text works in Chrome, Edge and Safari (not Firefox, so the 🎤
  is hidden there). **Chrome and Edge send the recorded audio to Google or Microsoft** to turn it into text; Sneakoscope never
  receives or stores audio, only the resulting text when you press Ask. Recognition can mishear hub names, which is why
  the words fill the box for you to check instead of being sent straight away. Read-aloud uses the voices installed on the
  device, so it sounds different from one device to another.
- **A hub whose nightly update failed keeps its last good score** (D133). It stays in the overview and the answers with its older date; the overview lists hubs whose data ends 2+ days before the others as stale. A hub without a usable FEMA record that night gets no alert, because its drop would be a data gap, not weather.
- **Alerts compare each night with the night before.** A score that creeps up slowly (say 2 points a week) never moves
  10 points in one night, so it raises an alert only when it crosses a level cut-off. Dismissing an alert hides it in
  that browser only; there's no login, so no shared state.
- **Eval runs from the app are shared by everyone** (D130): one every 30 minutes, 4 per day. One visitor can use up the
  day's runs, and others then see when the next one is possible. A run is paid from the same OpenRouter key as the
  answers. The "last run" shown is the latest saved one, from the app or from `npm run eval`, so it can be days old.
- **There is no login** (D113). Anyone with the link can ask questions, and every answer is paid from the same OpenRouter
  key. Request limits cap the damage: 20 questions per 10 minutes and 100 per day per visitor, 300 per day in total
  (D114). Someone switching IP addresses can get around the per-visitor limits, but not the daily total. If the key's
  credit runs out, the agent stops answering (with a friendly error) until a new key is set. A chat can be reopened
  by anyone who knows its random id.
- The OpenRouter key has a **$20 credit cap** and **expires 7 days after creation (around 2026-12-02)**.
  After that the agent can't answer until a new key is set in Vercel's environment variables.
- Open-Meteo's free tier is per-IP and non-commercial. A production version needs their paid API.

## Uncertainty the agent communicates
- **Confidence** (High / Medium / Low) is computed in code, never by the model
  ([src/core/scoring/confidence.ts](../src/core/scoring/confidence.ts)). It's **High** when the data is complete (≥ 95% of
  days present) and the two sources agree. It drops to **Medium** when observed weather and FEMA disagree by more than
  40 points (compared like with like, D56), and to **Low** when less than 80% of days are present. Every confidence comes
  with a one-line reason the agent can quote.
- **The premise of a question is checked by code.** "Why is Seattle's hurricane risk so high?" gets a correction in the
  first sentence, because code compares the claim with the real level (D63).
- Every answer lists the assumptions and limitations that apply to it.
