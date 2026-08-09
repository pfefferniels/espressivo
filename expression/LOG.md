# Expression-Transform Campaign — Journal (append-only)

## 2026-08-09 W0 — program start

- Worktree `meico-ts-exag` created, branch `exaggeration` off main @ da24612.
- Baseline `npm run verify` GREEN in worktree: 59 files, 2365 tests.
- CAMPAIGN.md written (constitution).
- Peer coordination:
  - **orn conductor (meico-ts-09)** replied with the full v3 ornament attribute
    surface (temporalSpread frame.offset as TemporalValue, frameLength TemporalValue
    default "100%", intensity >0 neutral 1.0, NO frame.end attribute — corrected my
    assumption; dynamicsGradient transition.from/.to ∈ [-1,1] neutral 0;
    ornament@scale ≥0 default 0.0 with the multiply-to-zero quirk; repetitions int
    with -1 fill extension; pool attrs midi.pitch / interval.* mostly not
    exaggerable). Merge to main expected within ~a day; THEY merge first, we rebase
    after; hold-and-ping protocol on merge day.
  - **mlign-57** replied: engine is directly useful as training-data augmentation.
    Their requirements adopted as DESIGN requirements R1–R6 (pure deterministic
    document transform; no RNG; s-record with missing=identity; documented sampling
    ranges; transformability report; symbolic-invariance guarantee tested; velocity
    clamped to [0,127] on the data path). They consume at first usable commit —
    ping them.
- W0 survey workflow launched (wf_772de42b-1f4): 8 map-family readers +
  conventions brief + prototype-test intent, synthesized into expression/SURVEY.md.

## 2026-08-09 W1 (early) — design decision: scope of level exaggeration

Decision, before survey completion (survey cannot overturn it — it is about
semantics, not code facts): tempo/dynamics exaggeration gets a `scope` option,
default **global** (around the map-wide unweighted geometric mean of level
values, caller-overridable center), with **local** (prototype behavior,
per-transition geomean) for spotlight use. Rationale: piecewise-constant maps —
the dominant shape of mpmify-sampled/inferred MPMs and mlign's training inputs —
are silent no-ops under the prototype's local-only rule. Unweighted mean because
duration-weighting needs piece length, which an MPM alone doesn't have (R1).
Proof obligations added to the property-test plan: center invariance ⇒ P2
composition in both scopes. DESIGN.md §1.1. mlign notified (accepted R1–R6 +
told about global scope).

## 2026-08-09 W1 — registry compiled; OPEN-1…7 resolved (conductor decisions)

W0 survey workflow done (11 agents, 0 errors): SURVEY.md 5103 lines. Registry
compiled into DESIGN.md §7/§8 with 7 ⚠ OPEN conflicts. Resolutions, decided and
journaled BEFORE execution per governance:

1. OPEN-1 → performance-wide center per dimension (geomean of style-resolved
   levels, element-identity dedupe); defs share the center ⇒ P2 exact everywhere.
   Tempo in quarter-note-normalized space; heterogeneous-beatLength defs skipped
   + reported.
2. OPEN-2 → joint trim reparameterization t = ls + (1−ee), boundary-power on t,
   split on preserved ratio; cross-site partial overrides skipped + reported.
3. OPEN-3 → P1 = canonical-baseline equality universally; strict input==output
   only for docs without self-mutating defs (rubatoDef/accentuationPatternDef
   with omitted attrs); exception pinned by a test.
4. OPEN-4 → R6 restated: [1,127] clamp on dynamics LEVEL attributes + reported
   per-dimension velocity-offset estimates; cross-dimension overflow is the
   caller's call, informed by the report.
5. OPEN-5 → gradient endpoints are gain (renderer semantics beat nominal domain);
   no clamp; leaving [−1,1] reported informationally. Divergence from O1's
   "linear with clamp" — orn conductor asked to confirm v3 enforcement.
6. OPEN-6 → endpoints are the single site; ornament@scale EXCLUDED (absent≙0
   dead lever + s² partner). v3 dormant row updated; orn conductor notified.
7. OPEN-7 → scale anyway; D-F exactness weakened to explicit-basis; derived-basis
   re-indexing flagged in report; determinism per (mpm,s) unaffected.
   materializeTimingBasis noted as possible future option, not v1.

§8 rubato row simplification follows from (2): the per-document crossing bound
disappears; the trim transform saturates smoothly.

## 2026-08-09 W1 — panel adjudication (binding; supersedes conflicting text above)

4-lens panel: all SOUND-WITH-FIXES; findings archived verbatim in
REVIEW-FINDINGS.md. Adjudication (conductor). Accepted unless noted:

