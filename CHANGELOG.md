# Changelog

All notable changes to Extend.Domains. This project follows
[semantic versioning](https://semver.org/).

## [0.2.0] — 2026-09-05

First public release, listed on the Chrome Web Store and addons.mozilla.org.
Versions before this were distributed only as self-signed builds.

### Added

- "Site access" row in the options page, so host permissions can be granted up
  front instead of only after a lookup reports one blocked.
- `PRIVACY.md`, covering the per-lookup data flow to third-party services and
  the Atom.com affiliate link.
- Release packaging: `npm run release` type-checks, tests, builds, lints with
  `web-ext`, and writes a Chrome zip, a Firefox zip, and a source archive to
  `web-ext-artifacts/`.
- `homepage_url` in both manifests; `author` in the Firefox manifest.
- `data_collection_permissions` in the Firefox manifest, declaring
  `browsingActivity` — Mozilla counts transmission to third parties as
  collection, and every lookup sends the domain to the DoH resolvers, RDAP, and
  the Wayback Machine.
- Store assets and listing copy under `store/`.

### Changed

- Host-permission checks share one origin list in `src/shared/net-permissions.ts`.
  A failed check now reads as "not granted" and offers the grant, where the DNS
  path previously let the error propagate.
- **Firefox now requires 140.0**, up from 115.0. Below 140 the
  `data_collection_permissions` key is ignored and the consent prompt never
  shows, which defeats the point of declaring it. 140 is the current ESR, so
  enterprise installs are unaffected.
