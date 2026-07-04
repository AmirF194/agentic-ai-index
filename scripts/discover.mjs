#!/usr/bin/env node
/**
 * Auto-widen the seed. Searches GitHub for popular agentic-AI repos, drops the
 * ones already in data/entries.json, and writes the rest to data/candidates.json
 * as a triage queue. A human promotes candidates into entries.json (assigning a
 * category) — discovery is automated, curation stays human.
 *
 * Run by .github/workflows/discover.yml on a schedule; also runnable locally:
 *   node scripts/discover.mjs
 *
 * Auth: `gh auth token` or $GITHUB_TOKEN (recommended — search is rate-limited).
 * No npm dependencies — Node 18+ only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAR_THRESHOLD = Number(process.env.DISCOVER_MIN_STARS || 3000);
const PER_PAGE = 50;

// Search angles — each is blind to what the others surface, so together they
// cover more ground than one query. Topic searches are already fairly targeted.
const QUERIES = [
  'topic:ai-agents',
  'topic:llm-agent',
  'topic:agentic',
  'topic:multi-agent',
  'topic:autonomous-agents',
  'topic:ai-agent',
  'topic:llm-agents',
  'topic:agent-framework',
];

function ghToken() {
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.env.GITHUB_TOKEN || '';
  }
}

async function search(query, token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'agentic-ai-index-discover' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url =
    'https://api.github.com/search/repositories?q=' +
    encodeURIComponent(`${query} stars:>${STAR_THRESHOLD} archived:false`) +
    `&sort=stars&order=desc&per_page=${PER_PAGE}`;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    console.warn(`  ${query}: network error ${e.message}`);
    return [];
  }
  if (res.status === 403) {
    console.warn(`  ${query}: rate limited`);
    return [];
  }
  if (!res.ok) {
    console.warn(`  ${query}: HTTP ${res.status}`);
    return [];
  }
  const j = await res.json();
  return (j.items || []).map((r) => ({
    repo: r.full_name,
    stars: r.stargazers_count,
    language: r.language || '',
    description: (r.description || '').replace(/\s+/g, ' ').trim(),
    matched: query,
  }));
}

const token = ghToken();
if (!token) console.warn('⚠  No GitHub token; search will be heavily rate-limited.');

const data = JSON.parse(readFileSync(join(ROOT, 'data/entries.json'), 'utf8'));
const listed = new Set(data.entries.map((e) => e.repo.toLowerCase()));

console.log(`Searching ${QUERIES.length} angles for repos >${STAR_THRESHOLD}★ not already listed…`);
const found = new Map(); // lowercased repo -> candidate (best/first hit wins)
for (const q of QUERIES) {
  const hits = await search(q, token);
  for (const h of hits) {
    const key = h.repo.toLowerCase();
    if (listed.has(key)) continue;
    if (!found.has(key)) found.set(key, h);
  }
}

const candidates = [...found.values()].sort((a, b) => b.stars - a.stars);
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  minStars: STAR_THRESHOLD,
  note: 'Triage queue: repos discovered automatically, NOT yet vetted or categorized. Promote good ones into entries.json with a category; delete the rest.',
  count: candidates.length,
  candidates,
};
writeFileSync(join(ROOT, 'data/candidates.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`✓ ${candidates.length} candidates written to data/candidates.json`);
if (candidates.length) {
  console.log('  Top new finds:');
  for (const c of candidates.slice(0, 10)) {
    console.log(`   ${String(c.stars).padStart(7)}★  ${c.repo}`);
  }
}
