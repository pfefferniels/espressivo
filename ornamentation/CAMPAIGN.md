# MPM v3 Ornamentation — Campaign Charter

Mission (user directive, 2026-08-09, multi-day autonomous program): fully implement the
MPM v3 ornamentation module (MPM develop branch, v3.0.0–v3.0.2, LarsEngeln + Axel
Berndt, Apr–Jul 2026) in meico-ts. Clean, well-tested, spec-faithful. This file is the
program's constitution and context anchor — every agent (and the conductor after any
context compaction) reads it FIRST.

## Where things live

- **This worktree**: /Users/nielspfeffer/Projects/meico-ts-orn, branch `ornamentation-v3`,
  based on ts-idiomatic @ a09f82c. ALL implementation happens here.
- **The main checkout** /Users/nielspfeffer/Projects/meico-ts belongs to the (almost
  finished) idiomatic-refactor swarm (conductor: peer session `meico-ts-2c`). NEVER
  touch it, its branch `ts-idiomatic`, `main`, or `refactor/**`. Coordination protocol
  CONFIRMED by conductor 2026-08-09: they merge ts-idiomatic→main first (ETA ~3-4h from
  09:00Z-ish; they will ping when the merge lands); we rebase onto main afterwards and
  only then integrate. Conductor's conflict forecast: no remaining refactor item
  touches ornamentation files or Performance.ts; rebase surface is Mpm.ts + the def
  classes (TD2 malformed-numeric handling) + AccentuationPatternDef/metrical fixtures
  (TD3). Conductor house rules accepted: refactor/ARCHITECTURE.md is LAW (dispatch §3,
  null §5, immutability §7, brands §8.5); the facade is FROZEN — v3 data is exposed via
  ADDITIVE facade fields only; v2 ornamentation ms-rendering (mirrors Java
  OrnamentationMap.java:477-509) is byte-load-bearing; PARITY.md post-integration needs
  a v3 section separating 'Java-verified' from 'spec-derived'; their probe tools are
  copied to ornamentation/tools/ (probe.mjs, probe2.mjs take a dist dir as argv[1];
  toks2.mjs emits JSDoc-pruned token streams); refactor/log.md [T7]/[T19] entries hold
  the parity traps (distilled into ornamentation/research/architecture-brief.md).
- **Java reference (v2 parity)** /Users/nielspfeffer/Projects/meico — READ-ONLY, always.
- **Java reference (v3)**: LarsEngeln/meico branch `develop` @ 3deb141c = open PR
  cemfi/meico#31 "v0.12.0" (unmerged, unreviewed — pin the SHA, track review changes).
  Implements the full v3 model incl. MeiOrnamentExpander (MEI ornament → MPM
  expansion; in scope as a late wave). Blueprint report:
  ornamentation/research/lars-v3-implementation.md (ORN-6).
- **MPM spec clone** (develop @ 1de00bb): scratchpad/mpm-develop
  (/private/tmp/claude-501/-Users-nielspfeffer-Projects-meico-ts/5d7ca67d-74f7-491c-a4c3-06867b04b872/scratchpad/mpm-develop).
  If missing (scratchpad is ephemeral): `git clone --branch develop
  https://github.com/axelberndt/MPM.git`.
- Research reports: `ornamentation/research/` (committed copies of agent findings).
- Design doc: `ornamentation/DESIGN.md` (written in ORN-5).
- Journal: `ornamentation/LOG.md` — append-only; every wave/decision/verdict goes there
  BEFORE acting on it.

## The v3 model in one paragraph (verified against spec sources)

`ornament` (in `ornamentationMap`) may contain a pool of `note` children — discrete
auxiliary notes with `xml:id` and exactly one of `midi.pitch` (int), `interval.chromatic`
(double, halftones rel. principal), `interval.diatonic` (int, context-sensitive).
`note.order` = "ascending pitch" | "descending pitch" | space-separated ID refs with
chord groups `[ #a #b ]` and repetition groups `|: … :|` (tokens incl. `:|:`);
`repetitions` (int ≥0, default 0) = number of EXTRA passes of the repetition group
within the ornament's time frame (3 → played 4×). Principal note: `noteid`, else a
non-pool ID ref in note.order, else all pool notes need `midi.pitch` (schematron).
`ornamentDef` = series of transformers (interleave of ≤1 `temporalSpread`, ≤1
`dynamicsGradient`) + NEW attr `alignment` = "at start" (default) | "at end".
`temporalSpread`: `frame.start`→**`frame.offset`** (rename), frame.offset/frameLength
now STRINGS with unit suffix `ms`|`%`|`ticks` (frame.offset default "0.0ticks",
frameLength default "100%"); frame = principal.date + offset … + frameLength; intensity
= power-function spacing; `noteoff.shift`: false = all ornament notes end at
principal's noteOff (chord-end), true = each note gets principal's duration (ends
shift), monophonic = shortened to sequential non-overlapping. Multiple ornaments on the
same principal are spaced sequentially. Pipeline order (mpm.odd, Articulation chapter):
ornamentation non-ms modifiers after velocity modifiers; ms-domain ornamentation after
all timing computation; randomization last. dynamicsGradient: transition.from/to ∈
[-1,1], scaled by ornament@scale (default 0.0) like accentuationPattern.

