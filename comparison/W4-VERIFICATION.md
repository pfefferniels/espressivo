# W4 WAVE GATE — VERIFICATION

**Verdict: GATE-BLOCK.** Three CAPITAL findings, ten MAJOR, thirteen MINOR. Four of these
(CAPITAL-1, MAJOR-4, MINOR-1, and half of MINOR-3) are tagged **[PRE-DECLARED]** — reported by
the author post-tenure and recorded as declarations rather than as this audit's discoveries, per
the W3 MINOR-8 precedent. The verdict does not depend on them: CAPITAL-2 and CAPITAL-3 block on
their own.

Scope: `87aa040..8789179` plus the conductor's `d98c735` — the edit path (`editScript.ts`,
`editState.ts`, the dimension adapters, the `diffMpm` facade, A5's fragment/consolidate moves),
the corpus products (`clustering.ts`, `embedding.ts`, `corpus.ts`, the `compareMpmCorpus`
facade), both scape variants, the README section with its executed recipes, and the family
extension 26 → 28 with AD-57.2's drop-each-member check.

Verifier: fresh Opus, wrote none of this code. Method: W2/W3 gate methodology — every claim
re-derived by code sharing no line with the implementation, on inputs the verifier constructed,
plus negative-control injection (patch the source, re-run, restore) to test whether the shipped
tests can fail. All mutation was performed in disposable copies of the worktree under the
session scratchpad; the worktree itself was never modified. `npm run verify` was run once at the
end on the unmodified tree — **125 files, 5396 passed, 0 skipped, green**; `git status` clean.

The two mandated extra heads are discharged in §1 (ruling reconciliation, AD-58.1..AD-66.1) and
§4 (the README's executed recipes).

---

## 0. Summary

The wave's mathematics is sound and its engineering discipline held. AD-5's theorem, the
replay's exactness, the canonical orientation, the dCurve/d_k bit-unification, the localization
impossibility for articulation, the matrix-equals-pairwise identity, PAM's optimality where it
claims to be exhaustive, silhouette, the linkages, the normalization's blast radius and the
scape's mass conservation were all independently re-derived and all hold. Cross-process
determinism, the plain-data rules, eslint and prettier are clean.

What blocks the gate is of a different kind, and the shape of it is the campaign's own theme:

1. **One binding ruling was amended into DESIGN and never implemented in code** (CAPITAL-1,
   PRE-DECLARED). AD-60.1's sixth epsilon family exists in `DESIGN.md` (the conductor's
   `d98c735`) and not in `report.ts`. The consequence is a wrong published number with measured
   harm, not a naming nit. This is exactly the divergence AD-66.4 convened this gate to look for,
   and the conductor's stated belief that "the code and the rulings converged by independent
   reasoning" is **false in this one place** — necessarily so, because the delegation was
   doc-only by construction, so nothing on the worker's side could have converged onto it. The
   split execution is itself the mechanism: had the ruling gone unexecuted on *both* sides there
   would be a gap; executed on one side, it manufactured a contradiction.

2. **The corpus level is not permutation-invariant** on three published fields — the medoid set,
   the seriation and the embedding coordinates (CAPITAL-2, CAPITAL-3). P-C6's "changes nothing
   else" is falsified end to end through the public facade. The wave's own P-C6 test uses a
   tie-free corpus and one fixed permutation, which is precisely the blind spot.

3. **AD-60.3's synthetic pin does not exist** (MAJOR-4, PRE-DECLARED). The gate brief flagged
   this as a check; the answer is that the obligation was never discharged, and the rule it was
   to pin has no observable in the suite at all.

Findings 1 and 3, plus MINOR-1 and half of MINOR-3, were **pre-declared by the author
post-tenure** and are recorded as declarations rather than as this audit's discoveries, per the
W3 MINOR-8 precedent. The pre-declaration reached this verifier only after the report was
written and delivered, so the two accounts are independent; the tag governs provenance and
credit, not severity.

**The verdict does not rest on the pre-declared items.** Strike all four of them and the gate
still blocks, on CAPITAL-2 and CAPITAL-3 — two permutation-invariance failures on published
corpus fields, neither reported by the author, both reproduced here at the algorithm layer and
end to end through the facade, and both traceable to a vacuous tie-rule test (MAJOR-7) that let
them ship. That is the finding this gate contributes.

Finding 2 is a craft gap of the ordinary kind. Findings 1 and 3 are channel-fault casualties and
should be recorded as such: AD-66.3 already closed the worker's tenure for the handshake failure,
and these are the places where that failure left defects in the tree rather than only in the
paperwork. That the author reported both unprompted, after its tenure had ended and with no
obligation to, is evidence for AD-66.3's own reading — the fault was the channel, not the craft.

---

## 1. RULING RECONCILIATION (mandated head i)

AD-58.1 through AD-66.1, each against the shipped code.

| Ruling | Obligation | Shipped? | Evidence |
|---|---|---|---|
| AD-58.1 | §6.2 tie recorded; both totals pinned, the choice pinned separately | YES | `editScript.test.ts` pins both; injection of a flipped precedence fails 10 tests |
| AD-58.2 | triple semantics: scriptCost = DP path, replayedDelta = delivered order, Σ costs = replayedDelta exactly, residual an exact-0 FIELD | YES | probe P2: `Σ steps.cost === replayedDelta` bit-exactly over 800 random pairs |
| AD-58.3 | co-dated ADDED instruction sorts AFTER a surviving one, pinned at the exported `editStateAt` | YES | `editScript.ts:281-286`; reversing the comparator fails 5 `editScript` + 1 `diff` test. **But see MAJOR-8** — the same rule in `stateFromFlags` is unpinned |
| AD-59.1 | deleting a `<style>` does not re-resolve; styleDef-only differences still priced | YES | `editDimensions.test.ts:317` pins `4·ln2/ln(1.025)` on the byte-identical-elements fixture |
| AD-59.2 | every dated entry is an instruction, `<style>` included | YES | `editDimensions.test.ts:334-357`, the `asynchronyMap` fixture written for the control that failed to fail |
| AD-59.3 / AD-61.1 | edit pricing RAW; `invariance` and `profile` ABSENT from the diff surface, not throwing | YES — the `Omit` is real in `src/api`, not only in DESIGN | `src/api/comparison.ts:187`: `DiffMpmOptions extends Omit<CompareMpmOptions, 'invariance' \| 'profile'>`; `diffMpm` forces `resolveInvariance(undefined)` and `profile: null` at `:335-336` |
| **AD-60.1** | **sixth epsilon family `rubato` with AD-34.1's figure** | **NO — DESIGN only** | **CAPITAL-1** |
| AD-60.2 | articulation localization stays OFF, 8× violation recorded | YES | `dimensions.ts:776` `localize: () => false`; verifier reproduced the violation (§2.5) |
| **AD-60.3** | **synthetic pin for the ornamentation mixed-state scope** | **NO** | **MAJOR-4** — rule implemented at `dimensions.ts:809`, no test reaches it |
| AD-61.1 | absence over throw | YES | as AD-59.3 above. **But see MAJOR-1** — `scape` was left in the inherited surface and is silently dropped |
| AD-62.1 | PAM exhaustive below `PAM_EXHAUSTIVE_LIMIT = 200000`; `Partition.exhaustive` reports which | PARTLY | `clustering.ts:247`; optimality verified over 2000 cases. **MAJOR-3**: the flag lies for 841 legal `(n,k)` pairs |
| AD-63.1 | `corpusAverage` removed from options, validator, echo and report | YES in code, but **vacuously** | absent from `CompareCorpusOptions`, `checkCorpusOptions`, `CorpusReport` — because the worker asked for the ruling *before* building it and then never built it. "Removed" and "never implemented" are indistinguishable in this tree, so this row is compliance without convergence. **MINOR-3**: design/code residue |
| AD-63.2 | explicit `embeddingAxes` errors, DEFAULT degrades | YES | `corpus.ts:189-191`. **MAJOR-10**: unguarded at `N ≤ 1` |
| AD-64.1 | scape on the PAIRWISE surface | YES in code | `CompareMpmOptions.scape` at `src/api/comparison.ts:169`, `ComparisonReport.scape`. **MINOR-1**: the §9.2 amendment was never executed |
| AD-66.1 | `EditOp.count`, `CorpusReport.window` | YES | `report.ts:391`, `report.ts:565-570`; `count` swaps correctly under the mirror |