A1 **Full-raw applier.** Parse with raw Builder (verified non-mutating by the
   feasibility lens), never the Mpm class (whose CONSTRUCTOR runs the mutating
   def parsers; GenericMap.parseData additionally re-sorts children and hoists
   whitespace). The applier replicates: date-stable child ordering as an
   internal view (never rewriting the document), positional style scope
   (findStyleSwitchAt semantics, never getStyleAt), whole-styleDef shadowing,
   renderer parseFloat/def-lookup-first numeric semantics. Navigation via
   child-element walkers; Element.query is banned (serialize+reparse cost).
A2 **P1 recontracted; Tier 2 dropped.** xmlns re-emission makes strict
   input==output impossible for every MPM. P1: output of identity transform ==
   raw parse→serialize bytes, tested for BOTH factors={} and factors={every
   dimension: 1}; s===1 short-circuits at dimension level + defensive identity
   in each transform (float round-trips at s=1 are not identities).
A3 **Composition honesty.** P2 exact only clamp-free and to ~1 ULP; property
   tests assert with epsilon and only when report.clamps==0; computed centers
   are reported and re-acceptable via options.center for exact composition
   under clamping. P3 for boundary-power requires s ≥ 0 — per-scale-space
   s-domains live in the registry; per-dimension = intersection; violations are
   typed errors. s=0 = "write the neutral" closed form (no 0·∞ NaN);
   logit/boundary saturation to exact 0/1 refuses the write + reports (cliff).
A4 **Validation gate.** read→validate→transform→validate→write; out-of-domain
   inputs are skipped+reported (never transformed, never "repaired"); the
   engine never writes a non-finite value (global invariant, adversarial-XML
   property test). Ornament-intensity epsilon floor DROPPED (gate subsumes it).
A5 **Center algorithm.** Population = exactly the distinct element sites the
   run will transform: numeric level attributes (bpm/volume on their elements)
   + referenced def @values, each ONCE; transition.to excluded from the
   population (still transformed); placeholders/unresolvables/unreferenced defs
   excluded and not transformed; skip-set computed first. Unweighted geomean
   over that population; span-weighting considered and REJECTED (would need an
   arbitrary last-span rule; callers wanting other centers pass options.center;
   centers always reported). Tempo population in quarter-note-normalized space.
A6 **Joint trim guard restored.** t' clamped to ≤ 1 − minRubatoWindow (option,
   default 1e-6, documented as IEEE saturation guard); assert ls' < ee' before
   write, typed engine error otherwise; §8 gets the per-document bound back as
   a report field.
A7 **Scopes: global | gesture** (replaces "local"). gesture = transition pairs
   attenuate around their own geomean; constants and defs untouched; gain
   dimensions attenuate toward 0 as usual. SPOTLIGHT uses gesture scope
   (resolves the 3-way contradiction; global-scope spotlight provably re-levels
   background LOUDER). End-marker duplicate = HANDLED: the duplicate constant
   moves with its transition.to (single musical value, not an independent
   lever). Piecewise-constant maps under spotlight: level dims inert+reported.
