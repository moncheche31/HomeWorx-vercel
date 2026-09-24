REVOKE ALL ON FUNCTION public.duplicate_scope_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_scope_item(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_update_scope_inclusion(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_scope_sections(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_scope_items(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_scope_template(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_scope_section_room() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_scope_item_refs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_scope_item_photo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_archive_section_with_items() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_scope_section_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_scope_item_activity() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.duplicate_scope_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_scope_item(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_scope_inclusion(uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_scope_sections(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_scope_items(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_template(uuid, uuid, uuid, boolean) TO authenticated;
