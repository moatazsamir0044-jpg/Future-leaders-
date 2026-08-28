-- Seed the site register.
--
-- The 44 sites were originally inserted straight into the hosted project, so
-- the payroll import migrations that follow referenced site UUIDs no
-- migration ever created. Applying the chain to a fresh database failed with
-- `payroll_periods_site_id_fkey` violations. This migration supplies those
-- rows, keyed on their original IDs so the imports resolve.
--
-- `on conflict do nothing` keeps it a no-op on the existing project.

insert into public.sites (id, name, name_ar, service_type, client_name, active, sort_order) values
  ('b31a9cb9-6584-4791-b280-9f9a7c938ce5', 'Al Maqsad', 'المقصد', 'hk', 'Al Maqsad', false, 1),
  ('ed416cb4-799f-4ce1-9c3b-cfa4b7722d5a', 'Al Burouj', 'البروج', 'hk', 'Al Burouj', false, 2),
  ('7c83d8a4-4817-4793-af24-18f7287dd1ff', 'Sefarat Almanya', 'سفارة ألمانيا', 'hk', 'German Embassy', false, 3),
  ('33940d5f-a0a3-462d-9934-7fa54454c2ed', 'Hayah', 'حياه', 'hk', 'Hayah', false, 4),
  ('1a7f7bbb-06fe-4bed-bec1-96019d8e3a97', 'La Vista', 'لا فيستا', 'hk', 'La Vista', false, 5),
  ('e8aef10a-8686-4076-b6b0-77557baa1687', 'Laverde', 'لافيردي', 'hk', 'Laverde', false, 6),
  ('4de7432d-f6fb-43f0-a308-bca2b01bcdfb', 'Telal', 'تيلال', 'hk', 'Telal', false, 7),
  ('7416b5e9-e49b-4a80-ab5f-62a07bb43b0d', 'Crystal Lagoons', 'كريستال لاجونز', 'hk', 'Crystal Lagoons', false, 8),
  ('f10c1244-0c6f-42cb-ade6-7cf177c607ae', 'Madinaty', 'مدينتي', 'hk', 'Madinaty', false, 9),
  ('09ee198c-dd1f-48ab-841a-3daf49ef31d9', 'Uptown Cairo', 'أب تاون القاهرة', 'hk', 'Uptown Cairo', false, 10),
  ('d2175a73-3494-4609-9c4d-c1197e0db688', 'Mostakbal City', 'مستقبل سيتي', 'hk', 'Mostakbal City', false, 11),
  ('29ff37c7-9b3a-43aa-8956-3513ee2bfffd', 'Al Rehab', 'الرحاب', 'ls', 'Al Rehab', false, 12),
  ('f2f6ce2b-0fbf-4eab-9813-f7af69690ba5', 'Al Shorouk', 'الشروق', 'ls', 'Al Shorouk', false, 13),
  ('10eff6bd-9981-4cd0-97da-de657c169773', 'Badr', 'بدر', 'ls', 'Badr', false, 14),
  ('74392397-6f39-4dc5-bcd1-e7a161dfc97c', 'October', 'أكتوبر', 'ls', 'October', false, 15),
  ('882f660e-590a-4ba9-8887-d7e87a4d84f4', 'Obour', 'العبور', 'ls', 'Obour', false, 16),
  ('c023614f-45e1-4b45-8e75-4ea684389ba8', 'El Tagamo', 'التجمع', 'ls', 'El Tagamo', false, 17),
  ('b1a90222-5b5b-4aec-94c6-57ca5ef7f441', 'Sahl Hasheesh', 'سهل حشيش', 'hk', 'Sahl Hasheesh', false, 18),
  ('ddc00292-e4f3-47db-a53e-7f4c989c6b04', 'Porto Sokhna', 'بورتو السخنة', 'hk', 'Porto Sokhna', false, 19),
  ('3c30a082-df4e-43c0-9c08-b8aadb5832f0', 'New Cairo', 'القاهرة الجديدة', 'fm', 'New Cairo', false, 20),
  ('4d1a88a1-494b-40aa-a79a-3b4d7c5f0c85', 'Mall of Arabia - HK', 'مول العرب - نظافة', 'hk', 'Tagamoa region', true, 21),
  ('dbe4198f-c195-4da1-a72a-42bebbf6866d', 'Mazar', 'مزار', 'hk', 'Tagamoa region', true, 22),
  ('d8017b1d-afd0-4075-a0b0-4e5faf51cdaa', 'Zed Park', 'زد بارك', 'hk', 'Tagamoa region', true, 23),
  ('1632d59b-933b-4bd4-9e20-700e83bdaf49', 'Arkan Plaza - HK', 'اركان بلازا - نظافة', 'hk', 'Tagamoa region', true, 24),
  ('b700f303-1f06-4cfd-b397-9d4ddfc019a6', 'Arkan Plaza - LS', 'اركان بلازا - زراعة', 'ls', 'Tagamoa region', true, 25),
  ('118c3f82-dd21-4002-9fbc-f02d7d91a770', 'Mall of Egypt - HK', 'مول مصر - نظافة', 'hk', 'Tagamoa region', true, 26),
  ('010e796a-4cb3-4b53-b745-f03a4876a268', 'Mall of Egypt - LS', 'مول مصر - زراعة', 'ls', 'Tagamoa region', true, 27),
  ('7611fa5b-c8ab-42b2-bdf3-5c767ea4ee6d', 'Mall of Egypt - Magic Planet', 'مول مصر - ماجيك بلانيت', 'hk', 'Tagamoa region', true, 28),
  ('35631ae0-e0d1-4905-9eae-22ef67f91336', 'Mall of Egypt - Cinema', 'مول مصر - سينما', 'hk', 'Tagamoa region', true, 29),
  ('7dcdbefb-2b87-4420-823e-514f93a5e1b1', 'Mall of Egypt - Ski', 'مول مصر - سكي', 'hk', 'Tagamoa region', true, 30),
  ('36f00bfb-c812-4f09-a90a-5e142d3cc8d4', 'Mall of Egypt - Offices', 'مول مصر - عقارات', 'fm', 'Tagamoa region', true, 31),
  ('6ee8ffc4-2d45-47dc-9301-b32b1cec5c6b', 'Futtaim Admin Buildings', 'المباني الادارية الفطيم', 'fm', 'October region', true, 32),
  ('81136148-fda0-4d5c-a8df-fe6dc6979bdd', 'Cairo Festival City - HK', 'كايرو فيستفال سيتي - نظافة', 'hk', 'October region', true, 33),
  ('83b715a2-64b5-4607-bb4d-221fc98c270e', 'Cairo Festival City - LS', 'كايرو فيستفال سيتي - زراعة', 'ls', 'October region', true, 34),
  ('bd299a27-d521-4eee-8ea1-c3a4cfbb28b5', 'Golden Gate', 'جولدن جيت', 'hk', 'October region', true, 35),
  ('31ba6081-4c7d-4a89-98cc-d0ba26d3cb0b', 'Maadi City Center', 'المعادي سيتي سنتر', 'hk', 'October region', true, 36),
  ('77050082-8fff-4156-bd2a-75f56b4ec78f', 'Almaza City Center - HK', 'سيتي سنتر الماظة - نظافة', 'hk', 'October region', true, 37),
  ('d84cb94f-aca2-4958-984b-d787176690c4', 'Almaza City Center - LS', 'زراعة المول (الماظة)', 'ls', 'October region', true, 38),
  ('d51b4772-0ae9-4c7c-bf9a-9cf8891dc14c', 'Oriana - CFC Landscaping', 'زراعة السيتي (كايرو فستيفال)', 'ls', 'October region', true, 39),
  ('9b8fc113-d0b4-46d8-8f45-39b37b665d7c', 'D5 - HK', 'دي 5 - نظافة', 'hk', 'October region', true, 40),
  ('bac2904a-532f-4ad1-9511-8c0c1635e5c5', 'Sokhna Landscaping', 'زراعة السخنة', 'ls', 'October region', true, 41),
  ('faedd386-2a26-42fa-94a4-6b2747d034dc', 'U Venus', 'يوفينوس', 'hk', 'October region', true, 42),
  ('7c788127-66a0-42dc-bb0a-88565e38a9d4', 'Town Center', 'تاون سنتر', 'hk', 'October region', true, 43),
  ('f7c0e6f9-3c08-4dc6-97cd-315572a17066', 'Movement / Admin Office', 'حركة - صيانة - مكتب اداري', 'fm', 'October region', true, 44)
on conflict (id) do nothing;
