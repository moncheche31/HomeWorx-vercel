UPDATE public.project_narrative_scopes
SET edited_text = regexp_replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(edited_text,
        E'Hardwood.\nThrough the wall.\nNot sure yet.\nStandard.\nRemoved and framed in.\nYes, match existing.\nLoad-bearing.\n',
        E'Vent the bathroom exhaust fan through the exterior wall.\nFinishes and fixtures are standard-grade throughout.\nRemove the existing garage door and frame in the opening.\nNew interior doors and trim match the existing interior door style.\nThe wall being removed is load-bearing; provide temporary support and a new beam with posts per structural design.\n'),
        E'Note: Close in existing back garage entry door.\n', ''),
        E'Note: Move and reframe 1 garage window.\n', ''),
        E'Note: Remove and reframe 1 large egress window.\n', ''),
        E'Note: Cut out and frame opening for new entry door to master bedroom from existing dining room.\n', ''),
        E'Note: Vanity 60” double sink.\n', ''),
        E'Note: Remove existing garage partition wall.\n', ''),
      E'^Note: .*$[\n]?', '', 'gm'),
    updated_at = now()
WHERE project_id = '70b778fc-07e8-42ac-8e7e-b992d85a53af';
