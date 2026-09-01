-- ============================================================
-- LuxRides Pass - Mayahuel promo display fields (public tickets page)
-- ============================================================

ALTER TABLE mayahuel_promotions
    ADD COLUMN IF NOT EXISTS venue_name VARCHAR(100) NOT NULL DEFAULT 'Mayahuel',
    ADD COLUMN IF NOT EXISTS description VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS icon VARCHAR(10) NOT NULL DEFAULT '🎟️';

UPDATE mayahuel_promotions
SET description = '10% en tu consumo',
    category = 'Comida'
WHERE code = 'MAYAHUELVIP' AND description = '';
