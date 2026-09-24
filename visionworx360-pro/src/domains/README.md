# src/domains

Reusable domain contracts (projects, scope, estimating, cost-catalog).

**Contracts only**, or thin server adapters. No React. No UI. No PDF.
Contractor Edition and future editions consume these; they never own them.

## Legacy locations (gradual migration)

Existing working implementations remain where they are until a real refactor:

- Projects & CRM: `src/features/crm/`
- Project Workspace (rooms/notes/photos/documents): `src/features/project-workspace/`
- Scope Builder: `src/features/scope/`

New shared engines MUST land under `src/domains/` (or `src/platform/`) and
expose typed adapters, not React hooks. Do not move existing files just to
match the new tree — see ADR-023.
