# MPM v3 Ornamentation in meico-ts — Design

Status: ADOPTED 2026-08-09 (conductor). Amendments require a LOG.md entry.
Evidence base: `research/java-ts-v2-ornamentation.md` (v2 exact semantics),
`research/github-v3-design.md` (spec rationale + ambiguity table),
`research/lars-v3-implementation.md` (reference-impl blueprint + bug catalogue + port
recommendations), `research/fixture-harness-feasibility.md` (harness + PR defect
confirmation), `research/architecture-brief.md` (codebase law).

## 1. Goal and non-goals

Implement the complete MPM v3 ornamentation model (spec: axelberndt/MPM develop
@ 1de00bb, v3.0.2) in meico-ts: note pools, full `note.order` grammar (chords,
repetition groups), `repetitions`, `alignment`, per-value unit suffixes, all three
`noteoff.shift` modes over generated notes, dynamics gradients over ornament
sequences, multi-ornament layout, MEI ornament expansion (`ornaments.dict`).

Non-goals: byte-parity with LarsEngeln/meico@3deb141c (it is defective — audit table
in the blueprint §8; we match its *intent*, not its bugs); implementing the MPM
Toolbox GUI side; changing v2 behavior in any byte-visible way.

## 2. Order of authority

1. MPM v3 spec at develop @ 1de00bb: schematrons > attDef tables > ODD prose >
   figures. Where they conflict internally, the ruling is recorded below.
