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
import type { CenterOverrides, ExaggerationScope, VelocityRange } from '../expression/options.js';
import type { ExaggerationFactors } from '../expression/registry.js';
import type { ExaggerationReport } from '../expression/report.js';

/**
 * The expression engine's vocabulary, re-exported unchanged (RULE F1).
 *
 * These are re-exports rather than mirrors because they are already exactly what this module
 * requires of a facade type — plain interfaces over `string | number | boolean | null`,
 * arrays and object literals, with every absence spelled `null` — and a parallel declaration
 * would be a second copy to keep in step with `src/expression/report.ts` for no gain. The one
 * type that is *not* re-exported is the interior's own `ExaggerateOptions`: the facade's
 * (below) carries `factors` and `msm`, which DESIGN.md §4 puts in the option bag and the
 * engine takes separately or not at all.
 */
export type { ExaggerationFactors, ExpressionDimension } from '../expression/registry.js';
export type { CenterOverrides, ExaggerationScope, VelocityRange } from '../expression/options.js';
export type {
  DimensionReport,
  ExaggerationReport,
  MsmDependentEstimates,
  PerformanceBounds,
  PerformanceReport,
  ReportNote,
  ReportNoteKind,
  SiteState,
  VelocityCoefficients,
} from '../expression/report.js';
export type { SiteRef } from '../expression/siteRef.js';

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
  /**
   * Whether MEI ornament signs become MPM ornaments. Default true.
   *
   * `<trill>`, `<mordent>` and `<turn>` are signs: they mark that an ornament is played without
   * writing its notes. With this on, each one is expanded into an MPM `<ornament>` carrying the
   * notes it plays, plus the `<ornamentDef>` describing its shape in time, in an `"MEI export"`
   * style — see `src/mei/MeiOrnamentExpander.ts`. With `false` the three elements are ignored,
   * which is what upstream meico does and what the MPM in this library's Java-reference fixtures
   * contains.
   *
   * `<arpeg>` is **not** governed by this flag. It has always been converted, into a v2 ornament,
   * and stays converted whatever this is set to.
   *
   * NOT THE SAME FLAG as {@link PerformOptions.expandOrnaments}, despite the shared name — they
   * act at different stages and compose. This one decides whether ornaments are ever *written
   * into the MPM* by a conversion; that one decides whether the ornaments already in an MPM
   * *generate their notes* during rendering. Turning this off leaves nothing for the renderer to
   * expand, and it also silences ornaments authored by hand in the MPM. Turning that one off
   * keeps the ornaments in the MPM document — a consumer still reads them — but performs the
   * score without them.
   */
  readonly expandOrnaments?: boolean;
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
  /**
   * Whether MPM v3 ornaments generate their notes. Default true.
   *
   * With `false`, an ornament that uses a v3 feature — a note pool, a `noteid`, `repetitions`,
   * or the grouping syntax in `note.order` — is skipped whole: no note is added to the score
   * and no `ornament.*` attribute is written, so every {@link PerformedNote} it would have
   * produced is simply absent and its principal comes through unornamented.
   *
   * **MPM v2 ornaments are unaffected**, whatever this is set to. A v2 ornament generates no
   * notes in the first place — it shifts and shapes notes the score already has — so there is
   * nothing here for the flag to expand or suppress, and those notes keep reporting
   * {@link PerformedNote.ornamented} as true.
   */
  readonly expandOrnaments?: boolean;
}

export interface MidiOptions {
  /** Synthesise a program change per part from its name. Default true. */
  readonly generateProgramChanges?: boolean;
}

