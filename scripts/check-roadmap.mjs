import { readFile } from 'node:fs/promises';

const ROADMAP_ROW_PATTERN = /^\|\s*(EX-\d{3})\s*\|([^|]*)\|\s*([^|]+?)\s*\|/gm;
const ALLOWED_STATUSES = new Set(['TODO', 'IN PROGRESS', 'BLOCKED', 'COMPLETED']);
const ROADMAP_HEADER_PATTERN = /^\|\s*ID\s*\|\s*Task\s*\|\s*Status\s*\|\s*Notes\s*\|\s*$/;
const DELIMITER_CELL_PATTERN = /^:?-{3,}:?$/;

export function parseRoadmapRows(source) {
  return Array.from(source.matchAll(ROADMAP_ROW_PATTERN), (match) => ({
    id: match[1],
    task: match[2].trim(),
    status: match[3].trim(),
  }));
}

export function validateRoadmap(source) {
  const errors = [];
  const rows = parseRoadmapRows(source);
  const seen = new Set();
  const lines = source.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => ROADMAP_HEADER_PATTERN.test(line));

  if (headerIndex < 0) {
    errors.push('roadmap table must have exactly the ID, Task, Status, and Notes columns');
  } else {
    const delimiter = lines[headerIndex + 1] ?? '';
    const delimiterCells =
      delimiter.startsWith('|') && delimiter.endsWith('|')
        ? delimiter
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim())
        : [];
    if (delimiterCells.length !== 4 || delimiterCells.some((cell) => !DELIMITER_CELL_PATTERN.test(cell))) {
      errors.push('roadmap table delimiter must define exactly four Markdown columns');
    }
  }

  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`duplicate roadmap id: ${row.id}`);
    seen.add(row.id);

    if (!row.task) errors.push(`roadmap task is empty: ${row.id}`);
    if (!ALLOWED_STATUSES.has(row.status)) {
      errors.push(`invalid roadmap status for ${row.id}: ${row.status}`);
    }
  }

  if (rows.length === 0) errors.push('roadmap contains no task rows');
  if (/^## Active Task Notes\s*$/m.test(source)) {
    errors.push('stale Active Task Notes section must be archived');
  }

  return errors;
}

async function main() {
  const roadmapPath = new URL('../ROADMAP.md', import.meta.url);
  const source = await readFile(roadmapPath, 'utf8');
  const errors = validateRoadmap(source);

  if (errors.length > 0) {
    for (const error of errors) console.error(`ROADMAP: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`ROADMAP: ${parseRoadmapRows(source).length} unique task rows validated`);
}

if (process.argv[1]?.endsWith('check-roadmap.mjs')) {
  await main();
}
