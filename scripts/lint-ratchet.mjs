/**
 * A one-way ratchet for ESLint, and the reason it exists is a sentence from this campaign's
 * opening diagnosis:
 *
 *   > `npm run verify` does not run ESLint, so the lint gate has been quietly red.
 *
 * It reported **1053 findings** that day and nothing failed, because nothing looked. The
 * campaign has since taken `src/` to a quarter of that, but "nothing looked" is still true,
 * and a count nobody enforces is a count that drifts back up. This is the same instrument as
 * {@link ./strict-ratchet.mjs}, pointed at `eslint .` instead of at a compiler flag, and wired
 * into `npm run verify` so that the gate is real.
 *
 * The reason it is a ratchet rather than `eslint --max-warnings 0` is arithmetic: turning the
 * lint gate on outright means clearing every finding first, and the two worst directories are
 * being rewritten by other people right now. A ratchet makes the number monotonic today and
 * lets it reach zero on its own schedule — which is exactly how `noUncheckedIndexedAccess`
 * got from 885 to 0 in `src/`.
 *
 *   node scripts/lint-ratchet.mjs            report the current counts against the baseline
 *   node scripts/lint-ratchet.mjs --check    exit 1 if any directory regressed
 *   node scripts/lint-ratchet.mjs --save     re-record the baseline (only ever downward)
 *   node scripts/lint-ratchet.mjs --reseed   establish a baseline from scratch
 *
 * `--save` refuses to record a worse number for any directory, and a directory absent from
 * the baseline counts as zero — so a new folder cannot arrive with a fresh allowance. That
 * guard is total, which is what `--reseed` is the deliberate exception to: use it only when
 * the thing being measured has changed (a rule added, a directory renamed) and say so in the
 * commit. It is not a way to launder a regression.
 *
 * Counts are per directory rather than per file so that moving code between files inside a
 * directory is not a regression, and per rule as well so the report says what got worse.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/lint-baseline.json');

/** Findings per directory. Errors and warnings both count — a warning nobody fixes is debt. */
function measure() {
  let out = '';
  try {
    out = execSync('npx eslint . --format json', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // ESLint exits non-zero when it reports anything, which is the normal case here.
    out = `${e.stdout ?? ''}`;
    if (out.trim() === '') throw e;
  }
  const counts = {};
  for (const file of JSON.parse(out)) {
    const total = file.errorCount + file.warningCount;
    if (total === 0) continue;
    const rel = file.filePath.replace(`${ROOT}/`, '');
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
    counts[dir] = (counts[dir] ?? 0) + total;
  }
  return counts;
}

const now = measure();
let base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};

if (process.argv.includes('--reseed')) {
  const seeded = {};
  for (const [dir, count] of Object.entries(now).sort()) if (count > 0) seeded[dir] = count;
  writeFileSync(BASELINE, `${JSON.stringify(seeded, null, 2)}\n`);
  base = seeded;
  console.log('baseline RESEEDED from current counts — this is not a ratchet operation');
} else if (process.argv.includes('--save')) {
  const merged = {};
  let refused = false;
  for (const dir of [...new Set([...Object.keys(now), ...Object.keys(base)])].sort()) {
    const current = now[dir] ?? 0;
    const previous = base[dir] ?? 0;
    if (current > previous) {
      console.error(`refusing to raise ${dir}: ${previous} -> ${current}`);
      refused = true;
    }
    if (current > 0) merged[dir] = Math.min(current, previous);
  }
  if (refused) {
    console.error('\nnothing written — a ratchet only turns one way');
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify(merged, null, 2)}\n`);
  base = merged;
  console.log('baseline written to scripts/lint-baseline.json');
}

let regressed = false;
const dirs = new Set([...Object.keys(now), ...Object.keys(base)]);
const total = Object.values(now).reduce((a, b) => a + b, 0);
const wasTotal = Object.values(base).reduce((a, b) => a + b, 0);
console.log(`\neslint   ${total} findings (baseline ${wasTotal})\n`);
for (const dir of [...dirs].sort()) {
  const current = now[dir] ?? 0;
  const previous = base[dir] ?? 0;
  if (current === 0 && previous === 0) continue;
  const mark = current > previous ? '  REGRESSED' : current < previous ? '  (better)' : '';
  console.log(
    `  ${dir.padEnd(44)} ${String(current).padStart(4)}  was ${String(previous).padStart(4)}${mark}`,
  );
  if (current > previous) regressed = true;
}
if (total === 0) console.log('  clean — replace this script with `eslint .` in `verify`');

if (process.argv.includes('--check') && regressed) {
  console.error('\na directory got worse; the ratchet only turns one way');
  process.exit(1);
}
