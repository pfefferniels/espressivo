# Ornamentation-v3 program journal (append-only)

## 2026-08-09 — P0 bootstrap (conductor session)

- User directive received: fully implement MPM v3 ornamentation (MPM develop
  v3.0.0–v3.0.2), multi-day, fully autonomous, clean + well tested, coordinate with the
  refactor swarm.
- Recon done directly: MPM develop cloned (HEAD 1de00bb); v2.1.5→develop diff read;
  ornament.xml / ornamentDef.xml / note.xml / att.note.order / att.time.frame /
  att.time.frameLength / att.time.unit / temporalSpread.xml read in full; mpm.odd
  Ornamentation chapter + modelling_ornaments.png figure read. Model summary in
  CAMPAIGN.md. Upstream cemfi/meico checked: NO v3 implementation (ornamentation
  classes differ from Niels' fork only by the dead-code fix) — v3 ground truth must be
  spec-derived.
- Refactor conductor (meico-ts-2c) contacted; protocol CONFIRMED (see CAMPAIGN.md
  "main checkout" section for their answers + house rules).
- Worktree /Users/nielspfeffer/Projects/meico-ts-orn created, branch ornamentation-v3 @
  a09f82c. `npm ci` + `npm run verify` PASSED (exit 0) — baseline green.
- Research agents dispatched: orn-research-java (v2 exact semantics, Java+TS),
  orn-research-github (design discussions, reference-impl status, version detection),
  orn-research-arch (ARCHITECTURE.md law + [T7]/[T19] traps + facade shape).
- Conductor's probe tools copied from their ephemeral scratchpad into
  ornamentation/tools/ before they could be lost.

## 2026-08-09 — P0: Java v3 reference implementation discovered

orn-research-github interim find: **open PR cemfi/meico#31 "v0.12.0" by LarsEngeln**
(head LarsEngeln:develop @ 3deb141c, opened 2026-08-06, unmerged, unreviewed, +3962/-233)
implements v3 ornamentation in Java: new TemporalValue (unit abstraction),
OrnamentationMap renderer (+752), OrnamentDef v3, MeiOrnamentExpander (MEI trill/
mordent/turn/arpeggio → MPM ornament expansion, ornaments.dict), pipeline change
(ornaments fully measured in ms after tempo rendering), negative-date MIDI guard,
too-short-note dropping. Companion PR #32 (meicoApp CLI flag).

Strategic consequences (journaled before acting):
1. Ground-truth upgrade path: v3 fixtures may be GENERATED from Lars' branch via
   Niels' reference tools (ORN-7) instead of purely hand-derived — labeled
   'PR-derived' (PR is unmerged and may change under review; pin the SHA).
2. Where PR and MPM spec disagree, each case gets an explicit DESIGN.md ruling
   (spec vs impl), mirroring how PARITY.md treats Java quirks.
3. Scope addition: MEI ornament expansion (MeiOrnamentExpander) is part of "the
   newest ornamentation updates" and inside meico-ts's MEI→MIDI scope. Planned as its
   own late wave after the MPM-side model+renderer.
4. Dedicated deep-dive agent orn-research-lars dispatched (ORN-6); orn-research-java
   re-scoped explicitly to v2-only so the two reports don't blur.

## 2026-08-09 — P0: architecture brief landed (orn-research-arch)

ornamentation/research/architecture-brief.md (571 lines, cited). The five facts that
will shape DESIGN.md most:
1. `OrnamentData.apply` always returns [] (Java TODO); the consuming loop in
   OrnamentationMap.apply is dead by construction — THAT is the discrete-note seam.
2. `Performance.renderMillisecondsModifiersToMap` is a character-identical PRIVATE COPY
   of OrnamentationMap's (2140 chars); only Performance's copy runs. Any v3 ms-domain
   change must land in both or be journaled. The ms ornament renderer is otherwise
   unprotected (no fixture reaches ornament.milliseconds.duration).
3. `Timed<T>` phantom type gates symbolic→ms pipeline placement; a new ms pass called
   from Performance must take Timed<PartRender>.
4. Facade frozen at dist/api byte identity — v3 exposure = additive PerformedNote
   fields + PerformOptions knobs; renderer should write REAL MSM notes (date, duration,
   midi.pitch) so they surface through the existing note discovery automatically.
5. Byte probes are insufficient evidence for Performance.ts changes — budget a call
   tracer (passtrace shape); negative controls mandatory ("a gate that never fails is
   not a gate").

## 2026-08-09 — P0: v2 exact-semantics report landed (orn-research-java)

ornamentation/research/java-ts-v2-ornamentation.md (861 lines). Facts most relevant to
v3 design:
- v2 never creates notes: it writes ornament.* marker attrs on existing notes; two
  passes fold them in (tick pass before tempo, ms pass after; markers never deleted —
  they are part of the visible augmented-MSM format).
- Frame math: dateOffset(i)=pow(i/(n-1),intensity)*frameLength+frameStart, last chord
  placed out-of-loop at frameStart+frameLength; n==1 → single chord at frame END.
- NoteOffShift: False=duration absorbs shift (end preserved); True=presence-only marker
  attr, end shifts, duration preserved; Monophonic EXISTS in v2 Java already —
  retro-shortens previous chord, writes ABSOLUTE ornament.duration which wins over
  shift downstream. Last chord keeps original length.
- DynamicsGradient: linear, n==1 uses transitionTo (asymmetry, pinned); additive
  velocity offset, accumulates; applied gradient-then-spread (attr insertion order is
  fixture-visible).
- scale trap: missing scale attr → 0.0 → gradient multiplied to zero; MEI importer
  writes scale="0.0" explicitly. Any v3 repair = ground-truth decision.
- chordSequence type supports chords but v2 never builds them (every chord = 1 note);
  '[' brackets TODO unimplemented in Java; note.order ID list: '#' stripped, unknown
  IDs silently dropped; default/ascending/descending sorts by midi.pitch of chord[0].
- v2 time.unit parse: anything ≠ "milliseconds" → Ticks. RelativeToNoteDuration exists
  only as commented-out enum constant — v3's '%' realizes it.
- TS divergences: getOrnamentDataOf alive in TS (dead in Java) — UNDOCUMENTED in
  PARITY.md (flag to conductor at integration); duplicated ms pass (both copies must
  change together); TS String(x) vs Java Double.toString formatting ("-22" vs "-22.0")
  — invisible to numeric tests, visible in bytes.
ORN-1 complete.

## 2026-08-09 — P0: GitHub design-rationale report landed (orn-research-github)

ornamentation/research/github-v3-design.md (367 lines). Decisive facts:
- NO version marker in MPM documents (same namespace v1-v3, no version attr) →
  v2/v3 detection is structural. Markers enumerated in report §1.
- Zero GitHub review discussion on the v3 PRs — semantics live ONLY in ODD prose,
  schematrons, and Lars' implementation. Issue #55 (arpeggiation, opened by
  pfefferniels = the user!) fixed v2 intent; #73 (defaultOrnamentation, pfefferniels,
  still open) was declined by Berndt for now.
