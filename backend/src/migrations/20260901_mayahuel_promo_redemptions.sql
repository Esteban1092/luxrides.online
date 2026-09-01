-- ============================================================
-- LuxRides Pass - Mayahuel ticket/promo redemptions (real-time)
-- ============================================================

CREATE TABLE IF NOT EXISTS mayahuel_promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_id UUID NOT NULL REFERENCES mayahuel_promotions(id) ON DELETE CASCADE,
    promo_code VARCHAR(50) NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_contact VARCHAR(100) NOT NULL,
    table_number VARCHAR(20),
    redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un mismo contacto no puede canjear el mismo ticket dos veces
CREATE UNIQUE INDEX IF NOT EXISTS mayahuel_promo_redemptions_unique_contact
    ON mayahuel_promo_redemptions (promo_id, LOWER(customer_contact));

CREATE INDEX IF NOT EXISTS mayahuel_promo_redemptions_redeemed_at_idx
    ON mayahuel_promo_redemptions (redeemed_at DESC);

-- Valida y canjea el ticket en una sola transaccion atomica (bloquea la fila del promo)
CREATE OR REPLACE FUNCTION redeem_mayahuel_promo(
    p_code TEXT,
    p_customer_name TEXT,
    p_customer_contact TEXT,
    p_table_number TEXT
)
RETURNS TABLE (is_valid BOOLEAN, message TEXT, redemption JSONB) AS $$
DECLARE
    found_promo RECORD;
    new_redemption RECORD;
BEGIN
    SELECT * INTO found_promo
    FROM mayahuel_promotions
    WHERE UPPER(code) = UPPER(p_code) AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'El codigo de ticket no existe o esta inactivo.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    IF NOW() > found_promo.expiration_date THEN
        RETURN QUERY SELECT FALSE, 'Este ticket ya expiro.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    IF found_promo.uses_count >= found_promo.max_uses THEN
        RETURN QUERY SELECT FALSE, 'Este ticket alcanzo su limite total de canjes.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM mayahuel_promo_redemptions
        WHERE promo_id = found_promo.id AND LOWER(customer_contact) = LOWER(p_customer_contact)
    ) THEN
        RETURN QUERY SELECT FALSE, 'Este ticket ya fue canjeado con este contacto.'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    INSERT INTO mayahuel_promo_redemptions (promo_id, promo_code, customer_name, customer_contact, table_number)
    VALUES (found_promo.id, found_promo.code, p_customer_name, p_customer_contact, p_table_number)
    RETURNING * INTO new_redemption;

    UPDATE mayahuel_promotions SET uses_count = uses_count + 1 WHERE id = found_promo.id;

    RETURN QUERY SELECT TRUE, 'Ticket canjeado con exito.'::TEXT,
        to_jsonb(new_redemption) || jsonb_build_object(
            'promo_title', found_promo.title,
            'discount_type', found_promo.discount_type,
            'discount_value', found_promo.discount_value
        );
END;
$$ LANGUAGE plpgsql;