A8 **Spotlight contract.** Type→dimension mapping table becomes part of D-I
   (with the §3 splits). ids=[] ⇒ identity+report; unresolved or
   dimension-less ids ⇒ new SelectionNotFoundError listing every offender
   (movement/style selections are caller mistakes, never silent flatten-all).
   attenuation ∈ (0,1], single scalar; pair writes that would collapse to the
   renderer's exact-float constant test (String(to')===String(bpm')) are
   refused + reported.
A9 **Dimension set v2 (15).** tempo, tempoShape (meanTempoAt), dynamics,
   dynamicsShape (curvature+protraction), rubato, articulation, accentuation,
   ornamentSpread (frame), ornamentSpacing (intensity), ornamentDynamics
   (gradient endpoints), asynchrony, imprecisionTiming, imprecisionDynamics,
   imprecisionDuration, pedalShape (movement curvature/protraction — the
   panel's twin-of-dynamics argument overturns D-G for the shape pair; position
   stays excluded). Tuning imprecision: excluded, inert (write-only), reported.
   Prototype 8-weight preset maps onto v2 dimensions with documented
   correspondence.
A10 **Report v2.** SiteRef vocabulary {scope, partIndex, container, date,
   index, attribute, xmlId} on every per-site note; glossary: absent (not in
   document) | inert (present, no rendered effect) | transformed | partial
   (articulation component asymmetry — staccato family documented) | skipped;
   velocity estimates as coefficients {multiplicative, additive} per dimension
   incl. imprecisionDynamics; mergedLevels for clamp-collapsed named defs;
   appliedFactors echo, centers, totalWrites, per-performance sub-reports;
   all numbers finite or null (RULE F1). Optional input msm?: XmlText used
   ONLY for report estimates (R1 carve-out, documented; fields null without
   it; accentuation falls back to def-anchor form + beatsUnverifiable).
A11 **Options/API.** Unknown factor keys / non-finite values ⇒
   InvalidOptionError; EXPRESSION_DIMENSIONS exported. velocityRange option
   default {min:1,max:127} — floor 1 documented (velocity 0 is a note-off),
   mlign notified of the narrowing from their "[0,127]". Articulation
   min-note-length clamp DEMOTED to report-only cliff risk. Default
   performance handling: ALL performances transformed (a document transform);
   options.performance narrows; divergence from performMsm's pick-one
   documented. Seeded-render reproducibility claim CUT (codebase is
   explicitly nondeterministic there); mlign re-notified.
A12 **P5 split.** P5a (attribute level) definitional, not tested as discovery;
   P5r (render level) per-row verdict column: holds | saturates | non-monotone
   | cliff — articulation's affine velocity pair documented non-monotone
   (net-deviation transform rejected: needs MSM velocities, violates R1).
A13 **§8 re-derived** under final rules: tempo 0.5…2 log-uniform + per-document
   bound formula in the report; split dimensions get their own rows/spaces;
   spotlight attenuation (0,1].
A14 Per-row "expected direction" render tests added to the W3 plan (the
   property suite alone cannot validate registry choices — panel MINOR).

## 2026-08-09 W2 — foundation layers landed; w2b design-vs-code findings

W1 committed as 4171766. W2a (transforms, 96 tests) + W2b (raw document layer,
6 modules, 95 tests incl. GenericMap/DynamicsMap parity pins) landed
uncommitted; full verify green at 2556 tests. W2b found six places where
DESIGN's wording diverges from the code — all implemented TO THE CODE, none
silently; DESIGN D-A gets a batch amendment at W2 commit:

1. Date ordering is the renderer's backwards-insertion LOOP, not a stable sort:
   NaN dates insert at the FRONT (GenericMap.ts:148-155). Transliterated.
2. xml/tree.ts allChildElements/firstChildElement(2-arg) ARE Element.query —
   the D-A ban must name them; document layer uses getChildElements only.
3. Def lookup indexes only VALID defs (parseJavaDouble throws → factory null →
   skipped): invalid def ⇒ name falls through to parseFloat; last VALID
   duplicate wins, not last duplicate.
4. parseJavaDouble accepts Java NaN/Infinity literals ⇒ def index can hold
   non-finite values; kind==='def' does NOT imply finite — the A4 gate must
   reject, integrator warned.
5. The ordered view excludes <style> without @name.ref (not only dateless
   children), per GenericMap.ts:145-146.
6. Map/style-collection discovery is descendant-axis last-one-wins (Header.ts:75,
   Dated.ts:63), replicated as a pre-order walk over child primitives.

Also noted: Builder malformed-input errors are xmldom's FOREIGN ParseError
(XomTypes' own handling is dead code) — facade must catch accordingly (the
existing api/pipeline.ts parseOrThrow pattern already does this); eslint
LAYER_ZONES and vitest coverage don't yet know src/expression/** — to be added
at W2 commit (coverage include + a layer zone permitting expression→xml only).
Verified for A5: whole-styleDef shadowing means a part-shadowed global def is
NOT referenced on that part's account (must not enter the center population);
the renderer's invented 100.0 for unresolvable levels is NEVER a center member
(engine reports NaN and skips).

## 2026-08-09 W2 — w2a rulings (conductor; DESIGN amendments batched to W2 commit)

w2a delivered 96 tests + 11 interpretations. Rulings:
R-W2-1 A3's saturation REFUSAL supersedes §7.3's pre-adjudication ε output
  clamp for meanTempoAt (refuse + report, never clamp-write). §7.3 amended.
R-W2-2 Saturation rule ratified as w2a stated it: saturation = an INTERIOR
  input landing on a bound it did not start on ⇒ refusal; an input already on
  an admissible bound is a fixed point. Bound-to-bound flips (protraction +1 at
  s=−1) are refused — inversion is not exaggeration.
R-W2-3 jointTrimWindow's clamp-not-refuse is the A6 carve-out working as
  designed (smooth saturation), not a deviation; pinned contrast test kept.
R-W2-4 DESIGN's cited crossing triple corrected: exact-1.0 rounding for
  (.45,.55) begins at s=17, not 16 (at 16 the clamp fires first — A6 guard
  still load-bearing). §7.6/A6 text amended.
R-W2-5 Ratified without change: closed-form-vs-metric anchor tests (#5),
  conditioned ULP tolerance — downstream P2 tests must condition by distance-
  to-bound, not flat epsilon (#6), asymmetric logit cliffs on (0,1) (#7),
  boundary-power closed at both ends (#8), geometricMean exactness branches for
  single/all-equal populations (#9 — protects piecewise-constant corpus
  identity), empty center population = refusal ⇒ dimension inert (#10),
  minWindow domain (0,1) (#11).
Housekeeping (vitest coverage include + eslint zone) assigned to w2c.

## 2026-08-09 W2 — w2c integration complete; 12 resolutions ratified

w2c delivered registry (82 live rows) + gate + levels + applier + report +
options, 183 tests; verify 2739. All 12 spec resolutions RATIFIED as reported
(see w2c report, reproduced in the wave-verification records): highlights —
volume≤0 gated by log-space intersection and velocityRange.min≤0 now an option
error; defs join the center population only via PREVAILING-level references
(transition.to naming a def does not enroll it — symmetric with A5's literal
side); articulation 'partial' generalized to any-excluded-lever-beside-a-
transformed-one; cross-site rubato windows skip BOTH sites; pair-collapse
refusal refuses BOTH endpoints (gesture scope at s→0 reports pair-collapse-
refused everywhere rather than flattening — the D-I attenuation>0 rule's
mechanical backstop); bounds.tempoMaxS RENAMED bounds.tempoDeviationRatio (§8's
window [lo,hi] is the caller's, C2 forbids inventing it) — §4 amendment;
ReportNote.site nullable for dimension-level notes; 'skipped' state +
dimension-level verdict mechanism; gradient-outside-nominal-range note kind;
rowForIn for the triple-map distribution family; beatLength-less <tempo>
inerts tempoShape too. W3 carries: state can be 'inert' with sitesSkipped>0;
options.ts + the A6 ls'<ee' assertion throw plain Error for the facade to wrap.
Pre-existing repo issue (NOT ours, report to user): `npm run lint` fails with
~1017 errors in tests/** on a pristine checkout; verify does not run lint.
DESIGN amendment batch dispatched to registry-compiler; adversarial wave
verification launched in parallel (4 lenses).

## 2026-08-09 W2 — verification results and fix-wave adjudication

Verdicts: tests PASS-WITH-FIXES, idiom PASS-WITH-FIXES, rows PASS-WITH-FIXES,
numeric adversary FAIL (narrowly, levels.ts; 13/15 dimensions matched
independent hand-computation exactly). Full findings: W2-VERIFICATION.md.
MUST-FIX before W2 commit (dispatched to w2c):
 F1 BLOCKER pair-collapse guard cannot refuse def-side writes (half-applied
    inverted gesture); F2 gesture-duplicate unit mismatch (detected in QN
    space, written in own beat units); F3 dynamicsShape NaN-endpoint constancy
    bypass (use renderer 100.0 fallback in isConstantDynamics ONLY);
    F4 tempoShape degenerate-pair rule (mirror dynamicsShape); F5 discharge
    the five undischarged §7.16 read-it obligations (frame-unit,
    noteoff-shift, sub-note-dynamics, loops/stickToMeasures notes);
    F6 velocityCoefficients finite-or-null at source + tests; F7 broaden the
    A4 adversarial no-nonfinite-write sweep; F8 state precedence
    transformed/partial per §4-as-amended; F9 transition-to-absent misfire;
    F10 EXCLUDED_ARTICULATION_LEVERS += detuneCents/detuneHz; F11 center
    population must be built from gate-SURVIVING values only (population =
    transform set, A5); F12 delete the six leftover scratch test files; plus
    the cheap MINORs (report array leaks, IDENTITY_FACTOR triplication,
    scalarSpaceOf naming, velocityRange aliasing, Number.isFinite consistency,
    verdict setter, zero-assertion test, pin skipped>inert precedence, cover
    'clamped' note kind, P2 moved-guard, enrich P1 byte fixture, tighten the
    13-note slack assertion).
DECLINED (journaled): removing boundary-power-high (kept: R-W2-5 #8 symmetry,
tested, zero cost); estimates-field §4 documentation goes to the W3 design
batch (field ships now, valued null — already per A10).

## 2026-08-09 W2 — fix wave ratified; W2 committed

w2c fix wave: F1–F12 + all MINORs done, +41 tests (2780), every fix pinned by
a test failing on pre-fix code. Ratified: (1) the F8 interpretation — "any
write at a FULLY-REACHABLE site makes the dimension transformed"; partial
stays reachable; §4 rewording joins the W3 design batch, along with the
gesture-scope qualification of the tempo@bpm/dynamics@volume row notes;
(2) F1's transitive refusal fixpoint across shared defs (a def is one shared
site; reported suppression beats half-application); (3) NUL-byte hygiene scan
added to the commit ritual after w2c found two raw NULs in registry.ts had
made grep classify it as binary — silently exempting it from every grep-based
verification claim. Scan clean; verify green; W2 committed.
