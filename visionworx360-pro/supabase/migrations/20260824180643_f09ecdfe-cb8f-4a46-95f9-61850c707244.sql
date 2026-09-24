INSERT INTO public.catalog_intent_aliases (library_version, alias_norm, match_kind, assembly_key, priority)
SELECT v.lv, a.alias, 'contains', 'trim.bookcase.builtin', a.prio
FROM (VALUES (1), (2)) v(lv),
     (VALUES ('built in casework', 100), ('casework', 80),
             ('built in cabinetry', 100), ('built ins', 78)) a(alias, prio)
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_intent_aliases x
  WHERE x.library_version = v.lv AND x.alias_norm = a.alias
    AND x.assembly_key = 'trim.bookcase.builtin');
