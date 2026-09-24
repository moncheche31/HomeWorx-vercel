/**
 * Concise labor-task labels.
 *
 * A task list is read on a phone, on a jobsite, in the sun. "Insulate walls,
 * ceiling, floor — walls" is three tasks wearing one name. One action per
 * line, no restated list, no dangling qualifier.
 *
 * Pure module — no React, no IO.
 */

const DASH = /\s+[—–-]{1,2}\s+/;

const squash = (v: string): string => v.replace(/\s+/g, " ").trim();

/**
 * Collapse a generated description into one action.
 *
 * "Insulate walls, ceiling, floor — walls"  -> "Insulate walls"
 * "Install LVP flooring — bedroom"          -> "Install LVP flooring (bedroom)"
 * "Paint walls"                             -> "Paint walls"
 */
export function conciseTaskLabel(
  description: string | null | undefined,
  maxLength = 64,
): string {
  const text = squash(String(description ?? ""));
  if (!text) return "";

  const parts = text.split(DASH).map(squash).filter(Boolean);
  let label = text;

  if (parts.length >= 2) {
    const head = parts[0];
    const qualifier = parts[parts.length - 1];
    const listMatch = head.match(/^(\S+)\s+(.*)$/);
    const members = listMatch
      ? listMatch[2].split(/\s*,\s*|\s+and\s+/).map(squash).filter(Boolean)
      : [];
    const qualifierIsMember = members.some(
      (m) => m.toLowerCase() === qualifier.toLowerCase(),
    );
    label = qualifierIsMember && listMatch
      ? `${listMatch[1]} ${qualifier}`
      : `${head} (${qualifier})`;
  }

  label = squash(label);
  if (label.length > maxLength) label = `${label.slice(0, maxLength - 1).trimEnd()}…`;
  return label;
}

/**
 * Split a genuine multi-surface description into one task per surface, so the
 * task list matches the work instead of hiding three jobs behind one row.
 */
export function splitCompoundTask(
  description: string | null | undefined,
): string[] {
  const text = squash(String(description ?? ""));
  if (!text) return [];
  const head = text.split(DASH)[0];
  const match = head.match(/^(\S+)\s+(.*)$/);
  if (!match) return [conciseTaskLabel(text)];
  const members = match[2].split(/\s*,\s*|\s+and\s+/).map(squash).filter(Boolean);
  if (members.length < 2) return [conciseTaskLabel(text)];
  return members.map((m) => squash(`${match[1]} ${m}`));
}
