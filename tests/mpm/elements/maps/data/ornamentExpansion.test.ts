import { describe, it, expect } from 'vitest';
import {
  parseNoteOrder,
  type NoteOrder,
  type RepeatGroup,
} from '../../../../../src/mpm/elements/maps/data/noteOrder.js';
import {
  expandOrnament,
  resolveDiatonicPitch,
  MAX_EXPANDED_SLOTS,
  type ExpansionInput,
  type ExpansionResult,
  type PitchSpec,
  type Slot,
} from '../../../../../src/mpm/elements/maps/data/ornamentExpansion.js';

type NoteOrderList = Extract<NoteOrder, { kind: 'list' }>;
type Expanded = Extract<ExpansionResult, { ok: true }>;
type Failed = Extract<ExpansionResult, { ok: false }>;

/**
 * The standing fixture. The principal is middle C (60) with id `P`; every pool note is named
 * after what it does, so an order string reads as the figure it encodes:
 *
 * | id    | spec                  | pitch against principal 60 in C major |
 * |-------|-----------------------|---------------------------------------|
 * | `up`  | interval.chromatic +1 | 61 (C♯)                               |
 * | `dn`  | interval.chromatic −1 | 59 (B)                                |
 * | `uni` | interval.chromatic 0  | 60 — a pool unison with the principal |
 * | `abs` | midi.pitch 64         | 64 (E), absolute, needs no principal  |
 * | `d0`  | interval.diatonic 0   | 60 (C)                                |
 * | `d1`  | interval.diatonic +1  | 62 (D)                                |
 * | `dm1` | interval.diatonic −1  | 59 (B)                                |
 *
 * `msm` (67, G) stands for a v2-style reference to a real score note outside the pool.
 */
const PRINCIPAL = { id: 'P', midiPitch: 60 } as const;

const POOL: ReadonlyMap<string, PitchSpec> = new Map<string, PitchSpec>([
  ['up', { kind: 'chromatic', value: 1 }],
  ['dn', { kind: 'chromatic', value: -1 }],
  ['uni', { kind: 'chromatic', value: 0 }],
  ['abs', { kind: 'midi', value: 64 }],
  ['d0', { kind: 'diatonic', value: 0 }],
  ['d1', { kind: 'diatonic', value: 1 }],
  ['dm1', { kind: 'diatonic', value: -1 }],
]);

const MSM_NOTES: ReadonlyMap<string, number> = new Map([['msm', 67]]);

const BASE: ExpansionInput = {
  order: { kind: 'list', items: [], groups: [], warnings: [] },
  pool: POOL,
  principal: PRINCIPAL,
  msmNotes: MSM_NOTES,
  repetitions: 0,
  diatonicContext: { keyFifths: 0 },
  frameNoteBudget: null,
};

/** Parse a `note.order` and assert it is a list — a keyword never reaches the expander. */
function asList(raw: string): NoteOrderList {
  const parsed = parseNoteOrder(raw);
  expect(parsed).not.toBeNull();
  expect(parsed!.kind).toBe('list');
  return parsed as NoteOrderList;
}

/** Build an AST by hand, for the cases where a parser round-trip would only obscure the input. */
function list(
  items: readonly (readonly string[])[],
  groups: readonly RepeatGroup[] = [],
): NoteOrderList {
  return { kind: 'list', items: items.map((ids) => ({ ids })), groups, warnings: [] };
}

/** Expand `raw` against the standing fixture, with per-test overrides. */
function run(raw: string, overrides: Partial<ExpansionInput> = {}): ExpansionResult {
  return expandOrnament({ ...BASE, order: asList(raw), ...overrides });
}

function ok(result: ExpansionResult): Expanded {
  if (!result.ok) throw new Error(`expected an expansion, got the fatal: ${result.reason}`);
  return result;
}

function failed(result: ExpansionResult): Failed {
  if (result.ok) throw new Error(`expected a fatal, got ${result.slots.length} slot(s)`);
  return result;
}

/** Every slot's pitches — the shape that distinguishes a chord slot from a single note. */
function chords(result: ExpansionResult): number[][] {
  return ok(result).slots.map((slot) => slot.notes.map((note) => note.midiPitch));
}

/** The pitch sequence, asserting on the way that every slot holds exactly one note. */
function pitches(result: ExpansionResult): number[] {
  return chords(result).map((slot) => {
    expect(slot).toHaveLength(1);
    return slot[0];
  });
}

function landings(result: ExpansionResult): boolean[] {
  return ok(result).slots.map((slot) => slot.notes.some((note) => note.landing === true));
}

