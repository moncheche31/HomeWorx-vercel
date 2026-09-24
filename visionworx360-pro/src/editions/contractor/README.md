# Contractor Edition

VisionWorx360 Pro Contractor Edition is the first client application of the
VisionWorx360 Platform. All Contractor-specific screens, workflows,
navigation, and presentation live here — or, for now, in the legacy
`src/features/**` locations documented in `src/domains/README.md`.

Contractor Edition consumes:

- `src/platform/` for auth, tenancy, product access, events, files, i18n
- `src/domains/` for shared engines (estimating, cost catalog, …)

Contractor Edition does NOT own any of those.
