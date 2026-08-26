BEGIN;

-- ============================================================
-- Let the app recognise a site from the worksheet it arrives on.
--
-- The monthly payroll workbooks carry one worksheet per site, named the way
-- the site is known internally ("B Office", "MOA. HK", "SKI"). Recording that
-- name against the site lets the in-app importer match a sheet to a site
-- without anybody re-entering the mapping every month.
--
-- The 24 values below are the mapping that the verified May, June and July
-- imports already used.
-- ============================================================

ALTER TABLE sites ADD COLUMN IF NOT EXISTS sheet_key TEXT;

-- one site per worksheet name; NULLs are ignored by a unique index
CREATE UNIQUE INDEX IF NOT EXISTS sites_sheet_key_unique
  ON sites (lower(btrim(sheet_key))) WHERE sheet_key IS NOT NULL;

UPDATE sites SET sheet_key = v.k FROM (VALUES
  ('6ee8ffc4-2d45-47dc-9301-b32b1cec5c6b'::uuid, 'B Office'),
  ('81136148-fda0-4d5c-a8df-fe6dc6979bdd', 'CFCM HK'),
  ('83b715a2-64b5-4607-bb4d-221fc98c270e', 'CFCM LS'),
  ('bd299a27-d521-4eee-8ea1-c3a4cfbb28b5', 'G.Gate'),
  ('31ba6081-4c7d-4a89-98cc-d0ba26d3cb0b', 'Maddi CC'),
  ('77050082-8fff-4156-bd2a-75f56b4ec78f', 'Almaza HK'),
  ('d84cb94f-aca2-4958-984b-d787176690c4', 'ALmza LS'),
  ('d51b4772-0ae9-4c7c-bf9a-9cf8891dc14c', 'Oriana'),
  ('9b8fc113-d0b4-46d8-8f45-39b37b665d7c', 'D5 HK'),
  ('bac2904a-532f-4ad1-9511-8c0c1635e5c5', 'D5 LS'),
  ('faedd386-2a26-42fa-94a4-6b2747d034dc', 'U Venus'),
  ('7c788127-66a0-42dc-bb0a-88565e38a9d4', 'Town.C'),
  ('f7c0e6f9-3c08-4dc6-97cd-315572a17066', 'H Office'),
  ('4d1a88a1-494b-40aa-a79a-3b4d7c5f0c85', 'MOA. HK'),
  ('dbe4198f-c195-4da1-a72a-42bebbf6866d', 'Mazar'),
  ('d8017b1d-afd0-4075-a0b0-4e5faf51cdaa', 'Z Park'),
  ('1632d59b-933b-4bd4-9e20-700e83bdaf49', 'Arkan HK'),
  ('b700f303-1f06-4cfd-b397-9d4ddfc019a6', 'Arkan LS'),
  ('118c3f82-dd21-4002-9fbc-f02d7d91a770', 'MOE HK'),
  ('010e796a-4cb3-4b53-b745-f03a4876a268', 'MOE LS'),
  ('7611fa5b-c8ab-42b2-bdf3-5c767ea4ee6d', 'Magic'),
  ('35631ae0-e0d1-4905-9eae-22ef67f91336', 'Cinema'),
  ('7dcdbefb-2b87-4420-823e-514f93a5e1b1', 'SKI'),
  ('36f00bfb-c812-4f09-a90a-5e142d3cc8d4', 'Egarat')
) AS v(id, k)
WHERE sites.id = v.id;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM sites WHERE sheet_key IS NOT NULL;
  IF n <> 24 THEN
    RAISE EXCEPTION 'expected 24 sites mapped to a worksheet, got %', n;
  END IF;
END $$;

COMMIT;
