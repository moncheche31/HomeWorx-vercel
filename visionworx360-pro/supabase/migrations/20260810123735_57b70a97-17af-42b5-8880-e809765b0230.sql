-- Remove orphaned decision status lines from saved Scope of Work wording.
UPDATE public.project_narrative_scopes
SET edited_text = regexp_replace(
      regexp_replace(
        edited_text,
        '(^|\n)[ \t]*(accepted|approved|removed|rejected|declined|dismissed|pending|skipped|aceptado|aceptada|aprobado|aprobada|eliminado|eliminada|retirado|retirada|rechazado|rechazada|omitido|omitida|pendiente)[.!;,]*[ \t]*(?=\n|$)',
        '', 'gi'
      ),
      '\n{3,}', E'\n\n', 'g'
    )
WHERE edited_text ~* '(^|\n)[ \t]*(accepted|approved|removed|rejected|declined|dismissed|pending|skipped|aceptado|aceptada|aprobado|aprobada|eliminado|eliminada|retirado|retirada|rechazado|rechazada|omitido|omitida|pendiente)[.!;,]*[ \t]*(\n|$)';
