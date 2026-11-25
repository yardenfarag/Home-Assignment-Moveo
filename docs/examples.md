# Example answers

Real answers from the **live app** (https://sneakoscope.vercel.app, model `openai/gpt-6.1-terra`), recorded by the eval run
of 2026-11-25 16:11 UTC and copied **verbatim** from
the saved results (nothing edited or picked by hand). Each one passed every eval check. The answer text is what the
model wrote; confidence, the premise verdict, the disclaimer and the standing limitations are added by code
(see [design.md](design.md#3-how-the-llm-is-kept-from-inventing-numbers)).

Scores change a little every night as the 5-year window moves, so today's numbers may differ slightly.

## Contents
- [The brief's four questions](#the-briefs-four-questions)
- [Pushing back on a false premise](#pushing-back-on-a-false-premise)
- [A follow-up question (conversation memory)](#a-follow-up-question-conversation-memory)
- [A decision question (recommendation + disclaimer)](#a-decision-question-recommendation--disclaimer)
- [Questions it should not answer](#questions-it-should-not-answer)

## The brief's four questions

**Q: Which hubs in the Midwest are most exposed to winter disruption?**

> **Minneapolis and Detroit are the Midwest hubs most exposed to winter weather**, with high winter-risk scores. The next three have medium scores:
>
> - Minneapolis: **86.5** — high
> - Detroit: **70.3** — high
> - St. Louis: **58.2** — medium
> - Milwaukee: **53.1** — medium
> - Chicago: **49.4** — medium
>
> The ranking reflects winter exposure, not actual operational disruption. Local adaptation and existing resilience measures are not modeled.

- **Confidence (set by code):** high
- **Tools called:** `rank_hubs({"metric":"winter","region":"Midwest","order":"most","limit":5})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| minneapolis | winter risk score | 86.5 | score 0-100 |
| detroit | winter risk score | 70.3 | score 0-100 |
| st-louis | winter risk score | 58.2 | score 0-100 |
| milwaukee | winter risk score | 53.1 | score 0-100 |
| chicago | winter risk score | 49.4 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Winter exposure scores do not measure actual operational disruption or account for local adaptation and existing resilience measures.
- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
</details>

**Q: Compare Miami and Houston in terms of hurricane and flood exposure.**

> **Miami has higher hurricane exposure; Houston has higher flood exposure.** Both hubs score high for both hazards.
>
> - **Hurricane:** Miami scores **100**, compared with Houston’s **74**. These scores use FEMA’s long-term county frequency record.
> - **Flood:** Houston scores **84**, compared with Miami’s **76**. Both have a FEMA flood score of **100**, but Houston’s observed-weather score is higher: **68** versus Miami’s **52**.
>
> Confidence is high for both comparisons. For flood, the sources measure different things: observed heavy rain and county-wide flood warnings. Heavy rain is not the same as flooding.

- **Confidence (set by code):** high
- **Tools called:** `compare_hubs({"hubIds":["miami","houston"],"hazards":["hurricane","flood"]})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| miami | hurricane exposure score | 100 | score 0-100 |
| houston | hurricane exposure score | 74 | score 0-100 |
| miami | flood exposure score | 76 | score 0-100 |
| houston | flood exposure score | 84 | score 0-100 |
| miami | FEMA flood score | 100 | score 0-100 |
| houston | FEMA flood score | 100 | score 0-100 |
| miami | observed-weather flood score | 52 | score 0-100 |
| houston | observed-weather flood score | 68 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Observed heavy rain and county-wide flood warnings measure different things; heavy rain is not the same as flooding.
- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
</details>

**Q: What percentage of days in Denver last year had snowfall?**

> In calendar year 2025, Denver had measurable snowfall on **9% of days**—33 days with at least 0.1 in (0.25 cm) of snow.
>
> The stricter threshold used in our winter risk score—at least 0.4 in (1 cm)—was met on **4.7% of days**, or 17 days.

- **Confidence (set by code):** high
- **Tools called:** `get_weather_stat({"hubId":"denver","metric":"measurable_snow_day","periodKind":"year","year":2025,"month":null,"startDate":null,"endDate":null})` · `get_weather_stat({"hubId":"denver","metric":"snow_day","periodKind":"year","year":2025,"month":null,"startDate":null,"endDate":null})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| denver | Percentage of days with measurable snow in 2025 | 9 | % |
| denver | Measurable-snow days in 2025 | 33 | days |
| denver | Percentage of snow days counted by winter score in 2025 | 4.7 | % |
| denver | Snow days counted by winter score in 2025 | 17 | days |
</details>

<details><summary>Limitations shown with this answer</summary>

- Observed weather is modeled reanalysis (Open-Meteo), not station measurements, so it smooths out extremes.
- The measurable-snow day count, ≥ 0.1 in of snow (≥ 0.25 cm of snow), is reported only: it answers "did it snow?"; the winter score counts snow days of ≥ 0.4 in (1 cm) instead.
</details>

**Q: Why is the Dallas hub's weather disruption risk high?**

> Dallas is rated **high** for weather exposure, with an overall score of **72.4** and an overall rank of **3** among the hubs. Severe storms are the main reason.
>
> - **Severe storms score 100.** This score uses FEMA’s long-term county record; hail is reported at **8.92 events/yr**.
> - **Heat scores 84.2**, and **flood scores 78**, adding to Dallas’s exposure. The flood score combines observed heavy rain with FEMA county-wide flood warnings, which measure different things.
> - The overall formula gives extra weight to the worst hazard: Dallas’s weighted hazard average is **54**, but its worst hazard score is **100**.
>
> The score measures exposure, not the hub’s actual disruption or financial losses.

- **Confidence (set by code):** high
- **Premise check (set by code):** the question assumed dallas is *high*; the data says *high* → premise holds ✅
- **Tools called:** `explain_hub_score({"hubId":"dallas"})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| dallas | overall risk score | 72.4 | score 0-100 |
| dallas | overall rank among hubs | 3 | rank |
| dallas | severe storms score | 100 | score 0-100 |
| dallas | FEMA hail frequency | 8.92 | events/yr |
| dallas | heat score | 84.2 | score 0-100 |
| dallas | flood score | 78 | score 0-100 |
| dallas | weighted average of hazard scores | 54 | score 0-100 |
| dallas | worst hazard score | 100 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
- Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.
- Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.
- Warning-level gusts, gusts ≥ 58 mph (gusts ≥ 93 km/h), are undercounted by modeled data, so wind is scored on advisory-level gust days, gusts ≥ 45 mph (gusts ≥ 72 km/h).
- Observed heat uses one national threshold, feels-like ≥ 104 °F (feels-like ≥ 40 °C); FEMA heat waves follow local heat-alert criteria, so the two can differ.
</details>

## Pushing back on a false premise

**Q: Why is Seattle's hurricane risk so high?**

> Seattle’s hurricane risk is **low, not high**: its score is **0 on the 0–100 scale**. The hurricane score uses FEMA’s long-term county frequency record, rather than observed weather data. Confidence in this hazard score is high.

- **Confidence (set by code):** medium
- **Premise check (set by code):** the question assumed seattle hurricane is *high*; the data says *low* → premise does NOT hold ❌
- **Tools called:** `explain_hub_score({"hubId":"seattle"})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| seattle | hurricane risk score | 0 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
- Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.
- Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.
- Warning-level gusts, gusts ≥ 58 mph (gusts ≥ 93 km/h), are undercounted by modeled data, so wind is scored on advisory-level gust days, gusts ≥ 45 mph (gusts ≥ 72 km/h).
- Observed heat uses one national threshold, feels-like ≥ 104 °F (feels-like ≥ 40 °C); FEMA heat waves follow local heat-alert criteria, so the two can differ.
</details>

## A follow-up question (conversation memory)

**Q: Which Midwest hub is most exposed to winter weather?**

> **Minneapolis, Minnesota** is the Midwest hub most exposed to winter weather, with a **high winter score of 86.5**. It ranks second among all hubs for winter exposure.
>
> The observed-weather component scores 86.7, and the FEMA component scores 86.3. Confidence in the winter result is high: the data are complete and the sources tell the same story.

- **Confidence (set by code):** medium
- **Tools called:** `rank_hubs({"metric":"winter","region":"Midwest","order":"most","limit":1})` · `explain_hub_score({"hubId":"minneapolis"})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| minneapolis | winter risk score | 86.5 | score 0-100 |
| minneapolis | winter rank among all hubs | 2 | rank |
| minneapolis | observed-weather winter component | 86.7 | score 0-100 |
| minneapolis | FEMA winter component | 86.3 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
- Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.
- Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.
- Warning-level gusts, gusts ≥ 58 mph (gusts ≥ 93 km/h), are undercounted by modeled data, so wind is scored on advisory-level gust days, gusts ≥ 45 mph (gusts ≥ 72 km/h).
- Observed heat uses one national threshold, feels-like ≥ 104 °F (feels-like ≥ 40 °C); FEMA heat waves follow local heat-alert criteria, so the two can differ.
</details>

**Q: Why that one?**

> **Minneapolis ranks highest in the Midwest for winter exposure largely because of extreme cold.** Its winter score is **86.5**, rated high.
>
> - The observed-weather record shows **26 extreme-cold days per year**, with an extreme-cold score of **86.7**. It also shows **20.8 scored snow days per year**.
> - FEMA’s cold-wave record scores **86.3**. The overall FEMA winter component also scores **86.3**, close to the observed-weather winter component’s **86.7**.
>
> Confidence in the winter result is high: the data are complete, and the observed-weather and FEMA records tell the same story.

- **Confidence (set by code):** medium
- **Tools called:** `explain_hub_score({"hubId":"minneapolis"})`

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| minneapolis | winter risk score | 86.5 | score 0-100 |
| minneapolis | extreme-cold days | 26 | days/yr |
| minneapolis | extreme-cold signal score | 86.7 | score 0-100 |
| minneapolis | scored snow days | 20.8 | days/yr |
| minneapolis | FEMA cold-wave signal score | 86.3 | score 0-100 |
| minneapolis | FEMA winter component | 86.3 | score 0-100 |
| minneapolis | observed-weather winter component | 86.7 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
- Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.
- Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.
- Warning-level gusts, gusts ≥ 58 mph (gusts ≥ 93 km/h), are undercounted by modeled data, so wind is scored on advisory-level gust days, gusts ≥ 45 mph (gusts ≥ 72 km/h).
- Observed heat uses one national threshold, feels-like ≥ 104 °F (feels-like ≥ 40 °C); FEMA heat waves follow local heat-alert criteria, so the two can differ.
</details>

## A decision question (recommendation + disclaimer)

**Q: Should we prioritize Houston or Denver for a resilience upgrade this year?**

> **Lean toward prioritizing Houston**, based on its higher overall weather exposure. Confirm the choice against upgrade costs, facility condition and operational importance before committing.
>
> - Houston’s overall risk score is **69.1** (high), versus Denver’s **57.9** (medium). Houston’s largest hazard is flooding at **84**; hurricane and heat scores are also high, at **74** and **72.6**.
> - Denver still warrants attention: its severe-storm score is **100**, based on FEMA’s long-term record. Its winter score is **52.1**.
>
> These scores describe exposure, not expected losses or a forecast for this year.

- **Confidence (set by code):** high
- **Tools called:** `compare_hubs({"hubIds":["houston","denver"],"hazards":null})`

<details><summary>Recommendation (stance: <code>lean_yes</code>)</summary>

Prioritize Houston over Denver for the resilience upgrade, subject to operational and cost review.

- Houston’s overall risk score is 69.1, compared with Denver’s 57.9.
- Houston’s flood, hurricane and heat scores are 84, 74 and 72.6, respectively.
- Denver’s severe-storm score of 100 remains a significant competing priority.

What would change it:
- Evidence of greater expected losses or more cost-effective risk reduction at Denver.
- Differences in facility condition, existing protections or operational importance.

_Disclaimer added by code:_ Decision support based on weather exposure only. It does not include hub volume, upgrade costs or existing resilience. Final decisions belong to your team.
</details>

<details><summary>Numbers it relied on (each one checked against the tool results)</summary>

| Hub | What | Value | Unit |
|---|---|---|---|
| houston | overall risk score | 69.1 | score 0-100 |
| denver | overall risk score | 57.9 | score 0-100 |
| houston | flood risk score | 84 | score 0-100 |
| houston | hurricane risk score | 74 | score 0-100 |
| houston | heat risk score | 72.6 | score 0-100 |
| denver | severe-storm risk score | 100 | score 0-100 |
| denver | winter risk score | 52.1 | score 0-100 |
</details>

<details><summary>Limitations shown with this answer</summary>

- The scores are not a forecast for this year.
- The comparison does not include upgrade costs, facility condition or operational importance.
- Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.
- Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.
- Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it.
- Heavy-snow days, ≥ 5.9 in of snow (≥ 15 cm of snow), are barely registered by modeled data, so they are reported but not scored.
- Ice storms come from FEMA only — observed weather has no ice signal.
- Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.
- Heavy-rain days, ≥ 2 in of rain (≥ 50 mm of rain), are not the same as flooding; FEMA's flood frequency counts flood warnings anywhere in the county.
- In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.
- Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.
- Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.
- Warning-level gusts, gusts ≥ 58 mph (gusts ≥ 93 km/h), are undercounted by modeled data, so wind is scored on advisory-level gust days, gusts ≥ 45 mph (gusts ≥ 72 km/h).
- Observed heat uses one national threshold, feels-like ≥ 104 °F (feels-like ≥ 40 °C); FEMA heat waves follow local heat-alert criteria, so the two can differ.
</details>

## Questions it should not answer

**Q: What is the weather risk at our Boise hub?**

> Boise is not one of our covered hubs, so I can’t assess its weather risk. I can help with weather risk for our listed US hubs.

- **Confidence (set by code):** n/a (no data used)
- **Out of scope:** yes, politely declined, no tools called
- **Tools called:** none

<details><summary>Limitations shown with this answer</summary>

- Boise is not a covered hub.
</details>

**Q: Write me a short poem about the sea.**

> I can help with weather risk for our US distribution hubs, including coastal hazards.

- **Confidence (set by code):** n/a (no data used)
- **Out of scope:** yes, politely declined, no tools called
- **Tools called:** none

