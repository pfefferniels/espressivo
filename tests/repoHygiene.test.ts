/**
 * Repository hygiene: properties of the source files rather than of what they compute.
 *
 * There is one rule here so far, and it earned its place the hard way (AD-70.1).
 * `src/comparison/diff.ts` shipped with two raw NUL bytes in it — a separator written as the
 * character instead of as the `\u0000` escape — and that one byte made the whole file binary
 * to the tools this project is reviewed with:
 *
 * - `git diff` and `git show` reported `Bin 21151 bytes` and no lines, so 537 lines went
 *   through two cuts and a wave gate without ever appearing in a reviewable diff;
 * - `grep` and `rg` skipped it in silence — exit 1, no output, not even a "binary file
 *   matches" line — so a sweep over `src/comparison/**` came back clean having never read it;
 * - `file` called it `data`.
 *
 * The failure mode is that nothing complains. Every other guard in this suite catches a wrong
 * answer, and a wrong answer announces itself; this one catches a file that quietly stops
 * being reviewable.
 *
 * The perimeter is every tracked directory the project's own text lives in, documents
 * included: they are reviewed the same way the code is, and a NUL makes them just as
 * unreadable (MINOR-R4). Fixture directories stay out, because the MIDI references under
 * `tests/integration/fixtures/**` are legitimately binary — they are byte-for-byte comparison
 * targets, and a NUL is what a MIDI file is made of.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `directory`, depth first, skipping the binary-by-design corners. */
function walk(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    // `fixtures*` holds byte-comparison targets — MIDI, and whatever a future parity check
    // needs. Matched by prefix: `fixtures-v3` and `fixtures-layers-to-staffs` are the same
    // kind of directory and an exact match misses both (MINOR-R4).
    if (entry.startsWith('fixtures') || entry === 'node_modules') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

describe('no source file is binary to git and grep (AD-70.1)', () => {
  const files = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'tests')),
    ...walk(join(ROOT, 'docs')),
    join(ROOT, 'README.md'),
  ];

  it('finds no raw NUL byte under src/ or tests/', () => {
    const offenders: string[] = [];
    for (const path of files) {
      const bytes = readFileSync(path);
      const at = bytes.indexOf(0);
      if (at < 0) continue;
      // Report the line, because "this file has a NUL somewhere" is not actionable and the
      // failure will be read by someone who has just been told their file is invisible.
      const line = bytes.subarray(0, at).toString('utf-8').split('\n').length;
      offenders.push(
        `${relative(ROOT, path)}:${String(line)} — write it as the \\u0000 ESCAPE, never as the ` +
          'character; see clustering.ts and diff.ts for the same separator done right',
      );
    }
    expect(offenders).toEqual([]);
  });

  it('is non-vacuous: it really did read the files, including the one that had it', () => {
    // A walk that silently found nothing would pass the test above for the wrong reason.
    expect(files.length).toBeGreaterThan(150);
    const walked = files.map((path) => relative(ROOT, path));
    expect(walked).toContain('src/comparison/diff.ts');
    // The widened perimeter, named file by file so a future narrowing fails here.
    expect(walked).toContain('docs/history/comparison/LOG.md');
    expect(walked).toContain('docs/history/comparison/DESIGN.md');
    expect(walked).toContain('docs/history/comparison/W4-VERIFICATION.md');
    expect(walked).toContain('README.md');
    expect(walked).toContain('docs/history/ornamentation/tools/probe.mjs');
    // …and the byte-comparison fixtures stay out, by prefix rather than by exact name.
    expect(walked.some((path) => path.includes('fixtures-v3'))).toBe(false);
    expect(walked.some((path) => path.includes('fixtures-layers-to-staffs'))).toBe(false);
    expect(walked.some((path) => path.includes('tests/integration/fixtures/'))).toBe(false);
    // …and the check itself detects a NUL when there is one to detect.
    expect(Buffer.from('a\u0000b', 'utf-8').indexOf(0)).toBe(1);
  });
});
