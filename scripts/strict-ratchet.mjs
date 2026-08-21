/**
 * A one-way ratchet for the compiler flags that are not on yet. Currently pointed at `tests/`
 * and at `--noUncheckedIndexedAccess`, which `tsconfig.json` already enforces for `src/` and
 * `tsconfig.tests.json` still opts out of.
 *
 * The flag makes `xs[i]` a `T | undefined`, which is the mistake a tree full of index-based
 * loops is prone to. Too many findings to switch on outright, and while it is off a new
 * indexed loop in an already-cleared directory silently puts the count back up. This makes the
 * count monotonic: the baseline is committed per directory, and `--check` fails if any
 * directory gets worse.
 *
 *   node scripts/strict-ratchet.mjs            report the current counts against the baseline
 *   node scripts/strict-ratchet.mjs --check     exit 1 if any directory regressed
 *   node scripts/strict-ratchet.mjs --save      re-record the baseline (only ever downward)
 *   node scripts/strict-ratchet.mjs --reseed    establish a baseline from scratch
 *
 * `--save` refuses to record a worse number for any directory, and a directory absent from the
 * baseline counts as zero, so a new folder cannot arrive with a fresh allowance. `--reseed` is
 * the deliberate exception, needed when the ratchet is pointed at a new target and every
 * directory therefore looks like a regression from an implied zero. It records whatever is
 * there now, so use it only when what is being measured has changed, and say so in the commit.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/strict-baseline.json');
const FLAGS = ['--noUncheckedIndexedAccess'];

/**
 * Errors per test directory, for one flag.
 *
 * **The guard below is the load-bearing part of this function.** The counts come from
 * scraping the compiler's stderr with a regex, and the whole ratchet rests on that regex
 * matching. If it ever stops matching — a compiler that prefixes paths differently, emits
 * colour codes, or changes the literal `error TS` token — every directory reports zero and
 * `--check` passes trivially. That failure does not crash and does not warn: it reads
 * exactly like a clean sweep, and a `--save` in that state bakes an all-zero baseline in,
 * after which every genuine finding looks like a regression.
 *
 * So: a non-zero exit with no parsed lines is a parser failure, not a clean tree, and it
 * throws. `tsc` exiting non-zero means it had something to say; if we understood none of it,
 * we do not get to report a number.
 *
 * This was checked rather than assumed when `npx tsc` became TypeScript 7 (the native Go
 * compiler): TS 7.0.2 and TS 6.0.3 produce byte-identical diagnostic formatting AND an
 * identical finding set here — 397 findings under `--noUncheckedIndexedAccess`, same files,
 * same positions, same codes — so the baseline stayed comparable across the switch and did
 * not need re-saving. The guard exists for the next compiler change, which will not
 * necessarily be as kind.
 */
function measure(flag) {
  let out = '';
  let failed = false;
  try {
    execSync(`npx tsc -p tsconfig.tests.json --noEmit ${flag}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    failed = true;
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const counts = {};
  let parsed = 0;
  for (const line of out.split('\n')) {
    const m = /^(tests\/.*)\([0-9]+,[0-9]+\): error TS/.exec(line);
    if (m === null) continue;
    parsed++;
    const dir = m[1].slice(0, m[1].lastIndexOf('/'));
    counts[dir] = (counts[dir] ?? 0) + 1;
  }
  if (failed && parsed === 0) {
    throw new Error(
      `strict-ratchet: \`tsc ${flag}\` failed but produced no diagnostic this script could ` +
        `parse, so its findings cannot be counted. Reporting zero here would read as a clean ` +
        `sweep, which is why this throws instead. First 400 characters of the output:\n` +
        out.slice(0, 400),
    );
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