**Verdict on the mandated head:** the convergence the conductor hoped for is real for **eleven**
of the fourteen rulings, vacuous for one (AD-63.1 — see its row), and absent for two. The two
failures are structural rather than accidental: AD-60.1 and AD-60.3 are the obligations that
could not converge, because they were *additions* the worker had no independent reason to
invent. AD-60.1's code half was never delegated to anyone — the conductor executed the DESIGN
half and left no code half with the worker — so the split execution manufactured the
DESIGN-vs-code contradiction that CAPITAL-1 records. AD-60.3's pin was explicitly left "WITH THE
WORKER" by AD-65.1, and the worker never received AD-65.

The strongest positive result here is AD-59.3/AD-61.1: the `Omit` is real in the shipped types,
reached by the worker from AD-52.3a's own rule without ever reading AD-61.1. That is genuine
convergence on the wave's most consequential surface decision, and it is the evidence for
AD-66.3's judgment that the fault was the channel and not the craft.

**Scope note on cut A5 (fragment/consolidate).** AD-61.3 deferred A5 by default under the RED
budget, to proceed "only if B–E close with headroom". The implementer never evaluated that
condition, because it shipped A5 without having read the ruling that imposed it. AD-66 accepted
the work after the fact, so A5's scope licence is **retrospective**, and this audit treats it as
unlicensed-at-the-time rather than pre-authorized. That classification changes nothing about the
code: A5 was audited on the same terms as every other cut and its substance holds — moves never
raise `scriptCost` (400 random pairs), the fragment/consolidate asymmetry reproduces from an
independent generator, the mirror swaps both the ops and their counts, and `MAX_MOVE_SPAN`'s
bound is respected. The one A5-adjacent defect this audit found (`MAX_MOVE_SPAN` having a single
thin detector) is a test-coverage MINOR. Recorded because a retrospective licence should be
visible as such in the campaign record, not because the work is in doubt.

---

## 2. CAPITAL FINDINGS

### CAPITAL-1 — AD-60.1's sixth epsilon family is in DESIGN and not in the code, and the shipped figure is wrong [PRE-DECLARED]

**Recorded as a pre-declared known finding, per the W3 MINOR-8 precedent — with one difference
from that precedent that matters.** The author reported this post-tenure, verified against the
tree at `f74c32a`. In W3 the pre-declaration reached the verifier before the audit closed; here
it arrived **after this report was written and delivered**, so the two accounts are independent
of each other. That makes the item better evidenced than either alone, not less — the gate
reached it from `report.ts` and a runtime probe, the author from the DESIGN-vs-code split. It is
recorded as the author's declaration rather than as this audit's discovery, and the severity is
unchanged: pre-declaration governs provenance, never consequence, and the consequence here is a
wrong published number in the shipped tree. Verified as declared, at all three sites the author
names (`report.ts:166`, `report.ts:187`, `compare.ts:140`).

**Where.** `src/comparison/report.ts:166` declares five families:

```ts
export type EpsilonFamily = 'step' | 'tempo' | 'bezier' | 'imprecision' | 'drift';
```

`report.ts:187` files `rubato: 'step'`, and `compare.ts:140` stamps `step: { relative: 0, jnd: 0 }`
under the comment *"no quadrature in the time domain at all (§5.7, §5.9)"*. `DESIGN.md:2494-2500`,
as amended by `d98c735`, declares six and names rubato's figure as AD-34.1's `2.718e-4` relative.

**Why it is CAPITAL rather than cosmetic.** `EPSILON_FAMILY_OF` is exported public data
(`src/api/comparison.ts:98`) specifically so `inputs.epsilon[EPSILON_FAMILY_OF[k]]` is a lookup,
and `diffMpm`'s own documentation tells the caller that both totals are `≥ dCurve` *"up to the
per-family quadrature ε the report stamps in `inputs.epsilon`"*. A consumer performing that
check on rubato gets ε = 0 and reads a theorem violation. Measured:

```
[P13] telemann/rubato: d=989.31309788  scriptCost=989.26705658
      shortfall=4.654e-5   family='step'  stampedEps=0   EXCEEDS THE STAMPED EPSILON
[P13] telemann/tempo:   d=17926.34723467 scriptCost=17926.34723467
      shortfall=2.029e-16  family='tempo' stampedEps=3.3e-6  within
```

The number `989.267…` is fine — the shortfall is 4.65e-5 relative, far below the metric's own
JND resolution, exactly as cut A3's STOP-AND-REPORT said. **The published record is what is
wrong**, and it is wrong in the direction that makes a correct implementation look broken. Note
the second consequence: with ε = 0, even ulp-level noise reads as a violation (vulpius rubato,
shortfall 1.687e-16, also "exceeds").

**Smallest repair.** Add `'rubato'` to `EpsilonFamily` (`report.ts:166`), repoint
`EPSILON_FAMILY_OF.rubato` from `'step'` to `'rubato'` (`report.ts:187`), and add
`rubato: { relative: 2.718e-4, jnd: <AD-34.1's JND figure> }` to `EPSILON_FIGURES`
(`compare.ts:135-155`). `epsilonRecord()` is derived from `EPSILON_FIGURES` and needs no change.
The `step` comment at `compare.ts:138-139` should lose its claim to cover rubato at the same
time. Add a test asserting the measured rubato shortfall is within the stamped rubato epsilon and
outside the `step` one, so the record cannot regress to the false reading — the author notes
`editDimensions.test.ts` already pins the 7.51e-5 real-data shortfall, so the assertion has a
measured figure to bind to and needs no new fixture.

---

### CAPITAL-2 — PAM's medoid set changes when the caller reorders `items`

**Where.** `src/comparison/clustering.ts:273-274`, inside `exhaustiveMedoids`:

```ts
const key = chosen.map((index) => labels[index] ?? '').join('\u0000');
const bestKey = best === null ? '' : best.map((index) => labels[index] ?? '').join('\u0000');
```

`chosen` is enumerated in ascending **index** order, so the key is the subset's labels in the
caller's own item order. Two cost-equal subsets are therefore compared under an order-dependent
key, and the winner depends on how the corpus was listed. AD-25.2's rule is that every tie is
broken on a LABEL; this key is label-*valued* but index-*ordered*, which is not the same thing.

**Reproduced at the algorithm layer.** Matrix `[0,0,2,2, 0,0,2,2, 2,2,0,0, 2,2,0,0]`,
labels `['L02','L00','L01','L03']`, `k = 2`, all 24 permutations:

```
[P9a] [["L00,L01 exhaustive=true", 20], ["L00,L03 exhaustive=true", 4]]
```

Two different medoid sets, both claiming to be the exhaustive global optimum.

**Reproduced end to end through the public facade.** Three vendored documents each listed twice
at `performance: 0` (a genuinely tie-rich corpus), unique labels, `k: 2`, `window {0,8}`, over 40
random item orders:

```
[P9c] medoid sets over 40 random item orders:
      [["A-tel-1,B-vul-1", 32], ["A-tel-1,E-vul-2", 8]]
```

The corpus names a different performance as "the most typical" depending on the order the files
were passed in. §8 makes the medoid the one corpus product whose entire value is naming a real
performer; AD-62.1 ratified the exhaustive pass on exactly that ground. A control in the same
probe confirms the matrices themselves permute correctly (worst aggregate cell difference `0`),
so this is the tie rule and nothing upstream of it.

`k = 1` — the corpus medoid that feeds `profiles` and the corpus scape — is immune, because a
one-element key has no order.

**Smallest repair.** Sort the label list before joining, in both `key` and `bestKey`:

```ts
const keyOf = (subset: readonly number[]) =>
  subset.map((index) => labels[index] ?? '').sort().join('\u0000');
```

