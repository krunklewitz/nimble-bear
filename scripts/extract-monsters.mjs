// Extracts monster stat blocks from the GM's own Nimble PDFs into a private monster file
// (format "nimble-bear/monsters") that the GM loads in GM tools → Monsters → Load monster file.
//
// It contains no game data itself: it reads the PDFs in reference/ and writes to private/,
// both git-ignored, so nothing extracted is ever committed or deployed (CLAUDE.md).
//
// Usage:
//   node scripts/extract-monsters.mjs gmg reference/NimbleGMG3.0.pdf
//   node scripts/extract-monsters.mjs mm reference/MonstersAndMore-v0.1.pdf
// Writes private/monsters/<book>.nimble-monsters.json and private/monsters/<book>.report.txt.
//
// How it reads a page: Poppler's pdftohtml -xml gives each text run with its position and
// font. Every stat block starts with a light-coloured banner ("lvl 2, small", "minion",
// "LVL 8 Legendary …", "lvl 2 Solo …"), then the name in the small-caps font with [hp] [ar]
// [mv] [sv] tags, then abilities (bold name, then text). Blocks sit in columns; a block runs
// down its column to the next banner or section heading.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOKS = {
  gmg: { label: "GMG", file: "NimbleGMG3.0.pdf" },
  mm: { label: "Monsters & More", short: "M&M", file: "MonstersAndMore-v0.1.pdf" },
};
const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

// ---------- reading the XML ----------

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(new RegExp(String.fromCharCode(160), "g"), " ");

function lightColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.85;
}

/** Splits a <text> element's inner HTML into runs with bold/italic flags. */
function runsOf(html) {
  const runs = [];
  let b = 0;
  let i = 0;
  for (const part of html.split(/(<\/?[bi]>)/)) {
    if (part === "<b>") b++;
    else if (part === "</b>") b--;
    else if (part === "<i>") i++;
    else if (part === "</i>") i--;
    else if (part) runs.push({ text: decode(part.replace(/<[^>]+>/g, "")), bold: b > 0, italic: i > 0 });
  }
  return runs;
}

