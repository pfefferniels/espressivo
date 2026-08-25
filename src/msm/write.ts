import { Attribute, Element } from '../xml/XomTypes.js';
import { firstChildElement } from '../xml/tree.js';
import { readId, readNumber, readString } from '../xml/attributes.js';
import { MeicoError } from '../xml/errors.js';

/**
 * Building the elements an MSM document is made of, and reading two of them back.
 *
 * MSM has no schema, so the vocabulary here is exactly what the format already carries: the
 * element names, the attribute names, and — because MSM is compared byte for byte — the order
 * each element writes its attributes in. Nothing is invented, and an attribute no options type
 * names is never written.
 *
 * **The attribute order is per element, not one convention.** `<note>` and `<rest>` put
 * `xml:id` first; `<pedal>` and `<section>` put it third, after the attributes that identify
 * the entry; `<timeSignature>` puts it last; `<programChange>` has none. Each factory's
 * docstring states its own order, and the tests assert it.
 *
 * Values are written with `String(value)`, so `60` serialises as `"60"`. A Java-generated MSM
 * spells the same number `"60.0"`; the two documents mean the same thing and are not byte-equal.
 */

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/** The `<dated>` children a writer can ask for. */
export type MsmMapName =
  | 'timeSignatureMap'
  | 'keySignatureMap'
  | 'markerMap'
  | 'sectionMap'
  | 'phraseMap'
  | 'sequencingMap'
  | 'pedalMap'
  | 'programChangeMap'
  | 'score';

/** What a `<pedal>` says the pedal is doing from its date onwards. */
export type PedalState = 'down' | 'up' | 'half' | 'bounce';

/**
 * The `<dated>` child order of a `<global>` and of a `<part>` — different lists, and both are
 * the serialised order: nothing sorts `<dated>` on read or on write.
 *
 * `miscMap` is here as a position, not as something a writer creates: it is the converter's
 * scratch space, which the MEI cleanup deletes. `programChangeMap` sits after `<score>` because
 * it is the one part map that is not pre-created, so it can only ever be appended.
 */
const GLOBAL_DATED_ORDER: readonly string[] = [
  'timeSignatureMap',
  'keySignatureMap',
  'markerMap',
  'sectionMap',
  'phraseMap',
  'sequencingMap',
  'pedalMap',
  'miscMap',
];

const PART_DATED_ORDER: readonly string[] = [
  'timeSignatureMap',
  'keySignatureMap',
  'markerMap',
  'sequencingMap',
  'pedalMap',
  'phraseMap',
  'miscMap',
  'score',
  'programChangeMap',
];

/** A `<part>`'s attributes. `number` identifies the part to everything that refers to one. */
export interface AddPartOptions {
  readonly name: string;
  readonly number: number;
  readonly midiChannel: number;
  readonly midiPort: number;
}

/**
 * Everything a `<note>` can say.
 *
 * `date` and `duration` are ticks at the document's `@pulsesPerQuarter`. The three performance
 * attributes at the bottom are what a rendered document carries; `milliseconds.*` are absolute
 * times, which is why changing the timing basis rescales the ticks and leaves them alone.
 */
export interface AddNoteOptions {
  /** `@date`, in ticks. A map child without one is invisible to every date lookup. */
  readonly date: number;
  /** `@duration`, in ticks. */
  readonly duration: number;
  /** `@midi.pitch`, the number MIDI export and performance extraction both read. */
  readonly midiPitch: number;
  /** `@pitchname` — the spelling of the pitch, descriptive only. */
  readonly pitchname?: string;
  /** `@accidentals`, in semitones: -1 for a flat, 1 for a sharp. Descriptive only. */
  readonly accidentals?: number;
  /** `@octave`. Descriptive only. */
  readonly octave?: number;
  /**
   * `@velocity`, MIDI 0-127. Only meaningful on a document handed straight to expressive MIDI
   * export or performance extraction: rendering a performance overwrites it on every note.
   */
  readonly velocity?: number;
  /** `@milliseconds.date`, in milliseconds. */
  readonly millisecondsDate?: number;
  /** `@milliseconds.date.end`, in milliseconds. */
  readonly millisecondsDateEnd?: number;
  /** `@xml:id`, written FIRST on a `<note>`. */
  readonly id?: string;
}

