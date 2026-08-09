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
