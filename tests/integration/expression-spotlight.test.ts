/**
 * The one spotlight claim only a render can settle: **the background gesture shrinks and the
 * foreground one does not move.**
 *
 * This is A14's method applied to `spotlightMpm` — the property suite validates no metric
 * choice (DESIGN §1.1), so what validates one is whether the effect moves the way the operation
 * is named for. `tests/api/spotlight.test.ts` covers everything about the facade that does not
 * need a performance; what it cannot show is that the written attributes add up to an audible
 * result, because an attenuated `@volume` pair is only evidence about a document.
 *
 * The document is hand-built and carries exactly two maps, and that is the whole design of the
 * test: with a tempo pair and a dynamics pair and nothing else, each is unambiguously the
 * other's background, the two readings are independent (dynamics move no onset, tempo moves no
 * velocity), and nothing in the render touches a PRNG. `all_maps.mpm` would give a richer
 * document and a muddier claim — its imprecision maps put a drawn value between the transform
 * and the reading, which the charter forbids resting an assertion on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  canonicalMpm,
  performMsmToData,
  spotlightMpm,
  type PerformedNote,
  type XmlText,
} from '../../src/api/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** Fourteen notes over ten bars — the same score the A14 block renders its documents against. */
const SCORE = readFileSync(join(HERE, 'fixtures', 'reference', 'tempo.msm'), 'utf-8') as XmlText;

/**
 * A tempo gesture and a dynamics gesture, each an id away from being the foreground.
 *
 * Both pairs are numeric, so both are writable under the `gesture` scope spotlight runs in;
 * named levels would make them `unwritable-level-site` and the test vacuous. Both are wide —
 * 60→180 bpm and 30→120 velocity — so that a shrunk version is unmistakably distinguishable
 * from the original rather than a rounding away from it.
 */
const TWO_GESTURES = (`<mpm xmlns="${MPM_NS}"><performance name="P" pulsesPerQuarter="720">` +
  '<global><header/><dated>' +
  '<tempoMap>' +
  '<tempo xml:id="tempoGesture" date="0.0" bpm="60" transition.to="180" meanTempoAt="0.5" beatLength="0.25"/>' +
  '<tempo date="7200.0" bpm="180" beatLength="0.25"/>' +
  '</tempoMap>' +
  '<dynamicsMap>' +
  '<dynamics xml:id="dynamicsGesture" date="0.0" volume="30" transition.to="120" curvature="0.0" protraction="0.0"/>' +
  '<dynamics date="7200.0" volume="120"/>' +
  '</dynamicsMap>' +
  '</dated></global></performance></mpm>') as XmlText;

const notesOf = (mpm: XmlText): readonly PerformedNote[] =>
  performMsmToData({ msm: SCORE, mpm }).parts.flatMap((part) => part.notes);

const render = (ids: readonly string[], attenuation: number): readonly PerformedNote[] =>
  notesOf(spotlightMpm(TWO_GESTURES, { ids, attenuation }).mpm);

/** The untouched performance, which every reading below is measured against. */
const BASELINE = notesOf(canonicalMpm(TWO_GESTURES));

/**
 * The size of the **dynamics** gesture as performed: how far apart the loudest and quietest
 * notes are. Zero would mean a flat performance.
 */
const dynamicContrast = (notes: readonly PerformedNote[]): number => {
  const velocities = notes.map((note) => note.velocity);
  return Math.max(...velocities) - Math.min(...velocities);
};

/**
 * The size of the **tempo** gesture as performed: the ratio of the slowest rendered rate to the
 * fastest, minus 1 so that a flat performance reads 0.
 *
 * A ratio rather than a difference because tempo is a log-space quantity, and dividing by the
 * symbolic duration first is what stops a long note from reading as a slow one — the same
 * reading `expression-transform.test.ts` uses for the `tempo` dimension's own direction test.
 */
const tempoContrast = (notes: readonly PerformedNote[]): number => {
  const rates = notes
    .filter((note) => note.duration > 0)
    .map((note) => (note.milliseconds.end - note.milliseconds.date) / note.duration);
  return Math.max(...rates) / Math.min(...rates) - 1;
};

/** Assert a reading falls strictly as the attenuation does, from a non-degenerate start. */
function assertShrinks(reading: (attenuation: number) => number): void {
  const attenuations = [1, 0.75, 0.5, 0.25];
  const values = attenuations.map(reading);
  expect(
    values[0],
    'the unattenuated reading is non-zero, so the shrinking is not from nothing',
  ).toBeGreaterThan(0);
  for (let i = 1; i < values.length; ++i)
    expect(
      values[i],
      `attenuation ${attenuations[i]} (${values[i]}) is below ${attenuations[i - 1]} (${values[i - 1]})`,
    ).toBeLessThan(values[i - 1]);
}

describe('spotlight: the background gesture shrinks (A14, rendered)', () => {
  it('sanity: the untouched document performs both gestures', () => {
    // Without this every claim below could be satisfied by a document that performs nothing.
    expect(BASELINE.length).toBeGreaterThan(1);
    expect(dynamicContrast(BASELINE)).toBeGreaterThan(0);
    expect(tempoContrast(BASELINE)).toBeGreaterThan(0);
  });

  it('spotlighting the tempo shrinks the dynamic contrast, monotonically in the attenuation', () => {
    assertShrinks((attenuation) => dynamicContrast(render(['tempoGesture'], attenuation)));
  });

  it('…and leaves the tempo gesture exactly as the untouched performance played it', () => {
    // The foreground half of "bring it out": the spotlit dimension is held at s = 1, which A2
    // short-circuits at the dimension level, so the tempo map is not walked at all and every
    // onset lands on the millisecond the baseline put it on.
    for (const attenuation of [0.75, 0.5, 0.25, 0.1])
      expect(
        render(['tempoGesture'], attenuation).map((note) => note.milliseconds.date),
        `attenuation ${attenuation}`,
      ).toEqual(BASELINE.map((note) => note.milliseconds.date));
  });

  it('spotlighting the dynamics shrinks the tempo gesture instead', () => {
    // The same document with the roles swapped, which is what makes the pair a test of the
    // selection rather than of one dimension: nothing about this document changed except which
    // of its two instructions was named.
    assertShrinks((attenuation) => tempoContrast(render(['dynamicsGesture'], attenuation)));
  });

  it('…and leaves every velocity exactly where the untouched performance put it', () => {
    for (const attenuation of [0.75, 0.5, 0.25, 0.1])
      expect(
        render(['dynamicsGesture'], attenuation).map((note) => note.velocity),
        `attenuation ${attenuation}`,
      ).toEqual(BASELINE.map((note) => note.velocity));
  });

  it('an empty selection performs the untouched document, note for note', () => {
    // D-I's identity at the level a listener would notice it: not merely "the same bytes" but
    // "the same performance", which is what a caller who selected nothing asked for.
    expect(render([], 0.1)).toEqual(BASELINE);
  });
});
