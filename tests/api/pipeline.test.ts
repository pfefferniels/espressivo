/**
 * The public facade (ARCHITECTURE.md §2): behaviour, field mapping and error policy.
 *
 * Plain-data guarantees (RULE F1/I3) live in `plain-data.test.ts`, the seed and sampling
 * knobs (RULE F7/I5) in `determinism.test.ts`, and byte equivalence with the classic class
 * API in `facade-equivalence.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  VERSION,
  convertMeiToMsmMpm,
  extractPerformanceData,
  listPerformances,
  performMsm,
  performMsmToData,
  renderExpressiveMidi,
  renderMidi,
} from '../../src/api/index.js';
import type { MovementDocuments, PerformanceData, PerformOptions } from '../../src/api/index.js';
import { elementAt } from '../../src/prelude/index.js';
import {
  EmptyDocumentError,
  InvalidOptionError,
  MeicoError,
  MissingNodeError,
  ParseError,
  PerformanceNotFoundError,
} from '../../src/api/errors.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const mei = (name: string) => readFileSync(join(FIXTURES, 'mei', `${name}.mei`), 'utf-8');
const augmented = (name: string) =>
  readFileSync(join(FIXTURES, 'performance-reference', `${name}_augmented.msm`), 'utf-8');
const allMaps = (name: string, ext: 'msm' | 'mpm') =>
  readFileSync(join(FIXTURES, 'all-maps-reference', `${name}.${ext}`), 'utf-8');

/**
 * W6's spec-derived MPM v3 documents, read where they live. They are the integration suite's
 * fixtures and stay its fixtures — the tick and millisecond arithmetic is asserted there, by
 * hand; what this file asks of them is only that the facade reports what the augmented MSM
 * says.
 */
const V3_FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'integration',
  'fixtures-v3',
);
const v3 = (name: string) => ({
  msm: readFileSync(join(V3_FIXTURES, `${name}.msm`), 'utf-8'),
  mpm: readFileSync(join(V3_FIXTURES, `${name}.mpm`), 'utf-8'),
});

/**
 * Rewrite the `meico_<uuid>` ids a v3 render draws for its generated notes to `generated-N` by
 * first occurrence, so two renders of one document can be compared.
 *
 * Those ids are the only thing that differs between two renders of an ornamented document
 * (nothing in the v3 path draws a random *value*), and canonicalising them is the convention
 * `ornamentation-v3.test.ts` already established for exactly this comparison.
 */
function canonicaliseGeneratedIds(xml: string): string {
  const seen = new Map<string, string>();
  return xml.replace(/meico_[0-9a-f-]{36}/g, (id) => {
    if (!seen.has(id)) seen.set(id, `generated-${seen.size + 1}`);
    return seen.get(id)!;
  });
}

/**
 * An MSM built by hand, so the error paths can be reached with exactly one thing wrong.
 * `notes` goes verbatim into `<part><dated><score>`.
 */
function msmWith(notes: string, maps = ''): string {
  return (
    `<msm title="Hand Built" pulsesPerQuarter="720"><global><header /><dated /></global>` +
    `<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated>` +
    `<score>${notes}</score>${maps}</dated></part></msm>`
  );
}

/** One performed note, enough to get past RULE E3's "was this MSM performed at all" test. */
const ONE_NOTE =
  '<note xml:id="n1" date="0.0" midi.pitch="60.0" duration="720.0" ' +
  'milliseconds.date="0.0" milliseconds.date.end="720.0" velocity="64.0" />';

/**
 * The movement at `index` of a conversion, checked.
 *
 * Nearly every test here converts a single-mdiv fixture and reads movement 0. Written as
 * `convertMeiToMsmMpm(...)[0].msm` a conversion that returned nothing failed as "cannot read
 * properties of undefined" inside whichever assertion happened to touch it first; this fails at
 * the read, saying how many movements there actually were.
 */
const movementAt = (movements: readonly MovementDocuments[], index = 0): MovementDocuments =>
  elementAt(movements, index, 'the converted movement list');

/** Part `index` of a performance's data, checked. Every fixture read here is single-part. */
const partAt = (data: PerformanceData, index = 0) =>
  elementAt(data.parts, index, 'the performance’s part list');

