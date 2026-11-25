-- =============================================================================
-- County area for FEMA records (D53): tornado frequency is scored per area,
-- because FEMA apportions tornado frequency to counties by area.
-- Nullable so existing rows stay valid until `npm run ingest -- --refresh-fema`.
-- =============================================================================
alter table public.fema_nri
  add column county_area_sq_mi numeric check (county_area_sq_mi > 0);

comment on column public.fema_nri.county_area_sq_mi is 'County area in square miles, as published in the FEMA NRI AREA field ("Area (sq mi)").';
