/**
 * The unit-suffixed temporal values MPM v3 introduced for `temporalSpread`: a number plus
 * the time domain its suffix names — `480ticks`, `-100ms`, `50.0%`.
 *
 * This module implements the two v3 attribute classes that carry them, `att.time.frame`
 * (attribute `frame.offset`, spec `src/specs/att.time.frame.xml`) and
 * `att.time.frameLength` (attribute `frameLength`, `src/specs/att.time.frameLength.xml`),
 * against the MPM spec at develop @ 1de00bb (v3.0.2). In v2 the unit was a property of the
 * *element* (one `time.unit` for the whole `temporalSpread`); in v3 it is a property of each
 * *value*, so `frame.offset="22.0ms" frameLength="90%"` is legal.
 *
 * The module is pure: no XML, no state, no logging. Callers own the attribute plumbing and the
 * log message on a rejected value (RULE E1).
 *
 * **Two parse modes, because the spec disagrees with its own corpus.** The schematron of
 * `att.time.frame` (`att.time.frame.xml:20`) and the `temporalSpread` override of
 * `att.time.frameLength` (`temporalSpread.xml:34`) make the suffix MANDATORY, while both
 * attribute descriptions and the unoverridden `att.time.frameLength` schematron
 * (`att.time.frameLength.xml:21`) make it OPTIONAL, falling back to a `time.unit` attribute
 * that v3 removed from every element. Every real v3 file writes values without a suffix,
 * including the format's own sample encoding and the guidelines' first example
 * (`docs/history/ornamentation/research/github-v3-design.md` §5). So
 * {@link parseTemporalValueStrict} is the schema-exact reader (also usable as a validator) and
 * {@link parseTemporalValueLenient} is what the document reader uses. What a missing domain
 * *means* — legacy `@time.unit` if present, else ticks — is reader policy, decided with the
 * `TemporalSpread` parse code (DESIGN.md D3), not here.
 *
 * PARITY NOTE. The v3 reference implementation's `TemporalValue.java`
 * (LarsEngeln/meico@3deb141c) is deliberately not ported — neither its API nor its behaviour
 * (DESIGN.md §1 non-goals; `docs/history/ornamentation/research/lars-v3-implementation.md`
 * §2.2–§2.4). Its parse regex `^(\d+)(ms|th|%|ticks|\?)$` rejects both the sign and the
 * decimals of the spec's own examples, admits two domains no spec release has (`th`, `?`), and
 * its `toString` emits `360.0ticks`, which its own `fromString` cannot read back. Only the
 * concept survives here: value + domain.
 */

/**
 * The three v3 time domains, each mapped to the suffix that names it. Single source of truth
 * for both directions.
 *
 * The domain names are those of the v2 `time.unit` vocabulary (`ticks` | `milliseconds` |
 * `relative`, `src/specs/att.time.unit.xml:15-17`), so a legacy `time.unit="milliseconds"` maps
 * onto a domain without translation.
 *
 * An `as const` table rather than a TS enum, per the new-code idiom (architecture brief
 * §1.3/§1.7); `TemporalSpread`'s `FrameDomain` and `NoteOffShift` are grandfathered enums.
 */
export const TEMPORAL_DOMAIN_SUFFIX = {
  ticks: 'ticks',
  milliseconds: 'ms',
  relative: '%',
} as const;

/** The domain of a {@link TemporalValue}: which clock its number is counted on. */
export type TemporalDomain = keyof typeof TEMPORAL_DOMAIN_SUFFIX;

/** The three suffix strings — the regex alternation `(ms|%|ticks)`, in type form. */
export type TemporalSuffix = (typeof TEMPORAL_DOMAIN_SUFFIX)[TemporalDomain];

/**
 * A parsed v3 temporal value. `value` is the bare number as written, so a `relative` value
 * carries the literal in front of the `%` — `"80%"` is `{ value: 80, domain: 'relative' }`,
 * not `0.8`. Resolving that against a principal note's duration is the renderer's job
 * (DESIGN.md D4 puts it in the tick domain).
 */
export interface TemporalValue {
  readonly value: number;
  readonly domain: TemporalDomain;
}

/**
 * What {@link parseTemporalValueLenient} returns: a well-formed number whose domain the
 * document did not state. `domain: null` is the domain saying "there is nothing here"
 * (RULE N1) and obliges the caller to apply the fallback chain of DESIGN.md D3.
 */
export interface UnresolvedTemporalValue {
  readonly value: number;
  readonly domain: TemporalDomain | null;
}

/**
 * The spec regex `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`
 * (`att.time.frame.xml:20`, `temporalSpread.xml:34`), verbatim except that the fraction
 * group is non-capturing and the number as a whole is captured instead — the accepted
 * language is unchanged.
 *
 * The exclusions are the schema's, not ours: no leading-dot form (`.5`), no exponent (`1e3`),
 * no `Infinity`/`NaN`, no `+`, no surrounding whitespace. They are about the *spelling* of the
 * number, not its magnitude — a 309-digit integer is schema-valid and parses to `Infinity`, see
 * {@link parseTemporalValueStrict}. JavaScript's `$` matches end of input only, which is also
 * what Java's `Matcher.matches()` requires, so the two agree on rejection as well as acceptance.
 */
const SUFFIXED = /^(-?[0-9]+(?:\.[0-9]+)?)(ms|%|ticks)$/;