/** A `<rest>`: it occupies time in the score and renders to nothing. */
export interface AddRestOptions {
  readonly date: number;
  readonly duration: number;
  /** `@xml:id`, written FIRST on a `<rest>`. */
  readonly id?: string;
}

/**
 * A `<pedal>`.
 *
 * Nothing in this library renders one to MIDI — pedalling reaches MIDI through MPM's
 * `movementMap`. A `<pedal>` survives a performance and is then dropped.
 */
export interface AddPedalOptions {
  readonly date: number;
  readonly state: PedalState;
  /** `@date.end`, in ticks, where the pedalling has a known end. */
  readonly dateEnd?: number;
  readonly id?: string;
}

/** A `<timeSignature>`. */
export interface AddTimeSignatureOptions {
  readonly date: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly id?: string;
}

/** A `<section>`. Written in the global `<dated>` only. */
export interface AddSectionOptions {
  readonly date: number;
  /** `@label` — the section's name in the score. */
  readonly label?: string;
  readonly id?: string;
  /** `@date.end`, in ticks. */
  readonly dateEnd?: number;
}

/** A `<programChange>`: `value` is a MIDI program number, 0-127. */
export interface AddProgramChangeOptions {
  readonly date: number;
  readonly value: number;
}

function xmlId(id: string): Attribute {
  return new Attribute('xml:id', XML_NAMESPACE, id);
}

/**
 * Attribute order: `xml:id`, `date`, `midi.pitch`, `pitchname`, `accidentals`, `octave`,
 * `duration`, `velocity`, `milliseconds.date`, `milliseconds.date.end`.
 */
export function makeNote(note: AddNoteOptions): Element {
  const e = new Element('note');

  if (note.id !== undefined) e.addAttribute(xmlId(note.id));
  e.addAttribute(new Attribute('date', String(note.date)));
  e.addAttribute(new Attribute('midi.pitch', String(note.midiPitch)));
  if (note.pitchname !== undefined) e.addAttribute(new Attribute('pitchname', note.pitchname));
  if (note.accidentals !== undefined)
    e.addAttribute(new Attribute('accidentals', String(note.accidentals)));
  if (note.octave !== undefined) e.addAttribute(new Attribute('octave', String(note.octave)));
  e.addAttribute(new Attribute('duration', String(note.duration)));
  if (note.velocity !== undefined) e.addAttribute(new Attribute('velocity', String(note.velocity)));
  if (note.millisecondsDate !== undefined)
    e.addAttribute(new Attribute('milliseconds.date', String(note.millisecondsDate)));
  if (note.millisecondsDateEnd !== undefined)
    e.addAttribute(new Attribute('milliseconds.date.end', String(note.millisecondsDateEnd)));

  return e;
}

/** Attribute order: `xml:id`, `date`, `duration`. */
export function makeRest(rest: AddRestOptions): Element {
  const e = new Element('rest');

  if (rest.id !== undefined) e.addAttribute(xmlId(rest.id));
  e.addAttribute(new Attribute('date', String(rest.date)));
  e.addAttribute(new Attribute('duration', String(rest.duration)));

  return e;
}

/** Attribute order: `date`, `state`, `xml:id`, `date.end`. */
export function makePedal(pedal: AddPedalOptions): Element {
  const e = new Element('pedal');

  e.addAttribute(new Attribute('date', String(pedal.date)));
  e.addAttribute(new Attribute('state', pedal.state));
  if (pedal.id !== undefined) e.addAttribute(xmlId(pedal.id));
  if (pedal.dateEnd !== undefined) e.addAttribute(new Attribute('date.end', String(pedal.dateEnd)));

  return e;
}

/** Attribute order: `date`, `label`, `xml:id`, `date.end`. */
export function makeSection(section: AddSectionOptions): Element {
  const e = new Element('section');

  e.addAttribute(new Attribute('date', String(section.date)));
  if (section.label !== undefined) e.addAttribute(new Attribute('label', section.label));
  if (section.id !== undefined) e.addAttribute(xmlId(section.id));
  if (section.dateEnd !== undefined)
    e.addAttribute(new Attribute('date.end', String(section.dateEnd)));

  return e;
}

/** Attribute order: `date`, `value`. A `<programChange>` carries no `xml:id`. */
export function makeProgramChange(programChange: AddProgramChangeOptions): Element {
  const e = new Element('programChange');

  e.addAttribute(new Attribute('date', String(programChange.date)));
  e.addAttribute(new Attribute('value', String(programChange.value)));

  return e;
}

