/**
 * MPM v3 ornamentation, end to end: hand-authored MSM + MPM documents from
 * `fixtures-v3/`, driven through the real pipeline — `new Msm(...)`, `new Mpm(...)`,
 * `Performance.perform`, `Msm.exportExpressiveMidi` — with nothing stubbed and no helper
 * standing in for a library class.
 *
 * ## Why these fixtures sit apart from `fixtures/`
 *
 * Everything under `tests/integration/fixtures/` is **Java-generated ground truth** and is
 * immutable (CHARTER §15-17): those suites compare this port's output against meico's,
 * attribute by attribute. No Java build produces v3 ornamentation — the feature does not
 * exist there — so a v3 fixture cannot have that kind of reference output, and pretending
 * otherwise by regenerating anything would weaken the parity gate. `fixtures-v3/` is
 * therefore a separate directory of **spec-derived** inputs, and the expected values live
 * here, in the arithmetic below, rather than in a committed `_augmented.msm`.
 *
 * **Every number asserted here is computed by hand in the comment above it** (CHARTER §8),
 * from DESIGN.md §5's worked vectors and these three rules:
 *
 * - frame: `%` resolves against the principal's symbolic tick duration (D4); "at start"
 *   anchors the frame at the principal's date, "at end" at its end minus the frame length;
 * - spacing (frozen against the v2 engine, `TemporalSpread.apply`): slot `i` of `n` sits at
 *   `pow(i / (n − 1), intensity) * frameLength + frameStart`, and the **last** slot is
 *   placed outside that loop, pinned at `frameStart + frameLength`;
 * - milliseconds: every fixture states 120 bpm on a quarter beat at ppq 720, so one quarter
 *   is 500 ms and `ms = ticks * 500 / 720`. That ratio is the only tempo arithmetic used.
 *
 * None of the expected values was read off the implementation.
 *
 * ## What each fixture is for
 *
 * | fixture | pins |
 * |---|---|
 * | `turn-atstart` | DESIGN.md §5.1 — the figure-1 turn, `%` frame, monophonic note-offs |
 * | `turn-atend` | DESIGN.md §5.2 — the same figure aligned at the end, and its head leftover |
 * | `trill-repetitions` | DESIGN.md §5.3 — repeat-group expansion, mixed `ticks`/`%` frame, the `pass` provenance |
 * | `spread-ms` | DESIGN.md §5.5 — a millisecond frame feeds the *unchanged* v2 marker engine |
 * | `atend-ms` | the D5 AMENDMENT — the end-anchored marker, and the head loss it costs |
 * | `multi-ornament` | D11 — two ornaments on one principal, and the overflow scale factor |
 * | `diatonic-key` | D8 — `interval.diatonic` against the MSM key signature |
 * | `legacy-timeunit` | D3 — the lenient read: legacy `time.unit`, suffix-less values, the `frame.start` alias |
 * | `v2-passthrough` | D6 — a v2 document still takes the v2 path through the v3 build |
 *
 * ## Timeouts
 *
 * Every case here carries an explicit timeout. `vitest.config.ts` sets a 30 s global one,
 * but TD1's rule (ARCHITECTURE.md §1216-1221) is that a family which *can* fail to
 * terminate states its own, so a regression fails the suite instead of hanging it — and an
 * integration case drives the expansion engine's repeat loops through the whole pipeline.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { ORNAMENTATION_MAP, ORNAMENTATION_STYLE } from '../../src/mpm/names.js';
import type { OrnamentDef } from '../../src/mpm/elements/styles/defs/OrnamentDef.js';
import { firstChildElement } from '../../src/xml/tree.js';
import type { Element } from '../../src/xml/XomTypes.js';
import type { Midi } from '../../src/midi/Midi.js';
import { messageStatus } from '../../src/midi/MidiTypes.js';
import type { Performance } from '../../src/mpm/elements/Performance.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-v3');
const TIMEOUT = 10000;

/** 120 bpm on a quarter beat at ppq 720: one quarter is 500 ms, so one tick is 500/720 ms. */
const MS_PER_TICK = 500 / 720;

/**
 * How closely a millisecond value must match: nine decimals, i.e. far below one microsecond.
 *
 * **Ticks are compared exactly and milliseconds are not**, and the asymmetry is deliberate.
 * A tick date is the spacing formula's own output and nothing divides it further, so exact
 * equality is meaningful there. A millisecond date has been through the tempo pass, where
 * `1462 * (500 / 720)` and `1462 * 500 / 720` differ in the last bit — this suite caught
 * exactly that on `v2-passthrough` when it first compared them with `toEqual`. Pinning the
 * last ulp of an association order would be a test about floating point, not about
 * ornamentation; `all-maps-equivalence.test.ts` makes the same call and documents it at
 * NUMERIC_TOLERANCE.
 */
const MS_PRECISION = 9;

// ---------------------------------------------------------------------------------------
// loading and reading
// ---------------------------------------------------------------------------------------

function load(name: string): { msm: Msm; mpm: Mpm; performance: Performance } {
  const msm = new Msm(readFileSync(join(FIXTURE_DIR, `${name}.msm`), 'utf-8'));
  const mpm = new Mpm(readFileSync(join(FIXTURE_DIR, `${name}.mpm`), 'utf-8'));
  const performances = mpm.getAllPerformances();
  expect(performances).toHaveLength(1);
  return { msm, mpm, performance: performances[0] };
}

/** One note of the augmented score, as the plain record the assertions read from. */
interface NoteRecord {
  readonly id: string | null;
  readonly date: number | null;
  readonly pitch: number | null;
  readonly duration: number | null;
  readonly datePerf: number | null;
  readonly durationPerf: number | null;
  readonly dateEndPerf: number | null;
  readonly ms: number | null;
  readonly msEnd: number | null;
  readonly velocity: number | null;
  readonly generated: string | null;
  readonly carved: string | null;
  readonly ref: string | null;
  readonly source: string | null;
  readonly slot: string | null;
  readonly pass: string | null;
  readonly anchor: string | null;
  readonly msOffset: number | null;
  readonly msFromEnd: number | null;
  readonly msDuration: number | null;
  readonly noteoffShift: string | null;
  readonly dynamics: number | null;
}

function readNote(note: Element): NoteRecord {
  const text = (name: string) => note.getAttributeValue(name);
  const num = (name: string) => {
    const value = note.getAttributeValue(name);
    return value === null ? null : parseFloat(value);
  };
  return {
    id: text('xml:id'),
    date: num('date'),
    pitch: num('midi.pitch'),
    duration: num('duration'),
    datePerf: num('date.perf'),
    durationPerf: num('duration.perf'),
    dateEndPerf: num('date.end.perf'),
    ms: num('milliseconds.date'),
    msEnd: num('milliseconds.date.end'),
    velocity: num('velocity'),
    generated: text('ornament.generated'),
    carved: text('ornament.carved'),
    ref: text('ornament.ref'),
    source: text('ornament.source'),
    slot: text('ornament.slot'),
    pass: text('ornament.pass'),
    anchor: text('ornament.anchor'),
    msOffset: num('ornament.milliseconds.date.offset'),
    msFromEnd: num('ornament.milliseconds.fromend.offset'),
    msDuration: num('ornament.milliseconds.duration'),
    noteoffShift: text('ornament.noteoff.shift'),
    dynamics: num('ornament.dynamics'),
  };
}

/** Every `<note>` of every part's `<score>`, in document order. */
function scoreNotes(msm: Msm): NoteRecord[] {
  const notes: NoteRecord[] = [];
  const parts = msm.getParts();
  for (let p = 0; p < parts.size(); ++p) {
    const dated = firstChildElement('dated', parts.get(p));
    const score = dated === null ? null : firstChildElement('score', dated);
    if (score === null) continue;
    for (const note of score.getChildElements('note').toArray()) notes.push(readNote(note));
  }
  return notes;
}

/** The `<ornament>` elements of the performance's global ornamentationMap, in map order. */
function ornaments(performance: Performance): Element[] {
  const map = performance.getGlobal()?.getDated()?.getMap(ORNAMENTATION_MAP) ?? null;
  expect(map).not.toBeNull();
  return map!.getAllElementsOfType('ornament').map((entry) => entry.getValue());
}

