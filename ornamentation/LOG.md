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

## 2026-08-09 — P1: DESIGN.md adopted (ORN-5); blueprint landed (ORN-6)

orn-research-lars delivered ornamentation/research/lars-v3-implementation.md (1976
lines): full algorithm walkthrough, 24-item spec-fidelity audit (headline: the PR
cannot read a spec-conformant v3 file), 29-item bug catalogue, port recommendations,
and the finding that the PR ships ZERO tests. ornamentation/DESIGN.md adopted with
17 binding decisions (D1–D17), module map, 6 normative worked examples
(figure-derived), test strategy, and waves W1–W10. Headline rulings: spec-first with
documented lenience; two-phase architecture keeping note INSTANTIATION + tick/%
spacing in the symbolic slot (fixes Lars' phase bugs by construction, keeps
gradients reaching velocity); % resolves against tick duration (≠Lars, rationale:
ODD pipeline classification + Berndt's tempo-dependence ruling in #55);
generation-preserving serialization (v2 sources stay byte-identical, v3 sources emit
canonical v3); generated notes are real MSM <note>s with provenance attrs; facade
additions limited to PerformedNote.ornamented/.ornamentRef + PerformOptions.
expandOrnaments. ORN-5, ORN-6 complete. Next: W1+W2 (parallelizable pure modules).

## W1 implementer — 2026-08-09

Built DESIGN.md D3's value type: `src/mpm/elements/styles/defs/TemporalValue.ts` +
`tests/mpm/elements/styles/defs/TemporalValue.test.ts`. Nothing else created or
touched (no names.ts, no barrel, no vitest.config.ts — `src/mpm/**` is already in the
coverage include list). 131 tests, all green; prettier clean; eslint clean with ZERO
suppressions; `tsc --noEmit` clean on both tsconfig.json and tsconfig.tests.json
(no build, no dist writes — the worktree is shared with W2).

Surface: `TemporalDomain` ('ticks'|'milliseconds'|'relative'), `TemporalSuffix`,
`TEMPORAL_DOMAIN_SUFFIX` (`as const` table, single source of truth for both
directions), `interface TemporalValue {value, domain}`, `interface
UnresolvedTemporalValue {value, domain|null}`, `parseTemporalValueStrict`,
`parseTemporalValueLenient`, `formatTemporalValue`. Plain readonly interfaces + pure
functions, no class (RULE C1 does not bite — nothing wraps an XML subtree); no
logging (RULE E1 leaves that to the W3 caller).

Choices worth knowing:
- Names are the brief's, not DESIGN.md §4's "factory `fromString`": a bare
  `fromString` export in a pure module says nothing at the call site, and both names
  satisfy RULE C4 (no new `createXxx`). §4's intent — strict/lenient explicit — holds.
- Two regex literals (suffixed, unsuffixed) rather than one with an optional trailing
  group: an optional capture is typed `string` under this tsconfig but is `undefined`
  at runtime, so "did it match a suffix" would be a check `no-unnecessary-condition`
  (RULE N6) believes is dead.
- Reverse suffix→domain lookup is a `Record<TemporalSuffix, TemporalDomain>` indexed
  with one narrowing `as` at the regex boundary, deliberately instead of a `switch`
  with a `default: return null` — the default is unreachable given the regex and would
  sit in the coverage report as a permanently uncovered line.
- Parse is `Number()`. On this grammar (plain decimal literals only) it agrees exactly
  with `parseFloat` and Java's `Double.parseDouble`; the grammar excludes every form
  they differ on (hex, exponent, trailing d/f, Infinity), so D16's parseJavaDouble
  requirement has nothing to bite on here. NB `src/supplementary/parseJavaDouble.ts`
  does not exist in this worktree yet — it arrives with the W10 rebase.
- `formatTemporalValue` writes `String(x)` (via template interpolation) per the house
  serializers, so `"0ticks"`/`"50%"` where Java's `Double.toString` gives
  `"0.0ticks"`/`"50.0%"`. Both satisfy the schematron; the port-wide divergence is
  research/java-ts-v2-ornamentation.md §5.3 item 5. Documented in the JSDoc and pinned.

Surprises:
- The strict/lenient split is not only corpus lenience: the spec itself contains both
  readings. `att.time.frameLength.xml:21` makes the suffix optional; the
  `temporalSpread` override at `temporalSpread.xml:34` makes it mandatory for the same
  attribute on the element we care about. Cited in the module doc.
- Round trip preserves value+domain, NOT source text (`"0.0ticks"` → `"0ticks"`), and
  above 1e21 `ToString`'s exponent form leaves the schema-valid range. Pinned as
  documented limitations rather than guarded — clamping would only move the problem.
- Sign of zero survives the parse (`-0.0ticks` → `-0`); pinned with `Object.is`, since
  DESIGN.md's tick arithmetic downstream can observe it.
- JS `$` is end-of-input with no trailing-newline allowance, matching Java's
  `Matcher.matches()`; pinned so a later `m` flag cannot silently loosen the grammar.

## W2 implementer — 2026-08-09

Built `src/mpm/elements/maps/data/noteOrder.ts` (pure module, precedent `bezier.ts`; zero
imports, no XML, no logging — diagnostics are returned) and
`tests/mpm/elements/maps/data/noteOrder.test.ts` (96 tests, table-driven). Nothing else
created or modified. Implements the parsing half of D9.

- `parseNoteOrder(raw): NoteOrder | null` — keywords, ID refs, chords `[ … ]`, repeat
  groups `|: … :|` (multiple, never nested/overlapping, indexed by ITEM not token),
  `:|:` normalised to `:| |:` (=Lars, `OrnamentationMap.java:353`), bare `|` accepted and
  ignored (schematron-legal, prose-silent). `formatNoteOrder` (canonical spec form) and
  `formatNoteOrderPerf` (space-separated, `#`-stripped, =Lars §4.2) round it out.
- DECISION (deviates from the wave brief's sketched type, documented at the site):
  `warnings` sits on **all three** `NoteOrder` variants, not only `list`. The brief asked
  for a warning on the trimmed-keyword lenience, which the keyword variants had nowhere to
  put; a uniform field also spares callers a narrow before collecting diagnostics.
- DECISION: surrounding whitespace around a keyword is accepted with a warning; whitespace
  *inside* it is not normalised (`"ascending  pitch"` stays a degenerate list) — collapsing
  it would invent a rule no source states.
- DECISION: only the LEADING `#` is the reference marker, per the schematron's
  `starts-with($i, '#')`. So `####` is a valid token denoting the id `###`, which resolves
  to no note and is dropped downstream. `#` alone → warning + skip.
- Unspaced brackets (`[#id1`, `#id2]`, `[#a]`, even `[[#a]]`) are salvaged into separate
  tokens with a warning — the spec's own `att.note.order.xml` `<desc>` uses the form its
  own spaced-token constraint rejects (github-v3-design.md §3.3).
- Every lenience case has a distinct message; the parser never throws. Termination is
  structural, not defensive: one forward pass over a fixed token array, and the bracket
  peeler strictly shrinks its input — Lars' bug 2 (non-advancing index on a `#`-less token)
  is unrepresentable rather than merely avoided.
- Empty/whitespace-only input → `null`; an input that yields zero items → a `list` with
  empty `items` plus the warnings, mirroring v2's empty-list-continue. Callers must not
  conflate the two.
- PARITY NOTE at the module head: v2 had no grammar beyond `replace(/#/g,'').split(/\s+/)`
  in `OrnamentData`; this module is v3-only and must never be reached from the v2 path
  (D6; W3/W5 own that gate).
- Surprise worth flagging to W4: a one-id chord `[ #a ]` is indistinguishable from a plain
  `#a` by construction (both are one item with one id), so `formatNoteOrder` collapses it.
  Round-trip identity therefore holds for canonical inputs only; the non-canonical
  normalisations are pinned as their own test table.
- Gates: prettier clean, `npx eslint` silent, ZERO suppressions, `tsc -p
  tsconfig.tests.json` clean, 96/96 green. Did NOT run `npm run verify` or `npm run build`
  (shared worktree), did NOT commit.
- Negative controls (the suite was green on first run, so it needed proving): NC1 remove
  the `:|:` normalisation → 3 red; NC2 off-by-one on group `end` → 22 red; NC3 chord
  pushed as separate items → 14 red; NC4 1.5 s stall inside `parseNoteOrder` → the
  pathological case fails on its explicit 1000 ms per-test timeout (`Test timed out in
  1000ms`), proving the termination gate is enforced, not decorative. Source restored and
  md5-verified identical (`72c9a305dbc1349992651a9ec8fe5653`) after each.

## W2 verifier — FAIL (2026-08-09)

Adversarial review of `src/mpm/elements/maps/data/noteOrder.ts` +
`tests/mpm/elements/maps/data/noteOrder.test.ts`. **One surviving mutation** is the whole of
the verdict; everything else below is clean. Remedy is a single test, not a code change.

- **FOOTPRINT — clean.** `git status --short` shows exactly W2's two files (`src/…/data/
  noteOrder.ts`, `tests/…/data/noteOrder.test.ts` as the untracked `tests/mpm/elements/maps/`)
  plus W1's two and this LOG append. Nothing else touched.
- **TREE FREEZE — verified.** `md5 -q src/…/noteOrder.ts` = `72c9a305dbc1349992651a9ec8fe5653`,
  matching the implementer's claim, before and after all probing. Test file
  `2c60f039ad1b4411602efe83e9d78632`. All mutation work ran on a scratchpad copy
  (`scratchpad/w2verify/mut/`); the worktree source was never written.
- **GATES — verified independently.** 96/96 green (claim confirmed exactly, 97 ms).
  `npx prettier --check` clean, `npx eslint` silent (exit 0), zero suppressions
  (grep for `eslint-disable`/`@ts-ignore`/`@ts-expect-error`/`as any` → none). Types are plain
  `readonly` interfaces + a discriminated union; no enum. Repo-wide gates deliberately not run.
- **FAIL FINDING — M11 survives: no test pins a bare `|` INSIDE a repeat group.**
  Mutating `case '|':` from a no-op to "close the open group" leaves the suite **96/96 green**.
  The behavioural delta is load-bearing, not cosmetic: `|: #a | #b :|` parses to
  `groups=[{start:0,end:1}]` today and `[{start:0,end:0}]` under the mutant — the span
  `@repetitions` multiplies is **halved**, silently changing generated-note counts downstream in
  W4. Same for `|: #a #b | #c :|` (end 2→1), `#x |: #a | #b :| #y` (end 2→1),
  `|: [ #a #b ] | #c :|` (end 1→0), `|: #a | #b | #c :|` (end 2→0).
  The suite's three bare-`|` tests all sit where the mutation is invisible: `'#a | #b'`
  (no group open, test line 195), `'[ #a | #b ]'` (chord, line 305), `'|'` alone (line 382);
  `'|: |: :| :| :|'` and the punctuation soup yield empty groups either way. Grep confirms no
  test string places `|` between ids inside an open group.
  This is the case the source's own comment names — *"a barline in the middle of a trill
  figure"* (noteOrder.ts:209-210) — and D9's "bare `|` accepted+ignored" is exactly a statement
  about group spans. **Missing test:** in `parseNoteOrder — chords and groups`, assert
  `parseNoteOrder('|: #a | #b :|')` → `items=[['a'],['b']]`, `groups=[{start:0,end:1}]`,
  `warnings=[]`. One `it` closes it. The implementation is CORRECT as written.
- **NC1–NC4 re-run independently, all four claims exact.** NC1 `:|:` normalisation dropped → 3
  red (the two `normalises ":|:"…` tests + round-trip `'":|:" becomes two spelled-out groups'`).
  NC2 group `end` off-by-one → 22 red. NC3 chord ids as separate items → 14 red. NC4 1.5 s stall
  → pathological tests fail with `Test timed out in 1000ms`; the per-test timeouts at test lines
  398/405/412/419 are enforced, not decorative.
- **Six further mutations, all caught** (beyond the implementer's NC list): `formatNoteOrderPerf`
  keeping `#` → 2 red; unspaced-bracket salvage removed → 4 red; trimmed-keyword warning
  suppressed → 2 red; empty-repeat-group guard removed → 2 red; `[` in an open chord restarting
  the chord → 2 red; stripping ALL `#` from an id instead of the leading one → 1 red.
- **DECISION rulings — all four defensible, none a spec violation.**
  (1) *`warnings` on all three variants* — D9 prescribes no type shape; the keyword-trim lenience
  has nowhere else to report. Accept.
  (2) *Keyword whitespace* — `" ascending pitch"` is schematron-INVALID (XML CDATA normalisation
  does not trim, and neither token satisfies `starts-with($i,'#')`), so accepting it with a
  warning is pure lenience that changes the reading of **no valid document**; refusing to collapse
  *internal* whitespace correctly declines to invent a rule. Accept.
  (3) *Leading-`#` only* — **confirmed**: the schematron test is `starts-with($i,'#')`, so `####`
  IS a valid token and denotes id `###`. Better grounded than the reference, which does
  `replaceAll("#","")`; the divergence is unreachable since xml:id is an NCName and excludes `#`.
  Accept.
  (4) *Unspaced-bracket salvage* — consistent with `att.note.order.xml`'s own `<desc>` writing
  `[#id1 #id2]` (github-v3-design.md §3.3). Precise boundary worth recording: the only
  schematron-VALID tokens the salvage re-reads are those starting `#` and ending `]` (e.g. `#a]`,
  valid per `starts-with`, salvaged to `#a` + `]`) — and such an id can never resolve, NCName
  excluding `]`. Accept.
- **PROBES — 31 hand-picked + 50 000 fuzz cases: no crash, no hang, no invariant violation.**
  All brief-mandated cases behave per the documented contract: `'|: :|'`→empty-group warning;
  `'|: [ #a :| ] |:'`→3 warnings, group {0,0}; `'[ [ #a ] ]'`→one item; `'#a ]'`→stray-close
  warning; `'[ #a |: #b :| #c ]'`→one 3-id chord, group tokens ignored; `':|: :|:'`, `'|:|:'`,
  `'#a#b'`(id `a#b`), `'[#a]'`≡`'[ #a ]'`, case-sensitivity, tab/newline/CR separators — all
  consistent. 20 000-case parse→format→parse fuzz: **0 non-fixpoints**. 30 000-case invariant
  fuzz: **0** violations of (groups in range, `start<=end`, strictly ascending and disjoint, no
  empty item, no empty id) — the "never nest, never overlap" claim holds empirically.
  `:|:` global-replace-before-split rewrites inside an id token (`'#a:|:b'`→id `a:|` + a skipped
  token); this is an **exact mirror** of the reference (`replaceAll(":\\|:", ":| |:")` also
  pre-split), and unreachable for NCName ids. JS `\s` is wider than XSD `\s` (it splits U+00A0);
  D9 literally specifies `\s+`, so this is conformant — noted only because a schematron-strict
  reader would treat `#a #b` as one token.
- **NON-BLOCKING (for W3/W5, not part of the FAIL): `splitUnspacedBrackets` is quadratic in the
  trailing-`]` run.** `rest.slice(0, -1)` re-copies each step (the leading `[` peel is linear —
  V8 slices cheaply from the front — the trailing peel is not). Measured on one glued token:
  4 000 `]`→4 ms, 16 000→215 ms, 64 000→2 702 ms; a 64 KB single-token value costs ~1.1 s of CPU.
  It TERMINATES (no hang, so not a FAIL), and no realistic `note.order` comes near this. Fix if
  ever wanted: count the runs with an index scan instead of repeated `slice`. Related: `warnings`
  is unbounded (a 100 K-char malformed value yields 100 002 strings) — W3/W5 should cap or
  summarise before logging.
- **VERDICT: FAIL** on the single surviving mutation. Everything else — footprint, freeze, gates,
  grammar conformance, all four DECISIONs, termination, fuzz invariants — passes. Re-verify by
  re-running M11 after the one test lands.

## W1 verifier — PASS (2026-08-09)

Adversarial review of `src/mpm/elements/styles/defs/TemporalValue.ts` +
`tests/…/TemporalValue.test.ts` against DESIGN.md D3, CAMPAIGN invariants and
architecture-brief §1. Verdict PASS. No defect found that violates D3, the architecture
law, or the module's own JSDoc claims. Four non-blocking findings below; F3 needs a W10
decision.

FOOTPRINT. `git status --short` = W1's two files + the LOG.md append, plus W2's
`noteOrder.ts`/`tests/mpm/elements/maps/` (out of scope, ignored). No `vitest.config.ts`
edit — verified unnecessary, `src/mpm/**/*.ts` is already in the coverage `include`.
`dist/` untouched since worktree setup (10:41, no `TemporalValue*` in it), no `coverage/`.
All my probes ran in scratchpad `w1verify/`, incl. a mutation sandbox with the module
copied out; worktree source md5-identical to the copy afterwards.

GATES. 131/131 green (`npx vitest run`, 27 ms). `npx prettier --check` clean. `npx eslint`
exit 0, silent — and `--print-config` confirms the three type-aware rules plus
`no-param-reassign` are all error-level on this file, so `no-unnecessary-type-assertion`
staying silent proves the one `as TemporalSuffix` at `:139` is load-bearing. ZERO
suppressions (grep for `@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|prettier-ignore`
finds nothing). Coverage of the module alone: 100 % statements / branches / functions /
lines — the "a `switch` default would be a permanently uncovered line" argument holds.
Conformance re-checked item by item: no TS enum (`as const` + literal union), plain
`readonly` interfaces (RULE C5; C1 correctly does not bite — nothing wraps an XML
subtree), RULE N1 correct (`domain: … | null` is domain absence in a return type, and
`:79-83` argues it), C4 satisfied, no logging (RULE E1 leaves it to W3), no `time.unit`
policy (deferred in prose only).

SPEC CITATION AUDIT, every line reference re-read in the clone @ 1de00bb: `att.time.frame.xml:20`
(regex character-identical to the module's, modulo the documented capture-group change),
`:16` (`0.0ticks` default); `att.time.frameLength.xml:21` (`(ms|%|ticks)?` — optional, as
claimed); `temporalSpread.xml:34` (mandatory-suffix override), `:38` (`100%` default),
`:48` (exemplum `-100.0ms` / `200.0ticks`); `mpm.odd:685` (`360ticks`, `20.5ms`, `80%`);
`att.time.unit.xml:15-17` (`ticks|milliseconds|relative`). All correct — the
spec-disagrees-with-itself finding in the module doc is real and precisely located.

PROBES (all inputs the brief named, plus more). Rejected as required, strict and lenient:
`+5ticks`, `5.ticks`, `.5ms`, `5..5ms`, `1e3ticks`, `1E3ms`, `Infinityms`, `NaNms`,
`0x10ticks`, `5 ticks`, ` 5ticks`, `5ticks `, `5MS`, `5Ticks`, `5tick`, `5m`, `5%%`, `-%`,
`--5ms`, `٥ticks` (Arabic-Indic), `５ticks` (fullwidth), `５%` (fullwidth percent),
`−5ms` (U+2212 minus), `5\nticks`, `5ticks\n`, `\n5ticks`, `5ms\r\n`, U+2028/U+0085/NUL/
BOM/zero-width variants, `5th`, `5?`. Accepted as required: `9007199254740993ticks` →
9007199254740992 (ties-to-even), `-0.0ms` → `-0` (`Object.is`-verified), the spec examples.
Suffix-less `480`/`0.0` → strict null, lenient `domain: null`. No `g` flag on either
regex, so no `lastIndex` statefulness — confirmed by repeated calls on the same input.
Constructing hostile `TemporalValue`s by hand: `__proto__`/`constructor`/`toString` as a
domain cannot reach `DOMAIN_BY_SUFFIX` from the parse path (the alternation only ever
yields `ms|%|ticks`; `parse("1__proto__")` = null), so the plain object literal is safe.

BACKTRACKING: none. 100 k-char adversarial inputs — all digits; digits + junk char; sign +
digits + near-miss suffix; `d…d.d…d`; `d…d.d…d` + partial suffix `m`; double dot; all dots;
alternating `1.` — every one completes in 0.015–2.5 ms, i.e. linear. 1000-digit inputs:
0.034 ms.

JAVA DIFFERENTIAL (the strongest evidence here, and it settles F3). Compiled a Java 17
harness running `Pattern.compile("^-?[0-9]+(\\.[0-9]+)?(ms|%|ticks)$").matcher(x).matches()`
+ `Double.parseDouble`, and compared against the real TS module over a 481-input corpus
(400 pseudo-random decimals up to 18 int / 20 frac digits, the 2^53 tie neighbourhood,
1e308 / 1e309, 309- and 1000-digit strings, 324-digit subnormals, the classic
`2.2250738585072012e-308` hang input, signed zeros, spec examples, 37 rejects).
Result: 443 values bit-compared, **0 acceptance mismatches, 0 lenient-acceptance
mismatches, 0 bit mismatches**. Notably Java gives `-0.0ticks` → `8000000000000000` and
`9007199254740995ticks` → `4340000000000002`, exactly as the TS does. So the module's
claims — `Number` ≡ `Double.parseDouble` on this grammar, and JS `$` ≡ Java
`Matcher.matches()` on rejection — are verified against ground truth, not merely argued.

MUTATION ANALYSIS: 10 mutations applied to a sandbox copy and actually run (not reasoned
about). 9 killed, 1 survived, and the survivor is a proven equivalent mutant.
The three the brief named: optional suffix in the strict regex → KILLED, 13 red, first
`rejects "480" — suffix-less — lenient only`; `ms`↔`ticks` swapped in `DOMAIN_BY_SUFFIX`
→ KILLED, 44 red; sign dropped from both regexes → KILLED, 19 red. Mine: bare trailing dot
allowed → KILLED (1 red, `rejects "5.ms"` — thin but present); `$` dropped from strict →
KILLED, 4 red; `^` dropped from lenient → KILLED, 7 red; formatter omits the suffix →
KILLED, 26 red; `%` stored as value/100 → KILLED, 19 red (the "pre-% number" contract is
genuinely pinned); lenient defaults to ticks instead of null → KILLED, 10 red (D3's
policy-belongs-to-the-caller boundary is pinned). SURVIVED: `Number` → `parseFloat`, which
the differential above shows produces bit-identical results on every string the grammar
accepts — an equivalent mutant, not a test gap.

FINDINGS (none blocking):
- F1. Overflow to `Infinity` is undocumented and untested. `parseTemporalValueStrict` on
  309+ digits returns `{ value: Infinity, domain: 'ticks' }` — a non-finite value from a
  schema-VALID input. Java does the same (`7ff0000000000000`), so it is parity-correct and
  terminates in 0.034 ms, but the JSDoc line "no `Infinity`/`NaN`" (`:97`) is about literal
  text forms and reads as if the parser could never yield one. Worth one clause + one test.
- F2. `formatTemporalValue` on a `NaN`/`±Infinity` value emits `"NaNticks"` /
  `"Infinityticks"` — schema-invalid and not round-trippable. `:170-175` documents the
  ≥1e21 and small-fraction cases but not these. Reachable in one hop from F1 (parse a
  309-digit `frameLength`, re-serialize), and W3's log-and-skip will NOT catch it because
  the parse succeeds. Absurd input, cheap doc fix.
- F3. **D16 says "new parse code uses parseJavaDouble for numeric attrs"; this module uses
  `Number()`.** The deviation is behaviourally void here — proven by the differential above
  — and `src/supplementary/parseJavaDouble.ts` genuinely does not exist in this worktree,
  so W1 could not have complied. Documented at `:126-130` and in the implementer's entry.
  Carry to W10: when the rebase brings the file, either confirm the exemption in PARITY.md
  or switch for uniformity. Flagged so it is a decision, not an omission.
- F4. `-0` asymmetry: the parser preserves it (Java-identical), the formatter normalises it
  to `"0ticks"`. Both directions are pinned by tests so this is deliberate and covered, but
  the implementer's own note says downstream tick arithmetic can observe the sign — the
  write side silently drops what the read side keeps.

CHECKED AND DISMISSED (so they are not re-raised): `TEMPORAL_DOMAIN_SUFFIX` is not
`Object.freeze`d — `Object.freeze` appears 0× in `src/`, and `as const` on static tables is
exactly RULE I4, matching `src/index.ts:226` and `src/midi/EventMaker.ts:1065`. Non-string
inputs coerce via `RegExp.exec` (`['5ticks']` parses) — type-system bypass only. D3's
`frame.start` alias, the `100%` frameLength default and the negative-frameLength clamp are
absent by correct scoping (attribute plumbing = W3); clamping negatives inside the value
parser would in fact corrupt `frame.offset`, which is legitimately negative.

### W2 fix round — 2026-08-09

Verifier ruled FAIL W2 on one surviving mutation, M11: turning the bare-`|` no-op into
"close the open repeat group" passed all 96 tests. The implementation was right; the suite
was blind. Root cause: every bare-`|` test sat *outside* an open group, where the mutation
is unobservable.

- Added two tests to "parseNoteOrder — chords and groups", test file only, src untouched
  (md5 still `72c9a305dbc1349992651a9ec8fe5653`): `'|: #a | #b :|'` → items `[a],[b]`,
  groups `[{0,1}]`, no warnings; and `'#x |: #a | #b :| #y'` → groups `[{1,2}]`, proving
  the barline neither closes nor splits a group nested in a longer list.
- Negative control re-running M11 verbatim: exactly the two new tests go red, and the
  three pre-existing bare-`|` tests still pass — which is the direct evidence that the old
  suite could not see it. Source restored and md5-verified after the run.
- Why it matters downstream: the group span is what `@repetitions` multiplies (D9), so
  M11 would have halved every repeated figure carrying a courtesy barline — a wrong note
  count, not a cosmetic diff. Rationale recorded as a comment at the test site.
- 98/98 green; prettier clean, eslint silent, zero suppressions, `tsc -p
  tsconfig.tests.json` clean. No commit, nothing else touched.

### W1 fix round — F1/F2 (2026-08-09)

Continuation of the "W1 implementer" entry above; appended here rather than edited into
it, because the journal is append-only (CAMPAIGN invariant / brief §1.7). TREE FREEZE was
lifted by the conductor for exactly F1 and F2 and is back on. Only the same two files
changed. F3 (Number vs parseJavaDouble) and F4 (-0 asymmetry) left alone as instructed.

F1 — overflow to Infinity, documented and pinned. The regex JSDoc now says its exclusions
bound the *spelling* of the number, not its magnitude, and points at the parse function;
the parse function's JSDoc states that the result is not guaranteed finite, that 309 legal
digits overflow to `Infinity` exactly as `Double.parseDouble` does (so a guard here would
be the divergence, not the absence of one), that the finiteness check belongs to the
caller, and that `formatTemporalValue` will write such a value straight back out. One test
pins `9…9(309)ticks` → `{Infinity, ticks}`, the signed form `-9…9(309)ms` → `-Infinity`,
and the same digits through the lenient reader → `{Infinity, null}`.

F2 — non-finite serialization documented, behaviour unchanged. The formatter's limitation
note now covers `NaN`/`±Infinity` alongside the ≥1e21 exponent case, and says why it is
not absurd-input-only: the value arrives from a *successful* parse, so a caller's
log-and-skip on a failed parse will not catch it, and the guard/clamp/reject decision
belongs to W3, which owns the attribute — the formatter stays total. Pinned by one test
(the three spellings, both rejected on re-read, plus the full one-hop path
309-digit parse → format → strict parse = null). That test is one more than the conductor
asked for; it pins a claim the JSDoc now makes, which is the house rule, and it changes no
behaviour.

GATES after the fix round: 133/133 green (was 131; +2 tests, no test removed or weakened),
prettier clean (both files unchanged by `--write`), eslint exit 0 and silent, ZERO
suppressions (re-grepped), `tsc --noEmit` clean on tsconfig.json and tsconfig.tests.json.
No build, no dist writes. `git status --short` still shows only W1's two files, this
LOG.md, and W2's untouched files.

### W2 verifier — re-check (2026-08-09): PASS

The fix round closes the single FAIL finding. Verdict flips FAIL → **PASS W2**.

- **M11 is dead.** Re-ran the mutation (`case '|':` closes an open repeat group) in the
  scratchpad sandbox against the updated test file: **2 red**, precisely the two new tests
  (`does not let a bare barline close an open repeat group`, `does not let a bare barline split
  a repeat group nested in a longer list`). They assert exactly the specified span —
  `'|: #a | #b :|'` → `groups=[{start:0,end:1}]` and `'#x |: #a | #b :| #y'` →
  `[{start:1,end:2}]`, both `warnings=[]`.
- **The repair generalises; it is not fitted to my mutant.** Three further bare-`|` mutations I
  had not run before are all caught: `|` pushed as an item → 5 red; `|` opens a group → 3 red;
  `|` flushes an open chord → 1 red. The `|` branch now has real coverage from several directions.
- **Purely additive — no existing test weakened** (CAMPAIGN invariant 3). Deleting the inserted
  lines 200–217 reproduces the pre-fix test file byte-for-byte
  (md5 `2c60f039ad1b4411602efe83e9d78632`). New test md5 `2468fabc36919f8942750d914eb0a267`,
  551 → 569 lines.
- **Source still frozen:** `md5 -q src/…/noteOrder.ts` = `72c9a305dbc1349992651a9ec8fe5653`,
  unchanged across both review rounds — the fix touched tests only, as claimed.
- **Regression sweep clean.** All ten earlier mutations still caught: M1 3 red, M2 24 red (up
  from 22 — the two new tests also sense the group-`end` off-by-one), M3 14, M5 2, M6 4, M7 2,
  M9 2, M10 2, M12 1. Baseline 98/98 green in the sandbox and in the worktree; prettier clean,
  eslint exit 0, zero suppressions on both files.
- Everything else in the FAIL entry above stands unchanged: footprint, grammar conformance, all
  four DECISION rulings, termination, and the 50 000-case fuzz invariants. The two non-blocking
  notes for W3/W5 (quadratic trailing-`]` peel in `splitUnspacedBrackets`; unbounded `warnings`
  array) are unaffected by this fix and remain open as advisories, not gates.

## W4 implementer — 2026-08-09

Built `src/mpm/elements/maps/data/ornamentExpansion.ts` (pure module; imports only W2's AST
types, no XML, no logging — diagnostics returned) and
`tests/mpm/elements/maps/data/ornamentExpansion.test.ts` (118 tests, table-driven).
Nothing else created or modified. Implements the expansion half of D9 plus the whole of D8.

`expandOrnament(input): {ok:true, slots, warnings} | {ok:false, reason, warnings}` over
`{order (list variant only, enforced by type), pool, principal|null, msmNotes, repetitions,
diatonicContext, frameNoteBudget|null}`. `Slot = {notes: ResolvedNote[]}` (chord ⇔ >1),
`ResolvedNote = {ref, midiPitch, source:'pool'|'msm'|'principal', landing?:true}`.

- DECISION (D8 ruling, spec says only "context-sensitive"): `interval.diatonic` resolves
  as tonic = 7·keyFifths mod 12, major scale sorted ASCENDING inside 0…11 (so the octave
  carry lands on C, where MIDI octaves begin — carrying at the tonic transposes every key
  but C by an octave); anchor = greatest scale pitch ≤ principal, `chromaticDelta` =
  principal − anchor kept and re-applied after the step. Exported as
  `resolveDiatonicPitch(principalPitch, steps, keyFifths)` — W8 needs the same arithmetic
  MEI-side. 24-row hand-computed matrix in the tests (C/D/F/C♯/C♭/past-the-circle, notes
  outside the key, microtones, below MIDI 0). `steps === 0` returns the principal exactly,
  which is the spec's default for a pitch-attribute-less `<note>`.
- DECISION (landing placement, brief said "append to the sequence"): the landing copy is
  inserted BEHIND ITS OWN GROUP, which is where the reference splices it (`notesToAdd` at
  `rptEnd`) and where its own "might add doubles -> need to sanitize" comment points. For a
  trailing group — the common case and the only one the brief's wording describes — the two
  readings coincide; they differ for `|: 0 1 :| 0 -1 0` (trill with mordent), pinned as a
  test. Trigger is D9's pitch test (group's first slot is a single note at the principal's
  pitch), which generalises the reference's pool-only `intm=="0.0hs"` lookup to a direct
  `#principal` reference. Fires on group presence, not on `repetitions > 0` (=Lars).
- DECISION (tremolo exception): computed over the EXPANDED SEQUENCE (D9's wording), not
  over the pool as the reference does — its pool test misfires whenever the pool holds
  notes the order never uses, and pool membership carries no meaning per the spec.
  Consequence pinned by test: a one-note group inside a longer figure collapses to one
  slot, the same group alone survives as a tremolo.
- DECISION: `warnings` on BOTH result variants (same widening W2 made, same reason —
  diagnostics collected before a fatal are still worth logging).
- DECISION: a well-formed order that resolves to zero slots is `{ok:false}`, not an empty
  success, so W5 gets one reason to log instead of a length check.
- ≠Lars, deliberate: `repetitions >= 0` expands each group (r+1)× in place with NO budget
  arithmetic — the reference reuses its fill-the-frame loop with `maxNotes=(r+1)·groupLen`
  and charges the non-repeated slots against it, so `#a |: #b #c :| #d` with r=2 gives it 6
  slots where the spec wants 8 (test pins 8). Multiple groups each expand with the same
  count (reference supports one). For `repetitions === -1` the extra-pass count is
  `max(0, floor((budget − S)/G))`, which is what the reference's append-while-it-fits loop
  computes for its single group, minus the loop.
- Guard (≠Lars bug 9): `MAX_EXPANDED_SLOTS = 1_000_000` (exported), checked ARITHMETICALLY
  before allocation; over it → `{ok:false}`, never a throw and never an OOM. It bounds the
  expansion; the ≤1 landing slot per group may sit above it. `repetitions` non-integer or
  < −1 → `{ok:false}`; `-1` without a group, without a budget, or with a budget < 1 or
  non-integer → `{ok:false}`.
- Termination is structural: pass counts are computed, never discovered by a `while`; every
  loop runs a precomputed length; repeated slots are SHARED frozen-by-type objects, so a
  million-slot budget is an array of pointers (documented — W5 must key bookkeeping on slot
  INDEX, not identity). Two 10⁶-slot tests with explicit 10 s timeouts complete in ms.
- Group re-indexing: `note.order` groups are item-indexed, but rule 1 can drop slots, so
  groups are re-mapped onto surviving slot indices (a group that loses everything is
  dropped with a warning). Tested both ways.
- Handoff to W5, verified by `tsc` in the scratchpad: W3's `OrnamentPitchSpec` (three-member
  discriminated union, `OrnamentNote.ts`) is assignable to this module's widened
  `PitchSpec`, and `Map<string, OrnamentPitchSpec>` to `ReadonlyMap<string, PitchSpec>` —
  no converter needed. W3's bare-`<note>` default `{chromatic, 0.0}` lands on D7 correctly:
  such a note without a principal makes the ornament `{ok:false}`.
- Gates: prettier clean (source unchanged by `--write`), `npx eslint` exit 0 and silent on
  both files, ZERO suppressions (grepped), `tsc --noEmit --strict` clean on source and on
  the test file. 118/118 green. Did NOT run `npm run verify`/`build`/repo-wide `tsc` (W3 is
  concurrently dirty in the same tree), did NOT commit.
- Negative controls (7, all caught; source restored and md5-verified
  `715aeab5307700dc16077a3d8439b66f` after each): NC1 plays = r instead of r+1 → 34 red;
  NC2 landing keyed on the group's last slot → 6 red; NC3 diatonic scale left in tonic
  order → 10 red (the C-major rows stay green, exactly the hazard the JSDoc names);
  NC4 dedup without the chord guard → 5 red; NC5 fill budget rounded up → 4 red;
  NC6 tremolo exception removed → 10 red; NC7 pool looked up after the MSM notes → 1 red.
- Note for the verifier: three test vectors I hand-computed were WRONG on first run and the
  implementation caught them (dedup applies to repeated single-note groups; the ceiling
  check double-counted landings at the boundary). The ceiling check was fixed in the
  source; the other two were my arithmetic. No expectation was relaxed to make a test pass.

## W4 verifier — PASS (2026-08-09)

Adversarial review of `src/mpm/elements/maps/data/ornamentExpansion.ts` +
`tests/mpm/elements/maps/data/ornamentExpansion.test.ts` against DESIGN.md D8/D9 (D7/D10 as
consumer context). Footprint exact: the two W4 files + this append; everything else dirty in
the tree is W3's (OrnamentDef/TemporalSpread/OrnamentData/OrnamentationMap/OrnamentNote +
tests) and was ignored. `git diff --numstat ornamentation/LOG.md` = 77/0 before this entry, so
the implementer appended and rewrote nothing. Gates re-run by me: 118/118 green (171 ms),
prettier clean, `eslint` exit 0 and silent, `tsc --noEmit --strict` clean, zero suppressions
(the `any` grep hits are the English word). No importers yet — W5 wires it.

**(a) The diatonic algorithm — all 24 matrix rows recomputed by hand, not 12.** Scale =
`7·keyFifths mod 12` plus `0 2 4 5 7 9 11`, sorted ascending inside 0…11; anchor = greatest
scale pitch ≤ principal; step by index with the carry at C; delta re-applied. C major
`[0,2,4,5,7,9,11]`: 60+0→60; 60+1→deg0→deg1(2)→62; 64+1→deg2→deg3(5)→65; **71+1→deg6→target 7
→octave 1, index 0 → base(71−11=60)+12+0 = 72 — the C-octave-carry claim holds**; 60−1→target
−1→floor(−1/7)=−1, index 6 → 60−12+11 = 59; 65−1→64; 62+2→65; 60±7→72/48; 60+15→octave 2,
index 1 → 60+24+2 = 86. Off-scale: 63→anchor 62 δ1→64+1 = 65; 63−1→60+1 = 61; 61+1→62+1 = 63;
60.5+1→62.5; −1+1→pc 11, anchor −1, base −12 → −12+12+0 = 0. D major `[1,2,4,6,7,9,11]`:
66+1→deg3→deg4(7)→67; 74+1→deg1→deg2(4)→72+4 = 76; 73+1→deg0→deg1(2)→74; 72+1→**deg −1
branch**: anchor = 72−0+11−12 = 71, δ1, target 7 → 60+12+1+1 = 74. F major `[0,2,4,5,7,9,10]`:
70+1→deg6→72; 71+1→anchor 70 δ1→72+1 = 73. Circle ends: k=7 tonic 1 `[0,1,3,5,6,8,10]`,
61+1→63; k=−7 tonic 11 `[1,3,4,6,8,10,11]`, 71+1→60+12+1 = 73; k=8 tonic 8
`[0,1,3,5,7,8,10]`, 68+1→deg5→deg6(10)→70. All 24 rows reproduce.

**No counterexample to the ascending-from-C sort exists, and I tried to build one.** Proof:
for pitch classes `s0<…<s6` in [0,12), the absolute scale pitches `12m + s_j` enumerate in
ascending order exactly as `(m, j)` lexicographic, so index `i+k` *is* the k-th scale note
above the anchor in every key — the sort choice is what makes that true, and sorting from the
tonic would desynchronise the octave index from the pitch-class order (the implementer's NC3).
E major (k=4, `[1,3,4,6,8,9,11]`) B4=71 +1 → 60+12+1 = **73 = C♯5**, musically right.
Exhaustive sweep, 25 signatures (−12…+12) × 165 pitches (−24…140): **0 violations** of
`steps=0 ⇒ identity`, `steps=±7/±14 ⇒ exact octave`, and strict monotonicity with every step
in {1,2} semitones (histogram per key: ten whole steps, two half steps per chromatic octave —
exactly a major scale's two half steps plus the five chromatic anchors, and never a 3-semitone
step). Two properties I invented *do* fail — seven single `+1` calls ≠ one `+7` call, and
`+1` then `−1` is not the identity for an altered principal (63→65→64) — but both are inherent
to the delta absorption D8 *mandates* ("accidentals of the principal preserved"), unreachable
by any pitch-class scheme without spelling, and claimed nowhere. Not findings.

**(b) Landing placement — the implementer is right, from the reference's own code.** lars §4.2:
the landing copy is added to `notesToAdd`, and the splice is `for(String n : notesToAdd) {
chords.add(rptEnd, n); rptEnd++; }` — inserted at the group's end, ahead of any tail. Behind
its own group is the reference's placement, confirmed. One correction to the implementer's LOG:
in-place vs append-at-end do **not** differ in the *output* for the pinned trill-with-mordent
`|: 0 1 :| 0 -1 0` — both give `60 62 60 62 60 59 60`, because dedup absorbs the landing copy
either way (my M4 mutation leaves that dict row green). The real discriminator is the two-group
test, which does catch it. The source comment states this correctly; only the LOG sentence
overstates.

**(c) Tremolo over the expanded sequence.** D9's words are "unless the whole *sequence* is
single-pitch", so the pinned consequence (a one-note group inside a longer figure collapses to
one slot; the same group alone survives) follows literally. The reference's pool-based
`hasSamePitches` genuinely misfires on unused pool notes, and §3.5 confirms pool membership
and order carry no meaning. Divergence correctly sourced.

**(d) The 8-slot exemplum, re-derived from the reference rather than taken on trust.**
`maxNotes=(r+1)·G`, loop `while(maxNotes >= notesToAdd.size() + chords.size() + G)`. For
`#a |: #b #c :| #d`, r=2: maxNotes=6, S=4, G=2 → first append passes (6 ≥ 0+4+2), second does
not (6 < 2+4+2) → the reference emits **6** slots, i.e. the group played twice. Spec wants r+1=3
plays → 3·2 + 2 = **8**; the test pins 8. Cross-check that the divergence is confined to the
non-trailing case: for §5 vector 3 (`|: #n1 #P :|`, S=G=2, r=3) the reference's loop appends
three times → 8, identical to ours, and the test pins 8 with no landing (group opens on n1).

**(e) The −1 formula is exactly the reference's loop.** The m-th append fires iff
`budget ≥ S + m·G`, so the largest m is `floor((budget−S)/G)` — the implementation's formula,
not an approximation of it. Off-by-ones: budget=S → 0 passes, total S; budget=S+G → 1 pass,
total exactly the budget; budget=S+G−1 → 0 passes. Verified against the pinned rows (S=G=2:
budgets 2/3/4/9/1000 → 2/2/4/8/1000). W5's side: `ceil(frameMs/150)` gives 2 at 300 ms, 3 at
301 ms, 7 at 1000 ms; note D9 measures the **frame**, while the reference measures the
principal's ms duration (`ceil((ms.date.end − ms.date)/150)`) — a ≠Lars for W5 to honour.

**Mutation analysis: 12 mutations, 0 survivors**, ten of them outside the implementer's NC set.
M1 nearest-anchor instead of greatest-≤ (2 red) · M2 chromaticDelta dropped (6) · M3 dedup
across a chord boundary (5) · M4 landing appended at sequence end (1) · M5 repetitions applied
to the first group only (6) · M6 `mod12` loses its sign correction (4) · M7 landing fires for a
chord (1) · M8 budget `floor(budget/G)` (9) · M9 tremolo decided from the pool, i.e. the
reference's rule (10) · M10 group re-indexing removed (3) · M11 plays=r (34) · M12 MSM looked up
before the pool (2). M4 and M7 are pinned by a single test each — thin, but pinned.

**Probes** (~50, scratchpad runner over a compiled copy; no throw, no hang, no crash anywhere):
msm-only order with an empty pool and no principal → ok; `#abs` without a principal → ok,
`#up` without one → `ok:false` (D7 step 3 both ways, and one non-absolute note fails the whole
ornament, which is D7's "all `note`s need an explicit `midi.pitch`"); keyFifths ±8/±15 resolve
as enharmonic keys; steps ±70 → exactly ±120 with the delta intact; `[ ]` and `|: :|` →
`ok:false` "lists no notes" (the reference's OOM case, terminated); `#up |: :| #dn` → 2 slots;
unclosed `|:` and nested `|: … |: … :| … :|` both terminate correctly; ceiling exactly at 10⁶
→ ok in 81 ms, one over → rejected in 0.1 ms with no allocation, `r=2³¹−1` rejected in 0.0 ms.

**Seven non-blocking findings, none a D8/D9 violation, all for W5/W9 rather than W4:**
1. Non-finite pitches pass through silently — `midi.pitch` NaN/Infinity reaches the slots with
   no warning and no drop, while `repetitions` and `frameNoteBudget` *are* validated. The
   asymmetry is defensible (only the latter two can hurt termination) and W3 owns the XML
   boundary, but Java's `Double.parseDouble` accepts "NaN"/"Infinity" literally, so W3/W5 must
   guarantee finite pitches or an MSM note gets `midi.pitch="NaN"`.
2. `[ #up #up ]` → `[61,61]`: a duplicate pitch inside one chord slot survives. The reference
   collapses it (its dedup runs across chord brackets). Two identical pitches at one onset on
   one channel is a MIDI stuck-note hazard — W5 must decide. Untested either way.
3. Related: "chords never collapse" is a real ≠Lars divergence that the source does not label
   as one (the reference's `lastNote` persists across `[`/`]`, so it *does* mutilate chords —
   ours is better). PARITY.md §v3 owes it, W9.
4. The landing copy can exceed the −1 fill budget by one slot (budget 2 → 3 slots). This is
   =Lars — the reference appends its landing copy after the while-loop too — but W5 should
   expect budget+1 notes in the frame.
5. `|: #P :|` r=0 → **two** principal-pitch slots (landing fires, tremolo exception blocks
   dedup). =Lars for the pool-unison spelling `|: #uni :|`; for the direct `#P` spelling it
   follows from the implementer's documented generalisation of the trigger. Degenerate input,
   worth knowing.
6. W2's parser warnings are *not* merged into the expansion warnings — W5 must log both the
   AST's and the engine's.
7. Slot objects are shared across passes (`slots[0] === slots[2]` confirmed) and are readonly
   by type only, not frozen. Documented; restating it because it is W5's sharpest trap.

Verdict: **PASS W4.** Every DECISION in the implementer's log is defensible on spec grounds, the
two contested ones ((b) and (d)) are confirmed against the reference's own source, the D8 ruling
survives an exhaustive search for a counterexample, and no mutation escaped the suite.

## W3 implementer — 2026-08-09

Model layer: `TemporalSpread` v3, `OrnamentDef.alignment`, the new `OrnamentNote`, the v3
fields on `OrnamentData`, and `OrnamentationMap`'s v3 read/write. Five source files, three
test files, nothing else. Did NOT run `npm run verify` or `npm run build`, did NOT commit.

**Shape.** The load-bearing choice is that a `temporalSpread` has **two readings of one
element**, picked by a per-instance `getSourceFormat()`, rather than one reading that
converts. v2-sourced: `frameStart`/`getFrameLength()`/`frameDomain`, parsed and written by
exactly today's statements. v3-sourced: `getFrameOffset()`/`getFrameLengthValue()`, each a
`TemporalValue` with its own domain, written canonical. INVARIANT (pinned): the two never
both hold state — v2 leaves the v3 accessors null, v3 leaves the v2 numbers at their
initialisers. No mirror, because `relative` has no `FrameDomain` counterpart and
`frame.offset="22ms" frameLength="90%"` has no single one either; any mirror would have to
invent a number, and D5 puts frame resolution in the renderer anyway. `OrnamentDef` and
`OrnamentationMap.addOrnament` carry the same v2/v3 split.

**Rulings exercised, all documented at the site.**
- D3 detection: `frame.offset` present, or a unit suffix on `frame.start`/`frameLength`. The
  suffix probe is a *format* test (`/(?:ms|%|ticks)$/`), not a validity test, so
  `frameLength="abc%"` is a malformed v3 value that logs and defaults, rather than sliding
  back onto v2's `parseFloat`. `alignment` is deliberately NOT a marker for the spread (it is
  not a frame value and the spread never writes it) but IS one for the def.
- The brief's mixed-spelling RULING is pinned both ways: `frame.start="-22.0"
  frameLength="44%"` is v3, and the offset re-emits as `frame.offset="-22ticks"`.
- D3 defaults: `frame.offset` → `0.0ticks`, `frameLength` → `100%`, both applied on the v3
  path so that "v3-sourced" and "the v3 accessors carry the state" are the same statement.
- D12: v3 writes BOTH frame attributes unconditionally. Omitting a default would lose the
  domain (`frameLength="0%"` vs absent-means-`100%`) — the reference's own omission bug.
  Same reasoning makes the v3 `addOrnament` always write `scale` and default it to the spec's
  `0.0` instead of `1.0`, and write `repetitions` only when ≠ 0.
- D2: `ornamentDef` wins over `temporalSpread`; a *malformed* def value is logged and treated
  as absent, so a well-formed spread value still wins over it rather than the default.
- D7: `noteid` stored raw (the schematron distinguishes `#p` from `p`), with
  `getPrincipalNoteId()` as the stripped accessor.
- D8: `midi.pitch` > `interval.chromatic` > `interval.diatonic`, warning when >1; zero pitch
  attributes → `{chromatic, 0}`. All three read as doubles (MSM carries fractional pitch).
- D16: `Number` + `TODO(W10)` at both new numeric sites, with the honest difference from W1's
  case written down — W1 could argue the deviation away because its grammar excludes every
  string on which `Number` and `Double.parseDouble` differ, and `midi.pitch` has no grammar,
  so the W10 switch is a real behaviour change on malformed input, not a formality.

**Decisions the brief left open.**
1. *Parsing never mutates the caller's tree.* A reference-style def carrying `alignment` on
   its `temporalSpread` is READ per D2 but keeps the attribute where it was written;
   `setAlignment` is what canonicalises it onto `ornamentDef`. Moving it at parse time would
   be a side effect nothing else in this port has. `setTemporalSpread` re-asserts an adopted
   alignment, because a regenerated spread drops it (no-op for every v2 def).
2. *`OrnamentData.noteOrderText` (new field).* Forced by a failing round-trip test: the flat
   `noteOrder` array strips every `#`, so `|: #n1 #princNote :|` came back out as
   `#|: #n1 #princNote #:|`. The raw text is now kept beside the v2 view; the v2 array is
   untouched, and W4/W5 want the raw string for `parseNoteOrder` anyway.
3. *`addOrnamentFromData` routes to the v3 writer* when the data shows any v3 marker,
   otherwise it is byte-unchanged. Without it, `getOrnamentDataOf` → `addOrnamentFromData`
   silently drops pool, `repetitions` and `noteid`.
4. *Non-finite v3 values are treated as absent*, closing W1's finding F2 at the level W1
   nominated: a 309-digit `frameLength` parses successfully to `Infinity` and would serialize
   as the unreadable `"Infinityticks"`.
5. *v3 attribute order* extends the v2 order rather than the spec exemplum's `noteid`-first:
   `date`, `name.ref`, `noteid`, `scale`, `note.order`, `repetitions`, `xml:id`. New element
   shapes (`<note>`: `xml:id` then the one pitch attribute) have no Java byte precedent, and
   that is said at the site.

**Surprises.**
- `Attribute.detach()` is a silent no-op for any attribute that came out of the parser:
  `Element.wrap` fills `_attributes` directly and never sets `_xomParent`, which is the only
  branch `Attribute.detach` has. `setAlignment` therefore uses `Element.removeAttribute`.
  **This is a live pre-existing bug in `TemporalSpread.setId(null)` and
  `DynamicsGradient.setId(null)`** — verified: on a Builder-parsed spread, `setId(null)`
  clears the field and leaves `xml:id="ts-1"` in the XML. The existing tests miss it because
  they build their elements with `new Element` + `addAttribute`. NOT fixed here: it is a
  behaviour change on a v2-frozen method and `DynamicsGradient` is outside this wave's file
  set. Conductor's call.
- `allChildElements(parent, name)` is **quadratic**: it runs an XPath, and `Element.query`
  serializes the subtree to text, re-parses it and maps hits back by position. Measured on a
  built pool: 250 notes 74 ms, 500 190 ms, 1000 795 ms, 2000 3158 ms. My first draft used it,
  which would have put a serialize-and-reparse of *every* ornament — v2 ones included, since
  the pool read runs on the render path — into a path that had none. `getChildElements('note')`
  is the same matching in a plain array scan: 2000 notes, 2 ms. PERFORMANCE NOTE at the site.
  Worth a wider look in W9: `allChildElements` has 16 call sites.
- `GenericMap.setHeaders(global, local)` — global first. Cost me a test.

**Tests: additive, no existing assertion weakened or deleted.**
`OrnamentDef.test.ts` 71 → 117 `it`s (v2 byte stability as whole-string comparisons; the v3
parse matrix incl. suffix-less/legacy `time.unit`/`relative`/alias/failure/overflow/clamp; v3
canonical serialization + fixpoint; the v3 API; alignment on both hosts with precedence).
`OrnamentationMap.test.ts` 93 → 122 (v2 `addOrnament` byte stability; `OrnamentData` v3 fields
incl. `repetitions` lenience and `noteOrderText`; pool child without `xml:id` skipped+logged;
`getOrnamentDataOf`; the v3 `addOrnament` shape; a NEGATIVE CONTROL proving an ornament
carrying pool+`noteid`+`repetitions` still renders the v2 arpeggio markers unchanged and
generates no notes). New `tests/mpm/elements/maps/data/OrnamentNote.test.ts`, 20 tests.
Per-test timeout on the one loop test (2000 ms over a 2 ms body — it is what caught the
quadratic draft at 3158 ms).

**Negative controls — 10 mutations, all caught** (applied to the worktree, suites run, source
restored and md5-verified after each; `md5 -q` of all five sources identical to the pre-NC
backup). NC1 detection forced to v2 → 9 red. NC2 forced to v3 → **18 red including
`all-maps-equivalence` "ornamentation: all elements and attributes match Java reference"** and
four pre-existing v2 tests — the byte gate bites. NC3 `frame.start` alias dropped → 2. NC4 D2
precedence inverted → 2. NC5 `repetitions` always stamped → 2. NC6 pool not read → 7. NC7
frameLength default 0 instead of 100% → 4. NC8 pitch priority reversed → 4. NC9 `noteid`
normalised on read → 4. NC10 v3 writer omits a 0 frameLength like v2 → 1.

**Gates.** Mandated set green: `all-maps-equivalence` + `OrnamentationMap` + `OrnamentDef` +
`OrnamentationStyle` + `OrnamentNote` = 298/298. `tests/integration` = 251/251. Whole suite
2723/2723 (62 files). `tsc --noEmit` clean on `tsconfig.json` and `tsconfig.tests.json`.
`prettier --check` clean on all eight touched files. `eslint`: the three test files are
**silent**; the new `OrnamentNote.ts` is **silent**; the four modified source files report 9
findings, every one of them on a line byte-identical to HEAD (`this.getLocalHeader()!` ×2,
`xml.getAttribute('date')!` ×2, `getDynamicsGradient()!` ×2, the unused `Attribute` import,
`createOrnamentDef`'s `unified-signatures`, `return this.xml!`) — pre-existing lint debt, zero
new findings, and the new `addOrnament` overload pair does not trip `unified-signatures`.
ZERO suppressions in all eight files.

**Left for later waves.** `note` is not registered in `Mpm.isInNamespace` (that file is
outside this wave's set) — a v3 pool note will be reported as foreign until someone adds it;
flagged for W9. `OrnamentData.noteOrder` stays v2's flat array on purpose, so the AST from
`noteOrder.ts` is not wired in yet — that is W4/W5's seam, and `noteOrderText` is what they
should parse. `OrnamentData.apply` still returns `[]`; the dead loop is still dead.

## W3 verifier — FAIL (2026-08-09)

Adversarial verification of the model layer. **One finding, and it is a test gap, not a
defect**: the shipped behaviour is correct everywhere I could reach it, and the v2 byte gate —
the thing this wave actually risked — is clean under every instrument I could build. Verdict is
FAIL only because the protocol rules a surviving mutation a FAIL finding, and one survived.

**Footprint.** Exactly the declared set: four modified sources (`TemporalSpread.ts`,
`OrnamentDef.ts`, `OrnamentData.ts`, `OrnamentationMap.ts`), one new (`OrnamentNote.ts`), three
test files, and this LOG. W4's `ornamentExpansion.*` are present and were built but not reviewed.
Nothing outside. `vitest.config.ts` needed no edit — coverage globs `src/mpm/**/*.ts`.

**Test-weakening audit: clean.** `git diff HEAD -- tests/` removes 4 lines total, all of them
import statements expanded in place (`vitest` + `vi`, `XomTypes` + `Builder`, and two added
import lines). Every other hunk appends after the final `});` (OrnamentationMap @1323+473,
OrnamentDef @840+480). No existing assertion modified or deleted.

**Byte gate — v2 is frozen. Four independent instruments, all green.**
- `npm run verify` exit 0: 62 files, **2723/2723**.
- Baseline = `git archive cd140e1` + own `tsc`; WIP = worktree `tsc`.
- `probe.mjs` 1284 checks — baseline and WIP both
  `ed158a07d553f9346b958e8943b98c3b8c55a046f4fb4061654567e864e8757f`.
- `probe2.mjs` 83 checks — both
  `0b58d5a4c281914e605de46eb44be54e223d1eb7b08724702eca1ac703ca8c7c`.
  (The JSON files differ only in the recorded `dist` path key; `sha` and `results` are equal.)
- **dist diff**: 8 added files (`OrnamentNote.*`, `ornamentExpansion.*` × js/d.ts/+maps) and 16
  changed = the four W3 sources × {js, d.ts, js.map, d.ts.map}. **Every other compiled file in
  dist/ is byte-identical.** No collateral emission anywhere.

**v2 serialization spot-probe (new instrument — `scratchpad/w3verify/v2probe.mjs`).** The two
pipeline probes never drive the MPM ornamentation model classes on `.mpm` input: their pipeline
block runs on `mei/` inputs only, and `ref/*.mpm` is exercised at the generic XomTypes level.
So this wave's actual surface was untested by them. 78 checks driving `Mpm`/`OrnamentDef`/
`TemporalSpread`/`OrnamentationMap`/`OrnamentData` directly — full `ornamentation.mpm`
parse-and-reserialize, each of the three `ornamentDef`s (incl. both `time.unit` forms), 14
`temporalSpread` forms, the v2 programmatic API per the §6 fixture recipe
(`setTemporalSpreadValues(-22, 44, Ticks, 1.0, False)` etc.), `createDefaultOrnamentDef`,
15 `addOrnament` argument shapes, `getOrnamentDataOf` → `addOrnamentFromData`, and a
render-path probe writing real `ornament.date.offset`/`ornament.dynamics` markers.
Baseline and WIP both `058e92c4cc08ef21f3b9187d24c6e491822a19426dac15c402680d227660fb0e`,
0 throws, 0 differing checks.

**D12/D3 matrix (WIP): all correct.** v2/v3 discriminator (`frame.start`→v2, `frame.offset`→v3,
bare→v2); the pinned mixed ruling `frame.start="-22.0" frameLength="44%"` → v3 re-emitting
`frame.offset="-22ticks" frameLength="44%"`; `time.unit` fallback (`frame.offset="5"` +
`milliseconds` → `5ms`, no `time.unit` written); suffix-less → ticks. Malformed v3
(`abc%`, `Infinityticks`, 309-digit, negative) → logged exactly once, attribute defaults, **def
survives with gradient and `intensity` intact**. D2: def wins over spread both ways; a malformed
def value yields to a well-formed spread value; alignment-only spread stays **v2** and
re-serializes as v2 bytes while the def reads `at end`.

*On the alignment question the brief flagged:* **no information is lost.** A reference-style
`<temporalSpread … alignment="at end">` round-trips with the attribute still in place (the def
wraps the live subtree; `getXml()` returns the parsed element, `generateXML()` is not called),
re-parsing that output is a **fixpoint**, and the def carries the behaviour. `setTemporalSpread`
re-asserts the adopted alignment onto `ornamentDef` — verified: the attribute survives a spread
replacement, and the re-assert is a no-op on a v2 def (`sourceFormat` stays `v2`, bytes
unchanged). Also verified: **parse and write never mutate the caller's tree** — a source
`<ornament>` carrying a non-spec attribute is byte-unchanged after `addOrnamentFromData`.

D7/D9/D1/D8: `noteid` stored raw and rewritten verbatim for both `#p` and `p`, stripped only by
`getPrincipalNoteId`; pool child without `xml:id` skipped + logged once; >1 pitch attr → 
`midi.pitch` > `chromatic` > `diatonic` + warning; zero pitch attrs → `chromatic 0`;
unparseable pitch → note skipped + logged; `repetitions="-1"` accepted, `"-2"`/`"abc"` → 0 +
log, `"2.5"` passed through; `repetitions="0"` not serialized; `scale` always serialized
(0.0, 1.0 and 2.0 all written). A full v3 document is a **round-trip fixpoint** with alignment,
frame values, `noteoff.shift`, `noteid`, `repetitions`, pool and `note.order` text all intact.

**Negative control (mine, independent of the implementer's).** Two identical arpeggio ornaments,
one bare and one carrying `noteid` + `repetitions="3"` + a pool `<note>`, rendered through
`renderOrnamentationToMap`: **byte-identical marker output**, markers actually present (probe is
not vacuous), and no notes generated — the W5 seam is still correctly dead.

**Mutations: 10 applied on a scratch copy, 9 killed, 1 SURVIVED.**

| # | mutation | verdict | killer |
|---|---|---|---|
| M1 | `V3_UNIT_SUFFIX` made a *validity* test → `frameLength="abc%"` slides to v2 | **SURVIVED** | — |
| M2 | v3 writer omits `frameLength` at the 100% default | killed (2) | OrnamentDef.test |
| M3 | `alignment` written on `temporalSpread` | killed (2) | OrnamentDef.test |
| M4 | `noteid` normalised (`#` stripped) at parse | killed (3) | OrnamentationMap.test |
| M5 | `addOrnamentFromData` never routes to v3 | killed (1) | OrnamentationMap.test |
| M6 | `detectSourceFormat` ignores a suffix on `frameLength` | killed (4) | OrnamentDef.test |
| M7 | `OrnamentNote.generateXML` omits the chromatic-0 pitch attr | killed (1) | OrnamentNote.test |
| M8 | negative v3 `frameLength` not clamped | killed (2) | OrnamentDef.test |
| M9 | v3 writer omits `scale` when 1.0 | killed (1) | OrnamentationMap.test |
| M10 | pool returned in reverse document order | killed (3) | OrnamentationMap.test |

M6–M10 go beyond anything the implementer pinned; all five died. Sources restored and
md5-verified against the pre-mutation backup. **The worktree was never mutated** — all mutation
work ran in `scratchpad/w3verify/mut/`.

**THE FINDING — M1: the `abc%` ruling is documented but not pinned.**
The LOG entry and the `V3_UNIT_SUFFIX` doc comment both state the ruling that the suffix probe
is a *format* test, so `frameLength="abc%"` is a malformed **v3** value (log + default) and must
not slide back onto v2's `parseFloat`. **No test enforces it.** Every malformed-value test uses
`frame.offset=…`, which is detected by attribute *name*, so the suffix probe is never the thing
under test; the 309-digit case still matches a strict numeric regex. Measured difference on the
mutant, with the full 2723-test suite green:

    <temporalSpread frameLength="abc%" />
      shipped: v3, logs 1, -> <temporalSpread frame.offset="0ticks" frameLength="100%" />
      mutant : v2, logs 0, -> <temporalSpread frameLength="NaN" />

A silent `NaN` into a frame length, with no diagnostic. Same for
`frame.start="xx ticks" frameLength="44.0"` → `frame.start="NaN"`.
**Remedy (small, additive):** one `it` in `OrnamentDef.test.ts` asserting that
`spread('frameLength="abc%"')` has `getSourceFormat() === 'v3'`, `getFrameLengthValue()`
`{value:100, domain:'relative'}`, and logs `no MPM v3 temporal value` — i.e. the existing
"unparseable v3 value" test repeated with the suffix, not the attribute name, as the marker.

**Gates.** `prettier --check` clean on all eight touched files. **Zero** `@ts-ignore` /
`@ts-expect-error` / `eslint-disable` in the five sources and the three test files. Lint debt
**930 baseline = 930 WIP**, per-file identical (OrnamentationMap 2, OrnamentData 5, OrnamentDef 1,
TemporalSpread 1 — the implementer's "9 pre-existing findings" confirmed against baseline);
`OrnamentNote.ts` and `ornamentExpansion.ts` contribute **zero**. No growth.

**Verdict: FAIL W3** on the single M1 test gap. Everything else — footprint, additive tests, the
v2 byte freeze across four instruments, the full D12/D3/D2/D7/D8/D9 matrix, round-trip
fixpoints, tree non-mutation, the negative control, and every gate — passes. Add the one test
and this is a PASS; I found nothing else to hold it back.

### W3 fix round — M1 (2026-08-09)

Verifier ruled FAIL W3 on one surviving mutation, M1: the *suffix* half of
`detectSourceFormat` had no test that could see it. The implementation was right; the suite
was blind, in the same shape as W2's M11. Root cause: my "unparseable v3 value" test spells
`frame.offset="abcticks"`, and `frame.offset` is a v3 marker by ATTRIBUTE NAME — so the
element was v3 with or without the suffix probe, and every other malformed-value test sat
behind the same name. Nothing pinned the ruling that the probe is a *format* test rather than
a validity test.

- Two tests added to `TemporalSpread — v3 parsing`, test file only. `frameLength="abc%"` —
  the trailing `%` the only marker in the whole element — must give `getSourceFormat()` `'v3'`,
  `getFrameLengthValue()` `{100, relative}` (the default, the attribute treated as absent),
  `getFrameOffset()` `{0, ticks}`, the `no MPM v3 temporal value` log, `getFrameLength()`
  still `0.0`, and the canonical output. Plus the twin on the offset side,
  `frame.start="xx ticks" frameLength="44.0"`.
- What the mutant would have done, and why it is not cosmetic: without the probe, `abc%` falls
  onto the v2 path, where `parseFloat("abc%")` is `NaN`, `setFrameLength`'s `Math.max(0, NaN)`
  is `NaN`, and `NaN !== 0.0` so `generateXML` writes a **silent `frameLength="NaN"` with zero
  diagnostics** — an unreadable frame in an otherwise valid document.
- Negative control, the verifier's mutant reproduced exactly (probe narrowed to accept only
  well-formed suffixed values, so `abc%` slides to v2): **2 red, precisely the two new tests**,
  123 others still green — which is the direct evidence that the old suite could not see it.
  A broader variant (suffix probe neutered entirely) takes 6 red, the two new ones among them.
  Source restored and md5-verified after each run.
- 125/125 green (was 123; +2, none removed or weakened). `prettier --check` clean, `eslint` on
  the test file exit 0 and silent, zero suppressions. The mandated gate and `tests/integration`
  re-run green.
- **All five source files byte-identical to the pre-fix-round freeze** — this round touched
  tests and this journal only. `md5 -q`: `TemporalSpread.ts eb7bc72b6faca5c4a1202a8dfcb2a4c8`,
  `OrnamentDef.ts 39b1c87d3d30b104d13b23922e3a1cd1`,
  `OrnamentNote.ts 7b8bbd909166428dc6e36d1e526b2de1`,
  `OrnamentData.ts aea1f424f20526eaaeac55cd9fd833cf`,
  `OrnamentationMap.ts 6d1c1ebe8cf3a4793b96228b7bb637d5`.

### W3 verifier — re-check (2026-08-09)

Independent re-run of M1 against the fix round. **Verdict flips FAIL → PASS W3.**

**The fix is test-only, verified independently.** All five sources are md5-identical to the
snapshot I took before the first verification — I did not take the implementer's word for it:
`TemporalSpread.ts eb7bc72b…`, `OrnamentDef.ts 39b1c87d…`, `OrnamentNote.ts 7b8bbd90…`,
`OrnamentData.ts aea1f424…`, `OrnamentationMap.ts 6d1c1ebe…`, each measured per file and each
matching the fix-round entry's attribution exactly. `git diff HEAD -- tests/` still removes
**exactly the same 4 import lines** as before the fix round and nothing else; the
`OrnamentDef.test.ts` hunk grew `+480 → +520` and remains a single append after the final
`});`. LOG.md remains a pure append (0 deletions), so no earlier entry was edited.

**M1 is dead.** Sandbox re-synced with the updated test file, control green at **2725/2725**
(was 2723; +2, none removed). Applying M1 verbatim — `V3_UNIT_SUFFIX` narrowed from a format
probe to a validity probe — now gives **2 failed / 2723 passed**, and the two failures are
precisely the two new tests:

    × TemporalSpread — v3 parsing (D3) > should treat a malformed value marked v3 by its SUFFIX ALONE as absent
    × TemporalSpread — v3 parsing (D3) > should treat a malformed frame.start marked v3 by its suffix as absent

The implementer's broader variant reproduces too: with the suffix probe removed entirely,
**6 red**, the two new tests among them, alongside the `frame.start` alias, the frameLength-only
default, the out-of-range case and the alias re-emission — matching their reported count exactly.
Sandbox sources restored and md5-verified after each run; the worktree was never mutated.

**The tests pin the right thing.** Both assert the full chain, not just the format flag:
`getSourceFormat() === 'v3'`, the defaulted `TemporalValue`, the `no MPM v3 temporal value` log,
**and** that no `NaN` leaked into the v2 reading (`getFrameLength()` / `frameStart` still `0.0`)
plus the exact canonical output string. That last pair is what makes them a real guard rather
than a restatement of the discriminator — they would catch the silent `frameLength="NaN"` even
if the format flag were somehow right for the wrong reason. The comments state the distinction
from the pre-existing `frame.offset="abcticks"` test (marker by attribute NAME vs by SUFFIX),
which is the gap I reported.

**The rest of the verdict stands, re-measured rather than assumed.** Sources being byte-identical
means added tests can only add kills, never remove them, so the other 9 mutations remain killed a
fortiori. Re-run against the freshly rebuilt dist: `npm run verify` exit 0 at **2725/2725** across
62 files; `probe.mjs` 1284 checks `ed158a07…`, `probe2.mjs` 83 checks `0b58d5a4…`, and my
`v2probe.mjs` 78 checks `058e92c4…` — **all three identical to the baseline `cd140e1` hashes**.
dist delta unchanged: 8 added, 0 removed, 16 changed = the four W3 sources × {js, d.ts, +maps};
every other compiled file byte-identical. Gates: `prettier --check` clean on the changed test
file, `eslint` **0 findings** on it, zero suppressions, `src/` lint debt still **930 = 930**, and
the repo-wide prettier warn count still **11 = 11** (pre-existing; `ornamentation/` is not in
`.prettierignore` although `refactor/` is — worth closing in W9, not a W3 matter).

**Verdict: PASS W3.** The v2 byte freeze holds under four instruments, the v3 matrix is correct,
round-trips are fixpoints, parse never mutates the caller's tree, and every mutation I could
devise now dies. Two items remain open for the conductor, both pre-existing and both correctly
left alone by this wave: the `setId(null)` no-op on parser-built attributes in `TemporalSpread`
and `DynamicsGradient`, and `note` not yet registered in `Mpm.isInNamespace` (flagged for W9).

## 2026-08-09 — Conductor: W1–W4 committed; D5 amendment for W5 (journaled before acting)

W1 9b4e610, W2 cd140e1, W3 e89d162, W4 6ca4b79. Suite at 2725 tests, all byte
gates baseline-identical.

**D5 AMENDMENT (binding for W5).** D5 claimed "NO change needed to the ms pass
itself". Planning W5 falsifies this for ONE combination: alignment="at end" with an
ms-domain frame — the anchor (principal ms end − frameLength) is unknowable before
tempo rendering, so phase N cannot express it with the v2 onset-offset marker.
Resolution: phase N writes, for that combination only, an end-anchored marker
`ornament.milliseconds.fromend.offset` (value = spacing_k + frame.offset −
frameLength, a static ms quantity); the ms pass gains ONE new branch consuming it:
msDate_new = msDateEnd_before + value (duration/noteoff handling analogous to the
existing branches, read-before-write discipline identical). The branch lands in
BOTH copies of renderMillisecondsModifiersToMap (Performance's live copy AND
OrnamentationMap's parity copy), with a synchronization test asserting the two
copies' behavior on the same input stays identical (closing the nothing-keeps-them-
in-step trap for the NEW branch at least). v2 documents never carry the marker →
byte gates unaffected. Rationale: the ODD itself classifies this as a
"milliseconds modifier", so extending the ms pass is spec-aligned, not a hack.

Further W5 rulings (D11-impl): multi-ornament layout cursor runs per frame domain
(tick/% ornaments on a tick cursor, ms ornaments on an ms cursor); overflow scaling
per domain group; BOTH domains stacking on one principal → warning logged,
domains laid out independently (spec silent; documented limitation). The -1
repetition sentinel requires an explicit ms frameLength (budget = ceil(ms/150)
computable pre-tempo); tick/% frames with -1 → log + skip (D9 refinement).
`note` gets added to Mpm.isInNamespace (v3 vocabulary; flagged by W3 verifier).
