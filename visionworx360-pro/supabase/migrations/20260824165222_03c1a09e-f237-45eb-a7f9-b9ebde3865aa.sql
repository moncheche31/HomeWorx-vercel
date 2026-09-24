DO $mig$
DECLARE v integer;
BEGIN
  FOR v IN SELECT DISTINCT library_version FROM public.catalog_intent_aliases LOOP
    INSERT INTO public.catalog_intent_aliases
      (library_version, alias_norm, match_kind, assembly_key, quantity_factor, role, priority, review_reason, note)
    VALUES
      (v, 'bearing column', 'contains', 'framing.post.structural', 1, 'bearing column', 100, NULL, NULL),
      (v, 'structural column', 'contains', 'framing.post.structural', 1, 'bearing column', 100, NULL, NULL),
      (v, 'supporting post', 'contains', 'framing.post.structural', 1, 'bearing post', 70, NULL, NULL),
      (v, 'remove wall between', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 88, NULL, NULL),
      (v, 'wall removal', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 75, NULL, NULL),
      (v, 'remove wall', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 70, NULL, NULL),
      (v, 'remove the wall', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 72, NULL, NULL),
      (v, 'closet removal', 'contains', 'demo.wall.nonbearing', 1, 'closet demo', 80, NULL, NULL),
      (v, 'closet enclosure removed', 'contains', 'demo.wall.nonbearing', 1, 'closet demo', 82, NULL, NULL),
      (v, 'remove closet', 'contains', 'demo.wall.nonbearing', 1, 'closet demo', 78, NULL, NULL)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $mig$;