/**
 * Perform a fixture and hand back what the assertions need.
 *
 * `console.error` is captured rather than silenced: the renderer reports every
 * unrenderable combination through it (RULE E1), so a fixture that starts logging is a
 * fixture that changed meaning — `atend-ms` asserts one such line, and every other describe
 * asserts there is none.
 */
function render(name: string): {
  notes: NoteRecord[];
  generated: NoteRecord[];
  ornaments: Element[];
  warnings: string[];
} {
  const { msm, performance } = load(name);
  const warnings: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
  let augmented: Msm;
  try {
    augmented = performance.perform(msm);
  } finally {
    spy.mockRestore();
  }
  const notes = scoreNotes(augmented);
  return {
    notes,
    generated: notes.filter((note) => note.generated === 'true'),
    ornaments: ornaments(performance),
    warnings,
  };
}

/** Assert a list of millisecond values against hand-computed ones; see {@link MS_PRECISION}. */
function expectMilliseconds(actual: readonly (number | null)[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const [i, value] of expected.entries()) expect(actual[i]).toBeCloseTo(value, MS_PRECISION);
}

/** The generated-id shape: `addUUID`'s `meico_` prefix plus a v4 UUID. */
const GENERATED_ID = /^meico_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------------------
// MIDI
// ---------------------------------------------------------------------------------------

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

/** Every note-on / note-off of every track, as `(tick, command)` pairs. */
function noteEvents(midi: Midi): { tick: number; command: number }[] {
  const events: { tick: number; command: number }[] = [];
  for (const track of midi.getSequence().getTracks())
    for (let i = 0; i < track.size(); ++i) {
      const event = track.get(i);
      const command = messageStatus(event.getMessage()) & 0xf0;
      if (command === NOTE_ON || command === NOTE_OFF)
        events.push({ tick: event.getTick(), command });
    }
  return events;
}

/**
 * The nine fixtures and the number of sounding notes each must end up with. Every count is
 * derived in the fixture's own describe block; they are restated here so the MIDI smoke can
 * check that the export sees exactly the notes the augmented MSM has.
 */
const FIXTURES: readonly { name: string; notes: number }[] = [
  { name: 'turn-atstart', notes: 6 }, // 4 generated + the two untouched neighbours
  { name: 'turn-atend', notes: 7 }, // head leftover + 4 generated + two neighbours
  { name: 'trill-repetitions', notes: 9 }, // 8 generated + one neighbour
  { name: 'spread-ms', notes: 4 }, // 3 generated + one neighbour
  { name: 'atend-ms', notes: 4 }, // 3 generated + one neighbour
  { name: 'multi-ornament', notes: 5 }, // 2 + 2 generated + one neighbour
  { name: 'diatonic-key', notes: 5 }, // 4 generated + one neighbour
  { name: 'legacy-timeunit', notes: 8 }, // 3 + 2 + 2 generated + one neighbour
  { name: 'v2-passthrough', notes: 6 }, // unchanged: the v2 path generates nothing
];

// ---------------------------------------------------------------------------------------
// DESIGN.md §5.1 — the figure-1 turn, aligned at the start
// ---------------------------------------------------------------------------------------

