/**
 * A one-way ratchet for the compiler flags that are not on yet.
 *
 * **Now pointed at `tests/`.** It did this job for `src/` first — 885 errors to zero across
 * fifteen directories, by five agents and me, and `noUncheckedIndexedAccess` is now ON in
 * `tsconfig.json` so the compiler enforces that side directly. `tsconfig.tests.json` opts the
 * test project out for the moment, at 1047, and this script keeps that number falling.
 *
 * `noUncheckedIndexedAccess` is the strongest remaining check available to this codebase and
 * the last one still off: it makes `xs[i]` have type `T | undefined`, which is exactly the
 * mistake a tree full of index-based loops is prone to. It reports 885 errors in `src/`, so it
 * cannot simply be switched on — it is being cleared directory by directory, by several people
 * at once.
 *
 * That is the problem this script exists for. Between "885" and "0" the flag protects nothing,
 * and a new indexed loop written in an already-cleared directory silently puts the count back
 * up. A count that can go both ways is not progress. This makes it monotonic: the baseline is
 * committed per directory, and the check fails if any directory gets worse.
 *
 *   node scripts/strict-ratchet.mjs            report the current counts against the baseline
 *   node scripts/strict-ratchet.mjs --check     exit 1 if any directory regressed
 *   node scripts/strict-ratchet.mjs --save      re-record the baseline (only ever downward)
 *   node scripts/strict-ratchet.mjs --reseed    establish a baseline from scratch
 *
 * `--save` refuses to record a worse number for any directory, which is what makes it a
 * ratchet rather than a rubber stamp. A directory absent from the baseline counts as zero, so
 * a new folder cannot arrive with a fresh allowance either.
 *
 * `--reseed` is the deliberate exception, and exists because that guard is otherwise total:
 * pointing the ratchet at a NEW target — as happened when `src/` reached zero and this turned
 * to `tests/` — means every directory looks like a regression from an implied zero, and
 * `--save` correctly refuses all of them. Reseeding is not a way to launder a regression: it
 * records whatever is there now, so use it only when the thing being measured has changed,
 * and say so in the commit.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/strict-baseline.json');
const FLAGS = ['--noUncheckedIndexedAccess'];

/** Errors per test directory, for one flag. */
function measure(flag) {
  let out = '';
  try {
    execSync(`npx tsc -p tsconfig.tests.json --noEmit ${flag}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const counts = {};
  for (const line of out.split('\n')) {
    const m = /^(tests\/.*)\([0-9]+,[0-9]+\): error TS/.exec(line);
    if (m === null) continue;
    const dir = m[1].slice(0, m[1].lastIndexOf('/'));
    counts[dir] = (counts[dir] ?? 0) + 1;
  }
  return counts;
}

const now = {};
for (const flag of FLAGS) now[flag] = measure(flag);

let base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};

if (process.argv.includes('--reseed')) {
  const seeded = {};
  for (const flag of FLAGS) {
    seeded[flag] = {};
    for (const [dir, count] of Object.entries(now[flag]).sort()) {
      if (count > 0) seeded[flag][dir] = count;
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify(seeded, null, 2)}\n`);
  base = seeded;
  console.log('baseline RESEEDED from current counts — this is not a ratchet operation');
} else if (process.argv.includes('--save')) {
  const merged = {};
  let refused = false;
  for (const flag of FLAGS) {
    merged[flag] = {};
    const dirs = new Set([...Object.keys(now[flag]), ...Object.keys(base[flag] ?? {})]);
    for (const dir of [...dirs].sort()) {
      const current = now[flag][dir] ?? 0;
      // A directory absent from the baseline counts as zero, not as unconstrained: new code
      // is written clean, so a new directory arriving with errors is a regression like any
      // other. Without this, `--save` would happily mint a fresh allowance for a new folder.
      const previous = base[flag]?.[dir] ?? 0;
      if (current > previous) {
        console.error(`refusing to raise ${flag} ${dir}: ${previous} -> ${current}`);
        refused = true;
      }
      if (current > 0) merged[flag][dir] = Math.min(current, previous);
    }
  }
  if (refused) {
    console.error('\nnothing written — a ratchet only turns one way');
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify(merged, null, 2)}\n`);
  // Report against what was just written, not against what was read before writing it.
  base = merged;
  console.log('baseline written to scripts/strict-baseline.json');
}

let regressed = false;
for (const flag of FLAGS) {
  const dirs = new Set([...Object.keys(now[flag]), ...Object.keys(base[flag] ?? {})]);
  const total = Object.values(now[flag]).reduce((a, b) => a + b, 0);
  const wasTotal = Object.values(base[flag] ?? {}).reduce((a, b) => a + b, 0);
  console.log(`\n${flag}   ${total} errors (baseline ${wasTotal})\n`);
  for (const dir of [...dirs].sort()) {
    const current = now[flag][dir] ?? 0;
    const previous = base[flag]?.[dir] ?? 0;
    const mark = current > previous ? '  REGRESSED' : current < previous ? '  (better)' : '';
    if (current === 0 && previous === 0) continue;
    console.log(
      `  ${dir.padEnd(36)} ${String(current).padStart(4)}  was ${String(previous).padStart(4)}${mark}`,
    );
    if (current > previous) regressed = true;
  }
  if (total === 0)
    console.log(`  clean — turn ${flag} on in tsconfig.json and delete it from this script`);
}

if (process.argv.includes('--check') && regressed) {
  console.error('\na directory got worse; the ratchet only turns one way');
  process.exit(1);
}
