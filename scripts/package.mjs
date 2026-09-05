// Zips a built target for store upload:
//
//   node scripts/package.mjs chrome   → web-ext-artifacts/extend-domains-<version>-chrome.zip
//
// Firefox goes through `web-ext build` instead (it signs and lints), but the
// Chrome Web Store just wants a zip and there is no portable `zip` binary to
// lean on — GNU tar can't write the format and macOS/Linux disagree on what
// else is installed. So the archive is written here with node:zlib only, which
// keeps the dependency list as short as the rest of the project.

import { deflateRawSync } from "node:zlib";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2];
if (target !== "chrome" && target !== "firefox") {
  console.error("usage: node scripts/package.mjs <chrome|firefox>");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const srcDir = `dist/${target}`;
const outFile = `web-ext-artifacts/extend-domains-${version}-${target}.zip`;

// ── Minimal ZIP writer ──────────────────────────────────────────────────────

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Every entry gets the same fixed timestamp so identical input yields an
 * identical archive — a reviewer can rebuild and diff byte for byte. */
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

function walk(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ name: rel, data: readFileSync(full) });
  }
  return out;
}

const files = walk(srcDir);
const locals = [];
const central = [];
let offset = 0;

for (const { name, data } of files) {
  const nameBuf = Buffer.from(name, "utf8");
  const deflated = deflateRawSync(data, { level: 9 });
  // Deflate can inflate an already-compressed file (the PNGs); store those raw.
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt32LE(0, 30); // extra + comment lengths
  dir.writeUInt16LE(0, 34); // disk number
  dir.writeUInt16LE(0, 36); // internal attrs
  dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, 0644
  dir.writeUInt32LE(offset, 42);
  central.push(dir, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const cd = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cd.length, 12);
eocd.writeUInt32LE(offset, 16);

mkdirSync("web-ext-artifacts", { recursive: true });
writeFileSync(outFile, Buffer.concat([...locals, cd, eocd]));

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`${outFile} — ${files.length} files, ${kb(statSync(outFile).size)}`);