describe('turn-atstart: the figure-1 turn (DESIGN.md §5.1)', () => {
  /**
   * Principal P: midi.pitch 64, date 0, duration 1440 ticks. Pool n2 = +1 chromatic (65),
   * n3 = −1 chromatic (63). note.order = "#n2 #P #n3 #P" ⇒ four slots, 65 / 64 / 63 / 64
   * (no two consecutive slots share a pitch, so the dedup rule collapses nothing).
   *
   * Frame: frameLength "50%" of the principal's 1440 ticks = 720; frame.offset 0.0ticks;
   * "at start" anchors it at the principal's date ⇒ [0, 720]. One ornament of length 720 on
   * a 1440-tick note, so D11's overflow factor is min(1, 1440/720) = 1.
   *
   * Spacing, n = 4, intensity 1 (the default):
   *   i=0: pow(0/3, 1) * 720 + 0 =   0
   *   i=1: pow(1/3, 1) * 720 + 0 = 240
   *   i=2: pow(2/3, 1) * 720 + 0 = 480
   *   last, pinned:         0 + 720 = 720
   *
   * noteoff.shift="monophonic" ⇒ each note ends where the next begins and the last runs to
   * the principal's end: durations 240 − 0, 480 − 240, 720 − 480, 1440 − 720
   *                            = 240, 240, 240, 720
   * i.e. note-offs at 240 / 480 / 720 / 1440 — figure 1's tie into the note it decorates.
   *
   * Milliseconds at 500/720 ms per tick: onsets 0, 500/3 = 166.666…, 1000/3 = 333.333…, 500;
   * note-offs 166.666…, 333.333…, 500, 1000.
   */
  const dates = [0, 240, 480, 720];
  const durations = [240, 240, 240, 720];
  const pitches = [65, 64, 63, 64];

  it(
    'replaces the principal with four notes and leaves the neighbours alone',
    () => {
      const { notes, generated } = render('turn-atstart');
      expect(notes).toHaveLength(6);
      expect(generated).toHaveLength(4);
      // q and r are the untouched notes of the fixture, at their authored positions
      const untouched = notes.filter((note) => note.generated === null);
      expect(untouched.map((note) => [note.id, note.date, note.pitch, note.duration])).toEqual([
        ['q', 1440, 67, 720],
        ['r', 2160, 65, 720],
      ]);
    },
    TIMEOUT,
  );

  it(
    'spaces the four notes over the frame [0, 720] with monophonic note-offs',
    () => {
      const { generated } = render('turn-atstart');
      expect(generated.map((note) => note.date)).toEqual(dates);
      expect(generated.map((note) => note.duration)).toEqual(durations);
      expect(generated.map((note) => note.date! + note.duration!)).toEqual([240, 480, 720, 1440]);
    },
    TIMEOUT,
  );

  it(
    'resolves the chromatic pool against the principal: 65, 64, 63, 64',
    () => {
      expect(render('turn-atstart').generated.map((note) => note.pitch)).toEqual(pitches);
    },
    TIMEOUT,
  );

  it(
    'carries the layout into the performance attributes and into milliseconds',
    () => {
      const { generated } = render('turn-atstart');
      // no rubato in this fixture, so date.perf is the notated date and the ends follow
      expect(generated.map((note) => note.datePerf)).toEqual(dates);
      expect(generated.map((note) => note.durationPerf)).toEqual(durations);
      expect(generated.map((note) => note.dateEndPerf)).toEqual([240, 480, 720, 1440]);
      // spelled out: 0, 166.666…, 333.333…, 500 and 166.666…, 333.333…, 500, 1000
      expectMilliseconds(
        generated.map((note) => note.ms),
        [0, 500 / 3, 1000 / 3, 500],
      );
      expectMilliseconds(
        generated.map((note) => note.msEnd),
        [500 / 3, 1000 / 3, 500, 1000],
      );
      // the same values, derived from the tick layout rather than restated
      for (const [i, note] of generated.entries()) {
        expect(note.ms).toBeCloseTo(dates[i] * MS_PER_TICK, MS_PRECISION);
        expect(note.msEnd).toBeCloseTo((dates[i] + durations[i]) * MS_PER_TICK, MS_PRECISION);
      }
    },
    TIMEOUT,
  );

  it(
    'gives every generated note the dynamics map’s velocity',
    () => {
      // the def carries no dynamicsGradient, so nothing is added to the mapped volume of 100
      const { generated } = render('turn-atstart');
      expect(generated.map((note) => note.velocity)).toEqual([100, 100, 100, 100]);
      expect(generated.map((note) => note.dynamics)).toEqual([null, null, null, null]);
    },
    TIMEOUT,
  );

  it(
    'hands the principal’s xml:id to the first note sourced from it, and generates the rest',
    () => {
      const { generated } = render('turn-atstart');
      // slot 1 is "#P" — the first reference the expansion resolved from the principal
      expect(generated[1].id).toBe('P');
      for (const note of [generated[0], generated[2], generated[3]])
        expect(note.id).toMatch(GENERATED_ID);
    },
    TIMEOUT,
  );

  it(
    'stamps the full provenance family (D10 + the 2026-08-09 rulings)',
    () => {
      const { generated } = render('turn-atstart');
      expect(generated.map((note) => note.generated)).toEqual(['true', 'true', 'true', 'true']);
      expect(generated.map((note) => note.ref)).toEqual(['orn1', 'orn1', 'orn1', 'orn1']);
      expect(generated.map((note) => note.source)).toEqual(['n2', 'P', 'n3', 'P']);
      expect(generated.map((note) => note.slot)).toEqual(['0', '1', '2', '3']);
      expect(generated.map((note) => note.anchor)).toEqual(['P', 'P', 'P', 'P']);
      // no repeat group in this note.order, so no note carries a pass
      expect(generated.map((note) => note.pass)).toEqual([null, null, null, null]);
    },
    TIMEOUT,
  );

  it(
    'writes note.order.perf onto the ornament element',
    () => {
      const { ornaments: elements, warnings } = render('turn-atstart');
      expect(elements).toHaveLength(1);
      expect(elements[0].getAttributeValue('note.order.perf')).toBe('n2 P n3 P');
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// DESIGN.md §5.2 — the same figure, aligned at the end
// ---------------------------------------------------------------------------------------

describe('turn-atend: the figure-2 turn (DESIGN.md §5.2)', () => {
  /**
   * The score and the ornament of `turn-atstart`, with alignment="at end".
   *
   * Frame: length still 50% of 1440 = 720. "at end" packs the end group against the
   * principal's end: start = principalDuration − frameLength + frame.offset
   *                        = 1440 − 720 + 0 = 720 ⇒ frame [720, 1440].
   *
   * Spacing, n = 4, intensity 1:
   *   i=0: pow(0/3,1)*720 + 720 =  720
   *   i=1: pow(1/3,1)*720 + 720 =  960
   *   i=2: pow(2/3,1)*720 + 720 = 1200
   *   last, pinned:      720 + 720 = 1440
   *
   * monophonic durations: 960−720, 1200−960, 1440−1200, and the last runs to the principal's
   * end 1440 ⇒ 240, 240, 240, and 1440 − 1440 = **0**. The zero is what DESIGN.md §5.2's own
   * arithmetic yields — the pinned last slot coincides with the principal's end — and it is
   * pinned here rather than papered over.
   *
   * Head leftover: the earliest generated note begins at 720, later than the principal's
   * date 0, so the principal survives as [0, 720) with its own id and every other attribute.
   *
   * Milliseconds: 500, 2000/3 = 666.666…, 2500/3 = 833.333…, 1000.
   */
  const dates = [720, 960, 1200, 1440];
  const durations = [240, 240, 240, 0];

  it(
    'leaves the principal sounding as a head leftover [0, 720)',
    () => {
      const { notes } = render('turn-atend');
      expect(notes).toHaveLength(7);
      const head = notes[0];
      expect(head.id).toBe('P');
      expect(head.generated).toBeNull();
      expect(head.date).toBe(0);
      expect(head.duration).toBe(720);
      // the shortening reaches the performance domain and the milliseconds with it
      expect(head.durationPerf).toBe(720);
      expect(head.dateEndPerf).toBe(720);
      expectMilliseconds([head.ms], [0]);
      expectMilliseconds([head.msEnd], [500]); // 720 ticks at 500/720 ms per tick
    },
    TIMEOUT,
  );

  it(
    'marks the leftover as carved by the ornament that shortened it',
    () => {
      // The leftover is altered without being generated, and the augmented document has to say
      // so — D15's `ornamented` covers "generated by **or altered by**" an ornament, and a
      // reader can only see what is written (conductor's ruling, LOG.md "the carved leftover is
      // ornamented"). It gets `ornament.carved` plus the ref, and none of the four attributes
      // that describe a *position in the figure*, which the leftover does not occupy.
      const { notes, generated } = render('turn-atend');
      const head = notes[0];
      expect(head.carved).toBe('true');
      expect(head.ref).toBe('orn2');
      expect([head.source, head.slot, head.pass, head.anchor]).toEqual([null, null, null, null]);
      // and nothing else in the document is carved — the generated notes are generated
      expect(notes.filter((note) => note.carved === 'true')).toHaveLength(1);
      expect(generated.every((note) => note.carved === null)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'places the four ornament notes over [720, 1440], the last one ending with the principal',
    () => {
      const { generated } = render('turn-atend');
      expect(generated.map((note) => note.date)).toEqual(dates);
      expect(generated.map((note) => note.duration)).toEqual(durations);
      expect(generated.map((note) => note.date! + note.duration!)).toEqual([960, 1200, 1440, 1440]);
      expect(generated.map((note) => note.pitch)).toEqual([65, 64, 63, 64]);
      expectMilliseconds(
        generated.map((note) => note.ms),
        [500, 2000 / 3, 2500 / 3, 1000],
      );
      for (const [i, note] of generated.entries())
        expect(note.ms).toBeCloseTo(dates[i] * MS_PER_TICK, MS_PRECISION);
    },
    TIMEOUT,
  );

  it(
    'appends a generated note to the end of the date group it lands in',
    () => {
      // Document order is byte-visible, and it is not simply "generated notes last": a
      // generated note joins its date group where any same-dated element goes, at the end.
      // The last note of this figure lands on 1440, where the fixture's `q` already sits, so
      // the order is head, three ornament notes, q, the last ornament note, r.
      const { notes } = render('turn-atend');
      expect(notes.map((note) => [note.date, note.generated])).toEqual([
        [0, null],
        [720, 'true'],
        [960, 'true'],
        [1200, 'true'],
        [1440, null],
        [1440, 'true'],
        [2160, null],
      ]);
    },
    TIMEOUT,
  );

  it(
    'gives the principal’s xml:id to the head leftover alone',
    () => {
      // INVERTED. This used to pin the opposite — that the leftover and the heir BOTH carry
      // xml:id="P", on the renderer's reading that "the leftover *is* the principal". The W6
      // verifier caught what that means for the output: an augmented MSM with two elements
      // sharing an xml:id, which is not a valid document. The conductor's **D10 id-uniqueness
      // ruling** (docs/history/ornamentation/LOG.md, 2026-08-09) settled it the other way — the id goes to
      // the head leftover when one survives, else to the heir, never to both. D10's original
      // wording was exclusive and was never amended, and `ornament.anchor` sits on every
      // generated note precisely so that no consumer needs the id there to find its way home.
      const { notes, generated } = render('turn-atend');

      const carriers = notes.filter((note) => note.id === 'P');
      expect(carriers).toHaveLength(1);
      // and it is the head leftover: the ungenerated note at date 0 running to the frame start
      expect(carriers[0].generated).toBeNull();
      expect(carriers[0].date).toBe(0);
      expect(carriers[0].duration).toBe(720);

      // the heir keeps the id it drew, and reaches its principal through the anchor instead
      expect(generated[1].id).toMatch(/^meico_[0-9a-f-]{36}$/);
      expect(generated.map((note) => note.anchor)).toEqual(Array(generated.length).fill('P'));
    },
    TIMEOUT,
  );

  it(
    'writes the same provenance as the at-start reading, under its own ornament id',
    () => {
      const { generated, ornaments: elements, warnings } = render('turn-atend');
      expect(generated.map((note) => note.ref)).toEqual(['orn2', 'orn2', 'orn2', 'orn2']);
      expect(generated.map((note) => note.source)).toEqual(['n2', 'P', 'n3', 'P']);
      expect(generated.map((note) => note.slot)).toEqual(['0', '1', '2', '3']);
      expect(elements[0].getAttributeValue('note.order.perf')).toBe('n2 P n3 P');
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// DESIGN.md §5.3 — the figure-3 trill
// ---------------------------------------------------------------------------------------

describe('trill-repetitions: the figure-3 trill (DESIGN.md §5.3)', () => {
  /**
   * Principal P: pitch 64, date 0, duration 1440. Pool n1 = +1 chromatic (65).
   * note.order = "|: #n1 #P :|", repetitions="3", frame.offset="360ticks",
   * frameLength="50%", noteoff.shift absent (i.e. false), intensity 1.
   *
   * Expansion: the group holds 2 slots and is played repetitions + 1 = 4 times ⇒ 8 slots,
   * alternating 65 / 64. The landing rule does not fire (the group opens on n1 = 65, not on
   * the principal's pitch) and dedup collapses nothing across a pass boundary (64 then 65).
   *
   * Frame: 50% of 1440 = 720 ticks, offset 360 ticks — the spec's own mixed-domain exemplum,
   * legal because a `%` length resolves into ticks (D4) ⇒ frame [360, 1080].
   *
   * Spacing, n = 8, intensity 1: pow(i/7, 1) * 720 + 360 for i = 0…6, last pinned at 1080:
   *   i=0: 360
   *   i=1: 720/7  + 360 =  462.857142857…
   *   i=2: 1440/7 + 360 =  565.714285714…
   *   i=3: 2160/7 + 360 =  668.571428571…
   *   i=4: 2880/7 + 360 =  771.428571428…
   *   i=5: 3600/7 + 360 =  874.285714285…
   *   i=6: 4320/7 + 360 =  977.142857142…
   *   i=7, pinned: 360 + 720 = 1080
   *
   * noteoff.shift false ⇒ every note ends at the principal's note-off 1440, so the durations
   * are 1440 − date. Milliseconds are 500/720 of those ticks: the frame runs 250…750 ms and
   * every note ends at 1000 ms.
   */
  const onset = (i: number) => (i < 7 ? (i / 7) * 720 + 360 : 1080);

  it(
    'expands the repeat group into eight notes inside the frame [360, 1080]',
    () => {
      const { notes, generated } = render('trill-repetitions');
      expect(notes).toHaveLength(9);
      expect(generated).toHaveLength(8);
      expect(generated[0].date).toBe(360);
      expect(generated[7].date).toBe(1080);
      for (const [i, note] of generated.entries())
        expect(note.date).toBeCloseTo(onset(i), MS_PRECISION);
    },
    TIMEOUT,
  );

  it(
    'alternates 65 and 64 and ends every note at the principal note-off',
    () => {
      const { generated } = render('trill-repetitions');
      expect(generated.map((note) => note.pitch)).toEqual([65, 64, 65, 64, 65, 64, 65, 64]);
      for (const note of generated) expect(note.date! + note.duration!).toBeCloseTo(1440, 9);
      // and the neighbour after the trill is untouched
      const { notes } = render('trill-repetitions');
      const last = notes[notes.length - 1];
      expect([last.id, last.date, last.duration]).toEqual(['q', 1440, 1440]);
    },
    TIMEOUT,
  );

  it(
    'renders the frame as 250…750 ms, every note ending at 1000 ms',
    () => {
      const { generated } = render('trill-repetitions');
      expectMilliseconds(
        generated.map((note) => note.ms),
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => onset(i) * MS_PER_TICK),
      );
      // the frame's own ends, stated as numbers: 360 ticks = 250 ms, 1080 ticks = 750 ms
      expectMilliseconds([generated[0].ms, generated[7].ms], [250, 750]);
      expectMilliseconds(
        generated.map((note) => note.msEnd),
        Array(generated.length).fill(1000),
      );
    },
    TIMEOUT,
  );

  it(
    'numbers the four passes of the repeat group in the provenance',
    () => {
      // the group holds 2 slots and is played 4 times, so slots 0…7 carry passes 0 0 1 1 2 2 3 3
      const { generated, ornaments: elements } = render('trill-repetitions');
      expect(generated.map((note) => note.source)).toEqual([
        'n1',
        'P',
        'n1',
        'P',
        'n1',
        'P',
        'n1',
        'P',
      ]);
      expect(generated.map((note) => note.slot)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
      expect(generated.map((note) => note.pass)).toEqual(['0', '0', '1', '1', '2', '2', '3', '3']);
      expect(generated.map((note) => note.anchor)).toEqual(Array(8).fill('P'));
      expect(generated.map((note) => note.ref)).toEqual(Array(8).fill('orn3'));
      expect(elements[0].getAttributeValue('note.order.perf')).toBe('n1 P n1 P n1 P n1 P');
    },
    TIMEOUT,
  );

  it(
    'leaves no head leftover — an "at start" frame never carves one',
    () => {
      const { notes, warnings } = render('trill-repetitions');
      expect(notes.filter((note) => note.generated === null).map((note) => note.id)).toEqual(['q']);
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// DESIGN.md §5.5 — a millisecond frame feeds the v2 marker engine
// ---------------------------------------------------------------------------------------

describe('spread-ms: a millisecond frame over a generated chord (DESIGN.md §5.5)', () => {
  /**
   * Principal P: pitch 64, date 2880, duration 1440 ⇒ 2000…3000 ms at 500/720 ms per tick.
   * Pool n2 = +3, n3 = +7 chromatic ⇒ the chord 64 / 67 / 71, the same three pitches the
   * committed Java fixture's `spreadMs` chord has. note.order = "#P #n2 #n3".
   *
   * Def: frame.offset "-30.0ms", frameLength "60.0ms", intensity 2, noteoff.shift="true",
   * dynamicsGradient −0.5 → +0.5, and the ornament scales it by 2.
   *
   * A millisecond frame cannot be placed in ticks before the tempo pass, so the generated
   * notes all sit on the principal's own date and duration and carry the v2 markers:
   *   i=0: pow(0/2, 2) * 60 − 30 = −30
   *   i=1: pow(1/2, 2) * 60 − 30 = 0.25 * 60 − 30 = −15
   *   last, pinned:        −30 + 60 = +30
   * These are exactly the values `all-maps-reference/ornamentation_augmented.msm` carries on
   * its n7/n8/n9 — the point of the vector: phase N feeds the unchanged v2 engine.
   *
   * The millisecond pass then shifts the onsets 2000 → 1970 / 1985 / 2030, and because
   * noteoff.shift is present (its presence is the flag) each end moves by the same amount:
   * 3000 → 2970 / 2985 / 3030.
   *
   * Dynamics, n = 3: constFac = scale * (to − from) / (n − 1) = 2 * 1 / 2 = 1 and
   * fromVelocity = from * scale = −1, so the markers are −1, 0, +1 over a mapped volume of
   * 100 ⇒ velocities 99, 100, 101.
   */
  it(
    'replaces the principal with the three-note chord on its own date and duration',
    () => {
      const { notes, generated } = render('spread-ms');
      expect(notes).toHaveLength(4);
      expect(generated).toHaveLength(3);
      expect(generated.map((note) => note.pitch)).toEqual([64, 67, 71]);
      expect(generated.map((note) => note.date)).toEqual([2880, 2880, 2880]);
      expect(generated.map((note) => note.duration)).toEqual([1440, 1440, 1440]);
      // the untouched neighbour keeps plain tempo arithmetic: 1440 ticks = 1000 ms
      const pre = notes[0];
      expect([pre.id, pre.ms, pre.msEnd]).toEqual(['pre', 1000, 2000]);
    },
    TIMEOUT,
  );

  it(
    'writes the v2 millisecond markers −30, −15, +30 and the note-off flag',
    () => {
      const { generated } = render('spread-ms');
      expect(generated.map((note) => note.msOffset)).toEqual([-30, -15, 30]);
      expect(generated.map((note) => note.noteoffShift)).toEqual(['true', 'true', 'true']);
      // an "at start" millisecond frame uses no end-anchored marker
      expect(generated.map((note) => note.msFromEnd)).toEqual([null, null, null]);
    },
    TIMEOUT,
  );

  it(
    'lands the chord at 1970 / 1985 / 2030 ms with its ends shifted alike',
    () => {
      const { generated } = render('spread-ms');
      expectMilliseconds(
        generated.map((note) => note.ms),
        [1970, 1985, 2030],
      );
      expectMilliseconds(
        generated.map((note) => note.msEnd),
        [2970, 2985, 3030],
      );
    },
    TIMEOUT,
  );

  it(
    'ramps the dynamics gradient across the chord: velocities 99, 100, 101',
    () => {
      const { generated, warnings } = render('spread-ms');
      expect(generated.map((note) => note.dynamics)).toEqual([-1, 0, 1]);
      expect(generated.map((note) => note.velocity)).toEqual([99, 100, 101]);
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// The D5 AMENDMENT — a millisecond frame aligned "at end"
// ---------------------------------------------------------------------------------------

describe('atend-ms: the end-anchored millisecond marker (D5 amendment)', () => {
  /**
   * The score and pool of `spread-ms`, with alignment="at end" and noteoff.shift absent.
   *
   * The frame is anchored at the principal's millisecond END, which does not exist before
   * the tempo pass, so phase N cannot express it as an onset offset. It writes
   * `ornament.milliseconds.fromend.offset` instead — a static quantity, the spacing plus
   * frame.offset minus frameLength — and the millisecond pass resolves it as
   * `milliseconds.date = milliseconds.date.end + value`.
   *
   * The end group's cursor runs from the end itself, so start = −frameLength + frame.offset
   * = −60 + (−30) = −90, and the spacing (n = 3, intensity 2, length 60) gives:
   *   i=0: pow(0/2, 2) * 60 − 90 = −90
   *   i=1: pow(1/2, 2) * 60 − 90 = 15 − 90 = −75
   *   last, pinned:        −90 + 60 = −30
   *
   * The principal sounds 2000…3000 ms, so the three notes land at 3000 − 90 = 2910,
   * 3000 − 75 = 2925 and 3000 − 30 = 2970. With no noteoff.shift the ends stay at 3000 and
   * the durations absorb the shift.
   */
  it(
    'writes the end-anchored markers −90, −75, −30 and no onset marker',
    () => {
      const { generated } = render('atend-ms');
      expect(generated).toHaveLength(3);
      expect(generated.map((note) => note.msFromEnd)).toEqual([-90, -75, -30]);
      expect(generated.map((note) => note.msOffset)).toEqual([null, null, null]);
      expect(generated.map((note) => note.noteoffShift)).toEqual([null, null, null]);
    },
    TIMEOUT,
  );

  it(
    'resolves them against each note’s millisecond end: 2910 / 2925 / 2970',
    () => {
      const { generated } = render('atend-ms');
      expectMilliseconds(
        generated.map((note) => note.ms),
        [2910, 2925, 2970],
      );
      expectMilliseconds(
        generated.map((note) => note.msEnd),
        [3000, 3000, 3000],
      );
      expect(generated.map((note) => note.pitch)).toEqual([64, 67, 71]);
    },
    TIMEOUT,
  );

  it(
    'drops the principal’s head and says so',
    () => {
      // The one case where carving throws away music the author wrote: the frame's anchor is
      // a millisecond end that does not exist yet, so the principal cannot be shortened and
      // is removed whole. The span the message names is what IS rendered,
      // frameLength − frame.offset = 60 − (−30) = 90 ms measured back from the note's end —
      // the only quantity available before the tempo pass. (Read from the other side: the
      // principal sounds 2000…3000 ms and the earliest generated note starts at 2910, so 910
      // of its 1000 ms are gone.)
      const { notes, warnings } = render('atend-ms');
      expect(notes).toHaveLength(4);
      expect(notes.filter((note) => note.generated === null).map((note) => note.id)).toEqual([
        'pre',
      ]);

      const warning = warnings.find((line) => line.includes('head is dropped'));
      expect(warning).toBeDefined();
      expect(warning).toContain('ornament "ornMsEnd"');
      expect(warning).toContain('only the last 90ms of it are rendered');
    },
    TIMEOUT,
  );

  it(
    'stays quiet for the same frame aligned at the start',
    () => {
      // The control for the warning above: `spread-ms` is the same millisecond frame with
      // the same offset and length, differing only in alignment, and it loses no head.
      expect(
        render('spread-ms').warnings.filter((line) => line.includes('head is dropped')),
      ).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// D11 — two ornaments on one principal
// ---------------------------------------------------------------------------------------

describe('multi-ornament: two ornaments on one principal (D11)', () => {
  /**
   * Principal P: pitch 64, date 0, duration 1440. Both ornaments name it and both use
   * note.order = "#n1 #P" with n1 = +1 chromatic (65), so each contributes two slots.
   *
   * `front`: frameLength "100%" = 1440 ticks, alignment "at start", noteoff.shift monophonic.
   * `back`:  frameLength  "50%" =  720 ticks, alignment "at end",   noteoff.shift true.
   *
   * D11's overflow rule: totalRaw = 1440 + 720 = 2160 > the principal's 1440, so
   *   scaleFactor = min(1, principalDuration / totalRaw) = min(1, 1440/2160) = 2/3
   * and the frames shrink to 1440 * 2/3 = 960 and 720 * 2/3 = 480.
   *
   * Layout: the front group's cursor starts at the principal's date ⇒ front frame [0, 960].
   * The end group is packed against the principal's end, endTotal = 480 ⇒ back frame
   * [1440 − 480, 1440] = [960, 1440].
   *
   * Spacing, n = 2, intensity 1 (the first slot at pow(0/1,1)*len + start = start, the last
   * pinned at start + len):
   *   front: 0 and 960     back: 960 and 1440
   *
   * front is monophonic ⇒ durations 960 − 0 = 960 and, for the last note, 1440 − 960 = 480.
   * back is "true" ⇒ every note keeps the principal's duration, 1440 each, so their ends
   * shift past the principal's own end (2400 and 2880 ticks) — which is what "the ends shift
   * with the onsets" means.
   *
   * No head leftover: the front ornament already begins at the principal's date, so the
   * earliest generated note is not later than it and the principal is consumed whole.
   *
   * Milliseconds: 0, 2000/3 = 666.666…, 1000 for the onsets; the back notes end at 2400 and
   * 2880 ticks = 5000/3 = 1666.666… and 2000 ms.
   */
  it(
    'shrinks both frames by the overflow factor 2/3 and lays them end to end',
    () => {
      const { generated } = render('multi-ornament');
      expect(generated).toHaveLength(4);
      expect(generated.map((note) => note.date)).toEqual([0, 960, 960, 1440]);
      expect(generated.map((note) => note.ref)).toEqual([
        'ornFront',
        'ornFront',
        'ornBack',
        'ornBack',
      ]);
      expect(generated.map((note) => note.slot)).toEqual(['0', '1', '0', '1']);
    },
    TIMEOUT,
  );

  it(
    'applies each ornament’s own noteoff.shift within the shared layout',
    () => {
      const { generated } = render('multi-ornament');
      expect(generated.map((note) => note.duration)).toEqual([960, 480, 1440, 1440]);
      expect(generated.map((note) => note.date! + note.duration!)).toEqual([960, 1440, 2400, 2880]);
      expect(generated.map((note) => note.pitch)).toEqual([65, 64, 65, 64]);
    },
    TIMEOUT,
  );

  it(
    'consumes the principal whole and anchors both ornaments to it',
    () => {
      const { notes, generated, warnings } = render('multi-ornament');
      expect(notes).toHaveLength(5);
      expect(notes.filter((note) => note.generated === null).map((note) => note.id)).toEqual(['q']);
      expect(generated.map((note) => note.anchor)).toEqual(['P', 'P', 'P', 'P']);
      // the id goes to the first note sourced from the principal, which is the front
      // ornament's second slot; both ornaments name the principal, only one can inherit it
      expect(generated[1].id).toBe('P');
      expect(generated.filter((note) => note.id === 'P')).toHaveLength(1);
      // both frames are tick-domain, so nothing warns about mixed domains
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'carries the layout into milliseconds',
    () => {
      const { generated } = render('multi-ornament');
      expectMilliseconds(
        generated.map((note) => note.ms),
        [0, 2000 / 3, 2000 / 3, 1000],
      );
      expectMilliseconds(
        generated.map((note) => note.msEnd),
        [2000 / 3, 1000, 5000 / 3, 2000],
      );
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// D8 — interval.diatonic against the MSM key signature
// ---------------------------------------------------------------------------------------

describe('diatonic-key: scale steps resolved against the key signature (D8)', () => {
  /**
   * The MSM's part carries a key signature of two sharps at date 0, i.e. **D major**:
   * `readKeyFifths` counts one per `<accidental>` with a positive `value` ⇒ keyFifths = 2.
   *
   * D8's algorithm: the tonic pitch class is 7 * keyFifths mod 12 = 14 mod 12 = 2 (D), and
   * the scale is that tonic plus 0 2 4 5 7 9 11, sorted ascending inside the octave:
   *   {2, 4, 6, 7, 9, 11, 1} sorted = [1, 2, 4, 6, 7, 9, 11]
   *   = C♯, D, E, F♯, G, A, B — D major.
   *
   * Principal P = 74 (D5), pitch class 2, which is degree 1 of that scale and therefore its
   * own anchor (no chromatic delta).
   *   down (interval.diatonic="-1"): degree 1 − 1 = 0 ⇒ scale[0] = 1 ⇒ 74 − 2 + 1 = **73** (C♯5)
   *   up   (interval.diatonic="2"):  degree 1 + 2 = 3 ⇒ scale[3] = 6 ⇒ 74 − 2 + 6 = **78** (F♯5)
   *   up8  (interval.diatonic="7"):  degree 8 ⇒ octave carry 1, scale[8−7] = 2
   *                                          ⇒ 74 − 2 + 12 + 2 = **86** (D6)
   *
   * Two of the three would differ in C major, which is what makes this an assertion about
   * the key rather than about arithmetic: there D − 1 is C (72) and D + 2 is F (77).
   *
   * Frame: 50% of 1440 = 720, "at start", monophonic, note.order "#down #P #up #up8" ⇒ four
   * slots at 0, 240, 480, 720 with durations 240, 240, 240, 720 — the §5.1 layout.
   */
  it(
    'reads two sharps as D major and resolves the steps into it',
    () => {
      const { generated } = render('diatonic-key');
      expect(generated).toHaveLength(4);
      expect(generated.map((note) => note.pitch)).toEqual([73, 74, 78, 86]);
      // the C-major readings this rules out, spelled out so the assertion cannot be reduced
      // to "some pitches": 73 ≠ 72 (C5) and 78 ≠ 77 (F5)
      expect(generated[0].pitch).not.toBe(72);
      expect(generated[2].pitch).not.toBe(77);
    },
    TIMEOUT,
  );

  it(
    'lays the four notes out over the frame [0, 720]',
    () => {
      const { notes, generated, warnings } = render('diatonic-key');
      expect(notes).toHaveLength(5);
      expect(generated.map((note) => note.date)).toEqual([0, 240, 480, 720]);
      expect(generated.map((note) => note.duration)).toEqual([240, 240, 240, 720]);
      expect(generated.map((note) => note.source)).toEqual(['down', 'P', 'up', 'up8']);
      expectMilliseconds(
        generated.map((note) => note.ms),
        [0, 500 / 3, 1000 / 3, 500],
      );
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'leaves the neighbour and the key signature map alone',
    () => {
      const { notes } = render('diatonic-key');
      const untouched = notes.filter((note) => note.generated === null);
      expect(untouched.map((note) => [note.id, note.date, note.pitch])).toEqual([['q', 1440, 69]]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// D3 — the lenient reading: legacy time.unit, suffix-less values, the frame.start alias
// ---------------------------------------------------------------------------------------

describe('legacy-timeunit: frame values written the pre-v3 way (D3)', () => {
  /**
   * D3's lenient reader had unit coverage only (W6 verifier's third secondary finding), so
   * nothing proved that a document written the way real documents are written *plays*. All
   * three readings are in one fixture, on three principals that do not overlap.
   *
   * **legacyMs — `time.unit="milliseconds"` with suffix-less values.**
   * `<temporalSpread time.unit="milliseconds" frame.offset="-30" frameLength="60"
   * intensity="2.0" noteoff.shift="true"/>`, i.e. `spread-ms`'s def in the older spelling.
   * The element is v3 because `frame.offset` is a v3 attribute *name*; both values then take
   * the legacy element-level unit, so the frame is [−30 ms, +30 ms] around the principal's
   * onset. Principal A: date 2880 = 2000 ms, duration 1440 = 1000 ms, pitch 64; pool +3 / +7
   * ⇒ 67 / 71; `note.order="#A #n2 #n3"` ⇒ three slots.
   *   i=0: pow(0/2,2)*60 − 30 = −30
   *   i=1: pow(1/2,2)*60 − 30 = 15 − 30 = −15
   *   last (pinned):    −30 + 60 = +30
   * `noteoff.shift="true"` shifts the ends with the onsets, so the notes sound
   * 1970..2970, 1985..2985, 2030..3030 — the −30 / −15 / +30 the Java reference wrote for
   * the chord this def came from.
   *
   * **legacyTicks — suffix-less with no `time.unit` at all ⇒ ticks (D3's default).**
   * `<temporalSpread frame.offset="0" frameLength="360"/>` over principal B (date 0,
   * duration 720, pitch 60), `note.order="#B #u1"`, u1 = +2 ⇒ 62. Two slots, intensity 1:
   *   i=0: pow(0/1,1)*360 + 0 =   0
   *   last (pinned):     0 + 360 = 360
   * `noteoff.shift` defaults to `false`, so both notes end where B would have, at 720:
   * durations 720 and 360, milliseconds 0 and 250, both ending at 500.
   *
   * **legacyAlias — `frame.start` read as `frame.offset`.**
   * `<temporalSpread frame.start="180" frameLength="50%"/>` over principal C (date 1440,
   * duration 720, pitch 72), `note.order="#C #d1"`, d1 = +1 ⇒ 73. The `%` suffix is the only
   * v3 marker in the element; the alias then carries the offset, suffix-less and with no
   * `time.unit`, so ticks. Frame: 50 % of 720 = 360 ticks, offset 180 ⇒ [1620, 1980] absolute.
   *   i=0: pow(0/1,1)*360 + 180 = 180 ⇒ 1440 + 180 = 1620
   *   last (pinned):      180 + 360 = 540 ⇒ 1440 + 540 = 1980
   * `false` note-offs again ⇒ ends at C's own end 2160, durations 540 and 180; milliseconds
   * 1620 * 500/720 = 1125 and 1980 * 500/720 = 1375, both ending at 1500.
   */
  it(
    'reads suffix-less values against the legacy time.unit and renders the markers of the canonical spelling',
    () => {
      const { notes, generated, warnings } = render('legacy-timeunit');
      const fromA = generated.filter((note) => note.ref === 'ornMsLegacy');

      expect(notes).toHaveLength(8); // 2 + 2 + 3 generated, plus the untouched `pre`
      expect(fromA.map((note) => note.pitch)).toEqual([64, 67, 71]);
      expect(fromA.map((note) => note.msOffset)).toEqual([-30, -15, 30]);
      expect(fromA.map((note) => note.noteoffShift)).toEqual(['true', 'true', 'true']);
      expectMilliseconds(
        fromA.map((note) => note.ms),
        [1970, 1985, 2030],
      );
      expectMilliseconds(
        fromA.map((note) => note.msEnd),
        [2970, 2985, 3030],
      );
      // a millisecond frame leaves the tick geometry alone: the notes sit on the principal's
      expect(fromA.map((note) => note.date)).toEqual([2880, 2880, 2880]);
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'defaults a suffix-less value to ticks when the element states no unit',
    () => {
      const { generated } = render('legacy-timeunit');
      const fromB = generated.filter((note) => note.ref === 'ornTicks');

      expect(fromB.map((note) => note.pitch)).toEqual([60, 62]);
      expect(fromB.map((note) => note.date)).toEqual([0, 360]);
      expect(fromB.map((note) => note.duration)).toEqual([720, 360]);
      expectMilliseconds(
        fromB.map((note) => note.ms),
        [0, 250],
      );
      expectMilliseconds(
        fromB.map((note) => note.msEnd),
        [500, 500],
      );
      // read as milliseconds instead, these would be markers on one date rather than dates
      expect(fromB.map((note) => note.msOffset)).toEqual([null, null]);
    },
    TIMEOUT,
  );

  it(
    'accepts frame.start as the name of frame.offset',
    () => {
      const { generated } = render('legacy-timeunit');
      const fromC = generated.filter((note) => note.ref === 'ornAlias');

      expect(fromC.map((note) => note.pitch)).toEqual([72, 73]);
      expect(fromC.map((note) => note.date)).toEqual([1620, 1980]);
      expect(fromC.map((note) => note.duration)).toEqual([540, 180]);
      expectMilliseconds(
        fromC.map((note) => note.ms),
        [1125, 1375],
      );
      // the alias is what places them: dropped, the frame would start at the principal's date
      expect(fromC.map((note) => note.source)).toEqual(['C', 'd1']);
    },
    TIMEOUT,
  );

  it(
    'keeps the untouched neighbour and each principal’s id',
    () => {
      const { notes } = render('legacy-timeunit');

      // `pre` is named by no ornament and comes through as itself
      const untouched = notes.filter((note) => note.generated === null);
      expect(untouched.map((note) => [note.id, note.date, note.pitch])).toEqual([
        ['pre', 2160, 55],
      ]);
      // every principal is consumed ("at start" leaves no head), so each id lands on the note
      // the expansion sourced from it — and lands exactly once
      for (const id of ['A', 'B', 'C'])
        expect(notes.filter((note) => note.id === id)).toHaveLength(1);
      expect(notes.filter((note) => note.id === 'A')[0].source).toBe('A');
    },
    TIMEOUT,
  );

  it(
    'is read leniently and written canonically (D12)',
    () => {
      // The other half of D3: what comes back out carries per-value suffixes and no
      // `time.unit`, whatever the document was written with. `generateXML` is what a caller
      // reaches through `Mpm.toXml`, so this is the shape a re-saved document has.
      const { performance } = load('legacy-timeunit');
      const style = performance
        .getGlobal()!
        .getHeader()!
        .getStyleDef(ORNAMENTATION_STYLE, 'orn style');
      const spreadOf = (name: string) =>
        (style!.getDef(name) as OrnamentDef).getTemporalSpread()!.generateXML().toXML();

      expect(spreadOf('legacyTicks')).toContain('frame.offset="0ticks" frameLength="360ticks"');
      expect(spreadOf('legacyAlias')).toContain('frame.offset="180ticks" frameLength="50%"');
      expect(spreadOf('legacyMs')).toContain('frame.offset="-30ms" frameLength="60ms"');
      for (const name of ['legacyTicks', 'legacyAlias', 'legacyMs']) {
        expect(spreadOf(name)).not.toContain('time.unit');
        expect(spreadOf(name)).not.toContain('frame.start');
      }
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// D6 — a v2 document through the v3 build
// ---------------------------------------------------------------------------------------

describe('v2-passthrough: a v2 ornamentation document is untouched by v3 (D6)', () => {
  /**
   * Two arpeggiated chords over the v2 def `arpeggio`
   * (`frame.start="-22.0" frameLength="44.0"`, dynamicsGradient −1 → +1, intensity 1,
   * noteoff.shift absent). Nothing in the document is v3, so DESIGN.md D6's gate must keep
   * every ornament on the v2 path: no note is generated, no provenance is written, and no
   * note.order.perf appears.
   *
   * Chord A at 1440 (60 / 64 / 67), no `scale` ⇒ the gradient is scaled by the spec default
   * 0.0. Chord B at 2880 (62 / 65 / 69), scale="2.0", note.order="descending pitch".
   *
   * Spacing over a chord of n = 3, intensity 1, frameStart −22, frameLength 44:
   *   i=0: pow(0/2,1)*44 − 22 = −22
   *   i=1: pow(1/2,1)*44 − 22 =  22 − 22 = 0
   *   last, pinned:      −22 + 44 = +22
   *
   * Dynamics: constFac = scale * (to − from) / (n − 1) = scale, fromVelocity = −scale, so the
   * markers are −scale, 0, +scale: 0 / 0 / 0 for chord A and −2 / 0 / +2 for chord B.
   *
   * Chord A is collected in ascending pitch order (60, 64, 67) and chord B in descending
   * order (69, 65, 62), which is what pairs each note with its offset:
   *   a1 (60): −22   a2 (64): 0   a3 (67): +22
   *   b3 (69): −22   b2 (65): 0   b1 (62): +22
   *
   * Pass two folds them in: date.perf = date + offset, and with no noteoff.shift the
   * duration absorbs the shift (duration.perf = 1440 − offset) so date.end.perf stays put.
   *   a1: date.perf 1418, duration.perf 1462   a3: 1462 / 1418   both ending 2880
   *   b3: date.perf 2858, duration.perf 1462   b1: 2902 / 1418   both ending 4320
   * Velocities: 100 everywhere in chord A; 98 / 100 / 102 for b3 / b2 / b1.
   *
   * Milliseconds at 500/720 per tick: 1418 → 984.722…, 1440 → 1000, 1462 → 1015.277…,
   * 2858 → 1984.722…, 2880 → 2000, 2902 → 2015.277…; the ends are 2000 and 3000.
   */
  it(
    'generates nothing and writes no v3 attribute anywhere',
    () => {
      const { notes, generated, ornaments: elements, warnings } = render('v2-passthrough');
      expect(notes).toHaveLength(6);
      expect(generated).toEqual([]);
      expect(notes.map((note) => note.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
      for (const note of notes) {
        expect(note.ref).toBeNull();
        expect(note.source).toBeNull();
        expect(note.slot).toBeNull();
        expect(note.pass).toBeNull();
        expect(note.anchor).toBeNull();
        expect(note.msFromEnd).toBeNull();
      }
      for (const element of elements)
        expect(element.getAttributeValue('note.order.perf')).toBeNull();
      expect(warnings).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'spreads chord A by −22 / 0 / +22 ticks with an unscaled gradient',
    () => {
      const notes = render('v2-passthrough').notes.slice(0, 3);
      expect(notes.map((note) => note.dynamics)).toEqual([0, 0, 0]);
      expect(notes.map((note) => note.velocity)).toEqual([100, 100, 100]);
      expect(notes.map((note) => note.datePerf)).toEqual([1418, 1440, 1462]);
      expect(notes.map((note) => note.durationPerf)).toEqual([1462, 1440, 1418]);
      expect(notes.map((note) => note.dateEndPerf)).toEqual([2880, 2880, 2880]);
      expectMilliseconds(
        notes.map((note) => note.ms),
        [1418 * MS_PER_TICK, 1000, 1462 * MS_PER_TICK],
      );
      // the same two values written out: 984.722… and 1015.277…
      expect(notes[0].ms).toBeCloseTo(984.722222222, 6);
      expect(notes[2].ms).toBeCloseTo(1015.277777777, 6);
      expectMilliseconds(
        notes.map((note) => note.msEnd),
        [2000, 2000, 2000],
      );
    },
    TIMEOUT,
  );

  it(
    'spreads chord B in descending pitch order with the gradient scaled by 2',
    () => {
      // document order is b1 (62), b2 (65), b3 (69); the descending collection order is the
      // reverse, so b3 takes the earliest offset and the lowest velocity
      const [b1, b2, b3] = render('v2-passthrough').notes.slice(3);
      expect([b3.dynamics, b2.dynamics, b1.dynamics]).toEqual([-2, 0, 2]);
      expect([b3.velocity, b2.velocity, b1.velocity]).toEqual([98, 100, 102]);
      expect([b3.datePerf, b2.datePerf, b1.datePerf]).toEqual([2858, 2880, 2902]);
      expect([b3.durationPerf, b2.durationPerf, b1.durationPerf]).toEqual([1462, 1440, 1418]);
      expect([b3.dateEndPerf, b2.dateEndPerf, b1.dateEndPerf]).toEqual([4320, 4320, 4320]);
      expectMilliseconds([b3.ms], [2858 * MS_PER_TICK]);
      expect(b3.ms).toBeCloseTo(1984.722222222, 6);
      expectMilliseconds([b2.ms], [2000]);
      expect(b1.ms).toBeCloseTo(2015.277777777, 6);
      expectMilliseconds(
        [b1, b2, b3].map((note) => note.msEnd),
        [3000, 3000, 3000],
      );
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// A degenerate frame end to end: the finiteness guard (W9 hardening, finding O2)
// ---------------------------------------------------------------------------------------

describe('a negative intensity reaches neither the augmented MSM nor the MIDI export', () => {
  /**
   * The guard in `createChords` exists for one measured failure, and its docblock names it:
   * a negative `intensity` made the renderer emit a real `<note date="Infinity"
   * duration="NaN">` "into the augmented MSM and on into the MIDI export". Every test that
   * pins the guard drives `renderOrnamentationToMap` directly, so nothing asserted that the
   * two documents the docblock names come out clean. This closes that.
   *
   * The construction is the W5 verifier's, unchanged: intensity −1,
   * `frame.offset="-1000ticks"`, `frameLength="100ticks"`, `noteoff.shift="monophonic"`,
   * four slots over a principal at date 0 with duration 1440. It is carried by an in-memory
   * variant of `turn-atstart`'s MPM rather than by a tenth fixture pair — the MSM, the pool
   * and `note.order` are reused unchanged and only the `<temporalSpread>` differs, so the
   * arithmetic below is that fixture's with one frame substituted.
   *
   * `pow(0, −1)` is `Infinity`, one of the two unguarded edges this renderer inherits from
   * the v2 spacing engine on purpose:
   *   i=0: pow(0/3, −1) * 100 − 1000 = Infinity
   *   i=1: pow(1/3, −1) = 3   ⇒  300 − 1000 = −700
   *   i=2: pow(2/3, −1) = 1.5 ⇒  150 − 1000 = −850
   *   last, pinned:                −1000 + 100 = −900
   * One ornament of raw length 100 on a 1440-tick principal, so D11's overflow factor is
   * min(1, 1440/100) = 1 and does not perturb any of it.
   *
   * `monophonic` measures each duration to the next onset — −700 − Infinity = −Infinity,
   * −850 − (−700) = −150, −900 − (−850) = −50, all of which clamp to 0 — and the last to the
   * principal's end, 1440 − (−900) = 2340. So the ends are Infinity, −700, −850 and 1440.
   *
   * What survives: slot 0 is the guard's case — its end is `Infinity`, so D14's `end <= 0`
   * is false and the clamp would then compute `Infinity − Infinity` = `NaN` for its
   * duration; slots 1 and 2 are D14's, their ends being at or before tick 0. Slot 3
   * straddles 0 and is clamped there: date max(0, −900) = 0, duration 1440 − 0 = 1440,
   * pitch 64 (it is the `#P` token, so the principal's own pitch). At 500/720 ms per tick
   * that is 0 ms to 1000 ms.
   *
   * The score therefore holds three notes: that survivor in place of the principal, plus the
   * fixture's two untouched neighbours q (1440, 67) and r (2160, 65).
   */
  const DEGENERATE_SPREAD =
    '<temporalSpread frame.offset="-1000.0ticks" frameLength="100.0ticks" intensity="-1.0" noteoff.shift="monophonic" />';

  /**
   * `turn-atstart` with its frame replaced, built in memory: the fixtures are immutable
   * (CHARTER §15-17), and a tenth pair would commit a document nobody would ever author.
   * The substitution is asserted rather than assumed — without that, a fixture edit or a
   * changed attribute order would quietly turn this into a second `turn-atstart` run.
   */
  function loadDegenerate(): { msm: Msm; performance: Performance } {
    const msm = new Msm(readFileSync(join(FIXTURE_DIR, 'turn-atstart.msm'), 'utf-8'));
    const authored = readFileSync(join(FIXTURE_DIR, 'turn-atstart.mpm'), 'utf-8');
    const patched = authored.replace(/<temporalSpread[^>]*\/>/, DEGENERATE_SPREAD);
    expect(patched).not.toBe(authored);
    expect(patched).toContain(DEGENERATE_SPREAD);
    expect(patched).not.toContain('frameLength="50%"');
    const performances = new Mpm(patched).getAllPerformances();
    expect(performances).toHaveLength(1);
    return { msm, performance: performances[0] };
  }

  it(
    'drops the non-finite slot and writes no Infinity or NaN into the augmented score',
    () => {
      const { msm, performance } = loadDegenerate();
      const warnings: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
      });
      let augmented: Msm;
      try {
        augmented = performance.perform(msm);
      } finally {
        spy.mockRestore();
      }

      const notes = scoreNotes(augmented);
      expect(notes).toHaveLength(3);
      for (const note of notes) {
        expect(Number.isFinite(note.date)).toBe(true);
        expect(Number.isFinite(note.duration)).toBe(true);
        expect(Number.isFinite(note.datePerf)).toBe(true);
        expect(Number.isFinite(note.durationPerf)).toBe(true);
        expect(Number.isFinite(note.ms)).toBe(true);
        expect(Number.isFinite(note.msEnd)).toBe(true);
      }

      // the strongest form of the same statement: not one non-finite literal anywhere in the
      // serialized document, whichever attribute might have carried it
      const xml = augmented.getRootElement()!.toXML();
      expect(xml).not.toMatch(/Infinity/);
      expect(xml).not.toMatch(/NaN/);

      const generated = notes.filter((note) => note.generated === 'true');
      expect(generated).toHaveLength(1);
      expect([generated[0].date, generated[0].duration, generated[0].pitch]).toEqual([0, 1440, 64]);
      expect(generated[0].slot).toBe('3');
      expectMilliseconds([generated[0].ms, generated[0].msEnd], [0, 1440 * MS_PER_TICK]);

      // and the drop announces itself once, counted over what the expansion planned
      const warning = warnings.find((line) => line.includes('not a finite number'));
      expect(warning).toBeDefined();
      expect(warning).toContain('ornament "orn1"');
      expect(warning).toContain('1 of its 4 ornament notes');
    },
    TIMEOUT,
  );

  it(
    'exports to MIDI with three note-ons, three note-offs and no event at an unreal tick',
    () => {
      const { msm, performance } = loadDegenerate();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let midi: Midi | null;
      try {
        midi = msm.exportExpressiveMidi(performance);
      } finally {
        spy.mockRestore();
      }
      expect(midi).not.toBeNull();

      const events = noteEvents(midi!);
      expect(events.filter((event) => event.command === NOTE_ON)).toHaveLength(3);
      expect(events.filter((event) => event.command === NOTE_OFF)).toHaveLength(3);
      // an Infinity date used to arrive here; a tick has to be a real, non-negative number
      expect(events.filter((event) => !Number.isFinite(event.tick) || event.tick < 0)).toEqual([]);

      const bytes = midi!.exportMidi();
      expect(bytes).not.toBeNull();
      expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------------------
// Cross-cutting: MIDI export and determinism
// ---------------------------------------------------------------------------------------

describe('every fixture exports to MIDI', () => {
  for (const { name, notes } of FIXTURES)
    it(
      `${name}: ${notes} notes become ${notes} note-ons and ${notes} note-offs, none before tick 0`,
      () => {
        const { msm, performance } = load(name);
        const midi = msm.exportExpressiveMidi(performance);
        expect(midi).not.toBeNull();

        const events = noteEvents(midi!);
        expect(events.filter((event) => event.command === NOTE_ON)).toHaveLength(notes);
        expect(events.filter((event) => event.command === NOTE_OFF)).toHaveLength(notes);
        // D14 exists so that a frame reaching before the piece cannot produce one of these
        expect(events.filter((event) => event.tick < 0)).toEqual([]);

        // and the bytes come out
        const bytes = midi!.exportMidi();
        expect(bytes).not.toBeNull();
        expect(String.fromCharCode(bytes![0], bytes![1], bytes![2], bytes![3])).toBe('MThd');
      },
      TIMEOUT,
    );
});

describe('performing twice gives the same document', () => {
  /**
   * None of these fixtures carries an imprecision map, so the only thing that may differ
   * between two renders of one performance is the `meico_<uuid>` a generated note draws.
   * Canonicalising those ids by first occurrence and then comparing the whole augmented
   * document byte for byte is therefore the strongest available statement: it covers
   * attribute order, number formatting and element order at once.
   *
   * The same `Msm` object is performed both times, so a pass that mutated its input rather
   * than the clone would also show up here.
   */
  function canonicalise(xml: string): string {
    const seen = new Map<string, string>();
    return xml.replace(/meico_[0-9a-f-]{36}/g, (id) => {
      if (!seen.has(id)) seen.set(id, `generated-${seen.size + 1}`);
      return seen.get(id)!;
    });
  }

  for (const { name } of FIXTURES)
    it(
      `${name}: two renders are byte-identical once generated ids are canonicalised`,
      () => {
        const { msm, performance } = load(name);
        const first = performance.perform(msm).getRootElement()!.toXML();
        const second = performance.perform(msm).getRootElement()!.toXML();
        expect(canonicalise(second)).toBe(canonicalise(first));
      },
      TIMEOUT,
    );

  it(
    'the canonicalisation is not vacuous: it rewrites ids that really differ',
    () => {
      // A control for the comparison above. `turn-atstart` generates three fresh ids per
      // render (the fourth note inherits the principal's), so the two raw documents must
      // NOT be equal — otherwise the test would pass for a renderer that emitted no ids at
      // all, or a canonicaliser that erased everything.
      const { msm, performance } = load('turn-atstart');
      const first = performance.perform(msm).getRootElement()!.toXML();
      const second = performance.perform(msm).getRootElement()!.toXML();
      expect(second).not.toBe(first);
      expect(first.match(/meico_[0-9a-f-]{36}/g)).toHaveLength(3);
      expect(canonicalise(first)).toContain('generated-1');
    },
    TIMEOUT,
  );
});