/** DESIGN.md §4's option bag for {@link module:api/expression.exaggerateMpm}. */
export interface ExaggerateOptions {
  /**
   * How far to exaggerate each dimension. A missing key is 1 is identity (R3), so `{}` is the
   * no-op and `EXPRESSION_DIMENSIONS` is the complete list of keys this accepts — an unknown
   * one is an {@link InvalidOptionError} rather than a silent identity, because the silent
   * version is undetectable to a caller who misspelled a key while sampling.
   */
  readonly factors: ExaggerationFactors;
  /**
   * Which performance to transform. Name or 0-based index; **omitted means all of them**.
   *
   * This is the one place the expression facade diverges from {@link PerformOptions}, and the
   * divergence is the difference between the two operations (A11): `performMsm` renders, and
   * a render needs one performance, so it defaults to index 0. This one edits a document, and
   * editing one performance while silently leaving its siblings behind produces a document
   * that means something different from either input.
   */
  readonly performance?: string | number;
  /**
   * Where the neutral point of the level dimensions lives (§1.3). Default `'global'`.
   *
   * `global` exaggerates `tempo` and `dynamics` levels around a performance-wide center, so a
   * piecewise-constant map grows section contrast; `gesture` scales each transition pair
   * around its own geometric mean and leaves constants and def values untouched.
   */
  readonly scope?: ExaggerationScope;
  /**
   * Override the computed center of a level dimension. `tempo` is in quarter-note bpm, the
   * space the transform works in.
   *
   * Passing back the center a previous run reported is what makes composition exact under
   * clamping: with the center fixed, `exaggerate(s₁) ∘ exaggerate(s₂) = exaggerate(s₁·s₂)`
   * again (§1.1's P2).
   */
  readonly center?: CenterOverrides;
  /** R6(a)'s musical bound on dynamics *level* attributes. Default `{min: 1, max: 127}`. */
  readonly velocityRange?: VelocityRange;
  /** A6's IEEE saturation guard on the rubato window, in (0,1). Default `1e-6`. */
  readonly minRubatoWindow?: number;
  /**
   * A score, read **only** to fill in the report's `estimates` (A10's carve-out to R1).
   *
   * It never reaches the transform: the interior's option object is built field by field
   * below this one, so there is no path by which an MSM could influence a written byte. Its
   * fields stay `null` when this is omitted, and stay `null` per field where the MSM does not
   * determine the answer — the millisecond cliffs need a note's *rendered* length, which only
   * an MSM that has already been performed carries.
   */
  readonly msm?: XmlText;
}

/** DESIGN.md §4. The transformed document, and what happened to it. */
export interface ExaggerationResult {
  readonly mpm: XmlText;
  /** R4's contract: `report.totalWrites === 0` means this sample is a no-op. */
  readonly report: ExaggerationReport;
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
  /**
   * Whether an ornament made this note what it is — either by generating it (MPM v3 adds notes
   * the score never had) or by moving, shortening or re-shading a note the score already had.
   *
   * It is true exactly when the note carries at least one `ornament.*` attribute, which is the
   * whole evidence an ornament leaves behind. There are three shapes it comes in, and the five
   * fields below are what tells them apart:
   *
   * - a **generated** note (v3) carries the full set that applies to it — `ornamentRef` when
   *   the ornament has an id, plus `ornamentSource`, `ornamentSlot`, `ornamentAnchor`, and
   *   `ornamentPass` when it came from a repeat group;
   * - a **v2-altered** note has all five `null`: a v2 ornament shifts and shades notes that
   *   already exist and names no roles — it has no pool, no slots and no passes to report;
   * - a **carved head** — the principal of an end-aligned v3 ornament, shortened so its
   *   generated notes fit after it — carries `ornamentRef` and nothing else, and even that
   *   only when the ornament has an id (an id-less ornament leaves all five `null`). It is
   *   not part of the expansion, so it has no source, slot or pass; and it needs no anchor
   *   because it *is* the anchor, still carrying the score's own id.
   */
  readonly ornamented: boolean;
  /**
   * MSM `ornament.ref`: the `xml:id` of the `<ornament>` this note came out of, or was altered
   * by. Set on a generated note and on a carved head; null when the ornament has no id, and on
   * every note no v3 ornament touched — including a v2-altered one, since a v2 ornament leaves
   * modifier markers but never names itself on the note.
   */
  readonly ornamentRef: string | null;
  /**
   * MSM `ornament.source`: the `note.order` token this note resolved from — a pool note's id,
   * the principal's id, or the id of another score note the order named.
   */
  readonly ornamentSource: string | null;
  /** MSM `ornament.slot`: 0-based position in the expanded sequence, after dedup and landing. */
  readonly ornamentSlot: number | null;
  /**
   * MSM `ornament.pass`: 0-based repetition pass. Null on a generated note that came from no
   * repeat group, which is why it is reported apart from {@link ornamentSlot}.
   */
  readonly ornamentPass: number | null;
  /**
   * MSM `ornament.anchor`: the `xml:id` the principal note carried *before* the ornament
   * replaced it — the score-side note this one belongs to.
   *
   * It exists so that a generated note can always be joined back to the score. The transitive
   * route (generated → principal → score) has a hole: when `note.order` never names the
   * principal and no leftover of it survives, the principal's id is on no note at all. This
   * carries it regardless. Null on notes the score already had, and on an ornament that
   * resolved no principal.
   */
  readonly ornamentAnchor: string | null;
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
