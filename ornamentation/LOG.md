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
