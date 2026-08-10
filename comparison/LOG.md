# Performance Comparison — Campaign Log

Append-only. Newest entry LAST. Every entry dated. Decisions marked [DECISION]
are binding until superseded by a later dated entry.

---

## 2026-08-10 — Campaign start

Conductor session opened on user directive (see CAMPAIGN.md Mission). Worktree
`../meico-ts-compare` created on branch `compare-campaign` off main@9974ba3
(the expression-campaign merge). Task board #1–#9 mirrors the wave plan.

[DECISION] Campaign record dir named `comparison/`; interior module will live
in `src/comparison/` unless W1 design finds a better name. Rationale: parallels
`expression/` ↔ `src/expression/`.

[DECISION] W0 runs as three parallel surveys (literature, algorithms, codebase)
by background agents writing `comparison/survey-{lit,algo,code}.md`; the
conductor synthesizes SURVEY.md and keeps design authorship. Rationale:
identical to the expression campaign's W0 shape, which worked; surveys are
independent so parallelism is free.

[DECISION] Presumptive metric foundation is the expression registry's scale
spaces (per-attribute T with musical neutral): local attribute distance
d(x,y) = |T(x) − T(y)| in the same space exaggeration scales. This makes
comparison and exaggeration mathematically coherent (an exaggeration by s
moves every attribute a predictable T-space distance, so the comparison module
can *see* exaggeration as a uniform dilation — a testable property linking the
two modules). W1 must confirm or amend per dimension; the surveys are tasked
with attacking this presumption.

Agents launched 2026-08-10: survey-lit, survey-algo, survey-code (background).

## 2026-08-10 — W0 progress

survey-algo delivered (comparison/survey-algo.md, task #2 complete). Headline
recommendations received: L1 aggregate over per-dimension deviation-density
integrals (exact dimension × segment attribution); curve-change pricing for
edit ops; separate read-registry superset (not an extension of REGISTRY_ROWS);
Mongeau–Sankoff rejected as metric (alignment, not composable edit distance);
compare tempo CURVE not millisecond map (cumulative drift artifact); UPGMA
default + Ward caveat; pair-level normalization prohibited. Full adjudication
deferred to SURVEY.md synthesis when survey-lit and survey-code land.

## 2026-08-10 — W0 progress (2)

survey-code delivered (comparison/survey-code.md, task #3 complete). Three
findings CONTRADICT the presumptive-plan LOG entry and are provisionally
accepted pending synthesis: (1) expression registry is a write-licence, not
read coverage — comparison builds its own superset registry reusing scale-space
assignments + valueDomain predicates; (2) level distance uses center-free
ln(x/y) (per-document geomean centers would break symmetry; corroborated by
mpmify evaluate.py's bare log2 bpm); (3) curves are the primary comparison
object on real corpora (transition.to in 95/121, 42/43, 100/100 files) —
instruction alignment is the secondary edit-path product. Corpus: 454 real
.mpm files inventoried; only real multi-performance docs are 3/6 official
samples, two blocked by BOM-intolerant Builder → BOM tolerance in
src/api/parse.ts adopted as W2 work item #1. getTempoAt strict-before vs
getDynamicsAt inclusive boundary disagreement flagged for W1 ruling.
tempo_dynamics_spans third <tempo> lacking @beatLength: reader sees 4, curve
evaluator sees 3 — W1 must pick a reading and report the skip.

## 2026-08-10 — W2 item #1: UTF-8 BOM tolerance (task #10, survey-code)

Pulled forward of W1 because it is design-independent and unblocks the only
real multi-performance corpus.

[DECISION] The fix lives in `Builder.build` (`src/xml/XomTypes.ts`), NOT in
`src/api/parse.ts` as the previous entry and the task assignment presumed.
Rationale: `parseOrThrow` receives an already-bound `() => parse(text)` closure
and never sees the text, so normalising there would require changing its
signature AND would still cover only the facade. There are exactly three
`.build(` call sites in `src/` — `XmlBase.ts:56-59` (the Mei/Msm/Mpm classes,
i.e. the whole render pipeline), `expression/mpmDocument.ts:52` and
`expression/msmFacts.ts:80` — and the latter two deliberately bypass those
classes under D-A. `Builder.build` is the single point all three share, so it
is the only place that covers the expression facade and the future comparison
module as well as the pipeline. Verified by grep, not assumed.

[FINDING] The fix is parity-RESTORING, not a divergence. Java hands XOM *bytes*
at every entry point (`XmlBase.java:99,128,162`; `mei/Helper.java:1042,1061`),
and XOM's SAX/Xerces reader consumes a leading `EF BB BF` as the XML 1.0
§4.3.3 / Appendix F encoding signature before the document entity begins. This
port parses a decoded *string*, where the same bytes are a U+FEFF character in
front of the declaration, which `@xmldom/xmldom` refuses fatally. The
divergence was an artefact of characters-vs-bytes, not a decision either side
made. PARITY.md §1 entry `CMP1` records this with the Java citations.

Scope discipline: exactly one leading mark is stripped. Interior U+FEFF is
ZERO WIDTH NO-BREAK SPACE and is preserved; a *run* of marks is left alone
because the second is content, content before the declaration is an error, and
Java rejects that too — stripping the run would open a divergence while closing
one. One test assumption of mine was wrong and was corrected against measured
behaviour rather than kept: a stray BOM with NO xml declaration is a *non-fatal*
xmldom error (content silently dropped), so only the declaration case threw.

Tests (13 new, no existing test changed): `tests/xml/XomTypes.test.ts` gains 5
Builder cases — BOM'd == un-BOM'd serialization, BOM without declaration, BOM +
single-quoted attributes, interior U+FEFF preserved, exactly-one-stripped.
`tests/api/bom-tolerance.test.ts` is new, 8 cases across all three document
kinds, asserting equality of a downstream product (`canonicalMpm`,
`listPerformances`, `exaggerateMpm`, `performMsm`, `convertMeiToMsmMpm`) rather
than merely that parsing succeeded — a mark that survived into the tree would
parse fine and corrupt the output. Nothing was added under
`tests/integration/fixtures/**` (charter invariant #2); test input is inline.

Gate: `npm run verify` green, 4005 tests (was 3992). `npx eslint` on the three
touched files reports 4 errors, all proven pre-existing by re-running the same
lint with the changes stashed — byte-identical output. The new file has zero.

Real-corpus check: all four BOM-affected official sample encodings now parse;
three of them threw before. Telemann *Grave* (Baroque/Fast/Romantic) and
Vulpius *Die helle Sonn* (Baroque/Romantic/Amateur) are readable, so the
campaign's multi-performance inputs are unblocked.

NOT done, per the lead's instruction: no fixture work for the multi-performance
samples. Where comparison fixtures live is a W1 ruling (charter forbids
additions under `tests/integration/fixtures/**`), and the licensing/provenance
of the official samples needs a design-time note.
