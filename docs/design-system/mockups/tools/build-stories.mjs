#!/usr/bin/env node
/*
 * build-stories.mjs — parse every docs/<domain>/user-stories.md into a single
 * lookup the mockups can bind to, so a `data-story="US-R4.1"` attribute in any
 * mockup can open the exact story + acceptance criteria in the shell drawer.
 *
 * Source of truth stays the markdown. This emits a BUILD ARTIFACT:
 *   assets/stories.data.js  ->  window.OGGVO_STORIES = { "US-R4.1": {...}, ... }
 *
 * Shipped as a .js (not .json) on purpose: mockups open over file:// where
 * fetch() of a local .json is blocked, but a <script> tag always loads — the
 * same trick tailwind-config.js / theme.js already use.
 *
 * Run:  node tools/build-stories.mjs        (from docs/design-system/mockups/)
 * No dependencies.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));       // .../mockups/tools
const MOCKUPS = join(HERE, "..");                            // .../mockups
const DOCS = join(MOCKUPS, "..", "..");                     // .../docs
const OUT = join(MOCKUPS, "assets", "stories.data.js");

const DOMAIN_LABELS = {
  admin: "Admin", analytics: "Dashboard", auth: "Auth", campaigns: "Campaigns",
  compliance: "Compliance", contacts: "Contacts", "design-funnel": "Funnel",
  integrations: "Integrations", messaging: "Connect", reviews: "Reviews",
  settings: "Settings", social: "Social", surveys: "Surveys", widgets: "Widgets",
  tutorials: "Tutorials", support: "Support", media: "Media", referrals: "Referrals",
};

// ---------- tiny, focused markdown -> HTML ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function inline(text) {
  // order matters: code first so ** inside code is left alone
  const parts = [];
  let rest = text, m;
  const codeRe = /`([^`]+)`/;
  while ((m = codeRe.exec(rest))) {
    parts.push(fmt(rest.slice(0, m.index)));
    parts.push('<code>' + esc(m[1]) + '</code>');
    rest = rest.slice(m.index + m[0].length);
  }
  parts.push(fmt(rest));
  return parts.join("");
  function fmt(s) {
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) =>
      '<a href="' + h + '" target="_blank" rel="noopener">' + t + "</a>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    return s;
  }
}

// detect "- **AC3** ..." or "- **AC3 — foo** ..." -> "AC3"
function acKey(line) {
  const m = /^-\s+\*\*(AC\d+)\b/.exec(line.trim());
  return m ? m[1] : null;
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // GFM table
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const tbl = [];
      while (i < lines.length && lines[i].includes("|")) { tbl.push(lines[i]); i++; }
      out.push(renderTable(tbl));
      continue;
    }

    // list block (top-level "- ")
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*-\s+/.test(lines[i]) || (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*-\s+/.test(lines[i])))) {
        if (/^\s{0,1}-\s+/.test(lines[i]) || /^-\s+/.test(lines[i])) {
          items.push({ text: lines[i].replace(/^\s*-\s+/, ""), ac: acKey(lines[i]), sub: [] });
        } else if (/^\s{2,}-\s+/.test(lines[i])) {
          (items[items.length - 1]?.sub || out).push(lines[i].replace(/^\s*-\s+/, ""));
        } else {
          // continuation of previous item
          if (items.length) items[items.length - 1].text += " " + lines[i].trim();
        }
        i++;
      }
      out.push("<ul class='ds-story-acs'>" + items.map((it) => {
        const anchor = it.ac ? ' id="ac-' + it.ac + '" data-ac="' + it.ac + '"' : "";
        const sub = it.sub.length ? "<ul>" + it.sub.map((s) => "<li>" + inline(s) + "</li>").join("") + "</ul>" : "";
        return "<li" + anchor + ">" + inline(it.text) + sub + "</li>";
      }).join("") + "</ul>");
      continue;
    }

    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^\s*-\s+/.test(lines[i]) && !lines[i].includes("|")) {
      buf.push(lines[i].trim()); i++;
    }
    if (buf.length) out.push("<p>" + inline(buf.join(" ")) + "</p>");
  }
  return out.join("\n");
}

function renderTable(rows) {
  const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return "<div class='ds-story-tablewrap'><table class='ds-story-table'><thead><tr>" +
    head.map((h) => "<th>" + inline(h) + "</th>").join("") + "</tr></thead><tbody>" +
    body.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

// ---------- parse one user-stories.md ----------
function parseDoc(domain, md) {
  const lines = md.split(/\r?\n/);
  const stories = [];
  let epic = null, cur = null;

  const flush = () => { if (cur) { stories.push(cur); cur = null; } };

  for (const raw of lines) {
    const epicM = /^##\s+(Epic\s+.+)$/.exec(raw);
    if (epicM) { epic = epicM[1].trim(); continue; }

    const storyM = /^###\s+(US-[A-Za-z0-9.]+)\s+[—-]\s+(.+)$/.exec(raw);
    if (storyM) {
      flush();
      cur = { id: storyM[1], title: storyM[2].trim(), epic, persona: null, bodyLines: [] };
      continue;
    }
    if (!cur) continue;
    if (/^#{2,3}\s+/.test(raw) || /^---\s*$/.test(raw)) { flush(); continue; }

    const personaM = /^\*\*As an?\*\*\s+(.+)$/.exec(raw.trim());
    if (personaM && !cur.persona) { cur.persona = inline(raw.trim()); continue; }
    cur.bodyLines.push(raw);
  }
  flush();

  return stories.map((s) => ({
    id: s.id,
    title: s.title,
    epic: s.epic,
    persona: s.persona,
    domain,
    domainLabel: DOMAIN_LABELS[domain] || domain,
    sourceHref: "../../../" + domain + "/user-stories.md",  // pages now live one folder deeper (mockups/<folder>/)
    html: renderBlocks(s.bodyLines),
  }));
}

// ---------- walk domains ----------
// Story IDs are NOT globally unique — 7 domains all use bare US-1.1/US-2.1/...
// So the canonical key is "<domain>:<id>". `bare` maps a plain id to the list
// of domain-keys that carry it, letting the shell resolve an unambiguous id or
// disambiguate with the page's declared domain.
const index = {};    // "reviews:US-R4.1" -> story
const bare = {};     // "US-R4.1" -> ["reviews:US-R4.1", ...]
let count = 0, dupes = 0;
for (const domain of Object.keys(DOMAIN_LABELS)) {
  const file = join(DOCS, domain, "user-stories.md");
  if (!existsSync(file)) continue;
  for (const st of parseDoc(domain, readFileSync(file, "utf8"))) {
    const key = domain + ":" + st.id;
    index[key] = st;
    (bare[st.id] = bare[st.id] || []).push(key);
    if (bare[st.id].length > 1) dupes++;
    count++;
  }
}

const banner = "/* AUTO-GENERATED by tools/build-stories.mjs — do not edit. " +
  "Source: docs/<domain>/user-stories.md. Re-run: node tools/build-stories.mjs */\n";
writeFileSync(OUT, banner +
  "window.OGGVO_STORIES = " + JSON.stringify(index, null, 0) + ";\n" +
  "window.OGGVO_STORIES_BARE = " + JSON.stringify(bare) + ";\n" +
  "window.OGGVO_STORIES_META = " + JSON.stringify({ count, domains: Object.keys(DOMAIN_LABELS) }) + ";\n");

console.log("Wrote " + relative(MOCKUPS, OUT) + " — " + count + " stories across " +
  new Set(Object.values(index).map((s) => s.domain)).size + " domains (" +
  (count - dupes) + " unique ids, " + dupes + " that need a domain to disambiguate).");