describe('facade: convertMeiToMsmMpm', () => {
  it('returns one index-aligned MSM+MPM pair per mdiv, as text', () => {
    const movements = convertMeiToMsmMpm(mei('simple_notes'));

    expect(movements).toHaveLength(1);
    const only = movementAt(movements);
    expect(only.index).toBe(0);
    expect(only.title).toBe('Simple Notes Test');
    expect(only.msm.startsWith('<msm ')).toBe(true);
    expect(only.mpm.startsWith('<mpm ')).toBe(true);
  });

  it('serializes without an XML declaration (RULE F2a)', () => {
    // The declaration-free form is what the equivalence fixtures are compared as; the two
    // other spellings in the tree (`Document.toXML`, the Java fixtures) both add one.
    const only = movementAt(convertMeiToMsmMpm(mei('simple_notes')));
    expect(only.msm).not.toContain('<?xml');
    expect(only.mpm).not.toContain('<?xml');
  });

  it('honours ppq as a floor', () => {
    expect(movementAt(convertMeiToMsmMpm(mei('simple_notes'), { ppq: 480 })).msm).toContain(
      'pulsesPerQuarter="480"',
    );
    // …but raises it where the source needs a finer grid than the floor allows.
    expect(movementAt(convertMeiToMsmMpm(mei('tuplets'), { ppq: 1 })).msm).not.toContain(
      'pulsesPerQuarter="1"',
    );
  });

  it('sets both the relatedResource URI and the comment text from sourceName (§8.4)', () => {
    const withName = movementAt(
      convertMeiToMsmMpm(mei('dynamics'), { sourceName: 'dynamics.mei' }),
    ).mpm;
    expect(withName).toContain('uri="dynamics.mei"');
    expect(withName).toContain('uri="dynamics.msm"');
    expect(withName).toContain("generated from 'dynamics.mei' using the meico MEI converter");

    const withoutName = movementAt(convertMeiToMsmMpm(mei('dynamics'))).mpm;
    expect(withoutName).not.toContain('uri=');
    expect(withoutName).toContain('generated from MEI code using the meico MEI converter');
  });

  it('threads ignoreExpansions and cleanup through to the converter', () => {
    const expanded = movementAt(convertMeiToMsmMpm(mei('repeats_endings'))).msm;
    const asWritten = movementAt(
      convertMeiToMsmMpm(mei('repeats_endings'), { ignoreExpansions: true }),
    ).msm;
    expect(asWritten).not.toBe(expanded);

    const cleaned = movementAt(convertMeiToMsmMpm(mei('ties_dots'))).msm;
    const uncleaned = movementAt(convertMeiToMsmMpm(mei('ties_dots'), { cleanup: false })).msm;
    expect(uncleaned.length).toBeGreaterThan(cleaned.length);
  });

  it('rejects nonsense options before parsing anything', () => {
    expect(() => convertMeiToMsmMpm(mei('simple_notes'), { ppq: 0 })).toThrow(InvalidOptionError);
    expect(() => convertMeiToMsmMpm(mei('simple_notes'), { ppq: -720 })).toThrow(
      InvalidOptionError,
    );
    expect(() => convertMeiToMsmMpm(mei('simple_notes'), { ppq: 720.5 })).toThrow(
      InvalidOptionError,
    );
    expect(() => convertMeiToMsmMpm(mei('simple_notes'), { sourceName: '  ' })).toThrow(
      InvalidOptionError,
    );
  });

  it('rejects input that is not a well-formed MEI document', () => {
    expect(() => convertMeiToMsmMpm('')).toThrow(ParseError);
    expect(() => convertMeiToMsmMpm('not xml at all')).toThrow(ParseError);
    expect(() => convertMeiToMsmMpm('<mei><unclosed></mei>')).toThrow(ParseError);
    expect(() => convertMeiToMsmMpm(allMaps('movement', 'msm'))).toThrow(ParseError);
  });

  it('throws rather than returning an empty list when there is nothing to convert', () => {
    expect(() => convertMeiToMsmMpm('<mei><music><body /></music></mei>')).toThrow(
      EmptyDocumentError,
    );
  });
});

describe('facade: listPerformances', () => {
  it('reports the performances an MPM offers', () => {
    const movement = movementAt(convertMeiToMsmMpm(mei('simple_notes')));
    expect(listPerformances(movement.mpm)).toEqual([
      { index: 0, name: 'MEI export performance', ppq: 720 },
    ]);
  });

  it('rejects a document that is not an MPM', () => {
    expect(() => listPerformances(allMaps('movement', 'msm'))).toThrow(ParseError);
  });
});

