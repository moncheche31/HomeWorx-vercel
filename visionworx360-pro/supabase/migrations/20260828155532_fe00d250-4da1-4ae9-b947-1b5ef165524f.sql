INSERT INTO public.nce_section_map (trade_key, section_pattern, notes)
VALUES
  ('roofing', 'Sheet Metal%', 'Drip edge, valley, step and counter flashing live here'),
  ('roofing', 'Soffit Systems', 'Aluminum soffit components of a roof edge assembly'),
  ('roofing', 'Vinyl soffit systems', 'Vinyl soffit components of a roof edge assembly'),
  ('roofing', 'Under eave soffit vents%', 'Intake ventilation components'),
  ('roofing', 'Accessories', 'Roofing accessories: underlayment/felt, ridge, vents'),
  ('roofing', 'Ridge%', 'Ridge vent and ridge cap components'),
  ('roofing', 'Fascia%', 'Fascia wrap and trim at the roof edge'),
  ('roofing', 'Skylights%', 'Roof penetration components')
ON CONFLICT DO NOTHING;
