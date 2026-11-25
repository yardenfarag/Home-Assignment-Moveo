# Assumptions, uncertainty & scope

What this agent assumes, what it can't know, and what it deliberately doesn't do.
The agent repeats the relevant parts in its answers (the `assumptions` and `limitations` fields).

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

## Out of scope (Phase 1)
- **Dust storms.** FEMA has no dust hazard. NOAA's [Storm Events Database](https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/)
  has "Dust Storm" events by forecast zone (84 nationwide in 2023, mostly TX/AZ/CA). Dust storm warning criteria:
  visibility ≤ ¼ mile with winds usually ≥ 25 mph ([NWSI 10-515](https://www.weather.gov/media/directives/010_pdfs/pd01005015curr.pdf)).
  Planned as the first post-deploy feature.
- Wildfire smoke, earthquakes, lightning and drought (FEMA has some of these, but they aren't weather-disruption
  hazards in our brief).
- Forecasts and live alerts. Phase 1 is historical exposure only.
- Cities that aren't in our hub list. The agent says so instead of guessing.

## Operational limits of the demo deployment
- The OpenRouter key has a **$20 credit cap** and **expires 7 days after creation (around 2026-12-02)**.
  After that the agent can't answer until a new key is set in Vercel's environment variables.
- Open-Meteo's free tier is per-IP and non-commercial. A production version needs their paid API.

## Uncertainty the agent communicates
- **Confidence** (High / Medium / Low) is computed in code from data completeness (≥95% of days present) and
  the number of sources backing each hazard (observed + FEMA).
- Every answer lists the assumptions and limitations that apply to it.
