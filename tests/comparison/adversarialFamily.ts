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
 * W3a cut 4 adds five more, one per surface §5.9 opens that nothing above it reaches:
 *
 * - `imprecision-plain` — an ordinary uniform law, so that every pair has a non-`⊥` law to
 *   compare against and the dimension's ordinary path is exercised at all.
 * - `imprecision-gaussian-gap` — a Gaussian span followed by a `<style>` that ends it, which
 *   is BOTH the special-function quadrature path and the δ₀ gap the any-entry rule opens.
 *   That gap is the sharp contrast with `asynchronyMap`, where the same structural situation
 *   NaN-poisons the span instead; having both in one family means a reading that confuses them
 *   fails the triangle test rather than merely a dedicated test.
 * - `imprecision-bottom` — an EMPTY `<distribution.list>`, the `⊥` route measured through the
 *   pipeline. It is the member that makes the capped density load-bearing: without a `⊥` in the
 *   family, an uncapped `W₁/jnd` would satisfy the triangle inequality on every pair here.
 * - `imprecision-process` — a `brownianNoise` whose declared MARGINAL matches
 *   `imprecision-plain`'s middle-half law while its process differs, so the pair is zero in the
 *   marginal component and non-zero only through `processParameters`. Without it the process
 *   component could be deleted and every metric property would still pass.
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

/** The articulation defs the event members name — two factors, so an alignment has a choice. */
const ARTICULATION_STYLES =
  '<articulationStyles><styleDef name="A">' +
  '<articulationDef name="stacc" relativeDuration="0.5"/>' +
  '<articulationDef name="ten" relativeDuration="1.2" absoluteVelocityChange="8"/>' +
  '</styleDef></articulationStyles>';

/**
 * Two ornament styles that differ ONLY in the spread's time unit.
 *
 * That is §5.6's one genuinely incomparable pair: a tick frame and a millisecond frame have no
 * common domain without a tempo map, so the two are `⊥` against each other while each is an
 * ordinary law against a document with no ornaments at all.
 */
