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