function parseXml(xml) {
  const fonts = new Map();
  for (const m of xml.matchAll(/<fontspec id="(\d+)" size="([\d.]+)" family="([^"]+)" color="(#[0-9a-f]{6})"/g)) {
    fonts.set(m[1], { size: Number(m[2]), family: m[3].replace(/^[A-Z]{6}\+/, ""), color: m[4] });
  }
  const pages = [];
  for (const pm of xml.matchAll(/<page number="(\d+)"[^>]*height="(\d+)" width="(\d+)">([\s\S]*?)<\/page>/g)) {
    const texts = [];
    for (const t of pm[4].matchAll(/<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">([\s\S]*?)<\/text>/g)) {
      const font = fonts.get(t[5]);
      const top = Number(t[1]);
      const height = Number(t[4]);
      texts.push({ top, left: Number(t[2]), width: Number(t[3]), height, bottom: top + height, font, runs: runsOf(t[6]) });
    }
    pages.push({ number: Number(pm[1]), height: Number(pm[2]), width: Number(pm[3]), texts });
  }
  return pages;
}

// ---------- classifying runs ----------

function kindOf(run, font) {
  const f = font.family;
  const t = run.text.trim();
  if (/AvenirNext/.test(f) && lightColor(font.color)) return "banner";
  if (/SC700/.test(f) && !lightColor(font.color)) return "name";
  if (/^\[[a-z]+\]$/.test(t)) return "tag";
  if (/NimbleBeaufort/.test(f) && run.bold && (t === "d" || t === "c")) return "tactic";
  if (t === "•" || t === "�") return "bullet";
  if (/^BeaufortPro/.test(f) || /Edo|DesirePro|BrushUp|Morris/.test(f)) return "heading";
  if (run.italic && !run.bold && /AvenirNext/.test(f) && font.color !== "#231f20" && font.color !== "#181615" && font.color !== "#4f4b4c") return "flavor";
  if (run.bold && /AvenirNext/.test(f)) return "bold";
  return "text";
}

/** Each element gets its runs classified; elements are what blocks are cut from. */
function classify(page) {
  for (const t of page.texts) for (const r of t.runs) r.kind = kindOf(r, t.font);
  return page;
}

const isBanner = (t) => t.runs.some((r) => r.kind === "banner" && /\S/.test(r.text));
const isHeading = (t) => t.runs.some((r) => r.kind === "heading" && /\S/.test(r.text));

// ---------- cutting a page into blocks ----------

function bannerGroups(page) {
  const banners = page.texts.filter(isBanner).sort((a, b) => a.top - b.top || a.left - b.left);
  const groups = [];
  for (const t of banners) {
    const g = groups.find((x) => Math.abs(x.bottom - t.bottom) <= 4 && t.left - x.right < 30 && x.left - (t.left + t.width) < 30);
    if (g) {
      g.parts.push(t);
      g.right = Math.max(g.right, t.left + t.width);
      g.left = Math.min(g.left, t.left);
      g.top = Math.min(g.top, t.top);
    } else groups.push({ top: t.top, bottom: t.bottom, left: t.left, right: t.left + t.width, parts: [t] });
  }
  for (const g of groups) {
    g.parts.sort((a, b) => a.left - b.left);
    g.text = g.parts.map((p) => p.runs.map((r) => r.text).join("")).join("").replace(/\s+/g, " ").trim();
  }
  // "lvl 2", "Level 8 Solo …", "minion", "Solo lvl 3 …", "Huge Solo …".
  return groups.filter((g) => /^(lvl|level|minion|solo\b)/i.test(g.text) || (/^\w+ solo\b/i.test(g.text) && /(lvl|level)\s*\d/i.test(g.text)));
}

function footerNumbers(page) {
  const nums = page.texts.filter((t) => t.top > page.height - 50 && /^\d{1,3}$/.test(t.runs.map((r) => r.text).join("").trim()));
  // The page numbers sit in the outer corners; table numbers near the bottom don't.
  const left = nums.filter((t) => t.left < 60).sort((a, b) => a.left - b.left)[0];
  const right = nums.filter((t) => t.left > page.width - 80).sort((a, b) => b.left - a.left)[0];
  const n = (t) => (t ? Number(t.runs.map((r) => r.text).join("").trim()) : null);
  const l = n(left) ?? (n(right) !== null ? n(right) - 1 : page.number * 2 - 2);
  return { left: l, right: n(right) ?? l + 1 };
}

function cutBlocks(page) {
  const mid = page.width / 2;
  const groups = bannerGroups(page);
  const bottomLimit = page.height - 45;
  const halfEnd = (g) => (g.left < mid ? mid : page.width) - 5;
  // A block runs down its column until the next banner or heading, or a gap of more than
  // GAP between lines (blocks are separated by space; lines inside one are close together).
  const GAP = 30;
  const extent = (g, xEnd) => {
    const xStart = g.left - 18;
    const inCol = (t) => t.left >= xStart && t.left < xEnd;
    const col = page.texts.filter((t) => inCol(t) && t.top >= g.top - 2 && t.top < bottomLimit).sort((a, b) => a.top - b.top);
    const texts = [];
    let last = g.bottom;
    for (const t of col) {
      if (t.top > g.bottom && ((isHeading(t) && t.top > g.bottom + 25) || (isBanner(t) && !g.parts.includes(t)))) break;
      const visible = t.runs.some((r) => r.text.trim() !== "");
      if (t.top - last > GAP && visible) break;
      texts.push(t);
      if (visible) last = Math.max(last, t.bottom);
    }
    return { xStart, xEnd, yEnd: last, texts };
  };
  const rightLimit = (g, others) => {
    const right = others.filter((o) => o !== g && o.left > g.left + 100 && o.left < halfEnd(g) + 5);
    const widest = /legendary|solo/i.test(g.text) ? 560 : 300;
    const limit = Math.min(halfEnd(g), g.left + widest, ...right.map((o) => o.left - 18));
    // The [hp] value is printed at the block's right edge: the name line's right end is the
    // best guide to how wide this block is (prose can sit right next to a narrow block).
    const nameLine = page.texts.filter((t) => t.top >= g.bottom - 2 && t.top <= g.bottom + 30 && t.left >= g.left - 20 && t.left < limit && t.runs.some((r) => r.kind === "name" || r.kind === "tag" || /follows minion/i.test(r.text)));
    // Only right-aligned things ([hp] and other tags, "*follows minion rules") mark the edge;
    // a name on its own (a hazard) says nothing about the width.
    const edgeMarked = nameLine.some((t) => t.runs.some((r) => r.kind === "tag" || /follows minion/i.test(r.text)));
    if (!nameLine.length || !edgeMarked) return limit;
    return Math.min(limit, Math.max(...nameLine.map((t) => t.left + t.width)) + 15);
  };
  // Pass 1: neighbours on roughly the same row decide the width.
  for (const g of groups) {
    const near = groups.filter((o) => Math.abs(o.top - g.top) < 150);
    Object.assign(g, extent(g, rightLimit(g, near)));
  }
  // Pass 2: only neighbours whose blocks overlap this one vertically.
  for (const g of groups) {
    const overlapping = groups.filter((o) => o.top < g.yEnd && o.yEnd > g.top);
    g.pass2 = extent(g, rightLimit(g, overlapping));
  }
  if (process.env.DUMP && Number(process.env.DUMP) === page.number) for (const g of groups) console.log("G", g.text, g.left, g.top, "p1", g.xEnd, g.yEnd, "p2", g.pass2.xEnd, g.pass2.yEnd);
  return groups.map((g) => ({ page: page.number, half: g.left < mid ? "left" : "right", top: g.top, left: g.left, banner: g.text, texts: g.pass2.texts, cutOff: g.pass2.yEnd >= bottomLimit - 45 || g.top > bottomLimit - 90 }));
}

/**
 * The top of each column, above its first banner: where a block cut off at the bottom of the
 * previous column carries on. Columns are banners lined up at the same x.
 */
function columnTops(page) {
  const mid = page.width / 2;
  const banners = bannerGroups(page);
  const cols = [];
  for (const b of [...banners].sort((x, y) => x.left - y.left)) {
    const c = cols.find((x) => Math.abs(x.left - b.left) < 40);
    if (c) c.firstTop = Math.min(c.firstTop, b.top);
    else cols.push({ left: b.left, firstTop: b.top, half: b.left < mid ? "left" : "right" });
  }
  for (const c of cols) {
    const nextLeft = Math.min(...cols.filter((o) => o.left > c.left + 100).map((o) => o.left - 18), c.left + 252);
    const inCol = page.texts.filter((t) => t.left >= c.left - 18 && t.left < nextLeft && t.top > 30 && t.top < c.firstTop - 2).sort((a, b) => a.top - b.top);
    c.texts = [];
    let last = null;
    for (const t of inCol) {
      const visible = t.runs.some((r) => r.text.trim() !== "");
      if (isHeading(t)) break;
      if (last !== null && visible && t.top - last > 30) break;
      c.texts.push(t);
      if (visible) last = Math.max(last ?? 0, t.bottom);
    }
  }
  return cols;
}

/** Groups a block's elements into lines (by baseline), each a list of runs left to right. */
function linesOf(texts) {
  const sorted = [...texts].sort((a, b) => a.bottom - b.bottom || a.left - b.left);
  const lines = [];
  const isTag = (t) => t.runs.every((r) => r.kind === "tag" || r.text.trim() === "");
  for (const t of sorted) {
    // Stat tags ([hp] icons) can sit a few points lower than the name they belong to.
    const line = lines.find((l) => Math.abs(l.bottom - t.bottom) <= 4) ?? (isTag(t) ? lines.find((l) => Math.abs(l.bottom - t.bottom) <= 8) : undefined);
    if (line) line.items.push(t);
    else lines.push({ bottom: t.bottom, top: t.top, items: [t] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.left - b.left);
    l.top = Math.min(...l.items.map((t) => t.top));
    l.left = Math.min(...l.items.map((t) => t.left));
    l.runs = l.items.flatMap((t) => t.runs.map((r) => ({ ...r, size: t.font.size })));
  }
  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

// ---------- reading a block ----------

const clean = (s) =>
  s
    .replace(/�/g, "×")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();

/** Small-caps name: the big letters are capitals, the small ones lower case. */
function smallCaps(runs) {
  if (!runs.length) return "";
  const big = Math.max(...runs.map((r) => r.size));
  return runs.map((r) => (r.size >= big - 0.5 ? r.text.toUpperCase() : r.text.toLowerCase())).join("");
}

function parseBanner(text) {
  const out = { minion: /minion/i.test(text), legendary: false };
  // "lvl 1/2", "lvl, 4", "lvl1", "Level 8"; anything else ("lvl x", "lvl 1/hero") is kept as printed.
  const lvl = /(?:lvl|level)[\s,]*(\d+(?:\/\d+)?)(?![\d/])/i.exec(text);
  const printed = /(?:lvl|level)[\s,]*(\S+)/i.exec(text);
  let rest = text.replace(/minion,?/i, "");
  if (lvl) {
    out.level = lvl[1];
    rest = rest.replace(lvl[0], " ");
  } else if (printed) {
    out.printedLevel = printed[1].replace(/,$/, "");
    rest = rest.replace(printed[0], " ");
  }
  const kind = /\b(legendary|solo)\b/i.exec(rest);
  if (kind) {
    out.legendary = true;
    out.legendaryKind = /solo/i.test(kind[1]) ? "Solo" : "Legendary";
    rest = rest.replace(kind[0], " ");
  }
  const words = rest.split(/[\s,]+/).filter(Boolean);
  const sizeAt = words.findIndex((w) => SIZES.includes(w.toLowerCase()));
  if (sizeAt >= 0 && sizeAt <= 1) out.size = words.splice(sizeAt, 1)[0].toLowerCase();
  if (words.length) out.type = words.join(" ");
  return out;
}

function applyTag(m, tag, value, problems) {
  const v = clean(value);
  if (tag === "[hp]") {
    const per = /^(\d+)\s*\/\s*hero/i.exec(v);
    const n = /^(\d+)/.exec(v);
    if (per) m.hpPerHero = Number(per[1]);
    else if (n) m.hp = Number(n[1]);
    else problems.push(`hp "${v}"`);
  } else if (tag === "[ar]") {
    if (/^M/i.test(v)) m.armor = "medium";
    else if (/^H/i.test(v)) m.armor = "heavy";
    else problems.push(`armor "${v}"`);
  } else if (tag === "[sv]") m.saves = v.toUpperCase().replace(/,$/, "");
  else if (tag === "[mv]") m.speed = m.speed ? `${v.replace(/,$/, "")}, ${m.speed}` : v.replace(/,$/, "");
  else if (/^\[(fly|swim|climb|burrow|bur|leap)\]$/.test(tag)) {
    const mode = `${tag[1].toUpperCase()}${tag.slice(2, -1)} ${v.replace(/,$/, "")}`;
    m.speed = m.speed ? `${m.speed}, ${mode}` : mode;
  } else problems.push(`tag ${tag} "${v}"`);
}

/** Text runs with stat tags written out: "[hp]45" → "45 HP", "[ar]M" → "Medium Armor". */
function inlineTags(runs) {
  return clean(
    runs
      .map((r) => r.text)
      .join("")
      .replace(/\[ar\]\s*M\b/g, "Medium Armor")
      .replace(/\[ar\]\s*H\b/g, "Heavy Armor")
      .replace(/\[hp\]\s*(\d+(?:\s*\/\s*hero)?)/gi, "$1 HP")
      .replace(/\[mv\]\s*/g, "Speed ")
      .replace(/\[sv\]\s*([A-Za-z+\-–, ]+)/g, (_, v) => `Saves ${v.toUpperCase().trim()}`)
      .replace(/\[(fly|swim|climb|burrow|bur|leap)\]\s*/g, (_, w) => `${w[0].toUpperCase()}${w.slice(1)} `),
  );
}

const TACTIC = { d: "👎", c: "💀" };

function readBlock(block) {
  const lines = linesOf(block.texts);
  if (process.env.DUMP && Number(process.env.DUMP) === block.page) {
    console.log(`--- ${block.banner} @${block.left},${block.top}`);
    for (const l of lines) console.log(`  ${l.top}/${l.left}: ` + l.runs.map((r) => `[${r.kind}${r.size}]${r.text}`).join(""));
  }
  const problems = [];
  const head = parseBanner(block.banner);
  const m = { name: "", level: head.level ?? (head.minion ? "1" : ""), minion: head.minion, armor: "none", abilities: [] };
  if (head.size) m.size = head.size;
  if (head.type) m.type = head.type;
  if (head.legendary) m.legendary = head.legendaryKind;

  const notes = [];
  if (head.printedLevel) {
    problems.push(`level printed as "${head.printedLevel}" (set to 0)`);
    m.level = "0";
    notes.push({ text: `Level as printed: lvl ${head.printedLevel}` });
  }
  let current = null; // ability being written
  let note = null; // note paragraph being written
  let phase = "head";
  let lastFlavorBottom = -Infinity;
  const visible = (r) => r.text.trim() !== "";

  for (const line of lines) {
    // The banner line: anything else on it (e.g. what a mimic disguises itself as) is a note.
    if (line.runs.some((r) => r.kind === "banner")) {
      const extra = clean(line.runs.filter((r) => r.kind !== "banner").map((r) => r.text).join(""));
      if (extra && !/^ARTIST/i.test(extra)) notes.push({ text: extra });
      continue;
    }
    const runs = line.runs;
    if (!runs.some(visible)) continue;
    const text0 = clean(runs.map((r) => r.text).join(""));
    if (/^ARTIST:/i.test(text0)) continue;
    const first = runs.find(visible);
    const lead = runs.indexOf(first);
    const statsLine = first.kind === "name" || first.kind === "tag";

    if (statsLine && (phase === "head" || !m.name)) {
      // Name and stats: name runs before the first tag, then "[tag] value" pairs.
      let tag = null;
      let value = [];
      const nameRuns = [];
      const flush = () => tag && applyTag(m, tag, value.map((r) => r.text).join(""), problems);
      for (const r of runs) {
        if (r.kind === "tag") {
          flush();
          tag = r.text.trim();
          value = [];
        } else if (tag) value.push(r);
        else if (r.kind === "name") nameRuns.push(r);
      }
      flush();
      const name = clean(smallCaps(nameRuns));
      if (name && !m.name) m.name = name;
      continue;
    }
    if (statsLine) {
      // A second creature inside the block (a legendary duo): its name and stats as a heading.
      const nameRuns = [];
      const rest = [];
      for (const r of runs) (r.kind === "name" && !rest.length ? nameRuns : rest).push(r);
      current = { name: clean(smallCaps(nameRuns)), text: inlineTags(rest), bullet: false };
      m.abilities.push(current);
      note = null;
      continue;
    }
    if (phase === "head" && !m.name) problems.push(`text before the name: "${text0}"`);
    phase = "body";

    if (first.kind === "tactic") {
      note = { text: `${TACTIC[first.text.trim()]} ${runs.slice(lead + 1).map((r) => r.text).join("")}` };
      notes.push(note);
      lastFlavorBottom = line.bottom;
      current = null;
      continue;
    }
    if (first.kind === "flavor" && runs.every((r) => r.kind === "flavor" || !visible(r))) {
      const text = runs.map((r) => r.text).join("");
      if (/^\s*\*follows minion rules/i.test(text)) continue;
      // Continues a boxed ability written in the same italic style ("Digested. …").
      if (current && current.boxed && line.top - current.bottom < 8) {
        current.text = `${current.text} ${text}`;
        current.bottom = line.bottom;
        continue;
      }
      // Continues the open note (flavour paragraph or tactic) unless there's a gap.
      if (note && line.top - lastFlavorBottom < 8) note.text += ` ${text}`;
      else {
        note = { text };
        notes.push(note);
      }
      lastFlavorBottom = line.bottom;
      current = null;
      continue;
    }
    note = null;
    const startsBullet = first.kind === "bullet";
    const afterBullet = startsBullet ? runs.slice(lead + 1).find(visible) : first;
    if (afterBullet && afterBullet.kind === "bold" && runs.indexOf(afterBullet) <= lead + 2) {
      // Some names are split over several bold runs ("Bite & Stab (2×).").
      let j = runs.indexOf(afterBullet);
      const nameParts = [];
      while (j < runs.length && runs[j].kind === "bold") nameParts.push(runs[j++].text);
      let name = clean(nameParts.join(""));
      let pre = "";
      // A bold name ends at its first full stop / colon / ! / ?; anything after is text.
      const cut = /^(.*?[.:!?])\s+(.+)$/.exec(name);
      if (cut && cut[1].length >= 3 && !/\($/.test(cut[1])) {
        name = cut[1];
        pre = cut[2];
      }
      const restRuns = runs.slice(j);
      current = { name: name.replace(/[.:]$/, "").trim(), text: clean(`${pre} ${inlineTags(restRuns)}`), bullet: startsBullet, boxed: restRuns.some((r) => r.kind === "flavor"), bottom: line.bottom };
      m.abilities.push(current);
      continue;
    }
    const text = inlineTags(runs.slice(startsBullet ? lead + 1 : 0));
    if (current && !startsBullet) {
      current.text = clean(`${current.text} ${text}`);
      current.bottom = line.bottom;
    } else {
      current = { name: "", text: clean(text), bullet: startsBullet, bottom: line.bottom };
      m.abilities.push(current);
    }
  }

  for (const a of m.abilities) {
    a.text = clean(a.text);
    if (a.bullet) a.name = a.name ? `• ${a.name}` : "•";
    delete a.bullet;
    delete a.boxed;
    delete a.bottom;
  }
  m.abilities = m.abilities.filter((a) => a.name || a.text);
  if (notes.length) m.notes = notes.map((n) => clean(n.text)).join("\n");
  // Keep within the app's limits (MonsterSchema in src/rules/persistence/campaign.ts).
  const cap = (v, n) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  m.name = cap(m.name, 80);
  for (const [k, n] of [["size", 20], ["type", 60], ["speed", 40], ["saves", 40], ["notes", 4000]]) if (m[k]) m[k] = cap(m[k], n);
  m.abilities = m.abilities.slice(0, 40).map((a) => ({ name: cap(a.name, 80), text: cap(a.text, 2000) }));
  if (!m.level) m.level = "0";
  // Legendary Last Stand: "regains [hp]7/hero" (GMG p.20–21).
  const lastStand = m.abilities.find((a) => /^LAST STAND/i.test(a.name) || /^LAST STAND/i.test(a.text));
  const regain = lastStand && /regains?\s+(\d+)\s*\/\s*hero/i.exec(lastStand.text);
  if (regain) m.lastStandHpPerHero = Number(regain[1]);
  return { monster: m, problems };
}

// ---------- groups (Goblins, Kobolds …) ----------

function groupHeadings(page) {
  return page.texts
    .filter((t) => t.runs.some((r) => r.kind === "heading") && t.font.size >= 30 && !lightColor(t.font.color))
    .map((t) => ({ top: t.top, left: t.left, text: clean(t.runs.map((r) => r.text).join("")) }))
    .filter((h) => h.text.length > 2 && !/^\d+$/.test(h.text));
}

// ---------- main ----------

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function main() {
  const [bookKey, pdfArg] = process.argv.slice(2);
  const book = BOOKS[bookKey];
  if (!book) {
    console.error(`Usage: node scripts/extract-monsters.mjs <${Object.keys(BOOKS).join("|")}> [pdf]`);
    process.exit(1);
  }
  const pdf = pdfArg ?? join("reference", book.file);
  const tmp = mkdtempSync(join(tmpdir(), "nimble-monsters-"));
  let xml;
  try {
    execFileSync("pdftohtml", ["-xml", "-i", "-q", pdf, join(tmp, "book")], { stdio: "inherit" });
    xml = readFileSync(join(tmp, "book.xml"), "utf8");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const pages = parseXml(xml).map(classify);
  // Hand corrections for blocks the layout reader gets wrong, kept with the output in private/
  // (git-ignored) because they contain book text: { "<monster id>": { field: value, …,
  // "removeAbilities": ["Name"], "delete": true } }.
  const fixesPath = join("private", "monsters", `${bookKey}.fixes.json`);
  let fixes = {};
  try {
    fixes = JSON.parse(readFileSync(fixesPath, "utf8"));
  } catch {
    fixes = {};
  }
  const monsters = [];
  const report = [];
  const ids = new Map();
  let group = "";
  // Blocks cut off at the bottom of a column carry on at the top of the next column (same
  // half, then the other half, then the next page). Their texts are shifted down so they read
  // after the rest of the block.
  const allBlocks = pages.map((page) => cutBlocks(page));
  const tops = pages.map((page) => columnTops(page));
  const continued = new Set();
  pages.forEach((page, pi) => {
    for (const block of allBlocks[pi]) {
      if (!block.cutOff) continue;
      const here = tops[pi].filter((c) => c.half === block.half && c.left > block.left + 100).sort((a, b) => a.left - b.left)[0];
      const other = block.half === "left" ? tops[pi].filter((c) => c.half === "right").sort((a, b) => a.left - b.left)[0] : undefined;
      const next = here ?? other ?? (tops[pi + 1] ?? []).filter((c) => c.half === "left").sort((a, b) => a.left - b.left)[0];
      const visible = next ? next.texts.filter((t) => t.runs.some((r) => r.text.trim() !== "")) : [];
      if (!visible.length) continue;
      // Only carry on when the next column clearly continues a stat block: it starts with an
      // ability (bold name or bullet), or this block stops mid-sentence.
      const firstRun = visible[0].runs.find((r) => r.text.trim() !== "");
      const lastText = [...block.texts].filter((t) => t.runs.some((r) => r.text.trim() !== "")).sort((a, b) => a.bottom - b.bottom || a.left - b.left).at(-1);
      const midSentence = lastText && !/[.!?:)*]$/.test(lastText.runs.map((r) => r.text).join("").trim());
      const startsAbility = (firstRun.kind === "bold" && /^[A-Za-z]/.test(firstRun.text.trim())) || firstRun.kind === "bullet";
      // A banner alone at the foot of a column: its name and stats start the next column.
      const bannerOnly = !block.texts.some((t) => t.runs.some((r) => r.kind === "name"));
      const startsName = bannerOnly && (firstRun.kind === "name" || firstRun.kind === "tag");
      if (!startsAbility && !startsName && !(midSentence && firstRun.kind === "text")) continue;
      const shift = 100000;
      block.texts = [...block.texts, ...next.texts.map((t) => ({ ...t, top: t.top + shift, bottom: t.bottom + shift }))];
      continued.add(block);
      next.texts = [];
    }
  });

  pages.forEach((page, pi) => {
    const pn = footerNumbers(page);
    const headings = groupHeadings(page);
    const blocks = allBlocks[pi].sort((a, b) => (a.half === b.half ? 0 : a.half === "left" ? -1 : 1) || a.left - b.left || a.top - b.top);
    // Group headings by half, in reading order.
    const mid = page.width / 2;
    for (const half of ["left", "right"]) {
      const hs = headings.filter((h) => (h.left < mid) === (half === "left")).sort((a, b) => a.top - b.top);
      const inHalf = blocks.filter((b) => b.half === half);
      for (const block of inHalf) {
        const before = hs.filter((h) => h.top < block.top).at(-1);
        const blockGroup = before ? before.text : group;
        const { monster, problems } = readBlock(block);
        const printed = half === "left" ? pn.left : pn.right;
        monster.source = `${book.short ?? book.label} p.${printed}`;
        if (blockGroup) monster.group = blockGroup;
        if (continued.has(block)) problems.push("continued in the next column: check");
        if (!monster.name) problems.push("no name");
        if (!monster.level) problems.push("no level");
        if (!monster.minion && monster.hp === undefined && monster.hpPerHero === undefined) problems.push("no HP");
        if (!monster.abilities.length) problems.push("no abilities");
        if (monster.level && /^\d+$/.test(monster.level) && Number(monster.level) > 30) problems.push(`level ${monster.level} looks wrong`);
        const base = `${bookKey}.${slug(monster.name || "unnamed")}${monster.minion ? "" : `-${slug(monster.level || "x")}`}`;
        const count = (ids.get(base) ?? 0) + 1;
        ids.set(base, count);
        monster.id = count > 1 ? `${base}-${count}` : base;
        if (!monster.name && !monster.abilities.length) {
          report.push(`-- PDF ${page.number} skipped an empty banner "${block.banner}"`);
          continue;
        }
        if (!monster.name) monster.name = `Unnamed (${monster.source})`;
        const fix = fixes[monster.id];
        if (fix?.delete) {
          report.push(`-- PDF ${page.number} ${monster.id} removed by the fixes file`);
          continue;
        }
        if (fix) {
          const { removeAbilities = [], ...set } = fix;
          Object.assign(monster, set);
          monster.abilities = monster.abilities.filter((a) => !removeAbilities.includes(a.name));
          problems.length = 0;
          problems.push("fixed by hand");
        }
        const ordered = { id: monster.id, ...monster };
        monsters.push(ordered);
        report.push(`${problems.length ? "!!" : "ok"} PDF ${page.number} (${monster.source}) ${monster.name || "?"} | ${block.banner}${problems.length ? ` | ${problems.join("; ")}` : ""}`);
      }
      if (hs.length) group = hs.at(-1).text;
    }
  });

  const outDir = join("private", "monsters");
  mkdirSync(outDir, { recursive: true });
  const file = {
    format: "nimble-bear/monsters",
    note: `Extracted from the GM's own copy of ${book.label} (${book.file}) for private use at the table. Never share or publish.`,
    monsters,
  };
  writeFileSync(join(outDir, `${bookKey}.nimble-monsters.json`), JSON.stringify(file, null, 2));
  writeFileSync(join(outDir, `${bookKey}.report.txt`), report.join("\n") + "\n");
  const bad = report.filter((r) => r.startsWith("!!")).length;
  console.log(`${monsters.length} monsters (${bad} flagged) → ${join(outDir, `${bookKey}.nimble-monsters.json`)}`);
}

main();