/** Attribute order: `date`, `numerator`, `denominator`, `xml:id`. */
export function makeTimeSignature(timeSignature: AddTimeSignatureOptions): Element {
  const e = new Element('timeSignature');

  e.addAttribute(new Attribute('date', String(timeSignature.date)));
  e.addAttribute(new Attribute('numerator', String(timeSignature.numerator)));
  e.addAttribute(new Attribute('denominator', String(timeSignature.denominator)));
  if (timeSignature.id !== undefined) e.addAttribute(xmlId(timeSignature.id));

  return e;
}

/**
 * The `<note>` as the options that would write it, or null where it does not carry all three
 * of `@date`, `@duration` and `@midi.pitch`.
 *
 * Numbers come back through `parseFloat`, so a Java-generated `midi.pitch="60.0"` reads as 60
 * and writing it out again spells it `"60"`. The round trip is an inverse for documents this
 * library wrote, not for every document it can read.
 */
export function noteOptionsOf(note: Element): AddNoteOptions | null {
  const date = readNumber(note, 'date');
  const duration = readNumber(note, 'duration');
  const midiPitch = readNumber(note, 'midi.pitch');
  if (date === undefined || duration === undefined || midiPitch === undefined) return null;

  return {
    date,
    duration,
    midiPitch,
    pitchname: readString(note, 'pitchname'),
    accidentals: readNumber(note, 'accidentals'),
    octave: readNumber(note, 'octave'),
    velocity: readNumber(note, 'velocity'),
    millisecondsDate: readNumber(note, 'milliseconds.date'),
    millisecondsDateEnd: readNumber(note, 'milliseconds.date.end'),
    id: readId(note),
  };
}

/**
 * The `<pedal>` as the options that would write it, or null where it carries no `@date`, or a
 * `@state` outside the four the format defines. That last case keeps {@link PedalState} honest:
 * the options type can only express a state this library can write.
 */
export function pedalOptionsOf(pedal: Element): AddPedalOptions | null {
  const date = readNumber(pedal, 'date');
  const state = readString(pedal, 'state');
  if (date === undefined || !isPedalState(state)) return null;

  return {
    date,
    state,
    dateEnd: readNumber(pedal, 'date.end'),
    id: readId(pedal),
  };
}

function isPedalState(state: string | undefined): state is PedalState {
  return state === 'down' || state === 'up' || state === 'half' || state === 'bounce';
}

/**
 * The map named `name` inside `scope`'s `<dated>`, created if it is not there yet — and created
 * in the position the scope's own child order gives it, which is the position it would have in
 * a document this library built from the start. `scope` is a `<global>` or a `<part>`; its
 * `<dated>` is created too if it is missing.
 *
 * A `<part>` has no `<sectionMap>` and a `<global>` has neither `<score>` nor
 * `<programChangeMap>`, so asking either for a map it cannot hold throws rather than putting
 * one somewhere arbitrary.
 *
 * A child of a name neither order lists — a foreign annotation — never acts as the insertion
 * anchor, so the new map lands before the first *known* map that belongs after it, and the
 * foreign element keeps its neighbours.
 */
export function datedMap(scope: Element, name: MsmMapName): Element {
  const order = datedOrderOf(scope);
  const position = order.indexOf(name);
  if (position < 0)
    throw new MeicoError(
      `a <${scope.getLocalName()}> holds no <${name}>; MSM writes that map in the other scope`,
    );

  let dated = firstChildElement('dated', scope);
  if (dated === null) {
    dated = new Element('dated');
    scope.appendChild(dated);
  }

  const existing = firstChildElement(name, dated);
  if (existing !== null) return existing;

  const map = new Element(name);
  for (const sibling of dated.getChildElements()) {
    const siblingPosition = order.indexOf(sibling.getLocalName());
    if (siblingPosition > position) {
      dated.insertChild(map, dated.indexOf(sibling));
      return map;
    }
  }

  dated.appendChild(map);
  return map;
}

function datedOrderOf(scope: Element): readonly string[] {
  const name = scope.getLocalName();
  if (name === 'global') return GLOBAL_DATED_ORDER;
  if (name === 'part') return PART_DATED_ORDER;
  throw new MeicoError(`<${name}> is neither a <global> nor a <part>, so it has no <dated>`);
}
