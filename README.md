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

## Feedback

Want to request a new feature or report a bug without opening a PR? Email me at
[info@extenddomains.com](mailto:info@extenddomains.com).

## License

[MIT](LICENSE) © Danilo Patrial
