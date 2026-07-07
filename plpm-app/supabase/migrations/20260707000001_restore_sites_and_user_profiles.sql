-- Applied to production 2026-07-07 while investigating an "empty dashboard"
-- report. The root cause turned out to be a free-tier project pause (reset
-- table statistics made every table look empty), not data loss, so the sites
-- insert below no-op'd against the intact rows via ON CONFLICT DO NOTHING.
--
-- The user_profiles insert did real work: it recreated profile rows for
-- auth.users accounts that were missing one (the on-signup trigger only fires
-- for new users). Kept for the ledger and as an idempotent safety net.
--
-- Site names/types here were recovered independently from the two May 2026
-- payroll workbooks (El Tagamo/CFCM zone and October zone), matched per-sheet
-- by gross/net totals; the live sites table already carried fuller names.

INSERT INTO sites (id, name, name_ar, service_type, client_name, active, sort_order) VALUES
  -- El Tagamo / CFCM zone
  ('6ee8ffc4-2d45-47dc-9301-b32b1cec5c6b', 'B Office',    'المباني الادارية الفطيم',        'hk',    'الخدمات الزراعيه الحديثه', true, 1),
  ('81136148-fda0-4d5c-a8df-fe6dc6979bdd', 'CFCM HK',     'كايرو فيستفال سيتى',             'hk',    NULL,                       true, 2),
  ('83b715a2-64b5-4607-bb4d-221fc98c270e', 'CFCM LS',     'زراعه المول (كايرو فستيفال)',    'ls',    'الخدمات الزراعيه الحديثه', true, 3),
  ('bd299a27-d521-4eee-8ea1-c3a4cfbb28b5', 'Golden Gate', 'جولدن جيت',                      'hk',    'بروفشنال ليدرز',           true, 4),
  ('31ba6081-4c7d-4a89-98cc-d0ba26d3cb0b', 'Maadi CC',    'المعادى سيتى سنتر',              'hk',    'الشروق للمشروعات',         true, 5),
  ('77050082-8fff-4156-bd2a-75f56b4ec78f', 'Almaza HK',   'سيتى سنتر الماظة',               'hk',    'الشروق للمشروعات',         true, 6),
  ('d84cb94f-aca2-4958-984b-d787176690c4', 'Almaza LS',   'زراعه المول (ألماظه)',           'ls',    'الخدمات الزراعيه الحديثه', true, 7),
  ('d51b4772-0ae9-4c7c-bf9a-9cf8891dc14c', 'Oriana',      'زراعه السيتي (كايرو فستيفال)',   'ls',    'الخدمات الزراعيه الحديثه', true, 8),
  ('9b8fc113-d0b4-46d8-8f45-39b37b665d7c', 'D5 HK',       'D.5',                            'hk',    'الشروق للمشروعات',         true, 9),
  ('bac2904a-532f-4ad1-9511-8c0c1635e5c5', 'D5 LS',       'زراعة السخنة',                   'ls',    'الشروق للمشروعات',         true, 10),
  ('faedd386-2a26-42fa-94a4-6b2747d034dc', 'U Venus',     'يوفينوس',                        'hk',    'بروفشنال ليدرز',           true, 11),
  ('7c788127-66a0-42dc-bb0a-88565e38a9d4', 'Town Center', 'تاون سنتر',                      'hk',    'الشروق للمشروعات',         true, 12),
  ('f7c0e6f9-3c08-4dc6-97cd-315572a17066', 'H Office',    'حركه - صيانه - مكتب ادارى',      'other', 'الشروق للمشروعات',         true, 13),
  -- October zone
  ('4d1a88a1-494b-40aa-a79a-3b4d7c5f0c85', 'MOA HK',      'مول العرب',                      'hk',    'بروفشنال ليدرز',           true, 14),
  ('dbe4198f-c195-4da1-a72a-42bebbf6866d', 'Mazar',       'مزار',                           'hk',    'بروفشنال ليدرز',           true, 15),
  ('d8017b1d-afd0-4075-a0b0-4e5faf51cdaa', 'Z Park',      'زد بارك',                        'hk',    'الشروق للمشروعات',         true, 16),
  ('1632d59b-933b-4bd4-9e20-700e83bdaf49', 'Arkan HK',    'اركان بلازا',                    'hk',    NULL,                       true, 17),
  ('b700f303-1f06-4cfd-b397-9d4ddfc019a6', 'Arkan LS',    'اركان بلازا - لاندسكيب',         'ls',    NULL,                       true, 18),
  ('118c3f82-dd21-4002-9fbc-f02d7d91a770', 'MOE HK',      'مول مصر',                        'hk',    'الشروق للمشروعات',         true, 19),
  ('010e796a-4cb3-4b53-b745-f03a4876a268', 'MOE LS',      'مول مصر - زراعة',                'ls',    'الشروق للمشروعات',         true, 20),
  ('7611fa5b-c8ab-42b2-bdf3-5c767ea4ee6d', 'Magic (MOE)', 'ماجيك - مول مصر',                'hk',    'الشروق للمشروعات',         true, 21),
  ('35631ae0-e0d1-4905-9eae-22ef67f91336', 'Cinema (MOE)','سينما - مول مصر',                'hk',    'الشروق للمشروعات',         true, 22),
  ('7dcdbefb-2b87-4420-823e-514f93a5e1b1', 'SKI (MOE)',   'سكي مصر - مول مصر',              'hk',    'الشروق للمشروعات',         true, 23),
  ('36f00bfb-c812-4f09-a90a-5e142d3cc8d4', 'Egarat',      'شقق ومرتبات الخارجية',           'other', 'الشروق للمشروعات',         true, 24)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (id, full_name, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email, ''),
  CASE WHEN u.email = 'moatazsamir0044@gmail.com' THEN 'admin' ELSE 'finance' END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
