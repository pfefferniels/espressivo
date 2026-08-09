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