Verified by the corpus audit: 923 failing randomized cases → 0; all 24 permutations agree.
`buildAndSwapMedoids`' own tie clauses (`clustering.ts:349-352`) should be checked in the same
pass. Add a permutation test over a **tie-rich** corpus that asserts `medoids` and `clusters`,
which the current P-C6 test does not.

---

### CAPITAL-3 — `seriationOrder` and `embedding.coordinates` are not permutation-invariant

**Where.** `src/comparison/embedding.ts:226-228` (the eigenvector sign anchor) and `:270-274`
(`seriationOrder`) both break ties with **exact** equality before falling back to the label:

```ts
// seriationOrder
coordinates[x] - coordinates[y] || (label tie-break)
```

Jacobi's rotation sequence depends on the matrix's storage order, so a permuted corpus yields
coordinates that are equal in exact arithmetic and differ in the last ulp. The `||` therefore
never reaches the label branch, and the published order follows float noise.

**Measured**, same six-item tie-rich corpus, 20 random item orders, `embeddingAxes: 1`:

```
[P9c] seriations: 7 distinct orders over 20 permutations, e.g.
      C-alb-1,F-alb-2,D-tel-2,A-tel-1,E-vul-2,B-vul-1
      C-alb-1,F-alb-2,A-tel-1,D-tel-2,B-vul-1,E-vul-2
      F-alb-2,C-alb-1,A-tel-1,D-tel-2,E-vul-2,B-vul-1        (and four more)
[P9c] A-tel-1 axis-1 coordinate: 16 distinct values, all ≈ -45.2370019107607…
      (-45.23700191076079, -45.23700191076068, …, -45.237001910761236)
```

The independent corpus audit additionally measured the **sign anchor itself** failing on the
vendored fixtures — `A-tel = +634.1636783061936` under four item orders and
`−634.1636783061933` under two others, i.e. the whole plot mirrored, which is precisely what
`embedding.ts:24-25` says the sign fixing prevents.

**Second, deeper layer, reported for the record:** a corpus with **repeated eigenvalues** (three
documents each duplicated gives `λ = [9, 9, ~0, ~0, 0, ~0]`) has an arbitrary basis for the
degenerate eigenspace, and *no* sign rule can canonicalise it. Measured coordinates for one item
across four permutations: `(1.6256,−0.5979)`, `(−1.3306,−1.1089)`, `(−0.2950,1.7067)`,
`(1.5165,−0.8369)`.

**Smallest repair.** Two parts, and both are needed. (a) Compare with a relative epsilon before
the label fallback in `signOf` and in `seriationOrder` — measured to take seriation from 718/1800
failures to 146 and the sign anchor from 239/600 to 133. (b) For the residue, either canonicalise
each repeated-eigenvalue block or narrow the stated guarantee: `embedding.ts`'s header currently
claims the sign fixing makes P-C6 true, which is unachievable for degenerate spectra. The honest
minimum is (a) plus a documented carve-out for degenerate spectra, with `embedding.degenerate`
carrying it as data rather than prose.

---

## 3. MAJOR FINDINGS

**MAJOR-1 — `diffMpm` accepts `scape` and silently drops it.**
`DiffMpmOptions` omits only `invariance` and `profile`, so `scape` is inherited
(`src/api/comparison.ts:187` vs `:169`), `checkCompareOptions` validates its `bins`
(`:522`), and `runDiff`'s field-by-field interior bag never passes it (`:323-339`).
Measured: `JSON.stringify(diffMpm({…, scape:{bins:8}})) === JSON.stringify(diffMpm({…}))` → `true`.
This is AD-25.1's knowability split violated on the very surface AD-59.3/AD-61.1 were about:
unusable given the options alone must ERROR, never be silently ignored. It also falsifies
`DESIGN.md:2815-2818`'s claim that the pairwise entry point has no instance of this branch in v1.
*Repair:* `Omit<CompareMpmOptions, 'invariance' | 'profile' | 'scape'>`.
Same class, one step weaker: `weights` and `plausibleRange` are inherited, validated, echoed, and
change no number in a `DiffReport` (measured: `weights: {tempo: 0}` leaves every `scriptCost`
bit-identical while the echo reports `0`; a `plausibleRange` band yields 0 diff notes against 56
from `compareMpm` on the same pair).

**MAJOR-2 — `explainedVariance` credits negative axes with positive variance.**
`embedding.ts:190` computes `Math.abs(eigenvalue) / total`; `embedding.ts:39` documents
`λ_j / Σ|λ|`. Reachable through the public API on the real vendored corpus (5 documents → 10
items, `window {0,16}`, `embeddingAxes: 9 = n−1`, legal): axes 7 and 8 have eigenvalues
`−145738.84` and `−567987.33`, all-zero coordinates, and are reported at `+0.004664811652368655`
and `+0.018180149719632315` — 2.28 % of the variance credited to two axes that are imaginary and
empty. *Repair:* delete the `Math.abs`; the sign is what tells the reader the axis is imaginary.

**MAJOR-3 — `Partition.exhaustive` is false, and its note is a false published statement, for 841 legal `(n, k)` pairs.**
`clustering.ts:250-257`'s `chooseCount` multiplies up to `k` without using `C(n,k) = C(n,n−k)`;
since `C(n,j)` is unimodal an intermediate product can blow the limit while `C(n,k)` is tiny.
Sweep over the legal domain (`n ≤ 256` = `DEFAULT_MAX_ITEMS`, `1 ≤ k ≤ n`): **841 pairs** where
the true `C(n,k) ≤ 200000` but `chooseCount` returns `limit+1`; the smallest is `n=21, k=21`
where `C = 1`. Measured: `n=26, k=24` (`C = 325`) reports `exhaustive: false` and emits the note
*"C(26, 24) is past the exhaustive limit"*.
*Repair — the two halves must land together.* Fixing `chooseCount` alone converts a false flag
into a hang: `exhaustiveMedoids`' `walk` (`clustering.ts:281`) has no pruning and visits
`Σ_{j≤k} C(n,j)` nodes. Measured with the count fix alone, `pam(n=30, k=28)` went from **1 ms to
51054 ms**. The correct repair is `const kk = Math.min(k, n - k)` in `chooseCount` **and**
`if (n - start < k - chosen.length) return;` at the head of `walk`. The current quirk is
load-bearing; do not fix half of it.
The flag never lies in the dangerous direction: `exhaustive === true` meant a true global optimum
in all 2000 verified cases.