Spec inconsistencies already spotted (resolve in DESIGN.md): mpm.odd examples still use
`time.unit` attr + suffix-less frame.offset although temporalSpread dropped
att.time.unit membership and schematron demands a suffix on frame.offset; figure says
`@placement`, spec says `alignment`; att.time.frame says suffix optional w/ time.unit
fallback but its own schematron requires it. Policy direction: lenient reader (accept
v2 `frame.start`, suffix-less values, `time.unit` fallback), canonical v3 writer —
final call in DESIGN.md after research lands.

## Stakeholder obligations (mpmify ML program, settled 2026-08-09)

The mpmify session (ListAgents name `mpmify-32`; socket uds:/tmp/cc-socks/16120.sock)
consumes this work for ML supervision (their v5 wave). Settled: D10 provenance
extension (ornament.source/slot/pass — their label set); they key supervision on
provenance attrs + (part,date,pitch,slot), never generated ids; they emit
spec-strict+suffixed v3. OWED PINGS: (1) when W7's facade fields land on the branch,
(2) when the merge to main happens. Keep these promises.

Second stakeholder: MLign (ListAgents `mlign-57`; socket uds:/tmp/cc-socks/6326.sock),
score↔performance alignment, trains on espressivo-rendered synthetic performances.
Consequence adopted 2026-08-09: D15 facade extension WIDENS — PerformedNote exposes
not just ornamented/ornamentRef but also ornamentSource/ornamentSlot/ornamentPass
(plain fields, null when absent) so alignment gets sub-roles without reading MSM XML.
Recommended-recipe promise made: perform-once-extract-twice keeps ground truth exact
under imprecision. Offer open to ping them at merge.

## Invariants

1. Never write outside this worktree + scratchpad (exceptions: memory dir; nothing else).
2. Java repo and MPM clone are read-only.
3. `npm run verify` green before every commit on ornamentation-v3. Existing tests may
   not be weakened; existing fixtures under tests/integration/fixtures/** are immutable
   HERE TOO until the explicit compat decision (DESIGN.md) — and any fixture-affecting
   decision is journaled in LOG.md first and reported to the user.
4. v2 backward parity: parsing/rendering of v2 ornamentation documents must keep
   producing byte-identical output vs the Java fixtures (all-maps ornamentation suite).
   v3 features are additive; where v3 semantics REDEFINE v2 behavior, the resolution is
   a documented DESIGN.md decision, not an accident.
5. One logical wave = one commit, message `feat(orn): …` (or `docs(orn):`, `test(orn):`).
   Commit early, commit often — the branch is private until final integration.
6. No pushes to origin until integration is coordinated (branch may be pushed as backup
   with `git push origin ornamentation-v3` — allowed, it touches no shared branch).
7. Worker/verifier discipline for implementation waves: implementer agent writes, an
   independent verifier agent reviews diff + runs verify before commit (adversarial).
8. Tests-first bias: spec-derived expected values are computed BY HAND in test comments
   (show the arithmetic), not copied from implementation output.

## Phases

- P0 Research (ORN-1 Java/TS v2 semantics; ORN-2 GitHub design/impl status) — running.
- P1 Design (ORN-5): DESIGN.md incl. compat policy + test strategy. User-visible report.
- P2 Foundation: unit-suffix value type, note.order parser (AST + serializer),
  `note` element class, schema-level round-trip tests.
- P3 Model integration: OrnamentDef alignment, TemporalSpread v3 fields, ornament
  note pool + repetitions in OrnamentationMap/OrnamentData, full XML round-trip.
- P4 Renderer: discrete-note generation (pitch resolution incl. diatonic), frame
  computation w/ units + alignment, spacing (intensity), noteoff.shift 3 modes,
  repetitions expansion, chords, dynamics gradient application, sequential stacking of
  multiple ornaments; integration into the perform pipeline in the documented order
  (incl. ms-domain second pass).
- P5 Hardening: property tests, spec-example integration fixtures (every egXML in the
  spec becomes a test), guideline-figure scenarios reproduced numerically, error paths.
- P6 Docs + integration: PARITY.md/README updates, rebase onto post-merge main
  (landed: main = d981c14, refactor program complete 2026-08-09), final verify,
  report. END STATE (user directive, 2026-08-09, given directly in this session):
  when everything is done, merge ornamentation-v3 straight into main (--no-ff,
  merge commit documenting the program, push), then remove the worktree
  /Users/nielspfeffer/Projects/meico-ts-orn (git worktree remove) and delete the
  merged branch. The main checkout at /Users/nielspfeffer/Projects/meico-ts is
  free again after the refactor program's completion.

## Agent craft (inherited from the refactor swarm, still true)

- Scratchpad is shared per-session; use unique subdirs. `cd` persists in compound
  commands — prefer absolute paths. Don't mkdir + redirect into it in the same batch.
- npm scripts: `npm run verify` (build + vitest), `npm run test:coverage`.
- Circular-import hazard: import Mpm before deep style imports.
- vitest.config.ts coverage `include` lists files explicitly in places — new source
  files must be added there or coverage silently lies.
