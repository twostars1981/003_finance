import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { XMLParser } from "fast-xml-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const xmlPath = join(root, "data", "corp.xml");
const outDir = join(root, "public", "data");
const outPath = join(outDir, "corporates.json");

if (!existsSync(xmlPath)) {
  console.error(
    "Missing data/corp.xml. Copy OpenDART CORPCODE.xml (corp.xml) into data/corp.xml then run npm run build:corp",
  );
  process.exit(1);
}

const xml = readFileSync(xmlPath, "utf8");
/** Leading zeros must be preserved: OpenDART corp_code is 8 digits, stock_code 6 digits. */
const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (tagName) => tagName === "list",
  parseTagValue: false,
});
const doc = parser.parse(xml);
const raw = doc?.result?.list;
const lists = Array.isArray(raw) ? raw : raw != null ? [raw] : [];

function padDigits(value, len) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > len ? digits.slice(-len) : digits.padStart(len, "0");
}

const corporates = lists.map((item) => ({
  corp_code: padDigits(item.corp_code, 8),
  corp_name: String(item.corp_name ?? ""),
  corp_eng_name: String(item.corp_eng_name ?? "").trim(),
  stock_code: padDigits(item.stock_code, 6),
  modify_date: String(item.modify_date ?? ""),
}));

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(corporates), "utf8");
console.log(`Wrote ${corporates.length} rows to ${outPath}`);
