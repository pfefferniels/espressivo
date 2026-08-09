/**
 * The facade's data types (ARCHITECTURE.md §2.2).
 *
 * **Everything here is plain data (RULE F1).** The permitted types are `string`, `number`,
 * `boolean`, `null`, `Uint8Array`, plain object literals and arrays of those — so every value
 * the facade returns survives `structuredClone`/`postMessage`, and every value except the
 * `Uint8Array` MIDI payloads survives a `JSON.stringify`/`parse` round trip (RULE F3). No
 * class instances, no `Map`/`Set`, no functions, no getters, and no XomTypes type (`Element`,
 * `Attribute`, `Document`, `Nodes`, `Elements`, `Text`, `Builder`) anywhere — not even behind
 * `readonly`. XML is an interior representation; it enters and leaves as text (RULE F2).
 *
 * **Outputs have no `undefined` (RULE N4).** Every field of every output type is always
 * present and absence is spelled `null`, because `JSON.stringify` drops `undefined`
 * properties and an output carrying one would not be JSON round-trip stable. Conversely
 * every *input* option is `?:` and is never `null`.
 *
 * **Brands (RULE U3(a)).** Output numbers that carry a unit are branded with the types from
 * `src/units.ts` — a compile-time annotation that erases completely (RULE U1/U2). Input
 * options are deliberately left plain `number` (RULE U3a): since there are no runtime
 * converters, a branded input would force every caller to write `0.05 as Normalized`.
 */
import type { Midi7Bit, Milliseconds, Ticks } from '../units.js';

/**
 * MEI/MSM/MPM XML source text.
 *
 * Deliberately a bare `string` alias rather than a branded type: the arguments are kept
 * apart by parameter *names* instead (RULE F5), so that reading a file and passing the
 * result never needs a cast.
 */
export type XmlText = string;

export interface ConvertOptions {
  /** Tick grid floor; raised automatically if the source needs finer resolution. Default 720. */
  readonly ppq?: number;
  /** Keep MIDI channel 10 free when assigning channels to parts. Default true. */
  readonly dontUseChannel10?: boolean;
  /** Convert as written, skipping `expansion` resolution. Default false. */
  readonly ignoreExpansions?: boolean;
  /** Strip the conversion's working attributes from the MSM. Default true. */
  readonly cleanup?: boolean;
  /**
   * Base name written into the MPM metadata's related-resource entry, mirroring what the
   * class API derives from a file path. Omit for no related-resource entry.
   *
   * It drives one branch in the converter and therefore sets two things together: the
   * `RelatedResource` URI *and* the generated `<comment>` text. Omitting it produces the
   * file-less variant of both, byte for byte.
   */
  readonly sourceName?: string;
}

/** One `mdiv` of the source: the score and the performance instructions for it. */
export interface MovementDocuments {
  /** Position in the returned array, which is the converter's movement order. */
  readonly index: number;
  /** The MSM's title — the work title plus the mdiv's `n` and `label`. */
  readonly title: string;
  readonly msm: XmlText;
  readonly mpm: XmlText;
}

export interface PerformanceInfo {
  /** Position in the MPM's performance list; what {@link PerformOptions.performance} indexes. */
  readonly index: number;
  readonly name: string;
  readonly ppq: number;
}

export interface PerformOptions {
  /** Which performance in the MPM. Name or 0-based index; default: index 0. */
  readonly performance?: string | number;
  /**
   * Base seed for imprecision distributions that carry no `seed` attribute of their own.
   * Omit for today's behaviour (each distribution seeded from `Math.random()`).
   * A per-distribution `seed` in the MPM always wins over this.
   *
   * **This is not a promise of reproducible output.** Where two imprecision offsets land on
   * the same `milliseconds.date`, the interior picks which one keeps its value with a bare
   * `Math.random()` and re-rolls the rest through an unseeded generator — faithfully, from
   * `ImprecisionMap.java:845,894`. A seeded render is reproducible only while no two offsets
   * share a date, which for polyphonic input is often false.
   */
  readonly seed?: number;
  /**
   * Max step, in the normalized 0..1 position domain, between sampled movement points.
   * Default 0.1. Larger values emit fewer control-change events for a long ramp.
   */
  readonly movementSampleMaxStep?: number;
}

export interface MidiOptions {
  /** Synthesise a program change per part from its name. Default true. */
  readonly generateProgramChanges?: boolean;
}

export interface PerformedNote {
  /** The note's `xml:id`, or null if it has none. */
  readonly id: string | null;
  readonly pitch: Midi7Bit;
  /** Symbolic MSM time, not performed time. */
  readonly date: Ticks;
  /** Symbolic MSM duration, not performed duration. */
  readonly duration: Ticks;
  readonly velocity: Midi7Bit;
  readonly milliseconds: {
    /** MSM `milliseconds.date`. */
    readonly date: Milliseconds;
    /** MSM `milliseconds.date.end`. */
    readonly end: Milliseconds;
  };
}

export type ControlChangeKind = 'channelVolume' | 'position';

export interface ControlChangePoint {
  /** Symbolic MSM time. */
  readonly date: Ticks;
  readonly milliseconds: Milliseconds;
  readonly value: Midi7Bit;
}

export interface ControlChangeStream {
  /** `channelVolume` carries sub-note dynamics; `position` carries movement (pedalling). */
  readonly kind: ControlChangeKind;
  /** `sustain` | `soft` | any other MPM controller name; null for channelVolume. */
  readonly controller: string | null;
  /** The MIDI controller number the renderer would use: 7, 64, 67, or 0 for unrecognised. */
  readonly ccNumber: number;
  readonly points: readonly ControlChangePoint[];
}

export interface PerformedPart {
  /** Position in {@link PerformanceData.parts}, not the MSM part's own `number` attribute. */
  readonly index: number;
  readonly name: string | null;
  readonly midiChannel: number | null;
  readonly midiPort: number | null;
  readonly notes: readonly PerformedNote[];
  readonly controlChanges: readonly ControlChangeStream[];
}

/**
 * The performance data of one movement.
 *
 * There is deliberately no flat all-notes list: `data.parts.flatMap(p => p.notes)` is one
 * line, and a second representation of the same notes would only invite the two to drift.
 */
export interface PerformanceData {
  readonly title: string;
  readonly ppq: Ticks;
  readonly parts: readonly PerformedPart[];
}
