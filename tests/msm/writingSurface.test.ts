/**
 * The MSM object model as a *writing* API — the sibling of `tests/mpm/writingSurface.test.ts`,
 * and for the same reason.
 *
 * Every import is from `src/index.js` deliberately: a deep import would pass while the public
 * surface was broken. What this file pins is the part of the surface a consumer cannot check
 * for itself, because MSM has no schema — the attribute order of each element, the `<dated>`
 * child order of each scope, and the fact that a map goes INSIDE `<dated>`. A hand-written MSM
 * that puts `<pedalMap>` beside `<dated>`, or a `<pedal>` with no `@date`, parses, serialises
 * and renders to nothing at all.
 */
import { describe, it, expect } from 'vitest';
import {
  Element,
  MeicoError,
  Msm,
  performMsm,
  type AddNoteOptions,
  type AddPedalOptions,
} from '../../src/index.js';

/** `expect(x).not.toBeNull()` as an expression, so a sample can be used on the next line. */
function present<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`expected ${what}, got null`);
  return value;
}

function localNames(parent: Element): string[] {
  return parent
    .getChildElements()
    .toArray()
    .map((child) => child.getLocalName());
}

function datedOf(scope: Element): Element {
  return present(scope.getFirstChildElement('dated'), '<dated>');
}

/** The §1 minimal document: one global, one part, one time signature, two notes. */
function minimal(): { msm: Msm; part: Element } {
  const msm = Msm.createMsm('Minimal', 'mdiv1', 720);
  const part = Msm.makePart({ name: 'Piano', number: 1, midiChannel: 0, midiPort: 0 });
  msm.addPart(part);
  msm.addTimeSignature(present(msm.getGlobal(), '<global>'), {
    date: 0,
    numerator: 4,
    denominator: 4,
  });
  msm.addNote(part, { date: 0, duration: 720, midiPitch: 60, id: 'n1' });
  msm.addNote(part, { date: 720, duration: 720, midiPitch: 62, id: 'n2' });
  return { msm, part };
}

