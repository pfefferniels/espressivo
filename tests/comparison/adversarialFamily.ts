/**
 * The standing adversarial fixture family — §10's P-C3/P-C3b family, promoted from the W2
 * verification report under AD-33.5.
 *
 * **Standing test policy (AD-33.5): every future integrator-touching change runs against this
 * family, not against constants.** The wave's original triangle tests used three pointwise-
 * ordered constants, which sit at the triangle's *equality* case — so they could only fail on
 * quadrature error, and they tested the quadrature rather than the metric. None of them
 * touched `⊥`, the cap, a renderer default, a skip, or an unmatched part. That gap is what
 * let CAPITAL-1 and CAPITAL-3 through the wave, and it is why this file exists.
 *
 * Twelve members, each carrying a different former-M1 hazard, including **two** transition
 * members — `criticalPointTicks` fires only when BOTH sides are transitions, so a single power
 * member would leave that path unreached by every pair in the family. Negative-controlled:
 * reverting AD-33.2's canonical ordering fails this family's P-C2, which the wave's
 * constants-only tests could not.
 *
 * W3a cut 1 added four: the two new dimensions' ordinary case, and one member each for the two
 * `⊥` routes they introduce (an aborting `accentuationPatternDef`, a non-monotone date
 * component) plus AD-35's unbounded resurrected span. Each cut extends the family with the
 * failure surfaces it opens, which is the standing policy rather than a courtesy.
 *
 * All members share one explicit window, which §10 requires: under a pair-derived window the
 * three windows of a triple differ and R3's triangle inequality is not even claimed (M2).
 */

/** The window every member is compared under — explicit, so R3's guarantee is unconditional. */
export const ADVERSARIAL_WINDOW = { start: 0, end: 4 } as const;

/** Wrap map bodies into a one-performance document. */
const document = (dated: string, header = ''): string =>
  '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
  `<global><header>${header}</header><dated>${dated}</dated></global>` +
  '</performance></mpm>';

/**
 * The style collection the accentuation members resolve against.
 *
 * Two defs of different lengths, so that a member which cycles on the measure and one which
 * cycles on the pattern are both expressible — and one member deliberately names neither.
 */
const ACCENTUATION_STYLES =
  '<metricalAccentuationStyles><styleDef name="M">' +
  '<accentuationPatternDef name="p" length="4.0">' +
  '<accentuation beat="1" value="20" transition.to="-5"/>' +
  '<accentuation beat="3" value="-10" transition.to="8"/>' +
  '</accentuationPatternDef>' +
  '</styleDef></metricalAccentuationStyles>';

export interface AdversarialMember {
  readonly name: string;
  /** Which hazard this member introduces — one line, for a failure message worth reading. */
  readonly hazard: string;
  readonly mpm: string;
}

/**
 * The family. Deliberately heterogeneous: members differ in which MAPS they carry as well as
 * in their values, because R6 makes an absent map neutral rather than missing and the
 * triangle inequality has to survive that too.
 */