/**
 * The same numeric grammar with the suffix removed — the form the base `att.time.frameLength`
 * schematron allows (`att.time.frameLength.xml:21`, where the suffix group is `?`-optional) and
 * the only form the real corpus writes.
 *
 * A second literal rather than one regex with an optional trailing group: an optional group's
 * capture is typed `string` under this tsconfig but is `undefined` at runtime, so the "did it
 * match a suffix" test would be a check the type system believes is dead (RULE N6's
 * `no-unnecessary-condition`).
 */
const UNSUFFIXED = /^-?[0-9]+(?:\.[0-9]+)?$/;

/** Reverse of {@link TEMPORAL_DOMAIN_SUFFIX}. Total over the suffixes {@link SUFFIXED} admits. */
const DOMAIN_BY_SUFFIX: Readonly<Record<TemporalSuffix, TemporalDomain>> = {
  ticks: 'ticks',
  ms: 'milliseconds',
  '%': 'relative',
};

/**
 * Read a value exactly as the v3 schematrons define it: number plus mandatory unit suffix.
 *
 * `Number` is the parse, and on this grammar — plain decimal literals only — it agrees exactly
 * with `parseFloat` and with Java's `Double.parseDouble`, both of which round to the nearest
 * double by the same rule. The grammar excludes every form on which they differ (hex, `1e3`,
 * trailing `d`/`f`, `Infinity`), which is why this module does not need `parseJavaDouble` even
 * though DESIGN.md D16 requires it for numeric attributes in general. That exemption is a
 * ruling (PARITY.md §6.8) and a measured one: a Java 17 harness running this same regex plus
 * `Double.parseDouble` over a 481-input corpus agrees with this module on all 443 accepted
 * values bit for bit, with zero acceptance mismatches. The v3 attributes that have *no* grammar
 * — a pool note's pitch, `@repetitions` — do read through `parseJavaDouble`, and there the
 * difference is observable. The sign of zero survives: `-0.0ticks` parses to `-0`.
 *
 * The result is not guaranteed finite. A number too large for a double is still spelled
 * legally — 309 digits satisfy the schematron — and overflows to `Infinity`, which is
 * exactly what `Double.parseDouble` returns for the same text, so the parity is intact and
 * a guard here would be a divergence. Callers that care own the finiteness check; note
 * {@link formatTemporalValue} will write such a value straight back out.
 *
 * @returns null for anything the schematron would reject, including a suffix-less number —
 *   use {@link parseTemporalValueLenient} for documents, and this for validation.
 */
export function parseTemporalValueStrict(text: string): TemporalValue | null {
  const match = SUFFIXED.exec(text);
  if (match === null) return null;
  // The alternation guarantees group 2 is one of the three keys of DOMAIN_BY_SUFFIX.
  return { value: Number(match[1]), domain: DOMAIN_BY_SUFFIX[match[2] as TemporalSuffix] };
}

/**
 * Read a value the way real v3 documents write it: same numeric grammar, suffix optional.
 *
 * Nothing is trimmed or repaired — a whitespace-padded or otherwise malformed string is
 * still null, because tolerating a suffix-less number is a documented spec contradiction
 * (see the module doc) and tolerating garbage would just hide encoding errors.
 *
 * @returns `domain: null` when the document stated no unit. The caller resolves it —
 *   legacy `@time.unit`, else ticks (DESIGN.md D3) — and logs whatever it decides to log.
 */
export function parseTemporalValueLenient(text: string): UnresolvedTemporalValue | null {
  const suffixed = parseTemporalValueStrict(text);
  if (suffixed !== null) return suffixed;
  if (!UNSUFFIXED.test(text)) return null;
  return { value: Number(text), domain: null };
}

/**
 * Serialize a value in canonical v3 form: the number, then its unit suffix, and no
 * `time.unit` attribute anywhere (DESIGN.md D12).
 *
 * Template interpolation of a number is `ToString`, i.e. exactly `String(x)`, which is what
 * every serializer in this port uses for attribute values. So this emits `"0ticks"` and `"50%"`
 * where Java's `Double.toString` would give `"0.0ticks"` and `"50.0%"`; both spellings satisfy
 * the schematron, and the port-wide textual divergence is recorded in
 * `docs/history/ornamentation/research/java-ts-v2-ornamentation.md` §5.3 item 5.
 *
 * The round trip preserves value and domain, not the source text: `"0.0ticks"` comes back out
 * as `"0ticks"`. For magnitudes where `ToString` switches to exponent form (≥ 1e21, or a very
 * small fraction) the output is no longer schema-valid; no musical frame reaches that range.
 *
 * The same holds, more sharply, for a non-finite value: `NaN` and `±Infinity` serialize as
 * `"NaNticks"` / `"Infinityticks"`, which no reader — including
 * {@link parseTemporalValueStrict} — accepts back. That is one hop from real input, because a
 * 309-digit `frameLength` parses to `Infinity` successfully, so a caller's log-and-skip on a
 * *failed* parse will not catch it. Whether to guard, clamp or reject belongs to the code that
 * owns the attribute, not to a formatter that must stay total.
 */
export function formatTemporalValue(temporal: TemporalValue): string {
  return `${temporal.value}${TEMPORAL_DOMAIN_SUFFIX[temporal.domain]}`;
}
