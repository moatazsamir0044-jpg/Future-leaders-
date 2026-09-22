-- One-time backfill: rename the sites created by the two real August 2026
-- imports (done before the site-naming fix in commit 85825b3 landed) from
-- their raw sheet tab codes to the same "hint (sheet tab)" convention the
-- fixed importer now proposes automatically for any new site going
-- forward. Matched by sheet_key, scoped by zone. Idempotent: a second run
-- against already-renamed rows is a no-op (name_ar already equals new_name).
with renames(zone_slug, sheet_key, new_name) as (
  values
    ('october', 'MOA. HK', 'مول العرب (MOA. HK)'),
    ('october', 'Royal. LS', 'رويال (Royal. LS)'),
    ('october', 'Mazar', 'مزار (Mazar)'),
    ('october', 'Z Park', 'زد بارك (Z Park)'),
    ('october', 'Arkan HK', 'اركان بلازا (Arkan HK)'),
    ('october', 'Arkan LS', 'اركان بلازا (Arkan LS)'),
    ('october', 'MOE HK', 'مول مصر (MOE HK)'),
    ('october', 'MOE LS', 'مول مصر (MOE LS)'),
    ('october', 'Magic', 'مول مصر (Magic)'),
    ('october', 'Cinema', 'مول مصر (Cinema)'),
    ('october', 'SKI', 'مول مصر (SKI)'),
    ('october', 'hays', 'مول مصر (hays)'),
    ('october', 'Egarat', 'مول مصر (Egarat)'),
    ('tagamoa', 'B Office', 'المبانى الاداريه الفطيم (B Office)'),
    ('tagamoa', 'CFCM HK', 'كايرو فيستفال سيتى (CFCM HK)'),
    ('tagamoa', 'CFCM LS', 'زراعه المول (كايرو فستيفال) (CFCM LS)'),
    ('tagamoa', 'G.Gate', 'جولدن جيت (G.Gate)'),
    ('tagamoa', 'Maddi CC', 'المعادى سيتى سنتر (Maddi CC)'),
    ('tagamoa', 'Almaza HK', 'سيتى سنتر الماظة (Almaza HK)'),
    ('tagamoa', 'ALmza LS', 'زراعه المول (ألماظه) (ALmza LS)'),
    ('tagamoa', 'Oriana', 'زراعه السيتي (كايرو فستيفال) (Oriana)'),
    ('tagamoa', 'D5 HK', 'D.5 (D5 HK)'),
    ('tagamoa', 'D5 LS', 'زراعة السخنة (D5 LS)'),
    ('tagamoa', 'U Venus', 'يوفينوس (U Venus)'),
    ('tagamoa', 'Town.C', 'تاون سنتر (Town.C)'),
    ('tagamoa', 'H Office', 'حركه - صيانه - مكتب ادارى (H Office)')
)
update public.pv_sites s
set name_ar = r.new_name
from renames r
join public.pv_zones z on z.slug = r.zone_slug
where s.zone_id = z.id and s.sheet_key = r.sheet_key;
