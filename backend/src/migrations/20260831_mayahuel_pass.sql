-- ============================================================
-- LuxRides Pass - Mayahuel restaurant reservations
-- ============================================================

CREATE TABLE IF NOT EXISTS mayahuel_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) DEFAULT 'Restaurante Mayahuel',
    slug VARCHAR(50) DEFAULT 'mayahuel' UNIQUE,
    address TEXT DEFAULT 'San Francisco Mazapa, Teotihuacan, Edo. Mex.',
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO mayahuel_info (name, slug, address, phone)
VALUES ('Restaurante Mayahuel', 'mayahuel', 'San Francisco Mazapa, Teotihuacan', '5555555555')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS mayahuel_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number VARCHAR(10) NOT NULL UNIQUE,
    zone_name VARCHAR(50) DEFAULT 'General',
    capacity INT DEFAULT 4,
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    pos_x INT NOT NULL,
    pos_y INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mayahuel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID REFERENCES mayahuel_tables(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email TEXT,
    reservation_time TIMESTAMPTZ NOT NULL,
    guest_count INT NOT NULL,
    status VARCHAR(20) DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mayahuel_menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mayahuel_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES mayahuel_menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mayahuel_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID REFERENCES mayahuel_tables(id),
    status VARCHAR(20) DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mayahuel_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES mayahuel_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES mayahuel_menu_items(id),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS mayahuel_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    applicable_to VARCHAR(20) DEFAULT 'MAYAHUEL_ONLY',
    borne_by VARCHAR(20) DEFAULT 'MAYAHUEL',
    start_date TIMESTAMPTZ DEFAULT NOW(),
    expiration_date TIMESTAMPTZ NOT NULL,
    max_uses INT DEFAULT 100,
    uses_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION validate_mayahuel_promo(promo_code TEXT)
RETURNS TABLE (is_valid BOOLEAN, message TEXT, promo_data JSONB) AS $$
DECLARE
    found_promo RECORD;
BEGIN
    SELECT * INTO found_promo
    FROM mayahuel_promotions
    WHERE UPPER(code) = UPPER(promo_code) AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'El codigo de promocion no existe o esta inactivo.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    IF NOW() > found_promo.expiration_date THEN
        RETURN QUERY SELECT FALSE, 'Esta promocion de Mayahuel ya expiro.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    IF found_promo.uses_count >= found_promo.max_uses THEN
        RETURN QUERY SELECT FALSE, 'La promocion alcanzo su limite total de canjes.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Promocion valida.'::TEXT, to_jsonb(found_promo);
END;
$$ LANGUAGE plpgsql;

INSERT INTO mayahuel_tables (table_number, zone_name, capacity, pos_x, pos_y) VALUES
('M-01', 'Terraza VIP', 4, 1, 1),
('M-02', 'Terraza VIP', 2, 2, 1),
('M-03', 'Terraza VIP', 4, 3, 1),
('M-04', 'Jardin Principal', 6, 1, 2),
('M-05', 'Jardin Principal', 6, 2, 2),
('M-06', 'Jardin Principal', 8, 3, 2)
ON CONFLICT (table_number) DO NOTHING;

INSERT INTO mayahuel_menu_categories (id, name, sort_order) VALUES
('11111111-1111-1111-1111-111111111111', 'Bebidas y Pulque', 1),
('22222222-2222-2222-2222-222222222222', 'Platillos Tradicionales', 2)
ON CONFLICT DO NOTHING;

INSERT INTO mayahuel_menu_items (category_id, name, description, price) VALUES
('11111111-1111-1111-1111-111111111111', 'Curado de Pinon (1L)', 'Pulque artesanal de pinon', 120.00),
('22222222-2222-2222-2222-222222222222', 'Mixiote de Carnero', 'Con nopales y arroz criollo', 240.00)
ON CONFLICT DO NOTHING;

INSERT INTO mayahuel_promotions (code, title, discount_type, discount_value, applicable_to, borne_by, expiration_date) VALUES
('MAYAHUELVIP', '10% de descuento en tu consumo reservando via LuxRides', 'PERCENTAGE', 10.00, 'MAYAHUEL_ONLY', 'MAYAHUEL', NOW() + INTERVAL '30 days')
ON CONFLICT (code) DO NOTHING;
