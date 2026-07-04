#!/usr/bin/env node
/**
 * Regenerate the entry tables in README.md from data/entries.json.
 *
 * Humans own data/entries.json (which repo, which category). This script owns
 * everything that rots: stars, descriptions, language, and dead-link pruning.
 * It rewrites only the block between the AUTOGEN markers in README.md.
 *
 * Auth: uses `gh auth token` if available, else $GITHUB_TOKEN, else anonymous
 * (works but rate-limited). No npm dependencies — Node 18+ only.
 *
 *   node scripts/generate.mjs           # write README.md
 *   node scripts/generate.mjs --check   # exit 1 if README would change (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README_PATH = join(ROOT, 'README.md');
const START = '<!-- AUTOGEN:START -->';
const END = '<!-- AUTOGEN:END -->';
const CONCURRENCY = 8;

const CATEGORY_BLURB = {
  'Agent Frameworks & Orchestration':
    'Build and coordinate agents — single-agent loops to multi-agent workflows.',
  'Coding Agents': 'Agents that read, write, and ship code — terminals, IDEs, and CI.',
  'Browser & Computer Use': 'Agents that drive a browser, a desktop, or a sandbox.',
  'Memory & Context': 'Long-term memory, state, and context management for agents.',
  'Tool Use & MCP': 'Tool-calling platforms and the Model Context Protocol ecosystem.',
  'LLM Infrastructure & Gateways':
    'The plumbing agents run on — gateways, routers, runtimes, and programming layers.',
  'Observability & Evaluation':
    'Trace, measure, and evaluate agents in development and production.',
  'Security & Guardrails': 'Guardrails, input/output filtering, and agent security.',
  'Voice & Multimodal Agents': 'Real-time voice, vision, and multimodal agent frameworks.',
  'Research Agents': 'Autonomous research and long-horizon information-gathering agents.',
  'Platforms & Low-Code': 'Visual builders and platforms for shipping agentic apps.',
  'RAG & Data': 'Retrieval, scraping, and data pipelines that feed agents.',
  'Personal AI Assistants': 'General-purpose personal assistants you run yourself.',
};

function ghToken() {
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.env.GITHUB_TOKEN || '';
  }
}

async function fetchRepo(slug, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agentic-ai-index-generator',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${slug}`, { headers });
  } catch (e) {
    return { slug, error: `network: ${e.message}` };
  }
  if (res.status === 404) return { slug, error: '404 (renamed or deleted)' };
  if (res.status === 403) return { slug, error: '403 (rate limited)' };
  if (!res.ok) return { slug, error: `HTTP ${res.status}` };
  const j = await res.json();
  return {
    slug,
    fullName: j.full_name,
    url: j.html_url,
    description: (j.description || '').replace(/\s+/g, ' ').trim(),
    stars: j.stargazers_count ?? 0,
    language: j.language || '',
    archived: !!j.archived,
  };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function fmtStars(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function anchor(s) {
  // Match GitHub's heading slugger: lowercase, drop punctuation (but not the
  // surrounding spaces), then map each remaining whitespace char to a hyphen
  // WITHOUT collapsing runs — so "A & B" -> "a--b" (double hyphen), same as
  // the rendered heading. Collapsing here would produce dead TOC links.
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
}

function render(categories, results, entries) {
  const byCat = new Map(categories.map((c) => [c, []]));
  const dropped = [];
  results.forEach((r, i) => {
    if (r.error) return dropped.push(`${r.slug} — ${r.error}`);
    if (r.archived) return dropped.push(`${r.slug} — archived`);
    const cat = entries[i].category;
    (byCat.get(cat) || byCat.set(cat, []).get(cat)).push(r);
  });

  let total = 0;
  const usedCats = categories.filter((c) => (byCat.get(c) || []).length);
  const toc = [];
  const body = [];

  for (const cat of usedCats) {
    const items = byCat.get(cat).sort((a, b) => b.stars - a.stars);
    total += items.length;
    toc.push(`- [${cat}](#${anchor(cat)}) <sub>·&nbsp;${items.length}</sub>`);
    body.push('', `### ${cat}`, '');
    if (CATEGORY_BLURB[cat]) body.push(`_${CATEGORY_BLURB[cat]}_`, '');
    for (const r of items) {
      const desc = r.description || '_no description_';
      const lang = r.language ? ` · ${r.language}` : '';
      body.push(`- **[${r.fullName}](${r.url})** \`⭐ ${fmtStars(r.stars)}${lang}\` — ${desc}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const header = [
    `> **${total} projects** · **${usedCats.length} categories** · ranked by GitHub stars · auto-refreshed **${today}**`,
    '',
    '**Contents**',
    '',
    ...toc,
  ];

  return { block: [...header, ...body].join('\n'), total, cats: usedCats.length, dropped };
}

// --- main ---
const data = JSON.parse(readFileSync(join(ROOT, 'data/entries.json'), 'utf8'));
const entries = data.entries;
const categories = data.categories;
const token = ghToken();
if (!token) console.warn('⚠  No GitHub token (gh/GITHUB_TOKEN); running anonymous + rate-limited.');

console.log(`Fetching ${entries.length} repos…`);
const results = await pool(entries, CONCURRENCY, (e) => fetchRepo(e.repo, token));

const rateLimited = results.filter((r) => r.error && r.error.includes('403'));
if (rateLimited.length) {
  console.error(`✖ ${rateLimited.length} repos hit rate-limiting; aborting to avoid a partial list.`);
  process.exit(2);
}

const { block, total, cats, dropped } = render(categories, results, entries);

const readme = readFileSync(README_PATH, 'utf8');
if (!readme.includes(START) || !readme.includes(END)) {
  console.error(`✖ README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}
const next = readme.replace(
  new RegExp(`${START}[\\s\\S]*${END}`),
  `${START}\n\n${block}\n\n${END}`
);

if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('✖ README.md is out of date. Run: node scripts/generate.mjs');
    process.exit(1);
  }
  console.log('✓ README.md is up to date.');
  process.exit(0);
}

writeFileSync(README_PATH, next);
console.log(`✓ Rendered ${total} entries across ${cats} categories.`);
if (dropped.length) console.log(`  Pruned ${dropped.length}:\n   - ${dropped.join('\n   - ')}`);
