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

describe('facade: convertMeiToMsmMpm', () => {
  it('returns one index-aligned MSM+MPM pair per mdiv, as text', () => {
    const movements = convertMeiToMsmMpm(mei('simple_notes'));

    expect(movements).toHaveLength(1);
    expect(movements[0].index).toBe(0);
    expect(movements[0].title).toBe('Simple Notes Test');
    expect(movements[0].msm.startsWith('<msm ')).toBe(true);
    expect(movements[0].mpm.startsWith('<mpm ')).toBe(true);
  });

  it('serializes without an XML declaration (RULE F2a)', () => {
    // The declaration-free form is what the equivalence fixtures are compared as; the two
    // other spellings in the tree (`Document.toXML`, the Java fixtures) both add one.
    const movements = convertMeiToMsmMpm(mei('simple_notes'));
    expect(movements[0].msm).not.toContain('<?xml');
    expect(movements[0].mpm).not.toContain('<?xml');
  });

  it('honours ppq as a floor', () => {
    expect(convertMeiToMsmMpm(mei('simple_notes'), { ppq: 480 })[0].msm).toContain(
      'pulsesPerQuarter="480"',
    );
    // …but raises it where the source needs a finer grid than the floor allows.
    expect(convertMeiToMsmMpm(mei('tuplets'), { ppq: 1 })[0].msm).not.toContain(
      'pulsesPerQuarter="1"',
    );
  });

  it('sets both the relatedResource URI and the comment text from sourceName (§8.4)', () => {
    const withName = convertMeiToMsmMpm(mei('dynamics'), { sourceName: 'dynamics.mei' })[0].mpm;
    expect(withName).toContain('uri="dynamics.mei"');
    expect(withName).toContain('uri="dynamics.msm"');
    expect(withName).toContain("generated from 'dynamics.mei' using the meico MEI converter");

    const withoutName = convertMeiToMsmMpm(mei('dynamics'))[0].mpm;
    expect(withoutName).not.toContain('uri=');
    expect(withoutName).toContain('generated from MEI code using the meico MEI converter');
  });

  it('threads ignoreExpansions and cleanup through to the converter', () => {
    const expanded = convertMeiToMsmMpm(mei('repeats_endings'))[0].msm;
    const asWritten = convertMeiToMsmMpm(mei('repeats_endings'), { ignoreExpansions: true })[0].msm;
    expect(asWritten).not.toBe(expanded);

    const cleaned = convertMeiToMsmMpm(mei('ties_dots'))[0].msm;
    const uncleaned = convertMeiToMsmMpm(mei('ties_dots'), { cleanup: false })[0].msm;
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
    const [movement] = convertMeiToMsmMpm(mei('simple_notes'));
    expect(listPerformances(movement.mpm)).toEqual([
      { index: 0, name: 'MEI export performance', ppq: 720 },
    ]);
  });

  it('rejects a document that is not an MPM', () => {
    expect(() => listPerformances(allMaps('movement', 'msm'))).toThrow(ParseError);
  });
});

describe('facade: performMsm', () => {
  const movement = () => convertMeiToMsmMpm(mei('dynamics'))[0];

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
  /** Reads the fixture's `<note>` attributes independently of the facade's own reader. */
  function notesFromXml(xml: string) {
    return [...xml.matchAll(/<note\s[^>]*\/>/g)].map((m) => {
      const attr = (name: string) =>
        new RegExp(`(?:^|\\s)${name.replace(/\./g, '\\.')}="([^"]*)"`).exec(m[0])?.[1];
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
      };
    });
  }

  it('maps every note field from the augmented MSM', () => {
    const xml = augmented('dynamics');
    const data = extractPerformanceData(xml);

    expect(data.title).toBe('Dynamics Test');
    expect(data.ppq).toBe(720);
    expect(data.parts).toHaveLength(1);
    expect(data.parts[0]).toMatchObject({ index: 0, name: '', midiChannel: 0, midiPort: 0 });

    const expected = notesFromXml(xml);
    expect(expected.length).toBeGreaterThan(0);
    expect(data.parts[0].notes).toEqual(expected);
  });

  it('reads sub-note dynamics as a channelVolume stream on controller 7', () => {
    const data = extractPerformanceData(augmented('dynamics'));
    const volume = data.parts[0].controlChanges.find((s) => s.kind === 'channelVolume');

    expect(volume).toBeDefined();
    expect(volume!.controller).toBeNull();
    expect(volume!.ccNumber).toBe(7);
    expect(volume!.points.length).toBeGreaterThan(0);
    for (const point of volume!.points) {
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
    const streams = extractPerformanceData(mixed).parts[0].controlChanges;

    expect(streams.map((s) => [s.kind, s.controller, s.ccNumber, s.points.length])).toEqual([
      ['position', 'sustain', 64, 2],
      ['position', 'soft', 67, 1],
      ['position', 'portamento', 0, 1],
      ['position', null, 0, 1],
    ]);
    // The two `sustain` entries keep document order inside their own stream.
    expect(streams[0].points.map((p) => p.date)).toEqual([0, 2880]);
    // A point with no `milliseconds.date` falls back to `date`, as the interior does.
    const noMs = msmWith(
      ONE_NOTE,
      '<positionMap><position date="360.0" value="1.0" /></positionMap>',
    );
    expect(extractPerformanceData(noMs).parts[0].controlChanges[0].points[0]).toEqual({
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
    const [first, second] = extractPerformanceData(partial).parts[0].notes;

    expect(first).toEqual({
      id: 'n1',
      pitch: 60,
      date: 0,
      duration: 720,
      velocity: 64,
      milliseconds: { date: 0, end: 500 },
    });
    expect(second).toEqual({
      id: 'n2',
      pitch: 62,
      date: 720,
      duration: 360,
      velocity: 100,
      milliseconds: { date: 720, end: 1080 },
    });
  });

  it('reports a note without an xml:id as null rather than dropping the field', () => {
    const anonymous = msmWith(
      '<note date="0.0" midi.pitch="60.0" duration="720.0" milliseconds.date="0.0" />',
    );
    const [note] = extractPerformanceData(anonymous).parts[0].notes;
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
        'pitch',
        'velocity',
      ]);
      expect(Object.keys(note.milliseconds).sort()).toEqual(['date', 'end']);
      expect(Number.isFinite(note.milliseconds.date)).toBe(true);
      expect(Number.isFinite(note.milliseconds.end)).toBe(true);
    }
  });
});

describe('facade: renderMidi / renderExpressiveMidi', () => {
  const movement = () => convertMeiToMsmMpm(mei('comprehensive'))[0];

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
    const [movement] = convertMeiToMsmMpm(mei('simple_notes'));
    expect(performMsm(movement)).not.toBeNull();
    expect(performMsmToData(movement)).not.toBeNull();
    expect(renderMidi({ msm: movement.msm })).not.toBeNull();
    expect(listPerformances(movement.mpm)).not.toBeNull();
  });
});

describe('facade: VERSION', () => {
  it('is the serialization-visible converter version, not package.json’s', () => {
    expect(VERSION).toBe('0.11.2');
    expect(convertMeiToMsmMpm(mei('simple_notes'))[0].mpm).toContain(
      `meico MEI converter v${VERSION}`,
    );
  });
});
