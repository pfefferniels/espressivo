/**
 * The two render passes the rest of the suite does not reach.
 *
 * `ImprecisionMap.renderImprecisionToMap` and `AsynchronyMap.renderAsynchronyToMap` both
 * loop over their map's instructions and, at the end of each pass, discard the map entries
 * that pass has finished with. With one instruction the loop body runs once and the
 * discard is dead code — and **every** imprecision and asynchrony fixture in this
 * repository holds exactly one instruction, so multi-instruction rendering was not
 * rendered by anything at all.
 *
 * What the two fixtures buy is not the same in both cases, and it is worth being exact:
 *
 * - **imprecision** — the drain is load-bearing. Making it leave one entry behind on each
 *   pass left all 5434 tests green and every byte of every reference fixture unchanged;
 *   the fixture here goes red on it. This is a real guard on real behaviour.
 * - **asynchrony** — the removal is a pure optimisation and cannot change the output; see
 *   `AsynchronyMap.renderAsynchronyToMap` for the argument, and note that disabling it
 *   leaves 300 randomly generated multi-asynchrony renders byte-identical. So no fixture
 *   can guard *it*. What this fixture guards is the surrounding pass — several
 *   instructions, notes sounding across their boundaries, both clamps in play — which
 *   nothing else in the suite renders.
 *
 * Both expected documents were produced by the build from **before** those two loops were
 * rewritten — a splice-per-entry drain and an indexOf-plus-splice per removal, each
 * quadratic in the length of the part — so what they record is the old behaviour, not the
 * new code's own output.
 *
 * **`@modified` carries instruction ids here, and briefly did not.** On 2026-08-21 the 24
 * `@modified` values in `asynchrony_augmented.msm` were rewritten to `""` to match the Java
 * reference, on the reasoning that all 105 `modified` attributes under `all-maps-reference/`
 * are empty. That reasoning was wrong twice over. `@modified` is a fork addition, not upstream
 * meico, so the reference is not authoritative about it; and the reference is empty because
 * `Helper.getAttributeValue("xml:id", …)` never matched — `Helper.getAttribute` takes a LOCAL
 * name and the attribute's is `id`. The feature recorded nothing, in both languages.
 *
 * Fixed in the fork at `meico@68ccd3b8` and here at the same time, and this file is restored to
 * exactly what it held before that edit. Which is the point of the restore rather than a
 * regeneration: the header above promises these documents record the PRE-rewrite build, and
 * they do again.
 *
 * `Math.random` is pinned for each run: not every distribution here carries an effective
 * seed, and `ImprecisionMap`'s class comment states that unseeded output is
 * nondeterministic by design. The stub makes the fixtures reproducible without changing
 * which code paths run.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performMsm } from '../../src/api/pipeline.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi-instruction');

const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

/** mulberry32, so a failure here is reproducible rather than a coin toss. */
function pinRandom(): void {
  let state = 0x9e3779b9;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

for (const subject of ['imprecision', 'asynchrony'] as const) {
  describe(`a ${subject} map with several instructions`, () => {
    const msm = read(`${subject}.msm`);
    const mpm = read(`${subject}.mpm`);
    const expected = read(`${subject}_augmented.msm`);

    it('renders byte for byte as the pre-rewrite build did', () => {
      pinRandom();
      expect(performMsm({ msm, mpm })).toBe(expected);
    });

    it('holds instructions whose spans notes actually sound across', () => {
      // Guard on the fixture itself: if it ever stops holding several instructions, or
      // stops holding notes that sound across their boundaries, the test above quietly
      // stops testing the pass it exists for.
      const boundaries = [...mpm.matchAll(/ date="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(new Set(boundaries).size).toBeGreaterThanOrEqual(4);

      const notes = [...msm.matchAll(/date="([\d.]+)"[^/]*duration="([\d.]+)"/g)].map((m) => ({
        start: Number(m[1]),
        end: Number(m[1]) + Number(m[2]),
      }));
      const straddling = notes.filter((note) =>
        boundaries.some((boundary) => note.start < boundary && note.end > boundary),
      ).length;
      expect(straddling).toBeGreaterThan(5);
    });

    it('gives every note a performed onset and a performed end', () => {
      pinRandom();
      const performed = performMsm({ msm, mpm });
      // `milliseconds.date="` does not match `milliseconds.date.end="`, so the two counts
      // are independent: 24 notes plus the one timeSignature carry an onset.
      expect((performed.match(/milliseconds\.date="/g) ?? []).length).toBe(25);
      expect((performed.match(/milliseconds\.date\.end="/g) ?? []).length).toBe(24);
    });
  });
}