const ORNAMENT_STYLES =
  '<ornamentationStyles>' +
  '<styleDef name="O"><ornamentDef name="arp">' +
  '<temporalSpread frameStart="-30.0" frameLength="60.0" intensity="1.0"/>' +
  '</ornamentDef></styleDef>' +
  '<styleDef name="Oms"><ornamentDef name="arp">' +
  '<temporalSpread frameStart="-30.0" frameLength="60.0" intensity="1.0" time.unit="milliseconds"/>' +
  '</ornamentDef></styleDef>' +
  '</ornamentationStyles>';

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
    name: 'imprecision-plain',
    hazard:
      "an ordinary uniform imprecision law over the whole window — the dimension's " +
      'non-⊥ path, without which every imprecision pair would be ⊥-vs-⊥ or law-vs-neutral',
    mpm: document(
      '<imprecisionMap.timing>' +
        '<distribution.uniform date="0.0" limit.lower="-25" limit.upper="25" milliseconds.timingBasis="300"/>' +
        '</imprecisionMap.timing>',
    ),
  },
  {
    name: 'imprecision-gaussian-gap',
    hazard:
      'a Gaussian law (the special-function quadrature path) ended by a <style>, which under ' +
      'the any-entry rule opens a δ₀ GAP — the same structural situation asynchronyMap ' +
      'NaN-poisons, with the opposite disposition (AD-14ii against AD-33.1)',
    mpm: document(
      '<imprecisionMap.timing>' +
        '<distribution.gaussian date="0.0" deviation.standard="11" limit.lower="-20" limit.upper="20" milliseconds.timingBasis="300"/>' +
        '<style date="1440.0" name.ref="S"/>' +
        '</imprecisionMap.timing>',
    ),
  },
  {
    name: 'imprecision-bottom',
    hazard:
      'an EMPTY <distribution.list>: getValue reads series[i % 0] = series[NaN] = undefined ' +
      'and every note in the span vanishes from the MIDI export (R24), so the span is ⊥ — the ' +
      "member that makes §5.9's capped density load-bearing (AD-36.2)",
    mpm: document(
      '<imprecisionMap.timing><distribution.list date="0.0" milliseconds.timingBasis="300"/></imprecisionMap.timing>',
    ),
  },
  {
    name: 'imprecision-wide',
    hazard:
      "a law so wide that W₁/jnd exceeds 2·δ_row, so §4's CAP binds — added because " +
      'reverting the cap failed only its dedicated test and no pair in the family, which is ' +
      'the same gap the eighth member was added to close for criticalPointTicks. Against ' +
      "imprecision-bottom it is the triangle's equality case: d(wide, plain) = 2δ exactly " +
      'equals d(wide, ⊥) + d(⊥, plain), and uncapped it would exceed it',
    mpm: document(
      '<imprecisionMap.timing>' +
        '<distribution.uniform date="0.0" limit.lower="-1500" limit.upper="1500" milliseconds.timingBasis="300"/>' +
        '</imprecisionMap.timing>',
    ),
  },
  {
    name: 'imprecision-process',
    hazard:
      "a brownianNoise whose declared MARGINAL is exactly imprecision-plain's — the middle " +
      'half of ±50 is ±25 — while its process differs, so the pair is zero in the marginal ' +
      'and non-zero only through processParameters (§5.9, A-B3)',
    mpm: document(
      '<imprecisionMap.timing>' +
        '<distribution.correlated.brownianNoise date="0.0" stepWidth.max="4" limit.lower="-50" limit.upper="50" milliseconds.timingBasis="300"/>' +
        '</imprecisionMap.timing>',
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
  {
    name: 'rubato-plain',
    hazard: 'an ordinary rubato warp — the dimension had no non-⊥ member at all (W3 MAJOR-1)',
    mpm: document(
      '<rubatoMap><rubato date="0.0" frameLength="720.0" intensity="1.6" lateStart="0.1" ' +
        'earlyEnd="0.9" loop="true"/><rubato date="2880.0" frameLength="720.0"/></rubatoMap>',
    ),
  },
  {
    name: 'rubato-bottom',
    hazard:
      'an unusable @intensity with @loop on: the warp is NaN over the WHOLE span, every note ' +
      'it touches gets date.perf="NaN" and vanishes from the MIDI export (R24), so the span ' +
      'is ⊥. Rubato gained its first four ⊥ routes in W3b and the capped integrator with ' +
      'them, and no family member reached any of them',
    mpm: document(
      '<rubatoMap><rubato date="0.0" frameLength="720.0" intensity="not-a-number" loop="true"/>' +
        '<rubato date="2880.0" frameLength="720.0"/></rubatoMap>',
    ),
  },
  {
    name: 'articulation-anchors',
    hazard:
      'four articulation anchors at four dates with four different modifiers — the event ' +
      "dimension's ordinary path, and the side of a pair that forces the alignment DP to " +
      'trade a match against two drops rather than to align trivially',
    mpm: document(
      '<articulationMap><style date="0.0" name.ref="A"/>' +
        '<articulation date="0.0" relativeDuration="0.5"/>' +
        '<articulation date="720.0" relativeVelocity="1.4"/>' +
        '<articulation date="1440.0" absoluteDurationChange="60"/>' +
        '<articulation date="2160.0" absoluteVelocityChange="-12"/>' +
        '</articulationMap>',
      ARTICULATION_STYLES,
    ),
  },
  {
    name: 'articulation-offset',
    hazard:
      'the same four families at dates BETWEEN the previous member’s, so no anchor pairs for ' +
      'free: `λ_date` decides every match and the DP reaches its equal-cost ties, which is ' +
      'where the tie-break has to be symmetric as well as fixed (W3 MAJOR-17)',
    mpm: document(
      '<articulationMap><style date="0.0" name.ref="A"/>' +
        '<articulation date="90.0" relativeDuration="0.8"/>' +
        '<articulation date="810.0" relativeVelocity="0.7"/>' +
        '<articulation date="1530.0" absoluteDurationChange="-30"/>' +
        '<articulation date="2250.0" absoluteVelocityChange="20"/>' +
        '</articulationMap>',
      ARTICULATION_STYLES,
    ),
  },
  {
    name: 'articulation-default',
    hazard:
      'a <style>@defaultArticulation and nothing else — d_articulation’s SECOND component ' +
      '(AD-55.1), which is a step function over the window and reaches the metric by a ' +
      'different route from the atoms',
    mpm: document(
      '<articulationMap><style date="0.0" name.ref="A" defaultArticulation="stacc"/>' +
        '<style date="1440.0" name.ref="A" defaultArticulation="ten"/>' +
        '</articulationMap>',
      ARTICULATION_STYLES,
    ),
  },
  {
    name: 'ornament-plain',
    hazard:
      'a temporalSpread ornament in TICKS — the other event dimension’s ordinary path, whose ' +
      'metric status §5.6 argues in prose (deviation-from-neutral anchored at neutral) and ' +
      'which nothing computed',
    mpm: document(
      '<ornamentationMap><style date="0.0" name.ref="O"/>' +
        '<ornament date="720.0" name.ref="arp"/>' +
        '<ornament date="2160.0" name.ref="arp"/>' +
        '</ornamentationMap>',
      ORNAMENT_STYLES,
    ),
  },
  {
    name: 'ornament-milliseconds',
    hazard:
      'the same ornaments with the spread declared in MILLISECONDS: §5.6’s one genuinely ' +
      'incomparable case, since a tick frame and a millisecond frame have no common domain ' +
      'without a tempo map. It is the ⊥ the ornamentation dimension can actually reach',
    mpm: document(
      '<ornamentationMap><style date="0.0" name.ref="Oms"/>' +
        '<ornament date="720.0" name.ref="arp"/>' +
        '<ornament date="2160.0" name.ref="arp"/>' +
        '</ornamentationMap>',
      ORNAMENT_STYLES,
    ),
  },
  {
    name: 'imprecision-other-domains',
    hazard:
      'laws in the DYNAMICS and TONEDURATION imprecision maps: the P-C5 record and this ' +
      'family both stopped at timing, so two of the eleven dimensions were compared only ' +
      'against neutral (W3 MAJOR-1, MINOR-4)',
    mpm: document(
      '<imprecisionMap.dynamics>' +
        '<distribution.uniform date="0.0" limit.lower="-12" limit.upper="12"/>' +
        '</imprecisionMap.dynamics>' +
        // The clips are EXPLICIT because absent ones read as 0 and collapse a triangular to δ₀
        // (AD-49.1's degenerate table) — measured: without them this member scored 0 against a
        // document with no toneduration map at all, which is renderer-true and useless here.
        '<imprecisionMap.toneduration>' +
        '<distribution.triangular date="0.0" limit.lower="-40" limit.upper="40" mode="15" ' +
        'clip.lower="-40" clip.upper="40" milliseconds.timingBasis="300"/>' +
        '</imprecisionMap.toneduration>',
    ),
  },
  {
    name: 'imprecision-other-domains-bottom',
    hazard:
      'an EMPTY <distribution.list> in each of those two maps — the ⊥ route in the two ' +
      'domains the family did not reach, so §4’s cap is load-bearing there too',
    mpm: document(
      '<imprecisionMap.dynamics><distribution.list date="0.0"/></imprecisionMap.dynamics>' +
        '<imprecisionMap.toneduration><distribution.list date="0.0"/></imprecisionMap.toneduration>',
    ),
  },
  // W4 adds two, and they are a PAIR: the surface §6's edit path opened is a difference that
  // lives entirely in the header, where the two maps are byte-identical and only the styleDef
  // they resolve through differs. Nothing in the family reached it — every other member states
  // its levels as literals — and it is metric-relevant as well as edit-relevant, because two
  // documents that PERFORM different tempi must not compare at 0 whatever their map text says.
  {
    name: 'styled-level-slow',
    hazard:
      'a symbolic @bpm resolved through a tempoDef — the level lives in the header, not in ' +
      'the map (W4 cut A2: resolution travels with the instruction, AD-40.2)',
    mpm: document(
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo date="0.0" bpm="t" beatLength="0.25"/></tempoMap>',
      '<tempoStyles><styleDef name="T"><tempoDef name="t" value="60"/></styleDef></tempoStyles>',
    ),
  },
  {
    name: 'styled-level-fast',
    hazard:
      'the SAME map text as styled-level-slow with a different tempoDef: the pair is a real ' +
      'distance whose whole cause is invisible in the maps being compared',
    mpm: document(
      '<tempoMap><style date="0.0" name.ref="T"/>' +
        '<tempo date="0.0" bpm="t" beatLength="0.25"/></tempoMap>',
      '<tempoStyles><styleDef name="T"><tempoDef name="t" value="120"/></styleDef></tempoStyles>',
    ),
  },
];

/**
 * AD-57.2's drop-each-member coverage check, made re-runnable rather than run once.
 *
 * Setting `COMPARISON_DROP_MEMBER` to a member's name removes it from the family, so
 *
 *     for m in $(node -e '…names…'); do COMPARISON_DROP_MEMBER=$m npx vitest run …; done
 *
 * answers "which members are load-bearing?" without patching a file. The W3 verifier ran the
 * equivalent by hand; a hook makes the answer reproducible by anyone who doubts it, which is the
 * difference between a measurement and an anecdote. AD-57.2 rules the family must NOT be pruned
 * on the result — a member that no test currently reaches still documents a distinct hazard, and
 * the check exists to say WHICH tests would notice, not to shorten the list.
 */
const DROPPED = process.env.COMPARISON_DROP_MEMBER ?? '';

/** The family as the suite sees it — the full list, unless the drop hook names a member. */
export function adversarialMembers(): readonly AdversarialMember[] {
  return DROPPED === '' ? ADVERSARIAL_FAMILY : ADVERSARIAL_FAMILY.filter((m) => m.name !== DROPPED);
}

/** Every ordered pair of distinct members — the triangle test's inner loop. */
export function adversarialPairs(): readonly (readonly [AdversarialMember, AdversarialMember])[] {
  const pairs: (readonly [AdversarialMember, AdversarialMember])[] = [];
  const members = adversarialMembers();
  for (const a of members) for (const b of members) if (a !== b) pairs.push([a, b]);
  return pairs;
}

/** Every unordered triple — the triangle inequality's domain. */
export function adversarialTriples(): readonly (readonly [
  AdversarialMember,
  AdversarialMember,
  AdversarialMember,
])[] {
  const triples: (readonly [AdversarialMember, AdversarialMember, AdversarialMember])[] = [];
  const members = adversarialMembers();
  for (let i = 0; i < members.length; ++i)
    for (let j = i + 1; j < members.length; ++j)
      for (let k = j + 1; k < members.length; ++k)
        triples.push([members[i], members[j], members[k]]);
  return triples;
}
