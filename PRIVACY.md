# Privacy Policy — Extend.Domains

_Last updated: 2026-09-05 · Applies to version 0.2.0 and later_

Extend.Domains looks up a domain you highlight and shows what it finds in a
sidebar. This document describes exactly what leaves your browser, where it
goes, and what is kept.

## The short version

- **There is no Extend.Domains server.** The extension has no backend, no
  account, no API key, and no telemetry. Nothing is ever sent to the developer.
- **No analytics, no tracking, no advertising, no remote code.** The extension
  bundles all of its own code; nothing is downloaded and executed at runtime.
- **Nothing is sold or shared with anyone**, because nothing is collected.
- Lookups are performed by contacting public services **directly from your
  browser** — the same services you would reach by visiting them yourself.

## What is sent, and to whom

A lookup runs when you highlight a domain on a page, use the right-click menu,
type in the sidebar's search box, or look up the current tab. When it runs, the
domain name is sent to the following services. Nothing else about you is
attached — no identifier, no account, no page URL, no browsing history.

| Recipient | What is sent | Why |
|---|---|---|
| `cloudflare-dns.com` and `dns.google` | The domain | DNS-over-HTTPS resolution (A, NS, MX and related records) |
| `data.iana.org` | Nothing domain-specific | Downloads the public RDAP bootstrap table, cached locally for 24 hours |
| The domain's registry RDAP server (for example `rdap.verisign.com`), or `rdap.org` when the registry is not in the bootstrap table | The domain | Registration status, dates, nameservers, and EPP status codes |
| `archive.org` and `web.archive.org` | The domain | When the name was first archived, used as an age estimate |
| **The looked-up domain's own web server** | An ordinary HTTPS request to `https://<domain>/`, falling back to `http://` | Reads the page title, description, and theme colour. Only the first 32 KB of the response is requested |

Each of these is an independent third party with its own privacy policy. Their
handling of the request — including any logging of your IP address, which is
inherent to making any web request — is governed by their terms, not this
policy.

Note the last row in particular: looking up a domain makes a **real request to
that domain's website**, which that site's operator can see in their logs, just
as if you had visited it.

## What is sent when you click something

The sidebar contains links to research tools (Atom, GoDaddy, NameBio, DotDB,
WIPO, Trademarkia, TMView, Ahrefs, and others) and to domain registrars. These
are **plain links**. Nothing is fetched and nothing is sent until you click one,
at which point your browser navigates normally and the destination sees the
request. A `utm_source=extenddomains.com` parameter is appended so those sites
can attribute the referral.

## Affiliate disclosure

When a domain's nameservers show it is listed for sale on Atom.com, the sidebar
shows a **"Buy now"** button. That link contains an affiliate referral code, and
the developer may earn a commission if you buy through it. This is the only
monetised link in the extension; the research links and registrar links carry no
referral codes.

The button is **on by default** and can be turned off in the extension's options
under "Buy now button". Turning it off changes nothing else.

The listing is detected from the DNS lookup that already runs — no extra request
is made to determine it.

## What is stored, and where

Everything is stored using the browser's local extension storage, on your
device. None of it is synced to another device, uploaded, or readable by the
developer.

- **Lookup cache** — results for looked-up domains, expiring after 24 hours.
- **Recent lookups** — the last 12 domains, shown as chips in the sidebar.
- **Settings** — theme, sidebar layout, preferred registrar, scoring weights,
  and the obfuscated-domain and "Buy now" toggles.
- **RDAP bootstrap table** — the public registry list from IANA, refreshed daily.

You can erase all of it at any time by removing the extension, which deletes its
storage.

## Page content

The content script reads **only the text you have selected**, and only when a
selection exists. It performs a cheap pattern check in the page, then passes the
selected text to the extension's background context for validation against the
Public Suffix List. That text never leaves your browser — only the extracted
domain is looked up. The extension does not read page content you have not
selected, does not modify pages, and does not track which pages you visit.

## Permissions

| Permission | Why it is needed |
|---|---|
| Access to all sites | Read the current text selection; fetch the looked-up domain's own homepage for its title and description |
| `cloudflare-dns.com`, `dns.google` | DNS-over-HTTPS lookups |
| `storage` | Save settings and the local cache described above |
| `contextMenus` | The right-click "Look up domain" entry |
| `sidePanel` (Chrome) | Show the sidebar |
| `favicon` (Chrome) | Render a site's icon from Chrome's local cache, avoiding a network request |

On Firefox these are requested when you first need them rather than at install,
so lookups will report that they need permission until you grant access — either
from the button shown in the sidebar or from "Site access" in the options page.

## Children

The extension is a developer/research tool and is not directed at children.

## Changes

Material changes to this policy will be noted in
[CHANGELOG.md](CHANGELOG.md) and this document's "last updated" date will change.

## Contact

Questions, or a privacy concern: **info@extenddomains.com**, or open an issue at
<https://github.com/patriali/extend.domains/issues>.