describe('facade: performMsm', () => {
  const movement = () => movementAt(convertMeiToMsmMpm(mei('dynamics')));

  it('augments the MSM with performance attributes', () => {
    const result = performMsm(movement());
    expect(result).toContain('milliseconds.date=');
    expect(result).toContain('velocity=');
    expect(result).not.toContain('<?xml');
  });

  it('does not mutate its input — the input is text (RULE I3a)', () => {
    const input = movement();
    const before = input.msm;
    performMsm(input);
    expect(input.msm).toBe(before);
  });

  it('selects the performance by name or by index', () => {
    const input = movement();
    const byDefault = performMsm(input);
    expect(performMsm(input, { performance: 0 })).toBe(byDefault);
    expect(performMsm(input, { performance: 'MEI export performance' })).toBe(byDefault);
  });

  it('throws when the requested performance is absent', () => {
    const input = movement();
    expect(() => performMsm(input, { performance: 1 })).toThrow(PerformanceNotFoundError);
    expect(() => performMsm(input, { performance: 'no such performance' })).toThrow(
      PerformanceNotFoundError,
    );
  });

  it('separates an out-of-domain index from an absent one', () => {
    const input = movement();
    expect(() => performMsm(input, { performance: -1 })).toThrow(InvalidOptionError);
    expect(() => performMsm(input, { performance: 1.5 })).toThrow(InvalidOptionError);
  });

  it('rejects out-of-domain render options', () => {
    const input = movement();
    expect(() => performMsm(input, { seed: Number.NaN })).toThrow(InvalidOptionError);
    expect(() => performMsm(input, { seed: Number.POSITIVE_INFINITY })).toThrow(InvalidOptionError);
    // A non-positive step never terminates the movement subdivision in the interior.
    expect(() => performMsm(input, { movementSampleMaxStep: 0 })).toThrow(InvalidOptionError);
    expect(() => performMsm(input, { movementSampleMaxStep: -0.1 })).toThrow(InvalidOptionError);
  });

  it('rejects the two documents swapped', () => {
    const input = movement();
    expect(() => performMsm({ msm: input.mpm, mpm: input.msm })).toThrow(ParseError);
  });
});