2. Real-corpus practice (the repo's own sample encodings + ODD examples) governs
   *reader lenience* — the strict schematrons reject the format's own corpus.
3. Lars' implementation (PR cemfi/meico#31) decides questions the spec leaves open —
   adopted formula by formula, never wholesale.
4. v2 behavior (Niels' meico @ 1d662105 + committed fixtures) is inviolable for v2
   inputs: **a document without v3 features must render byte-identically to today.**

## 3. Decision register

Each D# is binding for implementers. "(=Lars)" marks adoption from the reference
impl; "(≠Lars)" a deliberate divergence from it, which lands in PARITY.md §v3.

- **D1 — pool child element is `note`** (spec). `ornamentNote` (PR-internal, never in
  any spec release, and inconsistent even inside the PR) is NOT read. (≠Lars)
- **D2 — `alignment`**: read from `ornamentDef` (spec) AND `temporalSpread` (Lars/
  changelog); `ornamentDef` wins if both. Serialize on `ornamentDef` only. Values
  exactly `"at start"` (default) / `"at end"`.
- **D3 — unit values** (`frame.offset`, `frameLength`): a `TemporalValue` type,
  domains Ticks | Milliseconds | Relative. Strict grammar = spec regex
  `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`; lenient additions accepted on read:
  suffix-less number → domain from legacy `@time.unit` if present, else Ticks
  (matches every real corpus file); `frame.start` accepted as `frame.offset` alias.
  No `th`/`?` domains (Lars artifacts). Domains are **per value**, not per element
  (`frame.offset="22.0ms" frameLength="90%"` is legal, ODD example). frameLength
  defaults: bare `<temporalSpread>` in a v3 context → `100%` (spec); parse failure →
  log + treat attribute as absent (never destroy the def — ≠Lars bug 1). Negative
  frameLength: clamped to 0 (v2.1.4 minInclusive intent, =Lars, spec regex sloppiness
  documented).
- **D4 — `%` resolves against the principal note's TICK duration, in the symbolic
  phase.** (≠Lars, who uses ms duration.) Rationale: (a) the ODD pipeline assigns
  only "milliseconds modifiers" to the post-tempo pass — `%` is not a milliseconds
  modifier; (b) Berndt's issue-#55 ruling: tick-domain ornaments are "tempo
  dependent … we can use the tempo and rubato models to refine its timing" — a
  %-frame trill should breathe with rubato, which only tick-domain placement gives;
  (c) the figure derives % from notated (score-time) duration. Consequence: % and
  ticks frames space notes in ticks before tempo rendering; ms frames go through the
  ms marker mechanism (D6).
- **D5 — phase architecture** (the core ≠Lars decision, fixes his bugs 4–7 by
  construction):
  - **Phase N (symbolic)** — in the existing per-part symbolic ornamentation slot
    (after rubato, before tempo; `Performance.renderPartSymbolic` last step, same
    for global): v3 detection per ornament; principal resolution; `note.order`
    expansion (chords, repetitions, dedup, landing); **generated notes are inserted
    into the MSM score as real `<note>` elements** with tick `date`/`duration` and
    resolved `midi.pitch`; principal carving (leftovers per D10); `note.order.perf`
    written; tick/% frames spaced here via the v2 spacing engine (markers
    `ornament.date.offset` / `ornament.duration` / `ornament.noteoff.shift`);
    dynamics gradient markers (`ornament.dynamics`) written here. The immediately
    following v2 tick pass (`renderAllNonmillisecondsModifiersToMap`) folds markers
    into `date.perf`/`duration.perf`/`velocity` — so gradients DO reach velocity
    (≠Lars bug 4), and generated notes then flow through tempo rendering like any
    note (ticks stay consistent, ≠Lars bug 6/7; asynchrony/articulation-ms/
    imprecision apply to them naturally).
  - **Phase B (milliseconds)** — unchanged v2 ms pass consumes ms markers written by
    Phase N for ms-suffixed frames. NOTE: the pass exists twice (Performance private
    copy = live, OrnamentationMap copy = parity code); any change lands in BOTH,
    journaled (architecture brief §2.5). Expected: NO change needed to the ms pass
    itself — Phase N only feeds it standard v2 markers on more notes.
- **D6 — v2 path byte-frozen.** v3 processing triggers per ornament only on v3
  features (pool children present, or `repetitions` attr, or `noteid`, or grouping/
  repeat tokens in `note.order`). An ornament without them takes the v2 code path
  untouched. Gate: pipeline byte-probe over all existing fixtures, before/after,
  every wave.
- **D7 — principal resolution**, in spec order: (1) `@noteid` (accept `#`-prefixed
  and raw); (2) first `note.order` ID ref that is not a pool-note id and resolves to
  an MSM note; (3) no principal: render only if every referenced pool note has
  explicit `midi.pitch` — frame then anchors at the ornament's `@date`, `%` frames
  unresolvable → log + skip; else log + skip ornament, still writing
  `note.order.perf` (=Lars) for downstream visibility. (≠Lars: he implements only
  (1).)
- **D8 — pitch resolution of pool notes**: `midi.pitch` (double, as MSM) absolute;
  `interval.chromatic` (double) = principal `midi.pitch` + value (microtones legal —
  MSM carries fractional midi.pitch; MIDI export rounds as today); `interval.diatonic`
  (int): resolved against the part's MSM key signature at the ornament date
  (major-scale degrees of the key; accidentals of the principal preserved) — the spec
  says only "context-sensitive", Lars resolves upstream in MEI. We implement MSM-side
  resolution (needed for MPM-authored documents) AND the MEI-side path in the
  expansion wave. Mutual exclusion (schematron): if >1 pitch attr present → priority
  midi.pitch > interval.chromatic > interval.diatonic, log warning. Zero pitch attrs
  → principal pitch (spec defaults).
- **D9 — expansion semantics** (=Lars where cited): plays = `repetitions`+1 over the
  repeat group; `:|:` normalized to `:| |:`; bare `|` accepted+ignored; chords
  `[ #a #b ]` occupy ONE spacing slot; tokenization on `\s+`; unknown/malformed
  tokens are skipped with a log (NEVER an infinite loop, ≠Lars bug 2);
  `ascending pitch`/`descending pitch` keep full v2 behavior (≠Lars bug 3);
  consecutive duplicate pitches after expansion are dropped unless the whole
  sequence is single-pitch (=Lars, preserves tremolos); landing rule: if the repeat
  group starts on a principal-pitch note, one principal-pitch copy is appended after
  expansion (=Lars); `repetitions="-1"` fill-the-frame extension accepted
  (documented as schema-invalid meico extension): note count =
  ceil(frameLength_ms/150) with guards (≠Lars bug 9), requires ms-resolvable frame,
  else log+skip.
- **D10 — generated-note timing and carving** (grounded in figures 1–3, worked
  examples §5): ornament sequence occupies the frame [anchor+offset,
  anchor+offset+length]; anchor = principal date ("at start") or principal end −
  length ("at end", =Lars formula with offset added, reimplemented cleanly). Spacing
  within frame = v2 power-function engine (dateOffset(i) = (i/(n−1))^intensity ×
  length + start; last slot pinned at start+length; n=1 → end of frame). NB the v2
  engine's slot formula divides by (n−1) with the last slot pinned; v3 note
  instantiation feeds it n slots for n sequence positions — worked examples in §5
  define the exact expected numbers the tests pin. noteoff.shift over generated
  notes: `false` → every ornament note ends at principal noteOff; `true` → every
  note keeps principal's duration (ends shift with onsets); `monophonic` → each note
  ends at the next note's onset, the LAST note ends at principal noteOff (figure 1's
  tie). Principal replacement: if the ornament generated notes, the principal MSM
  note is replaced by the sequence plus leftovers: "at start" → no head leftover
  (frame may start before principal via negative offset), tail is covered by the
  last note per noteoff.shift (no separate tail fragment); "at end" → head leftover
  = a principal-pitch note [principal date, frame start) IF that span > 1ms-equiv
  (leftover fragments ≤1ms dropped, =Lars). Generated notes inherit the principal's
  performance-relevant attributes (velocity base, part/channel context) via clone —
  exact list in implementation, mirroring copyNotePerfInformation minus its bugs.
  Original principal id is preserved on the first principal-pitch leftover (or first
  principal-referenced generated note if no leftover) so goto/marker wiring and MEI
  id links survive; all other generated notes get fresh generated ids; every
  generated note carries `ornament.generated="true"` and `ornament.ref="<ornament
  xml:id if present>"` provenance attributes (≠Lars, port rec. 7).
- **D11 — multi-ornament layout** (=Lars intent, reimplemented from formulas, his
  bugs 11–16 excluded): group ornaments by principal in map order; partition into
  front (at-start) and end (at-end); scaleFactor = min(1, principalDuration /
  totalRawLength) applied to lengths; front laid out by cursor from principal start;
  end group packed against principal end; overflow shrinks proportionally (the rule
  the spec drafted then commented out — we implement it and cite the comment).
- **D12 — serialization is generation-preserving.** Objects remember their source
  format: v2-sourced (parsed from frame.start/time.unit or built via the existing v2
  API) serialize EXACTLY as today — the all-maps fixture comparisons stay
  byte-green. v3-sourced (parsed from v3 syntax or built via new v3 API) serialize
  canonical v3: `frame.offset` with unit suffix, no `time.unit`, `alignment` on
  `ornamentDef`, `scale` always written (≠Lars: his 1.0-omission → 0.0 round-trip
  bug), `repetitions` written only when ≠0 (≠Lars: he stamps repetitions="0" on v2
  ornaments). Revisit at integration: user/conductor may later choose
  canonical-v3-always + fixture regeneration; this design makes that a small,
  isolated change.
- **D13 — MSM `<note>` name for generated notes**, so MIDI export, facade note
  discovery, and every downstream pass see them with zero further changes
  (architecture brief §4.3.2). They must carry `date`, `duration`, `midi.pitch`.
- **D14 — negative dates**: clamp note-on AND note-off at 0 in MIDI export **only if
  already clamped today**; otherwise leave export untouched and prevent the case at
  the source: a generated note whose end ≤ 0 is dropped, one overlapping 0 is
  clamped at creation (≠Lars bug 17 — his export-side repair is wrong and touches
  shared export code we must not destabilize).
- **D15 — facade exposure (additive only)**: `PerformedNote` gains
  `ornamented: boolean` (note was generated by or altered by an ornament) and
  `ornamentRef: string | null`. `PerformOptions` gains `expandOrnaments?: boolean`
  (default true; mirrors PR #32's CLI opt-out) validated in checkPerformOptions,
  twinned in RenderOptions with the default resolved inside src/mpm. dist/api must
  remain byte-identical except these additions; N4/U3a/F1 rules apply.
- **D16 — errors/lenience**: interior keeps logs-and-returns/skips (RULE E1); new
  parse code uses parseJavaDouble for numeric attrs (it is NEW code — P1 note does
  not protect it); no throws on malformed v3 input, log + skip the ornament;
  per-test timeouts on expansion tests (repetition loops).
- **D17 — MEI expansion wave**: port `ornaments.dict` (verbatim resource) +
  MeiOrnamentExpander semantics: MEI `trill|mordent|turn` (+ SMuFL/`@altsym` names
  via dict aliases) expand to MPM ornaments with pool notes; diatonic steps resolved
  in the MEI layer against pname/oct context (=Lars); `arpeg` keeps its existing v2
  path unchanged (byte parity!); expansion respects `expandOrnaments` option. Exact
  scope refined at wave start from blueprint §7; defects listed in §7.5 excluded.

## 4. Module map (per architecture law)

All new code in L4 `src/mpm/` unless noted:

- `src/mpm/elements/styles/defs/TemporalValue.ts` — value type + parse/serialize
  (pure, no XML deps beyond callers passing strings). RULE C4: factory `fromString`,
  strict/lenient modes explicit.
- `src/mpm/elements/maps/data/noteOrder.ts` — tokenizer/AST/serializer for
  `note.order` (pure module, precedent: bezier.ts).
- `src/mpm/elements/maps/data/ornamentExpansion.ts` — pure expansion engine:
  (AST, pool, principal, repetitions) → resolved sequence of slots (each slot =
  list of pitch specs); dedup + landing rules.
- `src/mpm/elements/styles/defs/OrnamentDef.ts` + `TemporalSpread.ts` (+ alignment,
  TemporalValue fields; C1a lazy-XML constraint respected; v2 serialization path
  untouched) — `DynamicsGradient.ts` unchanged.
- `src/mpm/elements/maps/data/OrnamentData.ts` — pool notes, repetitions, noteid;
  `apply` becomes the live seam returning generated chords (the dead loop comes
  alive — negative control required).
- `src/mpm/elements/maps/OrnamentationMap.ts` — v3 detection, principal resolution,
  note instantiation + carving + multi-ornament layout (new private modules ok),
  registration unchanged.
- `src/mpm/elements/Performance.ts` — minimal: the symbolic slot already calls
  renderOrnamentationToMap; global fallback per v2; ms pass untouched (both copies).
  Any edit here owes a call tracer + negative controls (brief §2.6).
- `src/mei/` (expansion wave): `MeiOrnamentExpander.ts`, dict resource under
  `src/mei/resources/ornaments.dict.ts` (as const table — no runtime file IO).
- `src/mpm/names.ts`: new element/attr name constants (RULE M3).
- Facade: `src/api/types.ts` + `pipeline.ts` additive fields (D15).

## 5. Worked examples (normative test vectors)

The implementation waves must reproduce these hand-computed vectors (they encode
figures 1–3 + spec exempla; full arithmetic in tests):

1. **Figure-1 turn at start**: principal C (midi.pitch 64 in tests), date 0,
   dur 1440 ticks; pool n2=+1, n3=−1 chromatic; note.order="#n2 #P #n3 #P";
   def: frameLength="50%", alignment="at start", noteoff.shift="monophonic",
   intensity 1. Frame = [0, 720] ticks. The v2 spacing engine spans onsets over
   [start, start+length] inclusive (last slot pinned at frame end): onsets 0, 240,
   480, 720; monophonic ends 240, 480, 720, and the last note ends at principal
   noteOff 1440 (the tie). Principal replaced; no leftovers.
2. **Figure-2 turn at end**: same but alignment="at end", frame=[720, 1440]; head
   leftover = principal pitch [0,720); onsets 720..1440 as above; last ends 1440.
3. **Figure-3 trill**: frameLength="50%", frame.offset="360ticks",
   repetitions="3", note.order="|: #n1 #P :|" (n1=+1 or per dict trill "0 1" —
   vector uses the exemplum's half-tone), frame=[360,1080]; expansion: (3+1)×2=8,
   landing rule appends P if group starts on principal pitch (here group starts on
   n1 → no landing per D9; the exemplum's "played four times" = 8 notes) → 8 slots.
4. **v2 regression**: all-maps ornamentation fixtures byte-identical, every wave.
5. **ms-domain v3**: frame.offset="-30ms" frameLength="60ms" over a chord →
   markers equal to today's v2 spreadMs fixture values when applied to the same
   notes (proves Phase-N ms marker writing = v2 semantics).
6. **Monophonic ms trill** from the feasibility probe (§4c numbers: 7 notes,
   71.43ms, gradient 2.0→−2.0) — recomputed for our D4/D5 phases; the probe's
   Lars-run numbers are used as a cross-check of the spacing/gradient math only.

## 6. Test strategy

- Unit: every new pure module exhaustively (parser fuzz cases incl. the schematron's
  own corpus + malformed inputs; expansion property tests: monophonic ⇒
  non-overlapping ∧ within-frame ∧ ordered; false ⇒ common end; true ⇒ equal
  durations).
- Worked-vector tests (§5) with the arithmetic in comments.
- Integration: NEW dir `tests/integration/fixtures-v3/` (spec-derived provenance
  header in every file; separate from the immutable Java-verified fixtures) +
  `tests/integration/ornamentation-v3.test.ts` driving MSM+MPM → augmented MSM →
  MIDI through the real pipeline. vitest include-list updated (coverage law).
- v2 byte gates every wave: `npm run verify` + pipeline byte-probe
  (ornamentation/tools/probe.mjs) + emitted-JS diff for claimed-type-only waves.
- Negative controls per wave (the dead-loop coming alive gets one proving the old
  suite would NOT have caught a bogus implementation; Performance.ts changes get a
  call tracer).
- Wave protocol: implementer agent → adversarial verifier agent (fresh context,
  instructed to FAIL) → conductor commits. TREE FREEZE after READY (inherited).

## 7. Implementation waves

- **W1** TemporalValue + tests.
- **W2** noteOrder parser/AST + tests.
- **W3** Model layer: OrnamentDef/TemporalSpread v3 fields + lenient parse +
  generation-preserving serialization; OrnamentData pool/repetitions/noteid;
  OrnamentationMap parse/serialize + addOrnament v3; round-trip + v2-byte tests.
- **W4** Expansion engine (pure): AST×pool×principal → slot sequence (D8, D9).
- **W5** Renderer: instantiation, carving, multi-ornament layout, spacing feed-in,
  Phase-N wiring incl. global fallback; v2 gates + tracer + negative controls.
- **W6** v3 integration fixtures + suite (§5 vectors end-to-end).
- **W7** Facade additions (D15) + plain-data/determinism tests.
- **W8** MEI expansion (D17) + tests (incl. arpeg-unchanged byte gate).
- **W9** Hardening: property tests, error paths, coverage/lint, PARITY.md v3
  section (Java-verified vs spec-derived split, all ≠Lars divergences), README.
- **W10** Integration: rebase onto post-merge main, full verify, final report.

Waves commit on this branch in order; W1/W2/W4 are independent of W3 and may be
parallelized across worktree-isolated agents if their file sets stay disjoint;
everything else is serial.
