/**
 * MPM v3's unit-suffixed temporal values, as much of them as a document transform needs.
 *
 * v2 put the time unit on the `<temporalSpread>` element (one `@time.unit` for the whole
 * frame); v3 put it on each value, so `frame.offset="-22.0ms" frameLength="80%"` is legal and
 * the two bounds of one frame can be measured on different clocks. The renderer's reading of
 * that lives in `src/mpm/elements/styles/defs/TemporalValue.ts` and produces a
 * `{ value, domain }` pair; this module produces a `{ value, suffix }` pair instead, and the
 * difference is the whole point.
 *
 * ## Why this is a replication rather than an import
 *
 * The layer zone (eslint.config.js, `expression`) forbids importing anything under
 * `src/mpm/**` except `names.ts`, because `new Mpm(text)` rewrites the document in its own
 * constructor — D-A/A1's founding observation. So the grammar is transliterated here, and
 * `tests/expression/temporalValue.test.ts` pins the replication against the real parser on a
 * separate parse of the same text, exactly as `datedView.test.ts` pins the ordered view
 * against `GenericMap.parseData`.
 *
 * ## Why the SUFFIX and not the DOMAIN is what is carried
 *
 * The renderer parses `80%` into `{ value: 80, domain: 'relative' }` and serializes it back
 * through `formatTemporalValue`, which rebuilds the text from the domain. That round trip is
 * canonicalizing on purpose (`"0.0ticks"` comes back as `"0ticks"`, and a suffix-less value
 * comes back suffixed), and it is exactly what this engine may not do: D-A permits changing
 * the NUMBER the caller asked to scale and nothing else on the same attribute. A document
 * whose corpus spelling is `frameLength="44"` — which is what the format's own sample
 * encodings write (PARITY.md §6.2 D3) — must come back as `"88"`, not as `"88ticks"`, or the
 * engine has silently upgraded a document generation on the caller's behalf.
 *
 * So {@link parseTemporalText} keeps the suffix as the bytes it found, `''` included, and
 * {@link formatTemporalText} puts those same bytes back. The DOMAIN is derived separately, by
 * {@link resolveTemporalDomain}, and is used only for the report — never to rewrite a value.
 */
import { numberToString, readAttributeValue } from './attributes.js';
import {
  FRAME_LENGTH_ATTRIBUTE,
  FRAME_OFFSET_ATTRIBUTE,
  FRAME_START_ATTRIBUTE,
  FRAME_TIME_UNIT_ATTRIBUTE,
} from './registry.js';
import type { Element } from '../xml/XomTypes.js';

/**
 * The three v3 unit suffixes, plus the empty one a suffix-less value carries.
 *
 * `''` is not a fourth unit: it is the absence of one, which v3's own corpus writes and its
 * base schematron allows (`att.time.frameLength.xml:21`), and whose meaning is resolved by
 * {@link resolveTemporalDomain} rather than by the value itself.
 */
export type TemporalSuffix = '' | 'ms' | '%' | 'ticks';

/** The clock a value is counted on — the v2 `@time.unit` vocabulary, which v3 reuses. */
export type TemporalDomain = 'ticks' | 'milliseconds' | 'relative';

/**
 * A v3 temporal value split into the part this engine scales and the part it must not touch.
 *
 * `value` is the bare number as written — `"80%"` is `80`, not `0.8`; resolving a percentage
 * against a principal note is the renderer's job (PARITY.md §6.2 D4 puts it in the tick
 * domain). `suffix` is the trailing bytes verbatim.
 */
export interface TemporalText {
  readonly value: number;
  readonly suffix: TemporalSuffix;
}

/**
 * The v3 schematron's number grammar with its mandatory suffix
 * (`att.time.frame.xml:20`, `temporalSpread.xml:34`), transliterated from
 * `TemporalValue.ts`'s `SUFFIXED`.
 *
 * Every exclusion is load-bearing rather than an oversight: no leading-dot form (`.5`), no
 * exponent (`1e3`), no `+`, no `Infinity`/`NaN`, no surrounding whitespace. This is narrower
 * than `parseFloat`, which is what the v2 path reads with — and that gap is the reason the
 * generation has to be detected before a value is read at all. `parseFloat("80%")` is `80`,
 * so a v3 value read through the v2 path scales correctly and then serializes as `"120"`,
 * silently deleting the unit.
 */
const SUFFIXED = /^(-?[0-9]+(?:\.[0-9]+)?)(ms|%|ticks)$/;

/** The same numeric grammar with no suffix — `TemporalValue.ts`'s `UNSUFFIXED`. */
const UNSUFFIXED = /^-?[0-9]+(?:\.[0-9]+)?$/;

/**
 * A trailing unit suffix as a **format probe**, not a validity check — `TemporalSpread.ts`'s
 * `V3_UNIT_SUFFIX`.
 *
 * It deliberately ignores whether the rest of the value parses, so `frameLength="abc%"` is a
 * malformed *v3* value rather than a v2 one. Replicating that matters: reading it as v2 would
 * put it through `parseFloat`, get `NaN`, and refuse it as out-of-domain — the same outcome
 * by the wrong route, and the wrong route stops being harmless the moment the sibling bound
 * is well-formed and would be written on its own.
 */
const V3_UNIT_SUFFIX = /(?:ms|%|ticks)$/;

/** Which clock each suffix names. Total over the suffixes {@link SUFFIXED} admits. */
const DOMAIN_BY_SUFFIX: Readonly<Record<Exclude<TemporalSuffix, ''>, TemporalDomain>> = {
  ticks: 'ticks',
  ms: 'milliseconds',
  '%': 'relative',
};