describe('expandOrnament — reference resolution (rule 1)', () => {
  it('resolves a pool id against the pool, and reports the source', () => {
    const [note] = ok(run('#up')).slots[0].notes;
    expect(note).toEqual({ ref: 'up', midiPitch: 61, source: 'pool' });
  });

  it('resolves the principal id to the principal pitch', () => {
    const [note] = ok(run('#P')).slots[0].notes;
    expect(note).toEqual({ ref: 'P', midiPitch: 60, source: 'principal' });
  });

  it('resolves a non-pool id against the MSM notes', () => {
    const [note] = ok(run('#msm')).slots[0].notes;
    expect(note).toEqual({ ref: 'msm', midiPitch: 67, source: 'msm' });
  });

  it('keeps a chord as one slot with several notes', () => {
    expect(chords(run('[ #up #P #msm ]'))).toEqual([[61, 60, 67]]);
  });

  it('lets the pool shadow an MSM note of the same id — a pool id is ornament-local', () => {
    const result = run('#same', {
      pool: new Map<string, PitchSpec>([['same', { kind: 'midi', value: 42 }]]),
      msmNotes: new Map([['same', 99]]),
    });
    expect(ok(result).slots[0].notes[0]).toEqual({ ref: 'same', midiPitch: 42, source: 'pool' });
  });

  it('answers the principal id as the principal even when the MSM map also knows it', () => {
    // The principal *is* an MSM note, so this overlap is the normal case, not a corner one.
    const result = run('#P', { msmNotes: new Map([['P', 12]]) });
    expect(ok(result).slots[0].notes[0]).toEqual({ ref: 'P', midiPitch: 60, source: 'principal' });
  });

  it('drops an unknown reference with a warning and keeps the rest of the chord', () => {
    const result = run('[ #up #nope ]');
    expect(chords(result)).toEqual([[61]]);
    expect(result.warnings).toEqual([
      'ornament expansion: note.order references "nope", which is neither a pool note nor the ' +
        'principal note nor a known MSM note; dropped.',
    ]);
  });

  it('drops a slot whose references all vanish, naming the item index', () => {
    const result = run('#up #ghost #dn');
    expect(pitches(result)).toEqual([61, 59]);
    expect(result.warnings).toEqual([
      'ornament expansion: note.order references "ghost", which is neither a pool note nor the ' +
        'principal note nor a known MSM note; dropped.',
      'ornament expansion: note.order item 1 lost all of its references; slot dropped.',
    ]);
  });

  it('fails when nothing at all resolves, keeping the per-reference warnings', () => {
    const result = failed(run('#ghost #spook'));
    expect(result.reason).toBe(
      'every note reference in note.order was dropped; nothing left to render.',
    );
    expect(result.warnings).toHaveLength(4); // two unknown refs + two emptied slots
  });

  it('re-indexes a repeat group across a dropped slot', () => {
    // '#msm |: #ghost #up #dn :|' — item 1 dies, so the group over items 1…3 becomes slots 1…2,
    // and one extra pass repeats #up #dn rather than the two slots those indices held before.
    const result = run('#msm |: #ghost #up #dn :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([67, 61, 59, 61, 59]);
  });

  it('drops a repeat group that loses every slot, and says so', () => {
    const result = run('#up |: #ghost :| #dn', { repetitions: 5 });
    expect(pitches(result)).toEqual([61, 59]);
    expect(result.warnings).toContain(
      'ornament expansion: the repeat group over note.order items 1…1 lost all of its slots; ' +
        'group dropped.',
    );
  });
});

describe('expandOrnament — pitch resolution (rule 2, PARITY.md §6.2 D8)', () => {
  it('takes midi.pitch as an absolute pitch', () => {
    expect(pitches(run('#abs'))).toEqual([64]);
  });

  it.each([
    { name: 'a semitone up', spec: { kind: 'chromatic', value: 1 } as PitchSpec, expected: 61 },
    { name: 'a semitone down', spec: { kind: 'chromatic', value: -1 } as PitchSpec, expected: 59 },
    { name: 'a unison', spec: { kind: 'chromatic', value: 0 } as PitchSpec, expected: 60 },
    {
      name: 'a quarter tone',
      spec: { kind: 'chromatic', value: 0.5 } as PitchSpec,
      expected: 60.5,
    },
    { name: 'an octave', spec: { kind: 'chromatic', value: 12 } as PitchSpec, expected: 72 },
  ])('adds interval.chromatic to the principal: $name', ({ spec, expected }) => {
    expect(pitches(run('#x', { pool: new Map([['x', spec]]) }))).toEqual([expected]);
  });

  it('renders midi.pitch pool notes without any principal (D7 step 3)', () => {
    const result = run('#abs #abs', { principal: null });
    expect(pitches(result)).toEqual([64, 64]);
  });

  it.each([
    { kind: 'chromatic' as const, id: 'up' },
    { kind: 'diatonic' as const, id: 'd1' },
  ])('fails on an interval.$kind pool note with no principal', ({ kind, id }) => {
    const result = failed(run(`#${id}`, { principal: null }));
    expect(result.reason).toBe(
      `pool note "${id}" states its pitch as interval.${kind} and so needs a principal note to ` +
        `be relative to; this ornament has none, and only absolute midi.pitch pool notes can be ` +
        `rendered without one.`,
    );
  });

  it('still resolves MSM references without a principal — they carry their own pitch', () => {
    expect(pitches(run('#msm', { principal: null }))).toEqual([67]);
  });

  it('rounds a fractional interval.diatonic and warns', () => {
    const result = run('#x', {
      pool: new Map<string, PitchSpec>([['x', { kind: 'diatonic', value: 1.5 }]]),
    });
    expect(pitches(result)).toEqual([64]); // rounds to +2: C → E
    expect(result.warnings).toEqual([
      'ornament expansion: interval.diatonic="1.5" on pool note "x" is not a whole scale step; ' +
        'rounded to 2.',
    ]);
  });
});

describe('resolveDiatonicPitch — the D8 algorithm', () => {
  // Every row is hand-computed from the algorithm's four steps: scale ← 7·fifths (mod 12) plus
  // 0 2 4 5 7 9 11, sorted inside the octave; anchor ← greatest scale pitch ≤ principal, with
  // the remainder kept as `delta`; step by index with an octave carry at C; add `delta` back.
  it.each([
    // --- C major: scale pitch classes 0 2 4 5 7 9 11 ---
    { key: 0, from: 60, steps: 0, to: 60, why: 'C, no step — the spec default for a bare <note>' },
    { key: 0, from: 60, steps: 1, to: 62, why: 'C → D' },
    { key: 0, from: 64, steps: 1, to: 65, why: 'E → F, the half step inside the scale' },
    { key: 0, from: 71, steps: 1, to: 72, why: 'B → C, carrying the octave' },
    { key: 0, from: 60, steps: -1, to: 59, why: 'C → B, carrying down' },
    { key: 0, from: 65, steps: -1, to: 64, why: 'F → E' },
    { key: 0, from: 62, steps: 2, to: 65, why: 'D → F, two degrees' },
    { key: 0, from: 60, steps: 7, to: 72, why: 'seven degrees = one octave' },
    { key: 0, from: 60, steps: -7, to: 48, why: 'and back down' },
    { key: 0, from: 60, steps: 15, to: 86, why: 'two octaves (14) plus one degree: C → D' },
    // --- C major, principal outside the scale: anchor below + chromatic delta ---
    { key: 0, from: 63, steps: 1, to: 65, why: 'E♭: anchor D(62), delta 1, D→E(64), +1 = F(65)' },
    { key: 0, from: 63, steps: -1, to: 61, why: 'E♭: anchor D, D→C(60), +1 = D♭(61)' },
    { key: 0, from: 61, steps: 1, to: 63, why: 'C♯: anchor C, C→D(62), +1 = D♯(63)' },
    { key: 0, from: 60.5, steps: 1, to: 62.5, why: 'a quarter tone rides along' },
    { key: 0, from: -1, steps: 1, to: 0, why: 'B(−1) → C(0): the arithmetic holds below MIDI 0' },
    // --- D major (2 sharps): 1 2 4 6 7 9 11 ---
    { key: 2, from: 66, steps: 1, to: 67, why: 'F♯ → G' },
    { key: 2, from: 74, steps: 1, to: 76, why: 'D → E' },
    { key: 2, from: 73, steps: 1, to: 74, why: 'C♯ → D, carrying the octave at C' },
    { key: 2, from: 72, steps: 1, to: 74, why: 'C♮: anchor B(71), delta 1, B→C♯(73), +1 = D(74)' },
    // --- F major (1 flat): 0 2 4 5 7 9 10 ---
    { key: -1, from: 70, steps: 1, to: 72, why: 'B♭ → C' },
    { key: -1, from: 71, steps: 1, to: 73, why: 'B♮: anchor B♭(70), delta 1, B♭→C(72), +1' },
    // --- the ends of the circle, and past them ---
    { key: 7, from: 61, steps: 1, to: 63, why: 'C♯ major: C♯ → D♯' },
    { key: -7, from: 71, steps: 1, to: 73, why: 'C♭ major = B major enharmonically: B → C♯' },
    { key: 8, from: 68, steps: 1, to: 70, why: 'past the circle: G♯ major still resolves' },
  ])('$key fifths: $from + $steps → $to ($why)', ({ key, from, steps, to }) => {
    expect(resolveDiatonicPitch(from, steps, key)).toBe(to);
  });

  it('rounds a non-integer key signature to the nearest fifth', () => {
    expect(resolveDiatonicPitch(64, 1, 0.4)).toBe(resolveDiatonicPitch(64, 1, 0));
  });

  it('is reachable through expandOrnament with the ornament date key context', () => {
    // F♯ +1 in D major = G, via a pool note rather than the helper.
    const result = run('#d1', {
      principal: { id: 'P', midiPitch: 66 },
      diatonicContext: { keyFifths: 2 },
    });
    expect(pitches(result)).toEqual([67]);
  });
});

describe('expandOrnament — repetition expansion (rule 3)', () => {
  it('plays a group repetitions+1 times: the spec exemplum trill, 3 → 8 slots', () => {
    // the vector 3 / spec exemplum: "repeating the trill pattern three times within
    // the time frame … So, it is played four times." Group is #up #P, so 4 × 2 = 8 slots, and
    // the group does not start on the principal pitch, so no landing note is appended.
    const result = run('|: #up #P :|', { repetitions: 3 });
    expect(pitches(result)).toEqual([61, 60, 61, 60, 61, 60, 61, 60]);
    expect(landings(result)).toEqual(Array<boolean>(8).fill(false));
  });

  it('plays a group once when repetitions is 0', () => {
    expect(pitches(run('|: #up #P :|'))).toEqual([61, 60]);
  });

  it('expands the upper turn without any group: 4 slots', () => {
    expect(pitches(run('#up #P #dn #P'))).toEqual([61, 60, 59, 60]);
  });

  it('expands in place, leaving the tail behind the last pass', () => {
    // 1 + 3·2 + 1 = 8 slots. The reference gets 6 here: it reuses its fill-the-budget
    // loop with a budget of (r+1)·groupLen and charges the *whole* sequence against it, so the
    // #msm and #abs slots eat one of the three passes.
    expect(pitches(run('#msm |: #up #dn :| #abs', { repetitions: 2 }))).toEqual([
      67, 61, 59, 61, 59, 61, 59, 64,
    ]);
  });

  it('expands every group with the same count (≠Lars, who supports one)', () => {
    // 1 + 2·2 + 1 + 2·2 = 10 slots. Neither group opens on the principal pitch, and no two
    // neighbours share a pitch, so what comes back is the raw expansion.
    expect(pitches(run('#msm |: #up #dn :| #abs |: #dn #up :|', { repetitions: 1 }))).toEqual([
      67, 61, 59, 61, 59, 64, 59, 61, 59, 61,
    ]);
  });

  it('repeats a chord slot as one slot', () => {
    expect(chords(run('|: [ #up #dn ] #msm :|', { repetitions: 1 }))).toEqual([
      [61, 59],
      [67],
      [61, 59],
      [67],
    ]);
  });

  it('warns that repetitions had nothing to repeat when there is no group', () => {
    const result = run('#up #dn', { repetitions: 4 });
    expect(pitches(result)).toEqual([61, 59]);
    expect(result.warnings).toEqual([
      'ornament expansion: repetitions="4" has no effect — note.order has no repeat group.',
    ]);
  });

  it('says nothing when repetitions is 0 and there is no group', () => {
    expect(run('#up #dn').warnings).toEqual([]);
  });
});

describe('expandOrnament — the -1 fill sentinel (rule 3)', () => {
  it('fills the budget with whole passes: S=3, G=2, budget 10 → 3 extra passes, 9 slots', () => {
    // extra = floor((10 − 3) / 2) = 3, so the group is played 4 times: 1 + 4·2 = 9 ≤ 10, and
    // one more pass (11) would not fit.
    const result = run('#msm |: #up #dn :|', { repetitions: -1, frameNoteBudget: 10 });
    expect(pitches(result)).toEqual([67, 61, 59, 61, 59, 61, 59, 61, 59]);
  });

  it.each([
    { budget: 2, expected: 2 }, // floor((2−2)/2) = 0 extra passes
    { budget: 3, expected: 2 }, // a partial pass never fits
    { budget: 4, expected: 4 },
    { budget: 9, expected: 8 },
    { budget: 1000, expected: 1000 },
  ])(
    'a lone group of 2 slots fills a budget of $budget with $expected slots',
    ({ budget, expected }) => {
      const result = run('|: #up #dn :|', { repetitions: -1, frameNoteBudget: budget });
      expect(ok(result).slots).toHaveLength(expected);
    },
  );

  it('never shrinks the authored sequence when the budget is too small', () => {
    const result = run('#msm #abs |: #up :|', { repetitions: -1, frameNoteBudget: 1 });
    expect(pitches(result)).toEqual([67, 64, 61]);
  });

  it('spends the budget on every slot, repeated or not', () => {
    // S = 4, G = 2. Budget 6 buys exactly one extra pass (4 + 2 = 6 ≤ 6); budget 7 buys no
    // more, because a second pass would need 8. On this path the reference's append-while-it-
    // fits loop computes the same counts — it is the `repetitions >= 0` path where it differs.
    const order = '#msm #abs |: #up #dn :|';
    expect(pitches(run(order, { repetitions: -1, frameNoteBudget: 6 }))).toEqual([
      67, 64, 61, 59, 61, 59,
    ]);
    expect(ok(run(order, { repetitions: -1, frameNoteBudget: 7 })).slots).toHaveLength(6);
  });
});

describe('expandOrnament — landing (rule 4)', () => {
  it('appends a landing copy when the group opens on the principal pitch', () => {
    const result = run('|: #P #up :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([60, 61, 60, 61, 60]);
    expect(landings(result)).toEqual([false, false, false, false, true]);
  });

  it('fires on a pool unison too — the reference implementation\'s intm=="0.0hs" case', () => {
    const result = run('|: #uni #up :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([60, 61, 60, 61, 60]);
    expect(ok(result).slots[4].notes[0]).toEqual({
      ref: 'uni',
      midiPitch: 60,
      source: 'pool',
      landing: true,
    });
  });

  it('fires with repetitions 0 as well — a group is a group', () => {
    const result = run('|: #P #up :|');
    expect(pitches(result)).toEqual([60, 61, 60]);
    expect(landings(result)).toEqual([false, false, true]);
  });

  it('does not fire when the group opens on any other pitch', () => {
    const result = run('|: #up #P :|', { repetitions: 1 });
    expect(landings(result)).toEqual([false, false, false, false]);
  });

  it('does not fire on a chord, even one containing the principal pitch', () => {
    const result = run('|: [ #P #up ] #dn :|', { repetitions: 1 });
    expect(chords(result)).toEqual([[60, 61], [59], [60, 61], [59]]);
  });

  it('cannot fire without a principal', () => {
    const result = run('|: #abs :|', { principal: null, repetitions: 1 });
    expect(pitches(result)).toEqual([64, 64]);
    expect(landings(result)).toEqual([false, false]);
  });

  it('lands behind its own group, not at the end of the sequence', () => {
    // Two groups, both opening on the principal pitch: each gets its own landing copy, and the
    // tail after the first group is not disturbed.
    const result = run('|: #P #up :| #msm |: #P #dn :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([60, 61, 60, 61, 60, 67, 60, 59, 60, 59, 60]);
    expect(landings(result)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('expandOrnament — dedup (rule 5)', () => {
  it('collapses consecutive equal single notes', () => {
    expect(pitches(run('#P #P #up #up #up #dn'))).toEqual([60, 61, 59]);
  });

  it('never collapses chords, not even two identical ones', () => {
    expect(chords(run('[ #up #dn ] [ #up #dn ]'))).toEqual([
      [61, 59],
      [61, 59],
    ]);
  });

  it('never collapses a chord against a single note of the same pitch', () => {
    expect(chords(run('[ #P #up ] #P'))).toEqual([[60, 61], [60]]);
  });

  it('leaves an all-one-pitch sequence alone, so a tremolo survives', () => {
    expect(pitches(run('#P #P #P #P'))).toEqual([60, 60, 60, 60]);
  });

  it('preserves a tremolo written with distinct ids at the same pitch', () => {
    expect(pitches(run('#uni #P #uni'))).toEqual([60, 60, 60]);
  });

  it('drops the tremolo exception as soon as one slot differs', () => {
    expect(pitches(run('#P #P #up'))).toEqual([60, 61]);
  });

  it('collapses a one-note repeat group that sits inside a longer figure', () => {
    // The exception asks about the whole sequence, not about the group: #up repeated four
    // times is four identical slots, but #msm makes the sequence polyphonic, so the run
    // sanitizes down to a single #up — the reference's "redundant" case exactly.
    expect(pitches(run('#msm |: #up :|', { repetitions: 3 }))).toEqual([67, 61]);
    // Alone, the same group is a tremolo and survives whole.
    expect(pitches(run('|: #up :|', { repetitions: 3 }))).toEqual([61, 61, 61, 61]);
  });

  it('drops a landing note that duplicates its predecessor (landing runs first)', () => {
    // '#up |: #P :|' with one extra pass expands to up P P, the landing rule appends P — and
    // dedup then collapses the three principal-pitch slots into one.
    const result = run('#up |: #P :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([61, 60]);
    expect(landings(result)).toEqual([false, false]);
  });

  it('keeps a landing note that survives dedup, flag and all', () => {
    const result = run('|: #P #up :|');
    expect(landings(result)).toEqual([false, false, true]);
  });

  it('leaves a single-pitch group with its landing note untouched (tremolo exception wins)', () => {
    // '|: #P :|' ×2 plus the landing copy is P P P — every slot the same single pitch, so the
    // tremolo exception applies and nothing collapses, landing note included.
    const result = run('|: #P :|', { repetitions: 1 });
    expect(pitches(result)).toEqual([60, 60, 60]);
    expect(landings(result)).toEqual([false, false, true]);
  });
});

describe('expandOrnament — the standard ornament dictionary', () => {
  // The reference ships these as diatonic step sequences in `ornaments.dict`. Principal C4,
  // (60) in C major, so a step of +1 is D (62) and −1 is B (59). Each row states the dict's
  // own token string; `order` is that string with the steps bound to pool ids.
  const DICT = [
    {
      name: 'trill "|: 0 1 :|", one extra pass',
      order: '|: #d0 #d1 :|',
      repetitions: 1,
      // 60 62 60 62, then the landing copy (the group opens on the principal pitch) → 60.
      expected: [60, 62, 60, 62, 60],
    },
    {
      name: 'upper turn "1 0 -1 0"',
      order: '#d1 #d0 #dm1 #d0',
      repetitions: 0,
      expected: [62, 60, 59, 60],
    },
    {
      name: 'lower turn "-1 0 1 0"',
      order: '#dm1 #d0 #d1 #d0',
      repetitions: 0,
      expected: [59, 60, 62, 60],
    },
    { name: 'upper mordent "0 1 0"', order: '#d0 #d1 #d0', repetitions: 0, expected: [60, 62, 60] },
    {
      name: 'lower mordent "0 -1 0"',
      order: '#d0 #dm1 #d0',
      repetitions: 0,
      expected: [60, 59, 60],
    },
    {
      name: 'trill with mordent "|: 0 1 :| 0 -1 0"',
      order: '|: #d0 #d1 :| #d0 #dm1 #d0',
      repetitions: 1,
      // Expansion 60 62 60 62, landing 60, tail 60 59 60 → eight slots with a 60 60 pair,
      // which is exactly the "might add doubles -> need to sanitize" case: dedup → seven.
      expected: [60, 62, 60, 62, 60, 59, 60],
    },
    {
      name: 'double cadence lower prefix "-1 0 |: 1 0 :|"',
      order: '#dm1 #d0 |: #d1 #d0 :|',
      repetitions: 1,
      // The group opens on 62, not the principal pitch, so no landing copy is appended.
      expected: [59, 60, 62, 60, 62, 60],
    },
  ];

  it.each(DICT)('$name', ({ order, repetitions, expected }) => {
    expect(pitches(run(order, { repetitions }))).toEqual(expected);
  });
});

describe('expandOrnament — unrenderable inputs (ok: false)', () => {
  it.each([
    { name: 'a fractional count', repetitions: 2.5 },
    { name: 'a count below the sentinel', repetitions: -2 },
    { name: 'NaN', repetitions: Number.NaN },
    { name: 'Infinity', repetitions: Number.POSITIVE_INFINITY },
  ])('rejects $name for repetitions', ({ repetitions }) => {
    const result = failed(run('|: #up #P :|', { repetitions }));
    expect(result.reason).toBe(
      `repetitions must be a non-negative integer or the -1 fill sentinel; got ${repetitions}.`,
    );
  });

  it('rejects an empty note.order', () => {
    expect(failed(expandOrnament({ ...BASE, order: list([]) })).reason).toBe(
      'note.order lists no notes.',
    );
  });

  it.each([
    { name: 'no budget at all', frameNoteBudget: null, shown: 'null' },
    { name: 'a budget of zero', frameNoteBudget: 0, shown: '0' },
    { name: 'a negative budget', frameNoteBudget: -4, shown: '-4' },
    { name: 'a fractional budget', frameNoteBudget: 2.5, shown: '2.5' },
  ])('rejects the -1 sentinel with $name', ({ frameNoteBudget, shown }) => {
    const result = failed(run('|: #up :|', { repetitions: -1, frameNoteBudget }));
    expect(result.reason).toBe(
      `repetitions="-1" needs a frame note budget of at least 1 slot; got ${shown}.`,
    );
  });

  it('rejects the -1 sentinel when note.order has no repeat group', () => {
    const result = failed(run('#up #dn', { repetitions: -1, frameNoteBudget: 10 }));
    expect(result.reason).toBe('repetitions="-1" fills a repeat group, but note.order has none.');
  });

  it('rejects the -1 sentinel when the only group lost all its slots', () => {
    const result = failed(run('#up |: #ghost :|', { repetitions: -1, frameNoteBudget: 10 }));
    expect(result.reason).toBe('repetitions="-1" fills a repeat group, but note.order has none.');
  });

  it('refuses to allocate past MAX_EXPANDED_SLOTS instead of dying like the reference', () => {
    const result = failed(run('|: #up #dn :|', { repetitions: 1_000_000_000 }));
    expect(result.reason).toBe(
      `expansion would exceed ${MAX_EXPANDED_SLOTS} slots (2 authored, 1000000000 extra ` +
        `pass(es) over 2 grouped slot(s)).`,
    );
  });

  it('refuses an oversized fill budget too', () => {
    const result = failed(
      run('|: #up #dn :|', { repetitions: -1, frameNoteBudget: MAX_EXPANDED_SLOTS + 2 }),
    );
    expect(result.reason).toMatch(/^expansion would exceed 1000000 slots/);
  });

  it('carries the warnings collected before the fatal', () => {
    const result = failed(run('#ghost |: #up :|', { repetitions: -1, frameNoteBudget: 0 }));
    expect(result.warnings).toEqual([
      'ornament expansion: note.order references "ghost", which is neither a pool note nor the ' +
        'principal note nor a known MSM note; dropped.',
      'ornament expansion: note.order item 0 lost all of its references; slot dropped.',
    ]);
  });
});

describe('expandOrnament — properties', () => {
  /** Distinct pool pitches, so that nothing the property tests build can be deduped away. */
  const DISTINCT: ReadonlyMap<string, PitchSpec> = new Map(
    Array.from({ length: 12 }, (_value, index) => [
      `p${index}`,
      { kind: 'midi', value: 40 + index } as PitchSpec,
    ]),
  );
  const ids = (count: number, offset = 0) =>
    Array.from({ length: count }, (_value, index) => [`p${offset + index}`]);

  it.each([0, 1, 2, 3, 7])(
    'expands k groups to S + repetitions·G slots (repetitions = %i)',
    (repetitions) => {
      // Layout: p0 | group(p1 p2) | p3 | group(p4 p5 p6) | p7 — S = 8, G = 2 + 3 = 5. Every
      // pitch differs, and no group opens on the principal pitch, so neither landing nor dedup
      // can touch the count.
      const order = list(ids(8), [
        { start: 1, end: 2 },
        { start: 4, end: 6 },
      ]);
      const result = ok(expandOrnament({ ...BASE, order, pool: DISTINCT, repetitions }));
      expect(result.slots).toHaveLength(8 + repetitions * 5);
    },
  );

  it.each([1, 2, 5, 40])('never dedups %i identical chord slots', (count) => {
    const order = list(Array.from({ length: count }, () => ['p0', 'p1']));
    const result = ok(expandOrnament({ ...BASE, order, pool: DISTINCT }));
    expect(result.slots).toHaveLength(count);
    expect(result.slots.every((slot: Slot) => slot.notes.length === 2)).toBe(true);
  });

  it.each([2, 3, 16])('preserves a %i-slot single-pitch tremolo', (count) => {
    const order = list(Array.from({ length: count }, () => ['p0']));
    const result = ok(expandOrnament({ ...BASE, order, pool: DISTINCT }));
    expect(result.slots).toHaveLength(count);
  });

  it('terminates on a pathological fill budget', { timeout: 10_000 }, () => {
    // A million slots is the guard's ceiling: it must be reached, not rejected, and fast.
    const order = list(ids(2), [{ start: 0, end: 1 }]);
    const result = ok(
      expandOrnament({
        ...BASE,
        order,
        pool: DISTINCT,
        repetitions: -1,
        frameNoteBudget: MAX_EXPANDED_SLOTS,
      }),
    );
    expect(result.slots).toHaveLength(MAX_EXPANDED_SLOTS);
    expect(result.slots[MAX_EXPANDED_SLOTS - 1].notes[0].midiPitch).toBe(41);
  });

  it('terminates on a one-slot group filled to the ceiling', { timeout: 10_000 }, () => {
    const order = list([['p0']], [{ start: 0, end: 0 }]);
    const result = ok(
      expandOrnament({
        ...BASE,
        order,
        pool: DISTINCT,
        repetitions: -1,
        frameNoteBudget: MAX_EXPANDED_SLOTS,
      }),
    );
    // S = 1, G = 1 → 999 999 extra passes. Every slot is the same single pitch, so this also
    // walks the tremolo exception over a million slots rather than collapsing them to one.
    expect(result.slots).toHaveLength(MAX_EXPANDED_SLOTS);
  });

  it('is deterministic: the same input expands to the same value twice', () => {
    const input: ExpansionInput = {
      ...BASE,
      order: asList('#msm |: [ #up #dn ] #P :| #abs'),
      repetitions: 3,
    };
    expect(expandOrnament(input)).toEqual(expandOrnament(input));
  });

  it('returns readonly plain data — no XML, no classes, no functions', () => {
    const result = ok(run('|: [ #up #dn ] #P :|', { repetitions: 2 }));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

/**
 * `Slot.repetitionPass` carries the provenance a generated note's `ornament.pass` is stamped
 * from, so a consumer can tell the third turn of a trill from the first.
 */
describe('expandOrnament — repetitionPass (D10 provenance extension)', () => {
  /** Every slot's pass number, `null` where the slot carries none. */
  function passes(result: ExpansionResult): (number | null)[] {
    return ok(result).slots.map((slot) => slot.repetitionPass ?? null);
  }

  it('numbers the passes of a repeat group from 0', () => {
    // "|: #up #P :|" with repetitions 2 plays the group 3 times ⇒ passes 0,0 1,1 2,2
    expect(passes(run('|: #up #P :|', { repetitions: 2 }))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('gives a slot outside every group no pass at all', () => {
    expect(passes(run('#abs #msm'))).toEqual([null, null]);
  });

  it('marks only the grouped slots when a group sits inside a longer order', () => {
    // "#abs |: #up #P :| #msm" with repetitions 1: abs, (up P) pass 0, (up P) pass 1, msm
    expect(passes(run('#abs |: #up #P :| #msm', { repetitions: 1 }))).toEqual([
      null,
      0,
      0,
      1,
      1,
      null,
    ]);
  });

  it('numbers each group independently', () => {
    // two groups, repetitions 1 ⇒ each is played twice and each numbers its own passes from 0
    expect(passes(run('|: #up #P :| |: #dn #P :|', { repetitions: 1 }))).toEqual([
      0, 0, 1, 1, 0, 0, 1, 1,
    ]);
  });

  it('leaves the landing copy without a pass — it follows the passes, it is not one', () => {
    // the group opens on `uni`, a pool unison with the principal, so the landing rule fires
    const result = ok(run('|: #uni #up :|', { repetitions: 1 }));
    expect(result.slots.map((slot) => slot.repetitionPass ?? null)).toEqual([0, 0, 1, 1, null]);
    expect(result.slots[result.slots.length - 1].notes[0].landing).toBe(true);
  });

  it('keeps the surviving slot’s own pass when dedup collapses a repetition', () => {
    // "#abs |: #up :|" with repetitions 1 expands to 64, 61 (pass 0), 61 (pass 1); the two
    // consecutive 61s collapse to the first, so the survivor reports pass 0 — the pass it was
    // emitted in, not the one that was dropped onto it.
    const result = ok(run('#abs |: #up :|', { repetitions: 1 }));
    expect(result.slots.map((slot) => slot.notes[0].midiPitch)).toEqual([64, 61]);
    expect(passes(result)).toEqual([null, 0]);
  });

  it('stays plain readonly data', () => {
    const result = ok(run('|: #up #P :|', { repetitions: 2 }));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
