<p align="center">
  <img src="src/icons/icon-128.png" alt="Extend.Domains" width="96" height="96">
</p>

<h1 align="center">Extend.Domains</h1>

<p align="center">
  Highlight a domain on any page and get registration, DNS, metadata, and age
  in a sidebar.<br>
  Chrome + Firefox, Manifest V3.<br>
  No backend, no API keys — all data comes from free, keyless public endpoints.
</p>

<p align="center">
  For more information: <a href="https://extend.domains"><strong>Extend.Domains</strong></a>
</p>

## Install

Store listings are pending review; until they are live, use the source install
below.

## Source Install

```sh
git clone https://github.com/patriali/extend.domains.git extenddomains
cd extenddomains

npm install
npm run build       # both targets -> dist/chrome, dist/firefox
npm run watch       # rebuild on change
npm run typecheck
npm test
```

`build.mjs` generates the per-browser manifest from one source tree, so shared
fields never drift between the two builds.

- **Chrome** — `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/chrome`
- **Firefox** — `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> `dist/firefox/manifest.json`

On Firefox nothing resolves until host access is granted — MV3 there hands out
no host permissions at install. Use the grant button the sidebar shows, or
"Site access" in the options page.

## Building for release

```sh
npm run release
```

Type-checks, tests, builds both targets, lints the Firefox build with `web-ext`,
and writes three archives to `web-ext-artifacts/`: a Chrome zip for the Web
Store, a Firefox zip for AMO, and a source archive for AMO's source-code review
(the shipped bundles are esbuild output, so AMO requires the source alongside).

To reproduce a submitted build: `npm install && npm run build`, then compare
against `dist/`. `scripts/package.mjs` writes fixed timestamps, so the Chrome zip
is byte-for-byte reproducible from the same tree.

## Privacy

No backend, no accounts, no analytics, no remote code. Each lookup queries
public services directly from your browser — DNS-over-HTTPS, RDAP, the Wayback
Machine, and the domain's own homepage for its title. See [PRIVACY.md](PRIVACY.md)
for the full list of what is sent where.

**Affiliate disclosure:** when a domain's nameservers show it is listed on
Atom.com, the sidebar's "Buy now" button carries a referral code and may earn the
developer a commission. It is on by default and can be turned off in the options.
No other link in the extension carries a referral code.

## Feedback

Want to request a new feature or report a bug without opening a PR? Email me at
[info@extenddomains.com](mailto:info@extenddomains.com).

## License

[MIT](LICENSE) © Danilo Patrial
