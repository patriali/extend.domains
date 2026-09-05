# Screenshots

Both stores want **1280×800 PNG**. Chrome accepts 640×400 as well, but 1280×800
satisfies both, so shoot everything at that size and upload the same files twice.

Save them here as `01-registered.png` … `05-options.png`. This directory is
tracked; the files themselves are small enough to live in the repo.

## How to shoot

The sidebar is much narrower than 1280px, so a raw panel capture will be the
wrong shape. Capture the **browser window** with the panel open, at a window size
that gives you a 1280×800 crop with the panel on the right and a real page on the
left. Chrome's side panel is the better subject of the two — it renders wider
than Firefox's sidebar.

Use a page whose content makes the lookup make sense (an article mentioning the
domain, a registrar search result, a tweet) rather than a blank tab. Avoid
capturing bookmarks, other extensions, or anything identifying in the browser
chrome — crop the toolbar out if it is noisy.

Set the theme deliberately in the options page rather than inheriting the OS:
pick one and use it for every shot so the set looks like one product.

## Shot list

| # | File | What to show |
|---|---|---|
| 1 | `01-registered.png` | The main event. A registered domain with Registration, DNS, and age all populated — pick something with a real registrar, a distant expiry, and EPP status codes visible. This is the first screenshot users see; it should show the sidebar doing its whole job at once. |
| 2 | `02-available.png` | An unregistered name, showing the "Register" bar and the Local score block with a high score. Demonstrates the availability path. |
| 3 | `03-research.png` | The Research links block expanded, plus the Site preview block with a title, description, and theme-colour swatch. |
| 4 | `04-score.png` | The Local score block with its breakdown, ideally next to the options page's scoring tab, to show the weights are user-tunable. |
| 5 | `05-options.png` | The options page — the Layout tab, showing the reorderable sections, the Site access row, and the "Buy now button" section with its referral disclosure visible. Showing the disclosure in a screenshot is a small thing that reads well to a reviewer. |

Five is the Chrome maximum. If you only have time for two, shoot 1 and 2.

## What not to do

Do not put a screenshot in the promo tile — Chrome rejects tiles that are just a
shrunken screenshot. `store/promo-tile.png` is already the right thing.

Do not add captions, arrows, or drop shadows baked into the image. Both stores
render screenshots at various sizes and the annotations end up illegible.