- The 10-item consolidated ambiguity table (§6) — headline rulings the reference impl
  makes: alignment read from temporalSpread (spec says ornamentDef — accept both);
  unit suffix optional in practice, fall back time.unit then ticks (real corpus incl.
  the repo's own samples is NOT schema-valid); '%' resolves against principal note's
  MILLISECOND duration (both offset and length); multi-ornament overflow →
  proportional scaling (rule was commented out of spec but implemented); plays =
  repetitions+1; repetitions=-1 undocumented meico extension (fill frame @150ms/note);
  ':|:'normalized to ':| |:'; consecutive duplicate pitches dropped unless whole pool
  same-pitch (tremolo preservation); expansion writes derived note.order.perf attr
  back onto the ornament; impl implements ONLY noteid principal resolution (spec lists
  a 3-step fallback; unfound principal → ornament skipped + note.order.perf copied).
- frameLength suffix parsing is BROKEN in the reference impl (bare parseDouble throws
  on "100%"/"200ms" → domain only via time.unit or default 100 Relative). Spec-vs-impl
  divergence #1 for DESIGN.md.
- ornaments.dict ships standard ornament tables (trill, turns, mordents, cadence
  prefixes) as DIATONIC step sequences with |: :| tokens; diatonic resolution happens
  in MEI layer (Helper shifts diatonically, writes intm="...hs" halfstep attr on MSM
  notes).
- v3.0.1 is the only published release (rng/rnc/xsd/pdf assets); v3.0.2 (noteid) is
  develop+gh-pages only — published schema would reject @noteid.
ORN-2 complete.

## 2026-08-09 — P0: fixture-harness feasibility (ORN-7 probe)

ornamentation/research/fixture-harness-feasibility.md. Verdict: harness WORKS
(Lars' branch compiles with one jar addition; Niels' tools graft with a 90-line
adaptation; probe workspace kept warm), but 3deb141c CANNOT source fixtures:
- v2 ornamentation is a complete silent no-op on Lars' branch (apply() calls
  commented out; applyNotesToMaps skips ornaments without noteid). v2 parity target
  stays Niels' meico@1d662105 + committed fixtures — unchanged.
- v3 works end-to-end ONLY when child elements are named `note` (spec-correct);
  Lars' own OrnamentData parses `ornamentNote` (spec deviation + internal
  inconsistency → transformers silently no-op). frameLength unit suffix throws
  (swallowed). Ticks-domain .perf never updated for ornament notes (ms-only spread).
  Principal split (n3_split0) timing looks defective. interval.chromatic ignored by
  renderer (midi.pitch + intm only).
- When firing, math confirms design: 50% relative frame of principal's ms duration,
  even spacing, linear gradient × scale, monophonic seamless. Landing-note rule and
  (2+1)×group expansion confirmed live.
STRATEGIC RULING (journaled before design): meico-ts implements the SPEC faithfully
(with documented real-world lenience), consults Lars' impl where spec is silent
(% base, overflow scaling, note.order.perf, landing note, dedup, ':|:'), and does
NOT port PR defects. v3 fixtures: hand-authored MSM+MPM input pairs + expected
outputs derived from spec math (cross-checked against patched Lars build where
useful), stamped spec-derived. GenerateFromMsmMpm tool shape adopted.
Consider (user decision, not autonomous): reporting the PR defects upstream as a
review on cemfi/meico#31 — valuable to the ecosystem, outward-facing, so parked.
