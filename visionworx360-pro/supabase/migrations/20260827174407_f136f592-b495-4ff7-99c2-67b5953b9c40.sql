ALTER TABLE public.estimate_line_items DISABLE TRIGGER USER;

WITH restore(id, labor_hours, material_cost) AS (
  VALUES
    ('0632a80d-9d65-4750-ba76-9a327cc2e893'::uuid, 4.50::numeric, 196.19::numeric),
    ('16fa98b9-ac15-4528-9201-cc0bbe44d738', 2.00, 50.00),
    ('38c92190-c784-4589-a06e-bc57babf5d88', 0, 0),
    ('619dc716-7d7c-473d-964f-66128ac0f841', 17.50, 7.22),
    ('6d24ef93-4f6a-4ec5-a778-c5b70e7c21a4', 11.50, 0.36),
    ('82c43194-f6f1-43bd-a0cd-d8ad37b1177c', 5.75, 259.82),
    ('82e3fbbe-eba1-4090-948c-bc90b039fb51', 18.75, 0.31),
    ('958242e3-a244-46d4-8615-a5220fe1001f', 0, 0),
    ('95f1d131-8fe7-40cf-b086-1f56ad1d9bd3', 0, 0),
    ('a01c8b3a-be2b-43d5-8948-ac4a2ea1c70b', 2.00, 0.05),
    ('ac13ffad-15d1-4894-a5e6-2a2ede97202c', 0, 0),
    ('d76daa8e-2507-4039-93df-dcac37ca71ff', 0, 0),
    ('dfe2cf9d-1182-4de5-9055-e0ef968de7d7', 1.50, 29.69),
    ('e4ef8692-7037-4440-abcd-86fee9c5a85a', 5.00, 302.24)
)
UPDATE public.estimate_line_items e
SET labor_hours = r.labor_hours,
    material_cost = r.material_cost,
    is_price_overridden = false,
    pricing_source = 'catalog',
    cost_basis_source = 'catalog'
FROM restore r
WHERE e.id = r.id;

ALTER TABLE public.estimate_line_items ENABLE TRIGGER USER;