describe('the MSM writing surface', () => {
  /**
   * One row per element kind, asserting the whole serialisation rather than a field list: an
   * attribute the factory forgot, or wrote in the wrong place, has nowhere to hide.
   *
   * The orders differ per element and none of them is MPM's convention of `xml:id` last —
   * `<note>` and `<rest>` put it first, `<pedal>` and `<section>` third, `<timeSignature>`
   * last, `<programChange>` not at all.
   */
  it.each([
    {
      element: 'note',
      write: () =>
        Msm.makeNote({
          date: 0,
          duration: 720,
          midiPitch: 60,
          pitchname: 'c',
          accidentals: 0,
          octave: 3,
          velocity: 100,
          millisecondsDate: 0,
          millisecondsDateEnd: 500,
          id: 'n1',
        }),
      expected:
        '<note xml:id="n1" date="0" midi.pitch="60" pitchname="c" accidentals="0" octave="3"' +
        ' duration="720" velocity="100" milliseconds.date="0" milliseconds.date.end="500" />',
    },
    {
      element: 'rest',
      write: () => Msm.makeRest({ date: 720, duration: 360, id: 'r1' }),
      expected: '<rest xml:id="r1" date="720" duration="360" />',
    },
    {
      element: 'pedal',
      write: () => Msm.makePedal({ date: 0, state: 'down', dateEnd: 1440, id: 'ped1' }),
      expected: '<pedal date="0" state="down" xml:id="ped1" date.end="1440" />',
    },
    {
      element: 'section',
      write: () => Msm.makeSection({ date: 0, label: 'Exposition', dateEnd: 11520, id: 'sec1' }),
      expected: '<section date="0" label="Exposition" xml:id="sec1" date.end="11520" />',
    },
    {
      element: 'timeSignature',
      write: () => Msm.makeTimeSignature({ date: 0, numerator: 4, denominator: 4, id: 'ts1' }),
      expected: '<timeSignature date="0" numerator="4" denominator="4" xml:id="ts1" />',
    },
    {
      element: 'programChange',
      write: () => Msm.makeProgramChange({ date: 0, value: 41 }),
      expected: '<programChange date="0" value="41" />',
    },
  ])('$element: writes its attributes in its own order', ({ write, expected }) => {
    expect(write().toXML()).toBe(expected);
  });

  it('leaves out every attribute the options do not name', () => {
    expect(Msm.makeNote({ date: 0, duration: 720, midiPitch: 60 }).toXML()).toBe(
      '<note date="0" midi.pitch="60" duration="720" />',
    );
    expect(Msm.makePedal({ date: 0, state: 'up' }).toXML()).toBe('<pedal date="0" state="up" />');
  });

  it('writes the same bytes from the options form as from the positional one', () => {
    expect(
      Msm.makeTimeSignature({ date: 0, numerator: 3, denominator: 8, id: 'ts1' }).toXML(),
    ).toBe(Msm.makeTimeSignature(0, 3, 8, 'ts1').toXML());
    expect(Msm.makeTimeSignature({ date: 0, numerator: 3, denominator: 8 }).toXML()).toBe(
      Msm.makeTimeSignature(0, 3, 8, null).toXML(),
    );
    expect(Msm.makePart({ name: 'P', number: 2, midiChannel: 1, midiPort: 0 }).toXML()).toBe(
      Msm.makePart('P', 2, 1, 0).toXML(),
    );
  });

  /**
   * The two `<dated>` orders, which differ from each other: the global has a `<sectionMap>` and
   * no `<score>`, the part has a `<score>` and no `<sectionMap>`, and `phraseMap` and
   * `sequencingMap` swap places between them.
   */
  it('gives the global and a part their own <dated> child orders', () => {
    const { msm, part } = minimal();

    expect(localNames(datedOf(present(msm.getGlobal(), '<global>')))).toEqual([
      'timeSignatureMap',
      'keySignatureMap',
      'markerMap',
      'sectionMap',
      'phraseMap',
      'sequencingMap',
      'pedalMap',
      'miscMap',
    ]);
    expect(localNames(datedOf(part))).toEqual([
      'timeSignatureMap',
      'keySignatureMap',
      'markerMap',
      'sequencingMap',
      'pedalMap',
      'phraseMap',
      'miscMap',
      'score',
    ]);
  });

  it('appends a <programChangeMap> after <score>, the one part map nothing pre-creates', () => {
    const { msm, part } = minimal();
    msm.addProgramChange(part, { date: 0, value: 0 });

    expect(localNames(datedOf(part)).slice(-2)).toEqual(['score', 'programChangeMap']);
  });

  /**
   * A `<dated>` with nothing in it yet still gets its maps in the canonical order, not in the
   * order they were asked for.
   */
  it('creates a missing map in the position the scope order gives it', () => {
    const part = Msm.makePart({ name: 'P', number: 1, midiChannel: 0, midiPort: 0 });
    const dated = datedOf(part);
    for (const map of dated.getChildElements().toArray()) dated.removeChild(map);

    Msm.datedMap(part, 'score');
    Msm.datedMap(part, 'pedalMap');
    Msm.datedMap(part, 'timeSignatureMap');

    expect(localNames(dated)).toEqual(['timeSignatureMap', 'pedalMap', 'score']);
  });

  it('answers the map that is already there rather than a second one', () => {
    const { part } = minimal();
    expect(Msm.datedMap(part, 'score')).toBe(Msm.datedMap(part, 'score'));
    expect(datedOf(part).getChildElements('score').size()).toBe(1);
  });

  it('refuses a map the scope does not hold', () => {
    const { msm, part } = minimal();
    expect(() => Msm.datedMap(present(msm.getGlobal(), '<global>'), 'score')).toThrow(MeicoError);
    expect(() => Msm.datedMap(part, 'sectionMap')).toThrow(MeicoError);
  });

  /**
   * The two mistakes a hand-written MSM makes and nothing reports: a map beside `<dated>`
   * instead of inside it, and a map child with no `@date`. Both are silent — the map indexing
   * simply never sees the element.
   */
  it('puts every map inside <dated>, and dates every entry it writes', () => {
    const { msm, part } = minimal();
    const global = present(msm.getGlobal(), '<global>');
    msm.addPedal(global, { date: 0, state: 'down', id: 'ped1' });
    msm.addSection({ date: 0, label: 'A', dateEnd: 1440 });

    expect(global.getChildElements('pedalMap').size()).toBe(0);
    expect(datedOf(global).getChildElements('pedalMap').size()).toBe(1);

    // `miscMap` is the converter's scratch space and nests a further map, so it is not an
    // entry list; every other map holds dated entries and nothing else.
    for (const scope of [global, part]) {
      for (const map of datedOf(scope).getChildElements().toArray()) {
        if (map.getLocalName() === 'miscMap') continue;
        for (const entry of map.getChildElements().toArray()) {
          expect(
            entry.getAttribute('date'),
            `<${entry.getLocalName()}> carries no @date`,
          ).not.toBeNull();
        }
      }
    }
    expect(Msm.datedMap(part, 'score').getChildCount()).toBe(2);
  });

  /**
   * The law the reader owes the writer: for any element the factory produced, feeding what the
   * reader says back to the factory produces the same element, byte for byte. Every optional
   * field appears at least once present and once absent — an attribute nothing exercises is one
   * this law says nothing about.
   */
  it.each<AddNoteOptions>([
    { date: 0, duration: 720, midiPitch: 60 },
    { date: 720, duration: 360, midiPitch: 62, id: 'n2' },
    { date: 1440, duration: 720, midiPitch: 64, pitchname: 'e', accidentals: 0, octave: 3 },
    {
      date: 2160,
      duration: 720,
      midiPitch: 65,
      pitchname: 'f',
      accidentals: -1,
      octave: 4,
      velocity: 96,
      millisecondsDate: 1500,
      millisecondsDateEnd: 2000,
      id: 'n4',
    },
  ])('note $date: makeNote(noteOptionsOf(n)) reproduces n', (options) => {
    const original = Msm.makeNote(options);
    const read = present(Msm.noteOptionsOf(original), 'the note options');
    expect(Msm.makeNote(read).toXML()).toBe(original.toXML());
  });

  it.each<AddPedalOptions>([
    { date: 0, state: 'down' },
    { date: 1440, state: 'up', id: 'ped2' },
    { date: 2880, state: 'half', dateEnd: 7200, id: 'ped3' },
    { date: 5760, state: 'bounce', dateEnd: 10080 },
  ])('pedal $date: makePedal(pedalOptionsOf(p)) reproduces p', (options) => {
    const original = Msm.makePedal(options);
    const read = present(Msm.pedalOptionsOf(original), 'the pedal options');
    expect(Msm.makePedal(read).toXML()).toBe(original.toXML());
  });

  it('reads nothing back from an element that is missing what the options require', () => {
    expect(Msm.noteOptionsOf(Msm.makeRest({ date: 0, duration: 720 }))).toBeNull();
    // the four states the format defines are the four the options type can express
    const pedal = Msm.makePedal({ date: 0, state: 'down' });
    const state = present(pedal.getAttribute('state'), '@state');
    state.setValue('sideways');
    expect(Msm.pedalOptionsOf(pedal)).toBeNull();
  });

  it('renders: a document built here performs against an MPM', () => {
    const { msm } = minimal();
    const mpm =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated><tempoMap><tempo date="0.0" bpm="120" beatLength="0.25"/>' +
      '</tempoMap></dated></global></performance></mpm>';

    const performed = performMsm({
      msm: present(msm.getRootElement(), 'a root element').toXML(),
      mpm,
    });

    // 120 bpm on a quarter note: the first note starts at 0 ms and ends at 500.
    expect(performed).toContain('milliseconds.date="0"');
    expect(performed).toContain('milliseconds.date.end="500"');
    expect(performed).toContain('milliseconds.date="500"');
  });
});
