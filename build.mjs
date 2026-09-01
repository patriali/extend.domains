// Build script: bundles the extension for Chrome and Firefox from one source tree.
//
//   node build.mjs            → build both targets into dist/chrome and dist/firefox
//   node build.mjs chrome     → build one target
//   node build.mjs --watch    → rebuild on change (both targets unless one is named)
//
// The manifests are generated here rather than kept as two checked-in files so the
// shared fields (name, version, permissions) can never drift between browsers.

import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const named = ["chrome", "firefox"].filter((t) => args.includes(t));
const targets = named.length > 0 ? named : ["chrome", "firefox"];

const shared = {
  manifest_version: 3,
  name: "Extend.Domains",
  version: pkg.version,
  description:
    "Domain intelligence sidebar: registration, DNS, metadata, and age for any highlighted domain.",
  permissions: ["storage", "contextMenus"],
  // Keep in sync with src/shared/net-permissions.ts.
  host_permissions: ["https://cloudflare-dns.com/*", "https://dns.google/*"],
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    96: "icons/icon-96.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "Extend.Domains",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
    },
  },
  options_ui: {
    page: "options.html",
    open_in_tab: false,
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
};

function manifestFor(target) {
  if (target === "chrome") {
    return {
      ...shared,
      minimum_chrome_version: "116",
      permissions: [...shared.permissions, "sidePanel", "favicon"],
      // Site roots are fetched under the host access the content script match
      // already grants; this makes <all_urls> re-requestable if the user has
      // restricted site access.
      optional_host_permissions: ["<all_urls>"],
      background: { service_worker: "background.js" },
      side_panel: { default_path: "sidebar.html" },
      commands: {
        // With openPanelOnActionClick set, the browser opens the side panel
        // itself — no gesture plumbing needed.
        _execute_action: {
          suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
          description: "Open the Extend.Domains panel",
        },
      },
    };
  }
  return {
    ...shared,
    commands: {
      _execute_sidebar_action: {
        suggested_key: { default: "Ctrl+Shift+L", mac: "Command+Shift+L" },
        description: "Toggle the Extend.Domains sidebar",
      },
    },
    background: { scripts: ["background.js"] },
    sidebar_action: {
      default_panel: "sidebar.html",
      default_title: "Extend.Domains",
      // Firefox's sidebar header renders this icon only; it does not fall back
      // to the top-level `icons` the way the sidebar switcher menu does.
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
      },
      open_at_install: false,
    },
    browser_specific_settings: {
      gecko: {
        id: "extend-domains@danilopatrial",
        strict_min_version: "115.0",
      },
    },
  };
}

for (const target of targets) {
  const outdir = `dist/${target}`;
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const copyStatics = () => {
    writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifestFor(target), null, 2) + "\n");
    cpSync("src/sidebar/sidebar.html", `${outdir}/sidebar.html`);
    cpSync("src/sidebar/sidebar.css", `${outdir}/sidebar.css`);
    cpSync("src/options/options.html", `${outdir}/options.html`);
    cpSync("src/options/options.css", `${outdir}/options.css`);
    cpSync("src/icons", `${outdir}/icons`, { recursive: true });
  };
  copyStatics();

  const ctx = await esbuild.context({
    entryPoints: {
      background: "src/background/index.ts",
      content: "src/content/index.ts",
      sidebar: "src/sidebar/main.ts",
      options: "src/options/main.ts",
    },
    bundle: true,
    format: "iife",
    outdir,
    target: target === "chrome" ? ["chrome116"] : ["firefox115"],
    sourcemap: watch ? "inline" : false,
    define: { __TARGET__: JSON.stringify(target) },
    logLevel: "info",
    plugins: [
      {
        // Statics must track rebuilds too, or watch mode ships fresh JS
        // against a stale manifest/CSS (learned the hard way).
        name: "copy-statics",
        setup(b) {
          b.onEnd(copyStatics);
        },
      },
    ],
  });

  if (watch) {
    const { watch: watchFiles } = await import("node:fs");
    const statics = [
      "src/sidebar/sidebar.html",
      "src/sidebar/sidebar.css",
      "src/options/options.html",
      "src/options/options.css",
      "build.mjs",
    ];
    for (const f of statics) {
      watchFiles(f, copyStatics);
    }
    await ctx.watch();
    console.log(`[${target}] watching…`);
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log(`[${target}] built → ${outdir}`);
  }
}