describe('facade: extractPerformanceData (§2.3 field mapping)', () => {
  /**
   * Reads the fixture's `<note>` attributes independently of the facade's own reader.
   *
   * `ornamented` is derived by a **prefix probe** where the facade uses a closed list of
   * attribute names, deliberately: the two agree only while that list stays complete, so a
   * marker the renderer starts writing and the facade does not know about fails this
   * comparison on any fixture that produces it. `ornamented`'s contract is "carries at least
   * one `ornament.*` attribute", and the regex is that contract asked directly.
   */
  function notesFromXml(xml: string) {
    return [...xml.matchAll(/<note\s[^>]*\/>/g)].map((m) => {
      const attr = (name: string) =>
        new RegExp(`(?:^|\\s)${name.replace(/\./g, '\\.')}="([^"]*)"`).exec(m[0])?.[1];
      const num = (name: string) => {
        const raw = attr(name);
        return raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
      };
      return {
        id: attr('xml:id') ?? null,
        pitch: Number(attr('midi.pitch')),
        date: Number(attr('date')),
        duration: Number(attr('duration')),
        velocity: Number(attr('velocity')),
        milliseconds: {
          date: Number(attr('milliseconds.date')),
          end: Number(attr('milliseconds.date.end')),
        },
        ornamented: /(?:^|\s)ornament\.[a-z.]+=/.test(m[0]),
        ornamentRef: attr('ornament.ref') ?? null,
        ornamentSource: attr('ornament.source') ?? null,
        ornamentSlot: num('ornament.slot'),
        ornamentPass: num('ornament.pass'),
        ornamentAnchor: attr('ornament.anchor') ?? null,
      };
    });
  }

  it('maps every note field from the augmented MSM', () => {
    const xml = augmented('dynamics');
    const data = extractPerformanceData(xml);

    expect(data.title).toBe('Dynamics Test');
    expect(data.ppq).toBe(720);
    expect(data.parts).toHaveLength(1);
    const part = partAt(data);
    expect(part).toMatchObject({ index: 0, name: '', midiChannel: 0, midiPort: 0 });

    const expected = notesFromXml(xml);
    expect(expected.length).toBeGreaterThan(0);
    expect(part.notes).toEqual(expected);
  });

  it('reads sub-note dynamics as a channelVolume stream on controller 7', () => {
    const data = extractPerformanceData(augmented('dynamics'));
    const volume = partAt(data).controlChanges.find((s) => s.kind === 'channelVolume');

    expect(volume).toBeDefined();
    if (volume === undefined) throw new Error('no channelVolume stream in the dynamics fixture');
    expect(volume.controller).toBeNull();
    expect(volume.ccNumber).toBe(7);
    expect(volume.points.length).toBeGreaterThan(0);
    for (const point of volume.points) {
      expect(Number.isFinite(point.date)).toBe(true);
      expect(Number.isFinite(point.milliseconds)).toBe(true);
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('reads movement as a position stream, one per controller, with the renderer’s CC number', () => {
    const data = performMsmToData({
      msm: allMaps('movement', 'msm'),
      mpm: allMaps('movement', 'mpm'),
    });
    const streams = data.parts
      .flatMap((p) => p.controlChanges)
      .filter((s) => s.kind === 'position');

    expect(streams.length).toBeGreaterThan(0);
    for (const stream of streams) {
      expect(stream.controller).toBe('sustain');
      expect(stream.ccNumber).toBe(64); // sustain → CC 64, as Msm.parsePositionMap maps it
      expect(stream.points.length).toBeGreaterThan(1);
    }

    // The MSM's own values, unrounded and unthinned: the facade reports the data, the MIDI
    // renderer is what rounds and applies CONTROL_CHANGE_DENSITY.
    const xml = performMsm({ msm: allMaps('movement', 'msm'), mpm: allMaps('movement', 'mpm') });
    const inXml = [...xml.matchAll(/<position\s[^>]*\/>/g)].length;
    expect(streams.reduce((n, s) => n + s.points.length, 0)).toBe(inXml);
  });

  it('splits a mixed positionMap into one stream per controller, with the right CC numbers', () => {
    // No fixture mixes controllers — they are all `sustain` — so this is where the two
    // readings §2 leaves open get pinned: one stream per distinct `controller` in
    // first-appearance order, and `sustain` → 64, `soft` → 67, anything else → 0, exactly as
    // `Msm.parsePositionMap` maps them.
    const mixed = msmWith(
      ONE_NOTE,
      '<positionMap>' +
        '<position date="0.0" value="127.0" controller="sustain" milliseconds.date="0.0" />' +
        '<position date="720.0" value="64.0" controller="soft" milliseconds.date="500.0" />' +
        '<position date="1440.0" value="10.0" controller="portamento" milliseconds.date="900.0" />' +
        '<position date="2160.0" value="20.0" milliseconds.date="1300.0" />' +
        '<position date="2880.0" value="0.0" controller="sustain" milliseconds.date="1700.0" />' +
        '</positionMap>',
    );
    const streams = partAt(extractPerformanceData(mixed)).controlChanges;

    expect(streams.map((s) => [s.kind, s.controller, s.ccNumber, s.points.length])).toEqual([
      ['position', 'sustain', 64, 2],
      ['position', 'soft', 67, 1],
      ['position', 'portamento', 0, 1],
      ['position', null, 0, 1],
    ]);
    // The two `sustain` entries keep document order inside their own stream.
    expect(elementAt(streams, 0, 'the control-change streams').points.map((p) => p.date)).toEqual([
      0, 2880,
    ]);
    // A point with no `milliseconds.date` falls back to `date`, as the interior does.
    const noMs = msmWith(
      ONE_NOTE,
      '<positionMap><position date="360.0" value="1.0" /></positionMap>',
    );
    const onlyStream = elementAt(
      partAt(extractPerformanceData(noMs)).controlChanges,
      0,
      'the control-change streams',
    );
    expect(elementAt(onlyStream.points, 0, 'the stream’s points')).toEqual({
      date: 360,
      milliseconds: 360,
      value: 1,
    });
  });

  it('emits no stream for a map with no entries', () => {
    const data = performMsmToData({
      msm: allMaps('all_maps', 'msm'),
      mpm: allMaps('all_maps', 'mpm'),
    });
    // all_maps renders an empty `<positionMap />`, which must not become an empty stream.
    expect(
      performMsm({ msm: allMaps('all_maps', 'msm'), mpm: allMaps('all_maps', 'mpm') }),
    ).toContain('<positionMap />');
    expect(data.parts.flatMap((p) => p.controlChanges).some((s) => s.kind === 'position')).toBe(
      false,
    );
  });

  it('throws on an MSM nobody performed (RULE E3)', () => {
    expect(() => extractPerformanceData(allMaps('movement', 'msm'))).toThrow(EmptyDocumentError);
    expect(() => extractPerformanceData(allMaps('movement', 'msm'))).toThrow(
      /carries no performance attributes/,
    );
  });

  it('reports a note missing a required attribute rather than emitting NaN', () => {
    const noDate = msmWith(
      '<note xml:id="n1" midi.pitch="60.0" duration="720.0" ' +
        'milliseconds.date="0.0" milliseconds.date.end="720.0" velocity="64.0" />',
    );
    expect(() => extractPerformanceData(noDate)).toThrow(MissingNodeError);

    const badDate = msmWith(
      '<note xml:id="n1" date="abc" midi.pitch="60.0" duration="720.0" ' +
        'milliseconds.date="0.0" milliseconds.date.end="720.0" velocity="64.0" />',
    );
    expect(() => extractPerformanceData(badDate)).toThrow(ParseError);
  });

  it('falls back exactly as the interior does for a partially performed note', () => {
    // RULE E3: report what the interior produced, do not repair it. `milliseconds.date`
    // falls back to `date`, its end to date + duration, and velocity to 100 —
    // `Msm.readMillisecondsDateFromElement` and `Msm.processScore` do the same.
    const partial = msmWith(
      '<note xml:id="n1" date="0.0" midi.pitch="60.0" duration="720.0" ' +
        'milliseconds.date="0.0" milliseconds.date.end="500.0" velocity="64.0" />' +
        '<note xml:id="n2" date="720.0" midi.pitch="62.0" duration="360.0" />',
    );
    const partialNotes = partAt(extractPerformanceData(partial)).notes;
    const first = elementAt(partialNotes, 0, 'the part’s note list');
    const second = elementAt(partialNotes, 1, 'the part’s note list');

    // The ornamentation sextet on a document with no ornamentation map at all: `false` and
    // five nulls, spelled out rather than matched loosely, because RULE N4's whole point is
    // that absence is a present field holding null (D15).
    const unornamented = {
      ornamented: false,
      ornamentRef: null,
      ornamentSource: null,
      ornamentSlot: null,
      ornamentPass: null,
      ornamentAnchor: null,
    };

    expect(first).toEqual({
      id: 'n1',
      pitch: 60,
      date: 0,
      duration: 720,
      velocity: 64,
      milliseconds: { date: 0, end: 500 },
      ...unornamented,
    });
    expect(second).toEqual({
      id: 'n2',
      pitch: 62,
      date: 720,
      duration: 360,
      velocity: 100,
      milliseconds: { date: 720, end: 1080 },
      ...unornamented,
    });
  });

  it('reports a note without an xml:id as null rather than dropping the field', () => {
    const anonymous = msmWith(
      '<note date="0.0" midi.pitch="60.0" duration="720.0" milliseconds.date="0.0" />',
    );
    const note = elementAt(
      partAt(extractPerformanceData(anonymous)).notes,
      0,
      'the part’s note list',
    );
    expect(note.id).toBeNull();
    expect('id' in note).toBe(true);
  });
});

describe('facade: performMsmToData', () => {
  it('equals extractPerformanceData(performMsm(...)) — one parse, same value', () => {
    const input = { msm: allMaps('rubato', 'msm'), mpm: allMaps('rubato', 'mpm') };
    expect(performMsmToData(input)).toEqual(extractPerformanceData(performMsm(input)));
  });

  it('carries the per-note fields the batch consumer asked for', () => {
    const data = performMsmToData({
      msm: allMaps('asynchrony', 'msm'),
      mpm: allMaps('asynchrony', 'mpm'),
    });
    const notes = data.parts.flatMap((p) => p.notes);

    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(Object.keys(note).sort()).toEqual([
        'date',
        'duration',
        'id',
        'milliseconds',
        'ornamentAnchor',
        'ornamentPass',
        'ornamentRef',
        'ornamentSlot',
        'ornamentSource',
        'ornamented',
        'pitch',
        'velocity',
      ]);
      expect(Object.keys(note.milliseconds).sort()).toEqual(['date', 'end']);
      expect(Number.isFinite(note.milliseconds.date)).toBe(true);
      expect(Number.isFinite(note.milliseconds.end)).toBe(true);
    }
  });
});

/**
 * The ornamentation provenance sextet (DESIGN.md D15, widened by the D10 provenance extension
 * and the `ornament.anchor` addendum), as the two ML stakeholders consume it.
 *
 * Nothing here re-derives the renderer's arithmetic — `ornamentation-v3.test.ts` owns that,
 * with the numbers computed by hand. What these cases pin is the *mapping*: which MSM
 * attribute becomes which field, what absence looks like (RULE N4: a present field holding
 * null, never a missing one), and the one semantic judgement the facade makes on its own —
 * what `ornamented` counts as evidence.
 */
describe('facade: ornamentation provenance (D15)', () => {
  /** Every note of every part, which is the flat list the D15 consumers work from. */
  const notesOf = (input: { msm: string; mpm: string }, options?: PerformOptions) =>
    performMsmToData(input, options).parts.flatMap((p) => p.notes);

  it('stamps the full sextet on every note a v3 ornament generated', () => {
    // `turn-atstart`: principal `P` (pitch 64, date 0, dur 1440), pool n2 = +1, n3 = −1, and
    // note.order "#n2 #P #n3 #P" — four tokens, no repeat group, so four slots numbered 0..3
    // whose sources are exactly those four tokens in order and whose pass is null throughout.
    // The ornament carries xml:id="orn1", so every generated note refs it; every one anchors
    // on "P", the id the principal had before the ornament replaced it.
    const notes = notesOf(v3('turn-atstart'));
    const generated = notes.filter((n) => n.ornamented);

    expect(generated).toHaveLength(4);
    expect(
      generated.map((n) => [
        n.ornamentRef,
        n.ornamentSource,
        n.ornamentSlot,
        n.ornamentPass,
        n.ornamentAnchor,
      ]),
    ).toEqual([
      ['orn1', 'n2', 0, null, 'P'],
      ['orn1', 'P', 1, null, 'P'],
      ['orn1', 'n3', 2, null, 'P'],
      ['orn1', 'P', 3, null, 'P'],
    ]);

    // The two notes the ornament never named come through untouched: false and five nulls.
    const untouched = notes.filter((n) => !n.ornamented);
    expect(untouched.map((n) => n.id)).toEqual(['q', 'r']);
    for (const note of untouched)
      expect(note).toMatchObject({
        ornamented: false,
        ornamentRef: null,
        ornamentSource: null,
        ornamentSlot: null,
        ornamentPass: null,
        ornamentAnchor: null,
      });
  });

  it('reports the repetition pass, which is what separates two notes of the same source', () => {
    // `trill-repetitions`: note.order "|: #n1 #P :|" with repetitions="3" — the group is
    // played 4× (3 EXTRA passes), so 8 slots numbered 0..7, sources alternating n1/P, and
    // passes 0,0,1,1,2,2,3,3. Without `ornamentPass` the eight notes would carry only two
    // distinct sources between them, which is the join the stakeholders asked to be widened.
    const generated = notesOf(v3('trill-repetitions')).filter((n) => n.ornamented);

    expect(generated.map((n) => n.ornamentSlot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(generated.map((n) => n.ornamentSource)).toEqual([
      'n1',
      'P',
      'n1',
      'P',
      'n1',
      'P',
      'n1',
      'P',
    ]);
    expect(generated.map((n) => n.ornamentPass)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    for (const note of generated)
      expect(note).toMatchObject({ ornamentRef: 'orn3', ornamentAnchor: 'P' });
  });

  it('marks the carved head leftover ornamented, with ornamentRef and nothing else', () => {
    // `turn-atend` is `turn-atstart` with `alignment="at end"`, and it is the only fixture that
    // produces a **head leftover**: the frame is 50% of the principal's 1440 ticks anchored at
    // its end, so it occupies [720, 1440] and the principal survives, shortened to the 720
    // ticks in front of it — halved by the ornament, and still carrying its own id `P`.
    //
    // The ruling (D10/D15, LOG.md 2026-08-09): that note is altered, so it is `ornamented`, and
    // the renderer marks it `ornament.carved="true"` + `ornament.ref`. It gets no source, slot
    // or pass — it is not part of the expansion — and no anchor, because it *is* the anchor.
    const input = v3('turn-atend');
    const notes = notesOf(input);
    const head = notes.find((n) => n.id === 'P');

    // The alteration itself, measured rather than assumed: 1440 unexpanded, 720 expanded.
    expect(notesOf(input, { expandOrnaments: false }).find((n) => n.id === 'P')?.duration).toBe(
      1440,
    );
    expect(head?.duration).toBe(720);

    expect(head).toMatchObject({
      ornamented: true,
      ornamentRef: 'orn2',
      ornamentSource: null,
      ornamentSlot: null,
      ornamentPass: null,
      ornamentAnchor: null,
    });

    // The four generated notes keep the shape the sextet has everywhere else. `P` survives, so
    // D10 hands its id to nobody: every generated note here carries a fresh `meico_` id.
    const generated = notes.filter((n) => n.ornamentSlot !== null);
    expect(generated).toHaveLength(4);
    expect(
      generated.map((n) => [
        n.ornamented,
        n.ornamentRef,
        n.ornamentSource,
        n.ornamentSlot,
        n.ornamentPass,
        n.ornamentAnchor,
      ]),
    ).toEqual([
      [true, 'orn2', 'n2', 0, null, 'P'],
      [true, 'orn2', 'P', 1, null, 'P'],
      [true, 'orn2', 'n3', 2, null, 'P'],
      [true, 'orn2', 'P', 3, null, 'P'],
    ]);
    for (const note of generated) expect(note.id).toMatch(/^meico_[0-9a-f-]{36}$/);

    // And the notes the ornament never reached are still untouched, so `ornamented` has not
    // simply become true everywhere.
    expect(notes.filter((n) => !n.ornamented).map((n) => n.id)).toEqual(['q', 'r']);
  });

  it('marks a carved head whose ornament has no xml:id, where only ornament.carved says so', () => {
    // The case above does not actually test `ornament.carved`: the renderer co-writes
    // `ornament.ref` there, and `ornament.ref` is in the marker list too, so `ornamented` would
    // come out true even if `ornament.carved` were missing from it. (Measured — dropping the
    // name from the list leaves the whole suite green.)
    //
    // `ornament.carved` is load-bearing on exactly one document: an ornament with **no**
    // `xml:id`, where the renderer writes `ornament.carved="true"` and nothing else onto the
    // leftover. That is this case, and it is the negative control for the list entry.
    const { msm, mpm } = v3('turn-atend');
    const anonymous = mpm.replace(' xml:id="orn2"', '');
    // Not vacuous: the id really was there and really is gone.
    expect(anonymous).not.toBe(mpm);
    expect(anonymous).not.toContain('orn2');

    const head = notesOf({ msm, mpm: anonymous }).find((n) => n.id === 'P');

    // Still shortened by the ornament, still reported as ornamented — but now with all six
    // narrowing values absent, because an ornament with no id has no ref to give either.
    expect(head).toMatchObject({
      duration: 720,
      ornamented: true,
      ornamentRef: null,
      ornamentSource: null,
      ornamentSlot: null,
      ornamentPass: null,
      ornamentAnchor: null,
    });
  });

  it('marks a note a v2 ornament merely altered, with the five v3 fields null', () => {
    // The semantics D15 asks for is "generated by OR altered by", and a v2 ornament only ever
    // alters: `v2-passthrough`'s two arpeggios write `ornament.date.offset` and
    // `ornament.dynamics` onto the six notes the score already had, and generate none. So all
    // six are `ornamented` — and all five narrowing fields are null, because a v2 ornament has
    // no pool, no slots and no passes to name.
    const notes = notesOf(v3('v2-passthrough'));

    expect(notes.map((n) => n.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    for (const note of notes)
      expect(note).toMatchObject({
        ornamented: true,
        ornamentRef: null,
        ornamentSource: null,
        ornamentSlot: null,
        ornamentPass: null,
        ornamentAnchor: null,
      });
  });

  it('reads the sextet back out of a serialized MSM identically (extract == perform)', () => {
    // The two readers must not drift: `ornament.*` lives in the augmented MSM as text, so the
    // serialize/re-parse route has to produce the provenance the direct route does. The two
    // renders draw different `meico_<uuid>` ids, so those are canonicalised by first
    // occurrence — and only `id` needs it, because not one of the six is derived from a
    // generated id, which is exactly the property the ML stakeholders key on.
    const input = v3('multi-ornament');
    const canonicalise = (data: PerformanceData) => {
      const seen = new Map<string, string>();
      const canon = (id: string | null) => {
        if (id === null || !id.startsWith('meico_')) return id;
        if (!seen.has(id)) seen.set(id, `generated-${seen.size + 1}`);
        return seen.get(id)!;
      };
      return data.parts.flatMap((part) =>
        part.notes.map((note) => ({ ...note, id: canon(note.id) })),
      );
    };

    const viaText = canonicalise(extractPerformanceData(performMsm(input)));
    expect(viaText).toEqual(canonicalise(performMsmToData(input)));
    expect(viaText.some((n) => n.ornamented)).toBe(true);
    expect(viaText.some((n) => n.id === 'generated-1')).toBe(true);
  });
});

describe('facade: expandOrnaments (D15)', () => {
  it('generates nothing and writes no marker when expansion is off', () => {
    const on = performMsmToData(v3('turn-atstart')).parts.flatMap((p) => p.notes);
    const off = performMsmToData(v3('turn-atstart'), { expandOrnaments: false }).parts.flatMap(
      (p) => p.notes,
    );

    // With expansion on: four generated notes replace the principal, so six notes in all.
    expect(on).toHaveLength(6);
    // With it off the score is the score — the principal and its two neighbours, and not one
    // `ornament.*` attribute anywhere, so no note reports itself ornamented.
    expect(off.map((n) => n.id)).toEqual(['P', 'q', 'r']);
    expect(off.some((n) => n.ornamented)).toBe(false);
    expect(performMsm(v3('turn-atstart'), { expandOrnaments: false })).not.toContain('ornament.');
  });

  it('leaves MPM v2 ornaments alone, whichever way it is set', () => {
    // The flag switches off *expansion*, and a v2 ornament expands nothing — it modifies notes
    // that already exist. Turning it off must therefore not silently strip v2 ornamentation,
    // which would be a different and much larger promise.
    const input = v3('v2-passthrough');
    expect(performMsm(input, { expandOrnaments: false })).toBe(
      performMsm(input, { expandOrnaments: true }),
    );
    expect(performMsm(input, { expandOrnaments: false })).toBe(performMsm(input));
  });

  it('defaults to expanding, so omitting it renders the MPM as written', () => {
    // Compared as whole documents rather than as note counts: that catches a default which
    // expands the right number of notes with the wrong dates. The generated ids differ between
    // renders and are canonicalised away; nothing else in this fixture is random.
    const input = v3('turn-atstart');
    const render = (options?: PerformOptions) =>
      canonicaliseGeneratedIds(performMsm(input, options));

    expect(render({ expandOrnaments: true })).toBe(render());
    expect(render({})).toBe(render());
    expect(render()).toContain('ornament.generated="true"');
  });

  it('rejects a non-boolean rather than coercing it', () => {
    // `0` is the case that matters: coerced it would read as "expand", the opposite of what a
    // caller writing `0` for false meant.
    for (const bad of [0, 1, 'false', null]) {
      expect(() =>
        performMsmToData(v3('turn-atstart'), {
          expandOrnaments: bad as unknown as boolean,
        }),
      ).toThrow(InvalidOptionError);
    }
    expect(() =>
      performMsm(v3('turn-atstart'), { expandOrnaments: 'yes' as unknown as boolean }),
    ).toThrow(/expandOrnaments must be a boolean/);
  });

  it('is rejected with no MPM to apply, exactly as the other PerformOptions fields are', () => {
    expect(() =>
      renderExpressiveMidi({ msm: augmented('dynamics') }, { expandOrnaments: false }),
    ).toThrow(InvalidOptionError);
  });
});

describe('facade: renderMidi / renderExpressiveMidi', () => {
  const movement = () => movementAt(convertMeiToMsmMpm(mei('comprehensive')));

  it('writes a MIDI file as bytes', () => {
    const bytes = renderMidi({ msm: movement().msm });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
  });

  it('honours bpm and generateProgramChanges', () => {
    const input = { msm: movement().msm };
    expect(renderMidi(input, { bpm: 60 })).not.toEqual(renderMidi(input, { bpm: 120 }));
    expect(renderMidi(input, { generateProgramChanges: false })).not.toEqual(
      renderMidi(input, { generateProgramChanges: true }),
    );
    expect(() => renderMidi(input, { bpm: 0 })).toThrow(InvalidOptionError);
    expect(() => renderMidi(input, { bpm: Number.NaN })).toThrow(InvalidOptionError);
  });

  it('renders the performed score when an MPM is given', () => {
    const bytes = renderExpressiveMidi(movement());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
    expect(bytes).not.toEqual(renderMidi({ msm: movement().msm }));
  });

  it('renders an already-augmented MSM with the mpm omitted', () => {
    const bytes = renderExpressiveMidi({ msm: augmented('dynamics') });
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
  });

  it('refuses to render an unperformed MSM as expressive MIDI (§8.4, RULE E3)', () => {
    expect(() => renderExpressiveMidi({ msm: allMaps('movement', 'msm') })).toThrow(
      EmptyDocumentError,
    );
  });

  it('refuses PerformOptions that nothing would act on', () => {
    const msm = augmented('dynamics');
    expect(() => renderExpressiveMidi({ msm }, { seed: 1 })).toThrow(InvalidOptionError);
    expect(() => renderExpressiveMidi({ msm }, { performance: 0 })).toThrow(InvalidOptionError);
    expect(() => renderExpressiveMidi({ msm }, { movementSampleMaxStep: 0.5 })).toThrow(
      InvalidOptionError,
    );
    // …but MidiOptions alone are fine, and so is no options object at all.
    expect(() => renderExpressiveMidi({ msm }, { generateProgramChanges: false })).not.toThrow();
  });
});

describe('facade: error hierarchy (RULE E2)', () => {
  it('roots every facade error in the one MeicoError the interior also throws', () => {
    for (const thrower of [
      () => convertMeiToMsmMpm('nonsense'),
      () => extractPerformanceData(allMaps('movement', 'msm')),
      () =>
        performMsm(
          { msm: allMaps('movement', 'msm'), mpm: allMaps('movement', 'mpm') },
          {
            performance: 99,
          },
        ),
      () => renderMidi({ msm: allMaps('movement', 'msm') }, { bpm: -1 }),
    ]) {
      expect(thrower).toThrow(MeicoError);
    }
  });

  it('re-exports the interior root rather than declaring a second one', async () => {
    // A redeclared `MeicoError` would be invisible to `instanceof` across the boundary.
    const interior = await import('../../src/xml/errors.js');
    expect(MeicoError).toBe(interior.MeicoError);
    expect(MissingNodeError).toBe(interior.MissingNodeError);
    expect(new ParseError('x')).toBeInstanceOf(interior.MeicoError);
  });

  it('never returns null (RULE N4/E2)', () => {
    const movement = movementAt(convertMeiToMsmMpm(mei('simple_notes')));
    expect(performMsm(movement)).not.toBeNull();
    expect(performMsmToData(movement)).not.toBeNull();
    expect(renderMidi({ msm: movement.msm })).not.toBeNull();
    expect(listPerformances(movement.mpm)).not.toBeNull();
  });
});

describe('facade: VERSION', () => {
  it('is the serialization-visible converter version, not package.json’s', () => {
    expect(VERSION).toBe('0.11.2');
    expect(movementAt(convertMeiToMsmMpm(mei('simple_notes'))).mpm).toContain(
      `meico MEI converter v${VERSION}`,
    );
  });
});
