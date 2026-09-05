# Store listing copy

One source for both submissions. Update here, then paste — the two stores ask for
the same things under different names.

- **Privacy policy URL:** https://github.com/patriali/extend.domains/blob/main/PRIVACY.md
- **Homepage / support site:** https://github.com/patriali/extend.domains
- **Support email:** info@extenddomains.com
- **Category:** Developer Tools (Chrome) · Other / Web Development (AMO)

---

## Name

Extend.Domains

## Short description / summary

*Chrome caps this at 132 characters; AMO at 250. This fits both.*

> Highlight any domain to see registration, DNS, metadata, and age in a sidebar. No account, no backend, no tracking.

## Single purpose (Chrome requires this verbatim-ish)

> Show registration, DNS, metadata, and age information for a domain the user
> highlights, selects from the context menu, or types into the extension's search
> box.

## Detailed description

> Highlight a domain anywhere — a tweet, a spreadsheet, a terminal, an email —
> and Extend.Domains opens a sidebar telling you what it is.
>
> **What you get**
>
> - **Registration** — registered or available, creation and expiry dates,
>   registrar, and EPP status codes, read live from the registry's RDAP service.
> - **DNS** — A, NS, and MX records over DNS-over-HTTPS, with parked-domain
>   detection.
> - **Age** — when the Wayback Machine first archived the name.
> - **Preview** — the site's own title, description, and theme colour.
> - **A local quality score** — length, pronounceability, word segmentation, and
>   TLD, with every weight exposed in the options page so you can tune it to your
>   own taste.
> - **Research links** — one click through to Atom, NameBio, DotDB, Ahrefs, WIPO,
>   Trademarkia, TMView and others, scoped to the domain you are looking at.
>
> **How it works**
>
> Select text and the sidebar updates. Or right-click a selection, press
> Ctrl+Shift+L (Cmd+Shift+L on Mac), or type a name into the sidebar's search box
> — "grok" resolves to grok.com.
>
> Obfuscated spellings people use to dodge autolinking — `example dot com`,
> `example[.]com`, `example • com` — resolve too, once you enable that in the
> options.
>
> **What it is not**
>
> There is no Extend.Domains server. No account, no sign-up, no API key, no
> analytics, no telemetry, no remote code. Every lookup goes straight from your
> browser to the public services that answer it: Cloudflare or Google for DNS,
> the domain's registry for RDAP, the Internet Archive for age, and the domain's
> own homepage for its title. Nothing is ever sent to the developer, because
> there is nowhere to send it.
>
> The sidebar layout is yours to rearrange, and every block can be hidden.
>
> **Affiliate disclosure**
>
> When a domain's nameservers show it is listed for sale on Atom.com, the sidebar
> shows a "Buy now" button whose link carries a referral code — the developer may
> earn a commission if you buy through it. It is on by default and can be turned
> off in the options under "Buy now button". No other link in the extension
> carries a referral code.
>
> Open source (MIT): https://github.com/patriali/extend.domains
> Privacy policy: https://github.com/patriali/extend.domains/blob/main/PRIVACY.md

---

## Chrome: permission justifications

Paste one per field. These must match `dist/chrome/manifest.json` exactly.

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings (theme, sidebar layout, preferred registrar, scoring weights, feature toggles) and a 24-hour local cache of lookup results so repeating a lookup does not re-query the public services. Local only; nothing is synced or uploaded. |
| `contextMenus` | Adds a single right-click entry, "Look up domain", so the user can look up a selection without opening the sidebar first. |
| `sidePanel` | The extension's entire UI is a side panel. This is what opens it. |
| `favicon` | Renders a site's icon from Chrome's own local favicon cache instead of fetching `/favicon.ico` over the network. It exists to avoid a request, not to make one. |
| `host_permissions`: `https://cloudflare-dns.com/*`, `https://dns.google/*` | Resolves A, NS, and MX records for the looked-up domain over DNS-over-HTTPS. These two resolvers are the only hosts the extension needs declared access to; RDAP and the Internet Archive answer with CORS headers. |
| Content script on `<all_urls>` | Reads the current text selection so highlighting a domain can trigger a lookup. The user chooses which page that is by making a selection; the extension does not read pages without one, does not modify pages, and does not record which pages are visited. The same host access also covers fetching the looked-up domain's homepage for its title and description. |
| `optional_host_permissions`: `<all_urls>` | Lets a user who has restricted the extension's site access re-grant it from the sidebar or the options page. |

## Chrome: data usage disclosures

Check these two categories:

- **Website content** — the extension reads the user's text selection to extract
  a domain, and fetches the looked-up domain's homepage for its title,
  description, and theme colour.
- **Web history** — the looked-up domain is transmitted to third-party lookup
  services (DNS resolvers, RDAP registries, the Internet Archive), and the
  "look up the current tab" action derives a domain from the active tab.

Do **not** check: personally identifiable information, health, financial,
authentication, personal communications, location, user activity.

All three certifications can be affirmed truthfully:

- Not being sold to third parties ✓ (nothing is collected by the developer)
- Not being used or transferred for purposes unrelated to the single purpose ✓
- Not being used or transferred to determine creditworthiness or for lending ✓

## AMO: data collection

Declared in the manifest rather than a form —
`browser_specific_settings.gecko.data_collection_permissions.required` is
`["browsingActivity"]`, because Mozilla counts anything leaving the local browser
as collection, third parties included. Not `"none"`, and not `websiteContent`:
the selected text is handled entirely in the browser and only the extracted
domain is transmitted.

## AMO: notes for reviewers

> The extension has no backend and no accounts. Every request goes directly from
> the browser to a public service; the full list is in PRIVACY.md.
>
> **Host permissions are requested at runtime, not at install.** On a fresh
> profile the DNS and preview blocks will report that they need permission and
> show a "Grant access" button; there is also a "Site access" row at the top of
> the options page. Granting there makes lookups work.
>
> **Source code:** the uploaded bundles are esbuild output from the source
> archive. To reproduce: `npm install && npm run build`, then compare
> `dist/firefox` against the uploaded package. Node 20+ and no network access
> beyond npm are needed. `build.mjs` generates the manifest for both browsers
> from one source tree, which is why there is no checked-in `manifest.json`.
>
> The "Buy now" button links to Atom.com with a referral code. It is disclosed in
> the listing, in PRIVACY.md, and in the options page, and can be turned off
> there.

---

## Assets

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128×128 PNG | `src/icons/icon-128.png` |
| Chrome small promo tile | 440×280 PNG, no alpha | `store/promo-tile.png` |
| Chrome marquee tile | 1400×560 | Optional; only needed for featured placement |
| Screenshots | 1280×800 PNG, 1–5 | See `store/screenshots/README.md` |