**MAJOR-4 — AD-60.3's synthetic pin does not exist. [PRE-DECLARED]**
Pre-declared by the author post-tenure and independently reached by this audit (see CAPITAL-1 on
the sequence); recorded as the author's declaration, severity unchanged on the merits.
The rule is implemented — `dimensions.ts:798-809`, `containsA ? scopeOf(a) : scopeOf(b)` — and
`containsA` is threaded correctly from `dimensions.ts:679`. But no test in the repository
constructs an `ornamentationMap` pair, no vendored document carries one (the LOG says so), and
the `adversarialFamily` members that do carry one do not differ in local-header presence. So the
branch is never taken in either direction and the rule has no observable, which is the exact
condition AD-60.3 wrote the obligation to prevent ("a stated rule with no observable is half a
rule"). *Repair:* one synthetic pair — the same `ornamentationMap` content, one document with a
part-local `<header>` and one without — asserting that `S(0,0)` reproduces A's scope, `S(n,m)`
reproduces B's, and `replayResidual` is 0. Owner: `tests/comparison/editDimensions.test.ts`.

**MAJOR-5 — `DiffReport.notes` is structurally always empty.**
`diff.ts:158` allocates the array, nothing ever pushes to it, and `:253` sorts it. So no note
kind of §9.1 can fire on the diff path: no `length-mismatch`, no `capped` (though
`EditOpAttribute.deltaJnd` is a capped `localDistance` at `diff.ts:391`), no `plausibility`, no
`renderer-*`. In particular `DiffReport.scopes` can report `rule: 'mpm'`, which `DESIGN.md:2531`
says carries an `estimate-degradation` note — the note exists in `compare.ts:269-281` and has no
counterpart in `diff.ts`. `invertReport`'s note-inversion branch (`diff.ts:451-455`) is dead
code, and so is the wave's own mirror-test handling of it.

**MAJOR-6 — the drop-each-member sweep does not reach W4's own products.**
`w4Family.test.ts` binds the raw constant `ADVERSARIAL_FAMILY` at lines 123, 130, 144, 146, 153,
154 and 187, and calls `adversarialMembers()` only inside the guard test at line 250. The hook
itself works (`adversarialFamily.ts:465-469`, and `adversarialPairs()`/`adversarialTriples()`
honour it), and the sweep the LOG reports is genuine — it runs through `metricProperties.test.ts`.
But a drop-sweep over the whole suite exercises **identical W4 assertions for every value of
`COMPARISON_DROP_MEMBER`**: the orientation sweep and the tie-rich matrix pin, i.e. the two
surfaces AD-57.2's check was extended for, are outside it. Confirmed:
`COMPARISON_DROP_MEMBER=styled-level-fast npx vitest run w4Family.test.ts` → 7 passed, including
`prices the styled-level pair`, which does `expect(fast).toBeDefined()` on a member that was
supposed to be gone. *Repair:* route `w4Family.test.ts` through `adversarialMembers()`.

**MAJOR-7 — the PAM medoid tie rule has no negative control.**
Deleting the tie clause at `clustering.ts:275` (first-enumerated wins) and inverting it to
`cost <= bestCost` (last-enumerated wins) each fail **NOTHING** across all 124 W4 tests.
`corpusMath.test.ts`'s AD-25.2 block exercises `agglomerate` only, never `pam`. The ties are real
and live: instrumenting `exhaustiveMedoids` on `w4Family`'s ten-member corpus logged **28 tie
events at the optimum**, and under the inverted rule the published medoid set changes from
`{bottom-span, plain, renderer-default-level}` to `{capped, renderer-default-level,
styled-level-slow}` with the suite fully green. This is the vacuity that let CAPITAL-2 ship.

**MAJOR-8 — the replay's co-dated side preference is unpinned, and it is live.**
`editStateAt`'s rule is pinned directly (AD-58.3, `editScript.test.ts:181`), but the identical
comparator in `stateFromFlags` (`editScript.ts:309-314`) is not: reversing `x.side - y.side`
there fails **NOTHING**. The module's prose claims the replay never reaches the co-dated case;
measured, it does — over the same generator shape the suite uses, `Σ replayedDelta` fingerprints
are **365539.774112** (shipped) against **362418.129030** (reversed), and with co-dated entries
inside one side (a `<style>` and a `<tempo>` both at date 0, which real maps have) the gap widens
to 430087.51 against 397976.66. *Repair:* pin `stateFromFlags` the way `editStateAt` is pinned,
and correct the prose.

**MAJOR-9 — the corpus discards every per-pair note except `length-mismatch`.**
`corpus.ts:247-253` filters on `kind === 'length-mismatch'`, so `capped`, `plausibility`,
`renderer-*`, `grid-truncated`, `invariance-space` and `estimate-degradation` findings from the
`N(N−1)/2` comparisons are unobservable at the corpus facade. Corollary: `plausibleRange` is
accepted and validated at `compareMpmCorpus` and is inert there, since notes are its only
product — the same silent-drop class as MAJOR-1.

**MAJOR-10 — `embeddingAxes` is unvalidated at `N ≤ 1`.**
`corpus.ts:189` guards with `n > 1 &&`, so where the declared domain `[1, N−1]` is *empty* any
value is accepted. Measured: `compareMpmCorpus({items: [one], embeddingAxes: 7})` → `axes === 7`;
`items: []` with `embeddingAxes: 5` → `axes === 5` and an `explainedVariance` of length 5, all
null. Knowable from the options alone (`items.length` is in the same bag), so AD-25.1's first
branch applies and it must error.

---

## 4. THE EXECUTED RECIPES (mandated head ii)

**Verdict: the recipes genuinely execute against the engine.** This was tested by injection, not
by reading. Three independent engine perturbations each failed recipe tests, one of them caught
by no other file in the suite:

| Injection | Result |
|---|---|
| `tempoDistance.ts:226` mass scaled by `1.001` | `readmeRecipes` ×2 (Telemann table, Vulpius correction) + `editDimensions` ×2 + `w4Family` ×1 |
| `aggregate.ts` `attributionTable` remainder column pushed first, so `cells` column 0 is no longer `segments[0]` | `readmeRecipes` ×1 (the Hudson recipe) — **and nothing else in the suite** |
| `compare.ts:1158` linear-space guard widened so the `invariance-space` note fires for every mode | `readmeRecipes` ×1 (the Welte timing-only recipe) — **and nothing else** |

The second and third are the important ones: they show the recipes bind report *layout* and a
*negative* claim, which is what AD-65 credited the cut with. The shapes the README quotes
(`table.columnSums`, `segment.measure.start.number`, `opCounts.substitute`) are real and a rename
would fail these tests.

Two qualifications, both MINOR and both recorded rather than waved past:

- **README → test drift is silent** (MINOR-5). The tests never read `README.md` — `readFileSync`
  is used only for fixtures. The recipes and their numbers are re-typed. Rewriting five of the
  README's headline figures (`8397.60→9999.99`, `1755.47→1111.11`, `24941.06→12345.67`,
  `475 ms→999 ms`, `33 %→99 %`) leaves all 124 tests green. The file's docstring says "the
  numbers the README quotes are asserted against the engine", which is true of the *test's*
  copies of them.
- **Five of the twelve recipe tests assert only shape** — `Number.isFinite`, `toBeDefined`,
  `typeof`, or lengths: the neutral-baseline recipe, the `boundary_prf` derivation, the
  top-by-cost reading, the provenance presets, and the corpus example. They would survive any
  engine change that keeps the fields present and finite.

---

## 5. WHAT WAS INDEPENDENTLY VERIFIED AS CORRECT

Recorded with the strength of evidence, because a gate that only lists defects misreports the
wave.

