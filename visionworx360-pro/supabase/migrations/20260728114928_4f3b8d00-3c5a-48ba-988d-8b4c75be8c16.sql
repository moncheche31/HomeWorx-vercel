DROP TRIGGER IF EXISTS scope_items_activity ON public.scope_items;
DROP TRIGGER IF EXISTS scope_sections_activity ON public.scope_sections;
-- Also drop duplicate updated_at triggers (both fire set_updated_at)
DROP TRIGGER IF EXISTS scope_items_updated_at ON public.scope_items;
DROP TRIGGER IF EXISTS scope_sections_updated_at ON public.scope_sections;
DROP TRIGGER IF EXISTS scope_templates_updated_at ON public.scope_templates;