export const ADVERSARIAL_FAMILY: readonly AdversarialMember[] = [
  {
    name: 'plain',
    hazard: 'the ordinary case: constant tempo, dynamics and asynchrony, nothing degenerate',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="60" beatLength="0.25"/></tempoMap>' +
        '<dynamicsMap><dynamics date="0.0" volume="60"/>' +
        '<dynamics date="2880.0" volume="60"/></dynamicsMap>' +
        '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="0.0"/></asynchronyMap>',
    ),
  },
  {
    name: 'renderer-default-level',
    hazard: 'an unresolvable style name on both tempo and dynamics — R8/AD-1 performs 100.0',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="Allegrissimo" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="Allegrissimo" beatLength="0.25"/></tempoMap>' +
        '<dynamicsMap><dynamics date="0.0" volume="?"/>' +
        '<dynamics date="2880.0" volume="?"/></dynamicsMap>',
    ),
  },
  {
    name: 'bottom-span',
    hazard: 'a ⊥ asynchrony span from a missing @milliseconds.offset — R24, priced at δ_row',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="72" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="72" beatLength="0.25"/></tempoMap>' +
        '<asynchronyMap><asynchrony date="0.0"/>' +
        '<asynchrony date="2880.0" milliseconds.offset="5.0"/></asynchronyMap>',
    ),
  },
  {
    name: 'bottom-from-foreign-entry',
    hazard: 'a ⊥ asynchrony span opened by a <style> — CAPITAL-1/AD-33.1, a different route in',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="72" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="72" beatLength="0.25"/></tempoMap>' +
        '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="4.0"/>' +
        '<style date="1440.0" name.ref="S"/>' +
        '<asynchrony date="2880.0" milliseconds.offset="4.0"/></asynchronyMap>',
    ),
  },
  {
    name: 'capped',
    hazard: 'an asynchrony offset far past 2·δ_row, so §4s cap binds rather than the raw value',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="2880.0" bpm="60" beatLength="0.25"/></tempoMap>' +
        '<asynchronyMap><asynchrony date="0.0" milliseconds.offset="100000.0"/></asynchronyMap>',
    ),
  },
  {
    name: 'skips',
    hazard:
      'a skipped <tempo> (no @beatLength) and a skipped <dynamics> (no @volume) — AD-9i/AD-33.4',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '<tempo date="1440.0" bpm="180"/>' +
        '<tempo date="2880.0" bpm="60" beatLength="0.25"/></tempoMap>' +
        '<dynamicsMap><dynamics date="0.0" volume="55"/><dynamics date="1440.0"/>' +
        '<dynamics date="2880.0" volume="55"/></dynamicsMap>',
    ),
  },
  {
    name: 'power-vs-power',
    hazard:
      'two tempo transitions over one span — one of the TWO transition members, which is ' +
      'what makes criticalPointTicks reachable: the path fires only when BOTH sides are ' +
      'transitions, so this member and power-vs-power-2 are load-bearing as a PAIR (RG-4)',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="40" beatLength="0.25" transition.to="90" meanTempoAt="0.9"/>' +
        '<tempo date="2880.0" bpm="90" beatLength="0.25"/></tempoMap>' +
        '<dynamicsMap><dynamics date="0.0" volume="45" transition.to="85" curvature="0.7" protraction="0.6"/>' +
        '<dynamics date="2880.0" volume="85"/></dynamicsMap>',
    ),
  },
  {
    name: 'accentuation-and-pedal',
    hazard:
      'the ordinary case for W3a cut 1’s two dimensions: a resolvable accentuation pattern ' +
      'over a looping span, and a movement map that releases the pedal',
    mpm: document(
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern date="0.0" name.ref="p" scale="1.0" loop="true"/>' +
        '</metricalAccentuationMap>' +
        '<movementMap><movement date="0.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="1440.0" position="0.0"/></movementMap>',
      ACCENTUATION_STYLES,
    ),
  },
  {
    name: 'accentuation-bottom',
    hazard:
      'a ⊥ accentuation span from an unresolvable pattern name — R21, where the render THROWS ' +
      'rather than fabricating a level, so this is the ⊥ route no other member carries',
    mpm: document(
      '<metricalAccentuationMap><style date="0.0" name.ref="M"/>' +
        '<accentuationPattern date="0.0" name.ref="nosuch" scale="1.0"/>' +
        '</metricalAccentuationMap>',
      ACCENTUATION_STYLES,
    ),
  },
  {
    name: 'pedal-resurrected',
    hazard:
      'AD-35: a trailing <style> puts the last <movement> inside the `size() - 1` guard, so it ' +
      'renders with an UNBOUNDED span — the only member whose span end is Number.MAX_VALUE',
    mpm: document(
      '<movementMap><movement date="0.0" position="1.0" transition.to="0.0"/>' +
        '<movement date="1440.0" position="0.5" transition.to="0.0"/>' +
        '<style date="2160.0" name.ref="S"/></movementMap>',
    ),
  },
  {
    name: 'pedal-bottom',
    hazard:
      'a ⊥ pedal span from an out-of-domain @curvature — <movement> has no clamps, so x(t) is ' +
      'non-monotone and there is no date ↦ position function at all (§5.8/§4)',
    mpm: document(
      '<movementMap><movement date="0.0" position="0.0" transition.to="1.0" curvature="4"/>' +
        '<movement date="1440.0" position="1.0"/>' +
        '<style date="2160.0" name.ref="S"/></movementMap>',
    ),
  },
  {
    name: 'power-vs-power-2',
    hazard:
      'a SECOND transition pair over the same span with a different exponent — needed because ' +
      'criticalPointTicks fires only when BOTH sides are transitions, so one power member ' +
      'alone leaves the path unreached by every pair in the family',
    mpm: document(
      '<tempoMap><tempo date="0.0" bpm="45" beatLength="0.25" transition.to="85" meanTempoAt="0.1"/>' +
        '<tempo date="2880.0" bpm="85" beatLength="0.25"/></tempoMap>' +
        '<dynamicsMap><dynamics date="0.0" volume="40" transition.to="90" curvature="0.2" protraction="-0.5"/>' +
        '<dynamics date="2880.0" volume="90"/></dynamicsMap>',
    ),
  },
];

/** Every ordered pair of distinct members — the triangle test's inner loop. */
export function adversarialPairs(): readonly (readonly [AdversarialMember, AdversarialMember])[] {
  const pairs: (readonly [AdversarialMember, AdversarialMember])[] = [];
  for (const a of ADVERSARIAL_FAMILY)
    for (const b of ADVERSARIAL_FAMILY) if (a !== b) pairs.push([a, b]);
  return pairs;
}

/** Every unordered triple — the triangle inequality's domain. */
export function adversarialTriples(): readonly (readonly [
  AdversarialMember,
  AdversarialMember,
  AdversarialMember,
])[] {
  const triples: (readonly [AdversarialMember, AdversarialMember, AdversarialMember])[] = [];
  for (let i = 0; i < ADVERSARIAL_FAMILY.length; ++i)
    for (let j = i + 1; j < ADVERSARIAL_FAMILY.length; ++j)
      for (let k = j + 1; k < ADVERSARIAL_FAMILY.length; ++k)
        triples.push([ADVERSARIAL_FAMILY[i], ADVERSARIAL_FAMILY[j], ADVERSARIAL_FAMILY[k]]);
  return triples;
}