**The edit path.**
- **AD-5's theorem holds** on every vendored pair × all eleven dimensions × `moves` on and off:
  no `scriptCost` or `replayedDelta` falls more than 1e-4 relative below `d_k`, and the only
  dimension reaching that band is rubato (CAPITAL-1's subject).
- **The replay's op bookkeeping is complete**, re-derived from the delivered ops alone over 800
  random pairs (moves on and off): every A instruction consumed exactly once, every B instruction
  produced exactly once, no double-consumption — so the final state *is* B structurally, and
  `replayResidual === 0` is a consequence rather than a coincidence. `Σ steps.cost ===
  replayedDelta` bit-exactly on every one.
- **Moves never raise `scriptCost`** (the `L¹` triangle claim): 400 random pairs, 153 strict
  wins, 168 fragments against 7 consolidates — reproducing the wave's measured asymmetry from an
  independent generator.
- **The canonical orientation mirrors byte for byte**, including moved scripts *and* with an MSM
  supplied so `measureA`/`measureB` are populated — a case no shipped test covers (MINOR-6). The
  verifier's own mirror, written from §6.4 rather than copied, matched the engine exactly on all
  three vendored documents.
- **`dCurve` is bit-identical to `compareMpm`'s `d_k`** on every vendored pair and dimension
  (`Object.is`, 0 mismatches).
- **`free` is exact**: 479 free ops all cost exactly 0, 160 priced ops all non-zero.
- **Articulation's localization impossibility reproduces.** Forcing `localize: () => true` in
  the articulation plan gives `scriptCost = 506.9999999999999` against `d_articulation = 2583` —
  a **5.09× violation** of `scriptCost ≥ d`. Shipped, `scriptCost = 2583.000000000001` against
  `2583`, i.e. reworking 0 to the last ulp, which is §6.2's "consistent by construction" for the
  event dimensions arriving as a measurement.

**The corpus level.**
- **Matrix ≡ pairwise**: 1080 `Object.is` comparisons (90 aggregate + 990 per-dimension) on the
  full corpus at `window {0,16}` → 0 mismatches; 0 again with an MSM.
- **Dendrogram equivariance**: 66000 permutation cases across five linkages → 0 violations,
  merge for merge, leaf for leaf, height for height.
- **PAM optimality where it claims exhaustiveness**: 2000 random cases, `n=4..8`, `k=1..4` → 0
  suboptimal. The published heuristic statistics are honest (forcing BUILD+SWAP reproduces
  ~6 % misses, worst excess 41.0 %).
- **Silhouette is exact**: worst `|Δ|` = **0.000e+0** over 800 random clusterings including
  `k=1`, `k=N`, singletons and all-zero matrices.
- **Linkages**: single/complete bit-exact against brute force; average to 2.67e-15; weighted to
  1.78e-15; `ward.D2` against Ward's closed form to 3.55e-15 **and** its merge sequence against
  greedy minimum-ESS-increase, 120/120.
- **Jacobi**: `|VΛVᵀ−A| ≤ 1.18e-11`, `|VᵀV−I| ≤ 3.78e-15` over 300 random symmetric matrices.
- **The MDS denominator is the honest one**: on the 4-cycle metric, `Σλ⁺` gives 0.5 and `Σ|λ|`
  gives 0.4; the report says 0.4. `negativeEigenvalueMass` matches an independent computation to
  all digits.
- **Normalization rebuilds the aggregate only**: 0 of 704 per-dimension cells changed; all 11
  constants bit-equal to the median re-derived from the shipped matrices.
- **Scape mass conservation**: top cell = D to ≤5.4e-16 relative at bins 1, 2, 3, 7, 8, 256;
  every cell equals the sum of the unit cells beneath it to ≤2.22e-16; per-dimension bins sum to
  `d_k` to ≤1.31e-15 for all eleven dimensions. `scapeIndex` is a bijection at every bin count
  tested. The corpus reduction's argmin matched an independent recomputation on all cells, ties
  went to the lowest label, and no cell named the medoid.

**House rules.**
- **Plain data (§9.6)**: a walker over `DiffReport` (3 documents × moves on/off × msm on/off) and
  `CorpusReport` (including the `N=0`, `N=1`, identical-performances and `normalization:'corpus'`
  corpora DESIGN names) found **0** violations — no `undefined`, `NaN`, `Infinity`, `-0`, `Map`
  or `Set`.
- **Determinism across processes**: a 126 kB serialization of a `DiffReport` (moves on) plus a
  `CorpusReport` (k, noiseFloor, scape) is byte-identical across four separate `node` processes.
- **eslint** exits 0 on all W4 source and test files; **`npx prettier --check .`** reports all
  matched files clean, repo-wide.
- **Layer directions** hold: the comparison layer imports no `src/api` (the orientation key uses
  `serializeMpmRoot` rather than `canonicalMpm` for exactly this reason, `diff.ts:82-88`).

---

## 6. MINOR FINDINGS

1. **DESIGN §9.2 never gained the pairwise `scape`** (AD-64.1's delegation). **[PRE-DECLARED]**
   `DESIGN.md:2291-2315` `CompareMpmOptions` has no `scape` field, and `ComparisonReport` (§9.3)
   has no `scape`. The code is right and the design is stale — the reverse of CAPITAL-1.
2. **`DiffMpmOptions.moves` default disagrees.** `DESIGN.md:2321` says `default true`; the code
   ships `false` (`editScript.ts:365`, `search.moves === true`) and the code's reading is the
   ruled one (A-Q5, AD-66.1). Correct the DESIGN comment.
3. **The `corpusAverage` removal is incomplete on both sides.** `DESIGN.md:2337`'s orphan doc
   comment is **[PRE-DECLARED]** — and the author is right to name it the conductor's own stray
   rather than the worker's: it was created by `d98c735`, which deleted the
   `readonly corpusAverage?: boolean;` line and left the `/** Add the corpus-average
   pseudo-performance… */` comment above it, where it now documents `noiseFloor`. The rest of
   this item is this audit's: `DESIGN.md:2699` keeps `items[].synthetic`, whose
   only producer was the pseudo-item; `DESIGN.md:3038` still lists it as a W4 deliverable; and
   `corpus.ts:359-363` hard-codes `synthetic: false` for every row.
4. **Stale doc on `EditPlan.localize`** (`dimensions.ts:630-632`): "articulation localizes only
   where every atom is DATE-anchored". The shipped plan is `localize: () => false`
   unconditionally, per AD-60.2.
5. **README → test drift is silent** (see §4).
6. **The mirror's `measureA`/`measureB` swap is exercised by no shipped test** — no mirror test
   passes an `msm`, so both fields are always null. The verifier confirmed the code is *correct*
   (§5), so this is a test gap, not a defect. One mirror pair with an `msm` closes it.
7. **`replayResidual` is self-reported**: hard-coding `const replayResidual = 0` at
   `editScript.ts:551` fails nothing. Structurally the claim is sound (probe P2 proves the op
   bookkeeping reaches B), and a genuinely broken replay *is* caught — skipping the last
   delivered op fails 22 tests across four files. The gap is narrow: nothing computes `Φ(final)`
   independently of `editScript` and compares it to `Φ(B)`.
8. **`DiffReport` and `CorpusReport` key order is unpinned.** `properties.test.ts:324-383` pins
   `ComparisonReport` only — and its own comment records that the pin is what caught W4's `scape`
   addition, which is the argument for extending it to the two new shapes.
9. **`scripts` ordering is unpinned.** `DESIGN.md:2846` pins `(part, map)`; `compareScripts`
   implements `(part, map, dimension)`; no test asserts the delivered order.
10. **`callerIsCanonical`'s `<=` is unpinned** (`diff.ts:102`): with `<`, a self-diff reports
    every op's `site.document` as `'b'` and no test notices.
11. **`negativeEigenvalueMass` = 2.28e-17 on a perfectly Euclidean corpus** (regular simplex)
    where the true value is 0.
12. **Scape conservation is 1–2 ulp, not bit-exact**, where `scape.ts`'s prose says "conserves
    mass EXACTLY": bins=1 top cell `2526.4921488423447` against D `2526.4921488423442`.
13. **Latent ceiling**: `jacobiEigen` spreads `n²` arguments into `Math.hypot`
    (`embedding.ts:70`); V8's measured limit is 105741, so `N ≥ 326` throws `RangeError`.
    `DEFAULT_MAX_ITEMS = 256` needs 65536 — 1.61× headroom, undefended if C17's ceiling rises.

Also recorded, not a finding: **`w4Family`'s tie-rich matrix does not discriminate the linkage
tie rule.** Its header says the corpus "is the situation index-keyed tie rules get wrong"; an
index-keyed linkage tie was caught only by `corpusMath`'s synthetic all-equal matrix. The corpus
*is* tie-rich (45 pairs, materially fewer distinct values, asserted), but the ties never land at
the running argmin. Only the child-order rule is caught there.

**Test census** (the W4 files, 124 tests): **98 substantive (79 %)** — assert an engine-computed
value or relation — against 26 shape-, type-, constant- or error-only. Three touch no `src/` code
at all: `editScript.test.ts:242` (arithmetic on the test's own helper), `corpusMath.test.ts:226`
(tests the test's own `permute`), `w4Family.test.ts:243` (tests a test helper). The requirement
of ≥8 substantive W4 tests is met many times over.

---

## 7. PER-AREA VERDICTS

| Area | Verdict |
|---|---|
| 1. Ruling reconciliation (AD-58.1..AD-66.1) | **BLOCK** — 11/14 converged, 1 vacuous (AD-63.1), 2 absent: AD-60.1's code half (CAPITAL-1) and AD-60.3's pin (MAJOR-4). Both absences are PRE-DECLARED by the author; A5's scope licence is retrospective |
| 2. Edit path | **PASS with MAJORs** — every mathematical claim independently confirmed; defects are surface (MAJOR-1), notes (MAJOR-5) and pins (MAJOR-8) |
| 3. Corpus products | **BLOCK** — CAPITAL-2, CAPITAL-3, MAJOR-2, MAJOR-3, MAJOR-9, MAJOR-10; the mathematics is right, the determinism contract is not |
| 4. Test vacuity | **BLOCK** — 98/124 substantive and the recipes genuinely execute, but MAJOR-7 (PAM ties), MAJOR-8 (`stateFromFlags`) and MAJOR-6 (the drop sweep) are live vacuities, and MAJOR-7 is what let CAPITAL-2 ship |
| 5. DESIGN coverage | **PASS with MINORs** — §9.4's rows are otherwise complete and correct for both new facades; the gaps are the three silent drops and stale design text |
| 6. House rules | **PASS** — plain data, cross-process determinism, eslint, prettier, layer directions all clean |

---

## 8. MUST-FIX LIST FOR GATE PASS

Ordered so that each item is independently landable. Items marked **[PD]** were pre-declared by
the author and were already bound for the fix wave; they are listed here because a must-fix list
that omitted them would misstate what the tree needs, not because their provenance is in doubt.

1. **CAPITAL-1 [PD]** — implement AD-60.1's sixth epsilon family in `report.ts`/`compare.ts`; pin
   the measured rubato shortfall inside the new family and outside `step`.
2. **CAPITAL-2** — sort the label list in `exhaustiveMedoids`' tie key; audit
   `buildAndSwapMedoids`' tie clauses in the same pass; add a tie-rich permutation test asserting
   `medoids` and `clusters`.
3. **CAPITAL-3** — relative-epsilon tie-breaks in `signOf` and `seriationOrder`; then either
   canonicalise degenerate eigenspaces or narrow the stated P-C6 guarantee for `embedding` and
   say so in the data.
4. **MAJOR-1** — add `'scape'` to the `Omit`; decide and document the same question for `weights`
   and `plausibleRange` on the diff surface.
5. **MAJOR-2** — drop the `Math.abs` in `explainedVariance`.
6. **MAJOR-3** — fix `chooseCount` **and** add the pruning guard to `walk`, together.
7. **MAJOR-4 [PD]** — write AD-60.3's synthetic ornamentation pin. The author's suggested closure
   shape is the right one and cheaper than mine: a two-performance synthetic, part-local map
   against global, asserting `replayResidual === 0` and `directDistance === d_k`.
8. **MAJOR-6** — route `w4Family.test.ts` through `adversarialMembers()`.
9. **MAJOR-7, MAJOR-8** — negative controls for the PAM medoid tie rule and for
   `stateFromFlags`' co-dated preference.
10. **MAJOR-5, MAJOR-9, MAJOR-10** — the diff's notes, the corpus's note filter, and
    `embeddingAxes` at `N ≤ 1`.

MINORs 1–4 (the DESIGN/code text divergences, two of them pre-declared) should land in the same
pass as CAPITAL-1, since they are the remainder of the same channel fault and the tree should
stop disagreeing with itself about what was ruled. MINOR-1's §9.2 amendment and MINOR-3's orphan
comment are both one-line DESIGN edits and both belong to delegations the conductor executed or
retained; they need no worker and should not wait for one.

---

## 9. METHOD AND REPRODUCIBILITY

All probes ran against disposable `rsync` copies of the worktree under the session scratchpad
with `node_modules` symlinked; the worktree was never modified and `git status` is clean. Probe
files: `probe-editpath.test.ts` (AD-5, replay bookkeeping, moves monotonicity, the counterexample
arithmetic, the ignored options, the epsilon families), `probe-two.test.ts` (the mirror with
measures, plain data, `dCurve`/`d_k`, free ops), `probe-three.test.ts` and `probe-four.test.ts`
(PAM and embedding under permutation, with a matrix control), `probe-eps.test.ts` (the shortfall
against the stamped epsilon), plus the source patch that forces articulation localization on.

Negative-control injections: 24, each restored and the sources verified byte-identical to the
shipped state afterwards. Every injection that produced no failure is reported above as a
vacuity finding rather than omitted.

One honest note on this verifier's own process: probe P5's first form asserted that the reverse
report's ops sit at the same array positions as the forward's. They do not — the mirror re-sorts
by the recomputed date key, which is exactly what `invertSteps` exists to do. The probe was
wrong, not the engine; it was rewritten to mirror from §6.4 independently and then passed. It is
recorded because a gate that hides its own false positives is applying a standard it does not
meet.

---

# Re-verification (fix wave) — 2026-08-17

**Verdict: RE-GATE BLOCK**, on one MAJOR plus six MINORs. Every original finding re-probed is
genuinely repaired, and the hardest repairs held under far heavier load than the defects that
prompted them. What blocks is a regression introduced by one of the repairs.

## R-0. Scope, and a moving target

The convening brief gave HEAD `63df1d5`; scope was then amended to `eee4b0b..f6fe6a7` with HEAD
`4ae5547`. **The tree moved twice during this audit**, and that changed a finding.

At `63df1d5` this gate measured a MAJOR defect in `silhouette` and `profileOf` — the canonical
summation applied to `partitionCost` and not to its two siblings. Before it could be written up,
`32aa7c4` repaired exactly those sites. Recorded as **confirmed-and-already-repaired**, verified
at scale in R-3 rather than taken on the fixer's word.

Two process notes, both worth more than the finding:

- The fixer reached the same two siblings independently, with the right reason — *"a defect a
  verifier would rediscover is better fixed than queued."*
- **This gate came within one probe re-run of publishing a BLOCK on an already-fixed defect.**
  The re-run happened only because a test-count discrepancy (brief 5428, tree 5430) prompted a
  HEAD check. A gate that verdicts against a brief rather than against the tree can be wrong;
  confirming HEAD and re-running every live finding immediately before the verdict is now part of
  this verifier's method. Every claim in R-1 below was re-measured at `4ae5547`.

AD-76's calibration note — *"it passed here" is the claim this wave has shown to be weakest* — is
adopted and acted on: R-3 replaces this gate's original single-window, n=3 evidence with a sweep
over five corpus sizes and four windows.

`npm run verify` at `4ae5547`, run by this verifier on the unmodified tree: **126 files, 5430
passed, 0 skipped, green.** Tree clean; all probing in disposable copies.

## R-1. What the fix wave got right

Each original witness re-run at `4ae5547`, then attacked with new adversarial cases:

- **CAPITAL-1 (epsilon family) — REPAIRED.** `rubato` is its own family at
  `{relative: 2.718e-4, jnd: 7e-4}`; `step` keeps exact 0 for its remaining members. **The
  fixer's correction of this gate is upheld**: the original report repeated a claim that
  `editDimensions.test.ts` already pinned the 7.51e-5 shortfall; it did not — that walk carries
  scope 0 only. A sweep over all vendored documents × performance pairs × scopes × 11 dimensions
  (160 non-zero triples) puts the corpus-worst rubato shortfall at **7.509637e-5 at
  telemann-grave p0v1 scope 2**, the scope the new focused test walks, inside the stamped epsilon
  with 3.62× headroom. This gate was wrong on that point and the fixer was right.
- **CAPITAL-2 (PAM tie key) — REPAIRED.** The 24-permutation witness yields one medoid set (was
  20/4). Attack: 1600 tie-rich `(matrix, k)` cases, n=4..8, k=1..4, **161,280 `pam` calls** with
  labels anti-correlated to index order → **0** permutation-variant medoids, clusters, `cost` or
  `exhaustive`.
- **CAPITAL-3 (embedding order fields) — REPAIRED for every order-valued output.** Seriation on
  the original witness: 1 distinct order over 20 permutations (was 7). The non-transitive
  comparator was attacked directly — near-tie chains at n = 3..200, 102 corpora, **4,080
  permutations**, plus 2,880 random-blob permutations → 0 order-dependent results, because the
  label seed makes the second sort's input a canonical function of the (label, coordinate)
  multiset. Counterfactually the hazard is real (60/60 distinct orders at n ≥ 25 without the
  seed), so the seed is load-bearing.
- **MAJOR-2 (signed variance) — REPAIRED**; the identity
  `Σ explainedVariance = 1 − 2·negativeEigenvalueMass` holds to **3.331e-16** over 90+ corpora
  whenever all axes are retained.
- **MAJOR-3 (`chooseCount` + pruning) — REPAIRED.** Full legal-domain sweep, **32,896 `(n,k)`
  pairs** against exact BigInt `C(n,k)`: **0** disagreements post-fix against 841 pre-fix. The
  51,054 ms case now runs in **4.6–19 ms**; removing the prune alone restores it to 39,130 ms, so
  both halves are independently necessary exactly as the gate required.
- **MAJOR-4 (ornamentation pin) — WRITTEN** and non-vacuous: all three wrong readings of
  `containsA ? scopeOf(a) : scopeOf(b)` are caught, and a whole-directory run confirms the pin is
  the only guard for the rule.
- **MAJOR-8 (co-dated replay witness) — SOUND.** Reversing `stateFromFlags`' comparator fails
  exactly one test; reversing `editStateAt` instead fails a **disjoint** set of five. Both
  comparators are now independently pinned.
- **MINOR-13's ceiling test (pre-declared, repaired in `f6fe6a7`) — SOUND AND CHEAP.** The claim
  is the `Math.hypot` argument ceiling, and the diagonal 330×330 matrix isolates exactly that:
  the spread happens in the first statement, and an already-diagonal matrix exits the sweep loop
  immediately, so the test exercises the argument count in `O(n²)` instead of `O(n³)` per sweep.
  **Non-vacuity verified by revert**: restoring `Math.hypot(...a)` in place of
  `Math.sqrt(sumOfSquares)` fails the test in **6 ms** with `RangeError: Maximum call stack size
  exceeded`. The claim is pinned, and the 33 s flake is gone.
- **The NUL guard fires.** A raw NUL in `src/comparison/scape.ts` fails `tests/repoHygiene.test.ts`
  with the correct path and 1-indexed line; 347 files walked.
- **Untouched areas did not regress** (spot-checks at `4ae5547`): AD-5's theorem on every vendored
  pair × 11 dimensions × moves on and off; `dCurve` still bit-identical to `compareMpm`'s `d_k`;
  the mirror still symmetric with moves and an MSM.

## R-2. AD-70.2 — `src/comparison/diff.ts`, first review (mandated head)

Read in full as text, 608 lines. **Confirmed this file was never reviewable before:** the blob at
`f74c32a` — the tree this gate audited — carries **two raw NUL bytes, at lines 86 and 90**. Line
90 is `orientationKey`'s separator.

**This gate is implicated and says so.** The original audit read `diff.ts` and quoted line 90, but
the file-reading tool rendered the NUL as nothing, so the separator was transcribed as a space and
the defect was invisible; `git diff` reported `Bin` and `grep` skipped the file silently. "The
verifier read it" and "the file was reviewable" were different facts — precisely AD-70.1's harm.
The same class then appeared twice more in this gate's own work: three NULs copied out of
`clustering.ts` made `W4-VERIFICATION.md` binary until caught, and a fourth was typed into the
shell command that first tried to append this section. Four instances in one wave, from two
agents, is the argument for the standing guard and for widening its perimeter (MINOR-R4).

The review found **no new defect**. The NUL repair is correct and documented in place. Two
fix-wave additions here are right and worth naming: the `plausibility` and `estimate-degradation`
notes (MAJOR-5), scoped by what the diff actually *consumes*; and `invertReport` now **re-sorting**
notes rather than mapping in place — necessary because `sortNotes` orders on `document`, which the
swap changes, and §6.4's claim is byte-identity rather than set equality.

One latent item, checked and **not reachable**: `EditScript.part` and `site.partIndex` are copied
unchanged through the mirror while `parts[]` swaps `numberA`/`numberB`. Measured on the vendored
corpus, `numberA === numberB` for every matched part and the forward/reverse `script.part` sets
are identical. Latent, not a finding.

## R-3. AD-75 — the INDEPENDENT accumulation sweep (mandated head, re-run at scale)

Per AD-75, the fixer's own sweep does not discharge this head, and its "safe by construction"
claim for the remaining accumulations is checked here rather than inherited.

**White-box.** Every accumulation in the four files, classified by this verifier:

| site | accumulates over | order | verdict |
|---|---|---|---|
| `clustering.ts:400` `partitionCost` | items | label | repaired (AD-72.1) |
| `clustering.ts:528` `silhouette` `a` | cluster members | label | repaired at `32aa7c4` |
| `clustering.ts:535` `silhouette` `b` | cluster members | label | repaired at `32aa7c4` |
| `corpus.ts:617` `profileOf.toMeanDistance` | items | label | repaired at `32aa7c4` |
| `corpus.ts:357` normalization rebuild | dimensions, fixed cell | fixed dimension order | order-free — **measured** |
| `corpus.ts:643` `contextOf` rank count | items | integer counting | order-free — **measured** |
| `scape.ts:99,147,151,157,167,171,175` | bins / cells, fixed index | not item-indexed | order-free — **measured** |
| `embedding.ts:154` `sumOfSquares` | matrix entries | index | inside the eigensolver |
| `embedding.ts:161` `off` | matrix entries | index | inside the eigensolver |
| **`embedding.ts:217-219` `doubleCentered`** | **items, per row and grand** | **index** | **a genuine caller-order sum** — *not* safe by construction; it is the root of the coordinate wobble |
| `embedding.ts:270-271` `total` / `negative` | eigenvalues | canonical sorted order | order-free *given* the spectrum |

One correction to the inherited picture: `doubleCentered`'s row and grand means are summed in
item-index order over `n²` entries. That is the same disease as `partitionCost`'s, one layer down,
and calling it "safe by construction" would be wrong — it is safe only in the sense that AD-67.1
*narrowed the guarantee* to cover it. The distinction matters because the contract now carries
what the code does not.

**Black-box, and this is the load-bearing evidence.** Every published `CorpusReport` field
fingerprinted by LABEL and compared bit-exactly between a canonical run and six random
permutations, at **n = 3, 6, 12, 15, 19** across **four windows** (`{0,8}`, `{0,16}`, `{0,31}`,
`{4,20}`), under `normalization: 'corpus'` with `k = 2` — **232,680 field comparisons**. The
n = 12..19 range is deliberate: it is where the fixer measured 1242/2844 silhouette bit-differences
before the repair, and where this gate's earlier single-window n=3 probe had no power.

**Invariant at every n and every window** — `matrices.aggregate`, `matrices.byDimension` (all 11),
`silhouette`, `clusters`, `medoids`, `profiles[].toMeanDistance`, `.toMedoid`, `.toMedoidSigned`,
`seriationOrder`, `dendrogram.merges`, `dendrogram.order`, `silhouetteReliable`,
`normalizationConstants`, `context`, `suspectPairs`, `scape`.

**That is a much stronger confirmation of the two sibling repairs than the single-window probe
that first found them**, and it independently confirms the fixer's order-free claim for the
normalization rebuild, the percentile context and the scape.

**Varying** — five fields, from two distinct roots:

| field | root | disposition |
|---|---|---|
| `embedding.coordinates` | `doubleCentered` + Jacobi | MINOR-R1, inside AD-67.1's narrowed contract |
| `embedding.eigenvalues` | same | same |
| `embedding.explainedVariance` | same | same |
| `embedding.negativeEigenvalueMass` | same | same; at n=6 a *material* value moves (0.04822332545907413 vs 0.0482233254590742) |
| **`notes`** | **the note dedupe** | **MAJOR-R2 — a second, distinct root** |

## R-4. MAJOR-R2 — the corpus note dedupe, three symptoms of one root

**Still live at `4ae5547`.** The fix wave's repair for MAJOR-9 forwards every note kind, which was
right, and then folds `N(N−1)/2` pairwise reports into corpus-level facts using a key that still
contains pair-relative data. Three measured symptoms:

**(a) The note count depends on item order.** From the sweep, at every corpus size:

```
n=3   100 vs 104      n=6   156 vs 152      n=12  316 vs 311
n=15  434 vs 433      n=19  567 vs 563
```

Root: the dedupe key includes `entry.site`, and `ComparisonSiteRef.document` is `'a'`/`'b'` —
*pair*-relative. The same document-level fact therefore lands in one bucket or two depending on
whether that document was the `i` or the `j` of the pairs it appeared in, which is exactly what a
permutation changes. Caught in the act on a three-item corpus:

```
[N] order 120: plausibility|tempo|itemIndex=1|site.document=a|C: @transition.to = 6 outside [10,400]
[N] order 120: plausibility|tempo|itemIndex=1|site.document=b|C: @transition.to = 6 outside [10,400]
```

One fact about one document, emitted twice, distinguished only by a field the surrounding code
already knows is meaningless at corpus level — its own comment says so: *"`document` is
PAIR-relative and meaningless once the pair is gone; `itemIndex` is the corpus-level identity."*
That reasoning was applied to the top-level field and not to the copy inside `site`.

**(b) A note firing on some-but-not-all pairs names only the first and the rest vanish.**

```
[RG3] suspectPairs: ["tel-b|alb","tel-f|alb"]
[RG3] length-mismatch notes: 1 — "tel-b | alb: the two documents may not encode the same piece…"
```

One report contradicts itself: `suspectPairs` names two pairs, `notes` names one. This is
**strictly worse than the pre-fix code** for `length-mismatch` — the one kind the old filter did
forward, one note per pair.

**(c) The emitted message text varies under permutation**, because the `labelA | labelB` prefix is
built from `pairs[0]` in enumeration order: the same note reads `"C | B: §4's cap bound in 4
cells…"` under one order and `"B | C: …"` under another.

*Repair*, one place, `corpus.ts:288-324`: resolve `site` to corpus-level identity before keying
(drop `site.document` from the key, or rewrite it from the already-computed `itemIndex`); sort
`pairs` canonically by label and join **all** of them in the prefix; de-duplicate `pairs` as a set
so a note repeated inside one pairwise report cannot reach `=== totalPairs` and be promoted to an
unprefixed corpus-wide statement. The `''` branch for a genuinely corpus-wide note is right and
should stay.

Severity **MAJOR**: symptom (b) is a wrong answer a consumer would act on, and (a) and (c) are
P-C6 violations on a published field. It is now the **only** permutation-invariance failure
outside AD-67.1's narrowed eigensolver contract.

## R-5. MINORs

- **MINOR-R1 — `embedding.coordinates`, `eigenvalues`, `explainedVariance` and
  `negativeEigenvalueMass` vary under permutation.** Inside AD-67.1's narrowed contract, so not a
  finding against the code — recorded because the *contract* now carries it and because one
  instance is material rather than noise: at n=6, `negativeEigenvalueMass` moves in the 15th
  significant figure of a value of 0.048, not merely around zero. A reader of these four fields
  should be told they are not bit-reproducible under relabelling.
- **MINOR-R2 — `articulation` sits under `step`, whose epsilon is exactly 0, and has a non-zero
  shortfall.** Measured at `4ae5547`: telemann p1v2, `d = 4391`, `scriptCost = 4390.999999999999`,
  shortfall **2.07e-16**. Same *class* as CAPITAL-1, eleven orders of magnitude smaller — float
  noise, not quadrature error. But `step`'s stamped 0 is what a consumer checks the theorem
  against, and 0 admits no noise. Either give every family a documented ulp floor or stop claiming
  exact 0 for quantities exact only in ℝ.
- **MINOR-R3 — `DiffMpmOptions`' type half is weaker than its docstring.** Excess-property
  checking does not reach non-literals, so `diffMpm({ a, ...sharedSettings })` and
  `diffMpm(wideOptionsVariable)` compile clean and silently drop
  `weights`/`scape`/`invariance`/`profile`. §9.2's rationale for `ComparisonSettings` — "so a
  corpus and a pair can be configured identically" — makes the shared-bag spread the *intended*
  usage. *Repair:* declare the four keys as `?: never` rather than omitting them. The runtime half
  is correct and well tested.
- **MINOR-R4 — the NUL guard's perimeter misses the campaign's own records.** It walks `src/` and
  `tests/` only; `comparison/DESIGN.md`, `comparison/LOG.md`, `README.md` and `docs/` are
  unguarded — the documents the campaign is reviewed *from*. This gate's own deliverable
  demonstrated the gap by acquiring three NULs. Secondary: the fixture exclusion tests
  `entry === 'fixtures'`, missing `fixtures-v3` and `fixtures-layers-to-staffs`.
- **MINOR-R5 — the inconsistent label comparator now has three instances.** `labelOrder`
  (`clustering.ts:367-369`, `lower(x, y) ? -1 : 1`), `exhaustiveMedoids`' key sort, and — added by
  the sibling repair — `silhouette`'s member sort (`clustering.ts:521`,
  `(labels[x] ?? '') < (labels[y] ?? '') ? -1 : 1`, which also bypasses `lower()` for a raw `<`).
  Each returns `1` in both directions for equal labels, so a direct caller with duplicate labels
  gets order-dependent results — measured, 2 distinct costs over 200 permutations at n=12. Not
  reachable through `compareMpmCorpus`, which rejects duplicate labels first. *Repair:*
  `lower(x, y) ? -1 : lower(y, x) ? 1 : x - y` at all three. Worth doing with MAJOR-R2: it is the
  unswept residue of the repair that closed CAPITAL-2, and the sibling repair propagated it.
- **MINOR-R6 — the ornamentation tie-break is still unpinned.** A fifth reading of the scope rule
  that leaves both endpoints correct but gives mixed states B's scope passes all 63 tests while
  moving `scriptCost` from 38.667 to 30.667. One line:
  `expect(script.scriptCost).toBeCloseTo(38.666666666666664, 9)`.
- **Performance, recorded not blocking:** the `chooseCount` symmetry fix opens a legal slow region
  it does not budget for — `pam(n=256, k=254)` is exhaustive and takes **45 s** of synchronous
  CPU, where pre-fix it returned instantly with a wrong flag. Tempered by the 32,640 pairwise
  comparisons needed to reach n=256 at all.

## R-6. Gate hygiene — this verifier's own instruments

Three items, recorded rather than quietly fixed.

`probe-two.test.ts`'s P9 is a **vacuous green**: it calls the stale four-argument
`pam(matrix, n, k, labels)` against the current three-argument signature, yielding empty medoid
strings and passing on a set of size 1. The corrected witness in `probe-three.test.ts` is what
actually found CAPITAL-2; the broken copy was left in place. A gate shipping a vacuous probe has
no standing to report vacuity in others.

The near-miss in R-0: a BLOCK was drafted on an already-repaired defect and caught only by a
test-count mismatch.

And the one this head exists to correct: **this gate's original evidence for the summation
siblings was a single window at n=3**, which had no power at the sizes where the defect is dense.
AD-75's ruling that a fixer's own sweep cannot discharge the verification head is right, and so is
AD-76's note that single-window evidence on float-association defects is weak — R-3 is the form
that answer needed, and it is the form this verifier should have used the first time.

## R-7. Verdict

**RE-GATE BLOCK**, on one item:

1. **MAJOR-R2** — the corpus note dedupe keys on pair-relative `site.document` and labels from
   `pairs[0]`, so the note count, the note set and the message text all depend on the order the
   caller listed the items in, and a note firing on some-but-not-all pairs loses every pair but
   the first. `corpus.ts:288-324`.

MINOR-R2 and MINOR-R5 belong in the same pass — each is one line, and each is the unswept residue
of a defect the wave declared closed. MINOR-R1, R3, R4 and R6 can follow.

The wave's substance is sound: every CAPITAL and MAJOR from the original gate is genuinely
repaired, and the sweep in R-3 puts sixteen published corpus fields beyond permutation doubt at
five corpus sizes and four windows — evidence the original gate never produced. The pattern worth
carrying forward is the one AD-72.2 named and this head confirms: repairs land at the site that
was named and not at its siblings — `partitionCost` but not `silhouette`, `rubato` but not
`step`'s remaining members, `pam`'s tie key but not `labelOrder`'s comparator, and the note repair
fixed `document` at the top level while leaving the same field inside `site`. Two of those the
fixer swept unprompted, which is the habit to keep.