/**
 * Read a value the way a real v3 document writes it: the schematron's number, suffix
 * optional.
 *
 * Nothing is trimmed or repaired. `Number` is the parse and agrees with `parseFloat` and with
 * Java's `Double.parseDouble` bit for bit on this grammar, which excludes every form on which
 * the three differ — the ruling and its 481-input measurement are PARITY.md §6.8.
 *
 * The result is not guaranteed finite: a 309-digit integer is schema-valid and overflows to
 * `Infinity`. That is left to the gate, which refuses a non-finite input at every row.
 *
 * @returns null for anything outside the grammar, which the caller reports and skips.
 */
export function parseTemporalText(text: string): TemporalText | null {
  const suffixed = SUFFIXED.exec(text);
  if (suffixed !== null) {
    // The alternation guarantees group 2 is one of the three keys of DOMAIN_BY_SUFFIX.
    return { value: Number(suffixed[1]), suffix: suffixed[2] as TemporalSuffix };
  }
  if (!UNSUFFIXED.test(text)) return null;
  return { value: Number(text), suffix: '' };
}

/**
 * Put a scaled number back under the suffix it was found with.
 *
 * The number goes through {@link numberToString} — the engine's one formatting choke point —
 * and the suffix is concatenated verbatim, so `"80%"` scaled by 1.5 is `"120%"` and `"44"`
 * scaled by 2 is `"88"`. Note that the renderer's own `formatTemporalValue` would write
 * `"88ticks"` for the second one; the divergence is deliberate and is this module's reason to
 * exist.
 */
export function formatTemporalText(temporal: TemporalText): string {
  return `${numberToString(temporal.value)}${temporal.suffix}`;
}

/**
 * The clock a value is on: its own suffix, else the legacy `@time.unit` of its element, else
 * ticks.
 *
 * That fallback chain is `TemporalSpread.ts`'s `legacyFallbackDomain` (PARITY.md §6.2 D3),
 * and it is the reason DESIGN §7.15's claim that v3 "removes §7.9's branch on the unit" is
 * only half true: a suffix-less v3 value still defers to a sibling enum, and suffix-less is
 * what the format's own sample corpus writes. The applier reads it for the report only.
 *
 * Wider than the v2 reader, which maps everything that is not `"milliseconds"` onto ticks and
 * has no `relative` at all — the divergence is reachable only from the v3 path.
 */
export function resolveTemporalDomain(suffix: TemporalSuffix, element: Element): TemporalDomain {
  if (suffix !== '') return DOMAIN_BY_SUFFIX[suffix];
  switch (readAttributeValue(element, FRAME_TIME_UNIT_ATTRIBUTE)) {
    case 'milliseconds':
      return 'milliseconds';
    case 'relative':
      return 'relative';
    // Absent, and anything unrecognised, mean ticks. `null` is spelled out so that "the
    // attribute is missing" reads as a decision rather than as the bottom of a fallthrough.
    case null:
    default:
      return 'ticks';
  }
}

/** Which MPM generation a `<temporalSpread>` element is written in. */
export type FrameFormat = 'v2' | 'v3';

/**
 * Decide whether one `<temporalSpread>` is v2 or v3 syntax — `TemporalSpread.ts`'s
 * `detectSourceFormat`, transliterated.
 *
 * MPM documents carry no version marker at all (same namespace, no `@version`), so the
 * generation is inferred from two structural markers, both v3-only by construction: the
 * attribute `frame.offset`, which v3 renamed `frame.start` to and whose old name it deleted;
 * and a unit suffix on any frame value, which a v2 bare double cannot have.
 *
 * Three consequences of replicating it exactly, each pinned by a test:
 *
 * - Detection is per **element**, not per document. A performance may hold a v2 and a v3
 *   spread side by side, and each keeps its own reading and its own byte discipline.
 * - **Any** marker makes the whole element v3, including the mixed spelling
 *   `frame.start="-22.0" frameLength="44%"` — the alternative, a per-attribute generation,
 *   would have to write half a v2 and half a v3 element.
 * - `alignment` is v3-only but is deliberately NOT a marker: a `<temporalSpread>` carrying
 *   nothing but a reference-implementation-style `alignment` is otherwise pure v2 and must
 *   keep reading, and re-serializing, as v2.
 */
export function detectFrameFormat(spread: Element): FrameFormat {
  if (readAttributeValue(spread, FRAME_OFFSET_ATTRIBUTE) !== null) return 'v3';
  for (const name of [FRAME_START_ATTRIBUTE, FRAME_LENGTH_ATTRIBUTE]) {
    const raw = readAttributeValue(spread, name);
    if (raw !== null && V3_UNIT_SUFFIX.test(raw)) return 'v3';
  }
  return 'v2';
}

/**
 * Which attribute physically carries the frame's offset on a v3 spread, or null when it
 * carries none.
 *
 * `frame.offset` first, then `frame.start` as the legacy alias the v3 reader still accepts
 * (PARITY.md §6.2 D3) — the same `??` chain `TemporalSpread.parseV3Frame` reads with, so the
 * engine writes the bound the renderer reads. When both are present the alias is dead: the
 * reader never looks at it and the writer never emits it.
 */
export function v3FrameOffsetAttribute(spread: Element): string | null {
  if (readAttributeValue(spread, FRAME_OFFSET_ATTRIBUTE) !== null) return FRAME_OFFSET_ATTRIBUTE;
  if (readAttributeValue(spread, FRAME_START_ATTRIBUTE) !== null) return FRAME_START_ATTRIBUTE;
  return null;
}
