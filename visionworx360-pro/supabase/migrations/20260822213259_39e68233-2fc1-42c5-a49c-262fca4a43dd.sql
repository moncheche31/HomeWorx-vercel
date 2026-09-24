DROP TRIGGER IF EXISTS zz_round_estimate_line_money ON public.estimate_line_items;
DROP FUNCTION IF EXISTS public.round_estimate_line_money();

ALTER TABLE public.estimate_line_items
  DROP COLUMN labor_total,
  DROP COLUMN material_total,
  DROP COLUMN equipment_total,
  DROP COLUMN subcontractor_total,
  DROP COLUMN other_total,
  DROP COLUMN direct_cost;

ALTER TABLE public.estimate_line_items
  ADD COLUMN labor_total numeric GENERATED ALWAYS AS (round(labor_hours * labor_rate, 0)) STORED,
  ADD COLUMN material_total numeric GENERATED ALWAYS AS (round(material_cost * quantity, 0)) STORED,
  ADD COLUMN equipment_total numeric GENERATED ALWAYS AS (round(equipment_cost * quantity, 0)) STORED,
  ADD COLUMN subcontractor_total numeric GENERATED ALWAYS AS (round(subcontractor_cost * quantity, 0)) STORED,
  ADD COLUMN other_total numeric GENERATED ALWAYS AS (round(other_cost * quantity, 0)) STORED,
  ADD COLUMN direct_cost numeric GENERATED ALWAYS AS (
    round(labor_hours * labor_rate, 0)
    + round(material_cost * quantity, 0)
    + round(equipment_cost * quantity, 0)
    + round(subcontractor_cost * quantity, 0)
    + round(other_cost * quantity, 0)) STORED;
