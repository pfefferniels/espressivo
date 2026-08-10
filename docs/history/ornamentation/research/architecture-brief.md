# Architecture brief for the MPM-v3-ornamentation implementer

Distilled from `ARCHITECTURE.md` (all 1661 lines), `docs/history/refactor/CHARTER.md`,
`docs/history/refactor/log.md` ([T7] worker/verifier, [T8] worker/verifier, [T19] worker/verifier, every
`ornament` hit), `PARITY.md`, and the frozen facade in `src/api/`.

**Citation convention.** `ARCHITECTURE.md:NNN` and `docs/history/refactor/log.md:NNN` line numbers are
valid in *both* checkouts — `ARCHITECTURE.md` is byte-identical (1661 lines) and the four log
entries sit at the same offsets (`[T7]` worker 1948, verifier 2202; `[T19]` worker 8996, verifier
9208) in `meico-ts` and `meico-ts-orn`. Source citations (`src/…`) are the **worktree**
(`meico-ts-orn`) tree.

> **PARITY.md is stale in this worktree.** `meico-ts-orn/PARITY.md` is 251 lines (the pre-`TD2`
> version); the authoritative one is the 400-line working-tree copy in
> `/Users/nielspfeffer/Projects/meico-ts/PARITY.md`, which adds §1 entries for `TD2` (the
> `isInNamespace` typos), `P1` (`parseJavaDouble`), `P2` (movement position inheritance), `P4`
> (`RandomNumberProvider` index guards) and §2 (`TD3`, approved-pending). Read the main checkout's
> copy; re-check after the conductor merges `ts-idiomatic` into `main`. All PARITY citations below
> are by **section heading**, not line, for that reason.

**Order of authority** (`ARCHITECTURE.md:25-27`): `CHARTER.md` wins over `ARCHITECTURE.md`
wins over anything else. Where this brief and those disagree, they are right and this brief has a
bug.

---

## §1 Architecture law for new modules

### 1.1 Layering — where an ornamentation module may live, and what it may import

The layer table is `ARCHITECTURE.md:63-95`. **An import may only go to a strictly lower
layer, or sideways within the same directory** (`:59-61`). Relevant layers:

| layer | contents |
|---|---|
| L0 | `src/units.ts` (brands), `src/version.ts`, `src/xml/XomTypes.ts`, `XmlBase.ts`, `AbstractXmlSubtree.ts` |
| L1 | `src/xml/{tree,ids,prettyPrint,errors}.ts`, `src/music/**`, `src/supplementary/**` |
| L2 | `src/midi/**` |
| L3 | `src/msm/**` |
| L4 | `src/mpm/names.ts`, `src/mpm/RenderOptions.ts`, `src/mpm/**` |
| L5 | `src/mei/**` |
| L6 | `src/api/**` (the facade) |
| L7 | `src/index.ts` (barrel) |

- **RULE M1** (`ARCHITECTURE.md:97-102`): `src/mpm/**` **must not import anything from
  `src/mei/**`**. `src/msm/**` must not import from `src/mpm/**` except `import type`.
  `src/midi/**` must not import from `msm/mpm/mei` at all. `import/no-cycle` plus a
  path-restriction rule encode this in lint (T18/T21), so a violation is a build-visible failure,
  not a review finding.
- **Consequence for ornamentation:** new value types, extended defs and a discrete-note renderer
  are all **L4 `src/mpm/**`**. They may import `src/msm/**` (L3) and `src/xml/**` (L1) freely.
  A renderer that needs an MSM helper takes it from `src/msm/`, never the reverse.
- **RULE M3 — new MPM names go in `src/mpm/names.ts`, never on `Mpm`**
  (`ARCHITECTURE.md:157-165`). That file imports nothing and must stay a leaf:
  `src/mpm/names.ts:9-10` states that adding *any* import there re-opens the `Mpm ⇄ maps/styles`
  cycle for all 31 element modules at once. `Mpm` re-exports each name as a static of the same
  name and value (`src/mpm/names.ts:12-13`).
- **RULE M4 — registration stays a registry, never a `switch`**
  (`ARCHITECTURE.md:167-171`). A new typed map registers itself at the bottom of its own
  module (`GenericMap.registerMapFactory(localName, factory)` — pattern at
  `src/mpm/elements/maps/OrnamentationMap.ts:464-466`, machinery at
  `src/mpm/elements/maps/GenericMap.ts:67-71`) **and** must be added to the side-effect barrel
  `src/mpm/elements/maps/index.ts` (see its header, `:1-19`: an unregistered name silently falls
  back to a plain `GenericMap` in `Dated.addMapFromXml`). Converting the registry to a `switch`
  re-creates the removed cycle.
- **`Mpm.isInNamespace` is a membership table, not dispatch** (`docs/history/refactor/log.md:2429-2438`): 54
  empty fall-through cases mirroring `Mpm.java:193-255`. New v3 element names must be added
  there or the library will report them as foreign. Two Java typos in that table
  (`'accentuation '` with a trailing space, `'dynamcisGradient'`) are deliberately accepted
  **in addition to** the correct spellings — PARITY.md §1 "The two Java typos in
  `Mpm.isInNamespace`". Deleting either is a regression; the vocabulary is a deliberate superset.

### 1.2 Null vs undefined (§3)

- **RULE N1** (`ARCHITECTURE.md:588-594`): `null` = "the domain says there is nothing
  here"; `undefined` = "the caller did not supply this". Never interchangeable. Domain absence in
  a **return type or stored state** is `| null`; optional parameters and optional object
  properties are `?:`. Grandfathered exception: `ImprecisionMap.addDistribution*`'s
  `seed?: number | null` keeps both (`:595-597`) — do not "clean up" signatures that already
  accept both.
- **RULE N2** (`:599-601`): `src/xml/**` accessors keep `| null`. `src/xml/tree.ts` exposes
  throwing siblings — `requireFirstChildElement`, `requireAttribute`, … — which throw
  `MissingNodeError` (`:602-613`). Prefer the `require*` form only where you can argue the null is
  unreachable from local code (N2a's gate, `:735-744`).
- **RULE N3** (`:654-683`): `AbstractXmlSubtree.getXml(): Element` is **narrowed** (non-null);
  `getXmlOrNull()` exists for code that must distinguish. **Trap:** `TemporalSpread.getXml()` and
  `DynamicsGradient.getXml()` are typed `Element` but are **lazy generate-and-cache**, not field
  reads (`:679-683`, and RULE C1a at `:1482-1491`) — see §3 below.
- **RULE N4** (`:685-693`): facade **output** types have no `undefined` anywhere; absence is
  `null`. Every facade **input** option is `?:` and never `null`. The check must cover
  `pipeline.ts` too, which declares input objects inline.
- **RULE N6** (`:704-723`): exactly three type-aware lint rules are on — `prefer-readonly`,
  `no-unnecessary-condition`, `no-unnecessary-type-assertion` — scoped to `src/`. New code that
  leaves a dead `?? []` or a redundant `!` will be flagged.

### 1.3 Class vs function (§4)

- **RULE C1** (`:763-777`): a type stays a class if it (a) wraps a live XML subtree whose identity
  is load-bearing, (b) carries mutable state across calls whose ordering is parity-relevant, or
  (c) is used with `instanceof`. **New ornamentation value types that wrap an MPM element are
  classes**, in the `GenericMap`/`GenericStyle`/`AbstractDef` idiom.
- **RULE C1a** (`:1482-1491`): `TemporalSpread` and `DynamicsGradient` must **not** be put under
  `AbstractXmlSubtree`. Their `getXml()` is `if (this.xml === null) return this.generateXML();` —
  moving them under the hierarchy would replace generate-on-demand with a plain field read and
  silently change serialization of *programmatically built* ornaments. New v3 transformer types
  that generate-on-demand inherit this constraint.
- **RULE C3** (`:786-802`): `*Data` holders (incl. `OrnamentData`) stay classes; duplicated
  arithmetic moves into pure modules — `src/mpm/elements/maps/data/bezier.ts` is the precedent.
  Moving float arithmetic across a call boundary carries EQ-RISK (`:804-813`): the gate is a
  bit-identity probe over ~10⁴ pseudo-random triples **including sign of zero**, plus a
  reassociation negative control.
- **RULE C4** (`:815-822`): existing `createXxx` factories keep their names; **no new `createXxx`
  names** — a new factory is `fromXml` / `fromName` / a plain exported function. The deliberate
  `(name: string)` vs `(xml: Element)` overload pairs stay uncollapsed.
- **RULE C5** (`:824-835`): no mass getter/setter conversion. Existing Java-style accessors stay;
  **new code uses `readonly` properties and plain functions**.
- **RULE C6** (`:837-853`): `KeyValue` never appears in a *new* signature and never crosses the
  facade. Use `readonly [K, V]` tuples.

### 1.4 Immutability (§5)

- **RULE I1 — the six mutation boundaries, exhaustive** (`:861-878`). Relevant ones:
  boundary 3, "`Performance.perform` and every `render*ToMap` — they mutate the MSM **clone**,
  never the caller's. `perform` already opens with `msm.clone()`; **that call is the boundary and
  must not be removed or moved**"; boundary 5, `RandomNumberProvider.series`; boundary 6,
  `RenderContext.streamOrdinal` for the duration of one `perform` call. A discrete-note renderer
  that inserts notes into the MSM is legal **only** inside boundary 3.
- **RULE I2** (`:880-885`): outside those six, no exported function may assign to a parameter or
  to a property/element of a parameter. `no-param-reassign` is being driven to 0 in `src/`; note
  `OrnamentationMap.ts:102` is one of the three known offenders — do not add a fourth.
- **RULE I4** (`:892-903`): `readonly` where free — private fields never reassigned,
  `readonly T[]`/`ReadonlyMap` on parameters and return types that are only read, `as const` on
  static tables. **Do not** apply `readonly T[]` to a field mutated in place (`MovementData`'s
  `series`/`ts` are `splice`d/`unshift`ed). "`readonly` goes on the boundary, not on working
  state."
- **RULE I5 — no shared mutable statics** (`:905-940`). There must be **zero** non-`readonly`
  static fields in `src/`; the audit command at `:936-938` must return nothing. A new render knob
  goes on `src/mpm/RenderOptions.ts`, is threaded through `RenderContext`, and is exposed on
  `PerformOptions` — never as a module-level or class-level mutable.
- **RULE I6** (`:953-957`): no allocation-heavy immutability in rendering inner loops. If a spot
  wants persistent structures, write a `DISCOVERED:` note instead.

### 1.5 Errors (§6)

- **RULE E1** (`:965-973`): the interior (L0–L5) keeps Java's **logs-and-returns-null** behaviour,
  bug-for-bug. Do not add throws or guards on a malformed-input path — *except* where PARITY
  records an approved divergence. Only two interior throws exist today and both are narrowly
  argued: `NumberFormatError` (thrown exactly where Java throws) and `OutOfRangeError` (for an
  index no series can have) — PARITY.md §6.
- **CHARTER bug policy amendment** (`docs/history/refactor/CHARTER.md:54-66`, user directive 2026-08-09):
  obvious bugs — Java-inherited or port-born — **get fixed** as documented TD1-discipline
  divergences: (a) prove no fixture exercises the path or that the fix cannot move fixture bytes
  (pipeline byte-probe mandatory), (b) pinning tests for the fixed behaviour, inverting any test
  that pinned the bug, (c) a negative control, (d) a `PARITY.md` "Fixed bugs" entry with Java
  citations. Ambiguous design intent is **preserved**, documented with reasoning.
- **RULE E2** (`:977-991`): the facade validates and throws. `MeicoError` and `MissingNodeError`
  live in `src/xml/errors.ts` and are **re-exported** by `src/api/errors.ts:9-15` — redeclaring a
  second `MeicoError` in the facade would give it a root `instanceof` cannot see from the
  interior. New facade errors extend the *imported* `MeicoError`.
- **RULE E3** (`:993-999`): `extractPerformanceData` on an unperformed MSM throws
  `EmptyDocumentError`. The implementation of that test is `isPerformed` at
  `src/api/pipeline.ts:331-336`.

### 1.6 Units and brands (§7)

The failure this prevents actually happened — a normalized-vs-×127 domain confusion cost a
ground-truth regeneration (`:1025-1029`).

- **RULE U1** (`:1031-1057`): brands are compile-time only, declared in `src/units.ts`
  (`Ticks`, `Milliseconds`, `Normalized`, `Midi7Bit`, `Bpm`). Stripped of comments, `dist/units.js`
  must be exactly `export {};`.
- **RULE U2** (`:1059-1062`): **no runtime converters.** There is no `asTicks(n)`. Construction is
  an `as` cast at parse/construct boundaries.
- **RULE U3** (`:1064-1073`): brands apply to (a) facade **output** types only, and (b) exactly
  three interior declarations (`MovementData.position`/`.transitionTo`,
  `getMovementSegment`'s parameter, `DEFAULT_MOVEMENT_SAMPLE_MAX_STEP`).
- **RULE U3a** (`:1075-1081`): facade **inputs** are never branded — a branded input would force
  every caller to write `0.05 as Normalized`.
- **RULE U4 / U4a** (`:1083-1101`): never brand inside parity-frozen arithmetic; if a brand would
  need more than ~5 `as` casts elsewhere, document the unit in JSDoc instead. Return types of
  sampling methods that hand back their own mutable working array are explicitly exempt.

### 1.7 Style, naming, hygiene

- **Zero new suppressions.** `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` / `eslint-disable`
  are at **0 repo-wide** and every verifier since [T8] counts them (`docs/history/refactor/log.md:9169`,
  `:9355-9356`). T19 explicitly declined to pin its phantom type with a `@ts-expect-error` test
  for this reason (`:9056-9058`).
- **Document the trap at the site.** The house style established by [T7]/[T8] is a class-level
  doc saying what the MPM element *is*, where it sits in the pipeline, and every parity trap
  written down where the code is (`docs/history/refactor/log.md:1965-1969`). `PARITY NOTE` is the marker for a
  known divergence (`:2001-2002`).
- `prettier --check` clean; `log.md`-style journals are pure appends.
- Enums are load-bearing where tests import them: `OrnamentDef`'s `FrameDomain`/`NoteOffShift`
  were left as enums because converting them would change emitted JS (enum IIFE → const object)
  and they are imported by `tests/mpm/elements/OrnamentationMap.test.ts`
  (`docs/history/refactor/log.md:1728-1730`).

---

## §2 Perform pipeline architecture (post-[T19])

### 2.1 The four stages

`Performance.perform` is 15 lines dispatching four named stages
(`src/mpm/elements/Performance.ts:404-418`; the restructure is journaled at
`docs/history/refactor/log.md:9014-9027`).

| stage | member | what it owns |
|---|---|---|
| 1 | `cloneForRender` | `msm.clone()` + rename + `convertPPQ` — `Performance.ts:425-436` |
| 2 | `resolveGlobalMaps` | the twelve global MPM map reads — `Performance.ts:443-461` |
| 3 | `renderGlobal` → `renderGlobalOrnamentation`, `renderGlobalTiming`, `renderGlobalMilliseconds` | `Performance.ts:471-487` |
| 4 | `renderParts` → `renderPart` → `collectPartMaps`, `resolvePartMaps`, `renderPartSymbolic`, `renderPartTiming`, `renderPartMilliseconds` | `Performance.ts:554-768` |

**"The stage order is the algorithm"** (`Performance.ts:381-397`): every pass mutates the
`.perf` / `milliseconds.*` attributes the previous pass produced; Java runs exactly this order
(`Performance.java:385-548`).

### 2.2 The `Timed<T>` phantom type — a new ms-domain pass must adopt it

`declare const timed: unique symbol; type Timed<T> = T & { readonly [timed]: true };`
(`src/mpm/elements/Performance.ts:57-58`). The only producers are `renderPartTiming` /
`renderGlobalTiming`; the only consumers are `renderPartMilliseconds` /
`renderGlobalMilliseconds` (`docs/history/refactor/log.md:9040-9044`). Hoisting a millisecond pass above the
tempo pass is now a **compile error** (`TS2345`, reproduced independently at
`docs/history/refactor/log.md:9046-9054` and `:9300`).

Scope limits, recorded so they are not over-claimed (`docs/history/refactor/log.md:9368-9371`): `Timed` says
nothing about ordering *within* the millisecond stage, and it was deliberately **not** extended
onto the map classes' own entry points (`OrnamentationMap`'s pass 3,
`ArticulationMap.renderArticulationToMap_millisecondModifiers`) because that changes public
signatures unit tests call (`docs/history/refactor/log.md:9060-9066`, and again as an open option at `:9203-9206`).
**A new ms-domain ornamentation pass called from `Performance` must take `Timed<PartRender>`.**

### 2.3 Where ornamentation sits, exactly

**Symbolic passes** (`Performance.ts:648-717`), in order and with the reasons the file states:
dynamics → movement → metrical accentuation → articulation (no-ms-modifiers half) → rubato loop →
**ornamentation last** (`renderOrnamentationToMap(score)`, `Performance.ts:715`).

**Millisecond passes** (`Performance.ts:730-768`): pedal map → channelVolume map → position map →
then, for the score: asynchrony → articulation's ms modifiers → **ornamentation's ms modifiers**
(`Performance.renderMillisecondsModifiersToMap(score, mpm.ornamentation)`, `Performance.ts:768`) →
the four imprecision maps. `channelVolumeMap` and `positionMap` deliberately skip rubato
(`Performance.ts:734-736`).

**Global ornamentation** is inlined at `Performance.ts:489-506` (`renderGlobalOrnamentation`)
because this file only *type*-imports the map classes. It carries a `PARITY NOTE` for the
empty-map divergence (see §3.4).

### 2.4 Render options and RNG plumbing

- `RenderContext` is created **once per `perform` call** and passed by reference; never stored on
  a class, module, or `globalThis` (`Performance.ts:407-409`; spec at
  `ARCHITECTURE.md:478-488`).
- The option path is **four hops** (`ARCHITECTURE.md:497-503`):
  `Msm.exportExpressiveMidi` → `Performance.perform` → `MovementMap.renderMovementToMap(ctx)` /
  `ImprecisionMap.renderImprecisionToMap(…, ctx)`. Hop 1 crosses a layer boundary, so `src/msm/`
  may only `import type { RenderOptions }` — **every default must be resolved inside `src/mpm/`,
  at the point of use** (`:509-515`). Wanting to import a default constant into `Msm.ts` means you
  took a wrong turn.
- **RULE F7 — seed semantics** (`ARCHITECTURE.md:557-559`): a `seed` in the MPM always
  wins; `options.seed` supplies one only where the MPM supplies none; omitting `options.seed` must
  be **bit-identical** to today. Any new random stream derives its sub-seed with the exact
  `deriveSeed(base, ...parts)` at `ARCHITECTURE.md:542-555` (argument order is normative)
  and takes its ordinal from `ctx.streamOrdinal++`, read **once** per call, not per entry
  (`:535-538`).

### 2.5 Two duplicated statics — the single most dangerous fact for an ornamentation implementer

`Performance.renderMillisecondsModifiersToMap` (a `private static`, declared at
`src/mpm/elements/Performance.ts:876`, called at `:768`, with the class comment naming it a
deliberate copy at `:116-118`) is a
**character-identical copy** of `OrnamentationMap.renderMillisecondsModifiersToMap`
(`src/mpm/elements/maps/OrnamentationMap.ts:419`), measured brace-to-brace at **2140 characters**
(`docs/history/refactor/log.md:9182-9186`, verified independently at `:9255-9258`). The same holds for
`Performance.renderTempoToMap` vs `TempoMap`'s (907 characters).

- **The pipeline runs `Performance`'s copy, never `OrnamentationMap`'s**
  (`docs/history/refactor/log.md:2376-2401`). Editing `OrnamentationMap.renderMillisecondsModifiersToMap`
  changes nothing at runtime — a [T7] negative control that mutated it flipped **0** checks
  (`:2265`, explained at `:2386-2388`).
- The duplication was **ruled to stay** by T19, because collapsing it needs a *value* import of
  `OrnamentationMap` into `Performance.ts`, which moves this module's ESM evaluation position on
  the byte-compared rendering path; routed to T21 (`docs/history/refactor/log.md:9175-9192`).
- **Therefore: any change to ms-domain ornamentation rendering must be applied to both copies, or
  applied to `Performance`'s and journaled.** Nothing in the test suite keeps them in step
  (`docs/history/refactor/log.md:2398-2401`, `:2683-2688`).

### 2.6 The evidence lesson for this file

**Byte-identical fixture output is not sufficient evidence for changes to `Performance.ts`.** The
T19 verifier's three negative controls (`docs/history/refactor/log.md:9295-9306`): swapping asynchrony and
imprecision inside `renderGlobalMilliseconds` (NC1) and swapping ornamentation with the rubato loop
in `renderPartSymbolic` (NC3) both **pass the fixture byte probe** and are caught only by a call
tracer. Budget for a tracer (`t19verify/passtrace.mjs` shape: wrap every render entry point on
every map class, plus `Dated.getMap`, and hash the ordered transcript) — the conductor's note at
`docs/history/refactor/log.md:9363-9367` says so explicitly.

---

## §3 Parity traps near ornamentation

### 3.1 `OrnamentData.apply` is the note-generating seam, and it is currently dead

`OrnamentData.apply(chordSequence)` **always returns an empty array**, in Java too (a TODO marks
the spot), which makes the `for (const chord of od.apply(...))` loop in `OrnamentationMap.apply`
**dead by construction** — documented "so nobody 'simplifies' the contract away"
(`docs/history/refactor/log.md:1992-1995`; the code and its comment at
`src/mpm/elements/maps/data/OrnamentData.ts:80-99`, the consuming loop in
`src/mpm/elements/maps/OrnamentationMap.ts:196`).

**This is precisely the extension point a discrete-note renderer occupies**, and filling it turns a
provably-dead loop live. Consequences to plan for: the loop's behaviour has never been exercised by
any fixture or test; whatever it returns will be inserted into the MSM score, which means new
`<note>` elements, new generated ids, and new document order — all three are parity-relevant (§3.6,
§3.7).

### 3.2 The ms-domain ornament renderer is unprotected code

- **Unreachable from `Performance.perform`** (`docs/history/refactor/log.md:2376-2388`), so the suite cannot
  catch a regression in it. `ARCHITECTURE.md:1538-1542` says outright: "treat it as
  unprotected and change nothing in it without a purpose-built probe", and §8.10 rules it
  **keep, and mark** rather than delete, because it is a Java-parity path
  (`ARCHITECTURE.md:1569`).
- The `ornament.milliseconds.duration` branch is reached by **no fixture and no test**
  (`docs/history/refactor/log.md:2689-2693`); a [T8] probe blind-spot analysis found the same
  (`:2597-2599`). One uncovered statement in `Performance.ts` is exactly that renderer's `else`
  branch (`docs/history/refactor/log.md:9162-9165`).
- **Its exact semantics, verified against `OrnamentationMap.java:477-509`**
  (`docs/history/refactor/log.md:2279-2287`, corroborated `:2741-2744`): the `offset` shifts
  `milliseconds.date`; `ornament.milliseconds.duration` sets an **absolute** end as
  `millisecondsDate + offset + duration` (setting the attribute if present, **adding** it if not);
  `ornament.noteoff.shift` is only ever written with the value `"true"`, so its **presence alone**
  is the signal and it shifts the end by the offset while preserving duration; otherwise the end is
  unaltered. Every branch uses the `millisecondsDate` value read **before** the offset write. In
  the **tick** domain that final "otherwise" additionally subtracts the offset from `duration.perf`
  ("duration absorbs the shift"). The single `millisecondsDateEnd` local is the expression Java
  evaluates twice, same operand order, so the sum is bit-identical either way
  (`docs/history/refactor/log.md:2461-2467`).
- Float operation order in this neighbourhood is frozen (`ARCHITECTURE.md:1538-1542`).

### 3.3 Call-order-enforced structures and byte-load-bearing sections

- `ArticulationMap`'s two passes and `OrnamentationMap`'s three passes were, before T19, enforced
  **only** by call order in `perform` (`docs/history/refactor/log.md:2174-2178`). `Timed` now enforces the
  symbolic/ms split at the pipeline level only — **not** at the map level
  (`docs/history/refactor/log.md:9060-9066`).
- `OrnamentationMap.getOrnamentDataOf`'s index clamp is the **one** of eight accessors [T7]
  deliberately left unconverted, so that file's method bodies stay byte-identical
  (`docs/history/refactor/log.md:2139-2141`). Do not "finish" that cleanup as a drive-by.
- `OrnamentDef.createDefaultOrnamentDef` sets the **gradient before the spread**, and that order is
  recorded as load-bearing (`docs/history/refactor/log.md:1606`).
- XomTypes **attribute ordering and namespace handling are load-bearing for byte-identical
  serialization** (`docs/history/refactor/CHARTER.md:79-80`). Precedent for new attributes: the movement fix
  serializes `controller` *after* `protraction` and *before* `xml:id` (PARITY.md §1, "The movement
  fixes, mirrored from the Java fork", item 2). A new v3 attribute must be written in the position
  the Java reference writes it.

### 3.4 Known divergences already sitting in the ornamentation path

- **Global ornamentation guard** (PARITY.md §3, third bullet; site comment at
  `src/mpm/elements/Performance.ts:495-499`; journaled at `docs/history/refactor/log.md:2672-2682`):
  `Performance.renderGlobalOrnamentation` tests only `!== null` where
  `OrnamentationMap.java:215` tests `(map == null) || map.isEmpty()`. An empty global
  `ornamentationMap` therefore reaches the render path here and returns early there. Benign and
  reasoned through — **left as-is deliberately**; do not "fix" it without a decision.
- **`P1` residual — `OrnamentDef`, `TemporalSpread` and `DynamicsGradient` still use
  `parseFloat`** where the five repaired def classes now use `parseJavaDouble`
  (PARITY.md §1, entry "P1 …", closing "Not covered by this entry" paragraph, which names them
  explicitly along with the render-time reads in `ArticulationDef.articulateNote` /
  `TemporalSpread` / `DynamicsGradient`). New numeric attributes on extended defs should use
  `src/supplementary/parseJavaDouble.ts` — but note that doing so to an *existing* attribute is a
  behaviour change on malformed input and owes the TD-discipline evidence set.
- **`TemporalSpread` / `DynamicsGradient` now live in their own modules**
  (`src/mpm/elements/styles/defs/TemporalSpread.ts`, `…/DynamicsGradient.ts`), moved out of
  `OrnamentDef.ts` with **no re-export**, deliberately, so that importing a transformer no longer
  drags `OrnamentDef` in (`docs/history/refactor/log.md:7546-7555`). Do not add a convenience re-export.

### 3.5 RNG sequence identity discipline

- **The number and order of `RandomNumberProvider.getValue` calls is part of the output.**
  `ImprecisionMap` carries a "RANDOMNESS CONTRACT" section saying the test suite **cannot** catch a
  desync, because that map is charter-exempt from byte comparison — so it must be reasoned through
  (`docs/history/refactor/log.md:2003-2005`).
- `P4`'s index guards are **pure preconditions** — they allocate nothing, draw nothing, touch no
  field — proven by a 7,673-value probe hashing identically on guarded and unguarded builds
  (PARITY.md §1, "P4 — `RandomNumberProvider` rejects an index it cannot serve").
- Imprecision output is **never byte-compared** (`docs/history/refactor/CHARTER.md:72-73`, PARITY.md §5) and is
  nondeterministic *even with a fixed seed*, because colliding `milliseconds.date` values are
  re-rolled through an unseeded `Math.random()` (`ImprecisionMap.java:845,894`). **If ornamentation
  ever draws random values, it inherits this whole problem** — seed it through `RenderContext`
  per RULE F7, and expect its fixtures to need structural rather than byte comparison
  (`ARCHITECTURE.md:561-571`).

### 3.6 Generated ids and document order

Generated `meico_<uuid>` identifiers differ per run by construction; the equivalence suites
canonicalize them **by first-occurrence order**, which is stronger than deleting them because it
keeps `goto` → `marker` wiring verifiable. **"Keep ID-generation call order stable, or the tests
will say so"** (PARITY.md §5; `docs/history/refactor/CHARTER.md:74-75`). A note-generating renderer mints ids —
its insertion order is therefore test-visible.

### 3.7 Ground truth, and the only two ways to change bytes

- **Nothing under `tests/integration/fixtures/**` may be modified, deleted, or added to**
  (`docs/history/refactor/CHARTER.md:15-17`). If a fixture looks wrong: STOP and write a `BLOCKED` entry.
- The pipeline byte-probe transcript hash is
  `169e964bd492bc6a256cea4cea9cfab748c0502da289bc4be03892ae7b726c1e` (PARITY.md, "The evidence
  standard every 'fixed' entry below meets"; reproduced at `docs/history/refactor/log.md:9103-9104` and
  `:9431-9433`). **A fix that moves it is not shipped** — it goes to the pending section instead.
- The only sanctioned route for a change that *does* move bytes is the `T20b`/`TD3` pattern: patch
  the Java fork, regenerate the affected ground truth from it, then apply the change here — three
  steps that land together as their own gated item (PARITY.md §2, "What happens next").
  `TD3` (the `AccentuationPatternDef` segment-end bug) is the live worked example, and its warning
  generalizes: **a green `npm run verify` is not evidence a byte-moving fix is safe**, because
  `all-maps-equivalence.test.ts` compares numeric attributes with a tolerance of 0.01.

### 3.8 Behaviours that read as bugs and are not

`docs/history/refactor/CHARTER.md:68-80` and PARITY.md §4/§6. Nearest to ornamentation: the last movement in a
`movementMap` is not rendered by design; `ArticulationData`'s duration modifiers **overwrite rather
than compose** (preserved on design-intent grounds, pinned by a test asserting 130); the library
**logs to the console** during conversion and rendering, which is Java's logs-and-returns-null
policy reproduced deliberately.

---

## §4 Facade shape and additive extension points

### 4.1 Current shape

Four files, ~770 lines: `src/api/types.ts` (153), `src/api/pipeline.ts` (558), `src/api/errors.ts`
(40), `src/api/index.ts` (18, a pure re-export barrel).

**Public data types** (`src/api/types.ts`): `XmlText` (`:31`), `ConvertOptions` (`:33-51`),
`MovementDocuments` (`:54-61`), `PerformanceInfo` (`:63-68`), `PerformOptions` (`:70-90`),
`MidiOptions` (`:92-95`), `PerformedNote` (`:97-112`), `ControlChangeKind` (`:114`),
`ControlChangePoint` (`:116-121`), `ControlChangeStream` (`:123-131`), `PerformedPart`
(`:133-141`), `PerformanceData` (`:149-153`).

**Public functions** (`src/api/pipeline.ts`): `convertMeiToMsmMpm` (`:367`), `listPerformances`
(`:414`), `performMsm` (`:435`), `extractPerformanceData` (`:456`), `performMsmToData` (`:470`),
`renderMidi` (`:489`), `renderExpressiveMidi` (`:524`); plus `VERSION`.

**Public errors** (`src/api/errors.ts`): `MeicoError`, `MissingNodeError` (re-exported from
`src/xml/errors.ts`, `:15`), `ParseError` (`:23`), `EmptyDocumentError` (`:30`),
`PerformanceNotFoundError` (`:33`), `InvalidOptionError` (`:40`).

**The facade is FROZEN, and the freeze is measured at the emitted level**: T19 and T20 both report
`dist/api/**` byte-identical **including every `.d.ts`** as a standing gate
(`docs/history/refactor/log.md:9114-9116`, `:9231-9233`, `:9382-9383`). New data may only be exposed
**additively**.

### 4.2 The rules any addition must satisfy

- **RULE F1 — plain data** (`ARCHITECTURE.md:206-220`): permitted types are `string`,
  `number`, `boolean`, `null`, `Uint8Array`, plain object literals, and arrays of those. **No class
  instances, no `Map`/`Set`, no functions, no getters, and no XomTypes type may appear in any
  facade signature, not even behind `readonly`.** Three mechanical tests exist and any new field
  must pass them: `structuredClone(r)` equality, JSON round-trip equality (excluding `Uint8Array`
  payloads), and a referential test that two calls with equal inputs are `!==` at every level.
- **RULE F2 / F2a** (`:222-239`): XML crosses as **text**, produced with
  `getRootElement().toXML()` — never `Document.toXML()` (which prefixes an XML declaration).
- **RULE F5** (`:407-411`): named-parameter objects at every multi-document call.
- **RULE F6** (`:413-416`): `KeyValue`, `Msm`, `Mpm`, `Mei`, `Midi`, `Performance` never appear in
  a facade signature.
- **RULE N4** (`:685-693`) + **U3a** (`:1075-1081`): outputs have no `undefined` and carry brands;
  inputs are `?:`, never `null`, never branded.
- **RULE I3** (`:887-890`): never mutate inputs; every return value freshly allocated.

### 4.3 Where ornamentation data naturally attaches

1. **`PerformedNote` — additive readonly fields** (`src/api/types.ts:97-112`, built by `readNote`
   at `src/api/pipeline.ts:232-253`). Adding a field here is the architecture's own precedent:
   **Q6** (`ARCHITECTURE.md:456-462` and `:1654-1661`) proposes adding
   `datePerf`/`durationPerf` and calls it "additive and cheap", with the architect recommending
   it. An ornamentation field (e.g. an ornament id, or a flag marking a generated note) has exactly
   that shape. Constraints: always present, absence spelled `null` (N4); read from an MSM attribute
   in `readNote`; branded only if it carries a unit (U3).
2. **Generated notes need no facade change to become visible.** `noteElements`
   (`src/api/pipeline.ts:224-230`) discovers `<part><dated><score><note>` in document order and
   `readPart` maps every one of them (`:318-328`). A discrete-note renderer that inserts notes into
   the augmented MSM shows up in `PerformedPart.notes` automatically — which is the strongest
   argument for making the renderer write MSM notes rather than invent a parallel representation.
   The corollary is that such notes **must** carry `date`, `duration` and `midi.pitch`, since
   `requiredNumber` (`:199-207`) throws `ParseError` when they are missing or unparseable.
3. **`PerformOptions` — new optional knobs** (`src/api/types.ts:70-90`). Plain `number` /
   `boolean` / string union, `?:`, never `null`, never branded. It must be validated in
   `checkPerformOptions` (`src/api/pipeline.ts:146`) throwing `InvalidOptionError`, mapped into
   `RenderOptions` in `toRenderOptions` (`:163`), and it must have an interior twin in
   `src/mpm/RenderOptions.ts` whose default is resolved **inside `src/mpm/`** (§2.4).
   `movementSampleMaxStep` is the worked precedent, end to end (PARITY.md §1, "D1").
4. **`PerformedPart` — a new stream or list**, alongside `notes` and `controlChanges`
   (`src/api/types.ts:133-141`). Prefer a **new field** over widening `ControlChangeKind`
   (`:114`), which is a closed union that downstream exhaustive switches depend on.
5. **A new error class** in `src/api/errors.ts`, extending the **imported** `MeicoError`
   (`:15-17`).
6. **`src/index.ts`** is the L7 barrel; a new public class needs an explicit named export there
   (`src/index.ts:88-138` for the class surface, `:53-85` for the facade re-export block — note it
   re-exports member by member, deliberately, to avoid a duplicate `MeicoError` star export).

**What the facade must *not* grow:** a second representation of the same notes. §2.3's own note
(`ARCHITECTURE.md:445-447`, echoed at `src/api/types.ts:143-148`) rejects a flat all-notes
list because "a second representation of the same notes would only invite the two to drift". The
same reasoning applies to an ornament-shaped mirror of data already in `notes`.

---

## §5 Testing conventions

- **The gate**: `npm run verify` = `npm run build && npm run typecheck:tests && vitest run`
  (`package.json`), green before every commit, **no exceptions, no `--skip`, no test exclusion**
  (`docs/history/refactor/CHARTER.md:13-14`). Current baseline: 59 files / 2272 tests
  (`docs/history/refactor/log.md:9157`, `:9342`).
- **Layout**: unit tests mirror `src/` paths under `tests/` (`tests/mpm/elements/…`,
  `tests/mpm/elements/styles/defs/…`, `tests/api/…`, `tests/xml/…`, `tests/supplementary/…`).
  Six integration suites live in `tests/integration/`: `all-maps-equivalence`, `cross-validation`,
  `full-xml-equivalence`, `midi-byte-equivalence`, `midi-export`, `performance-equivalence`.
  The facade's own suites are `pipeline` (38), `plain-data` (37), `facade-equivalence` (26) and
  `determinism` (8) (`docs/history/refactor/log.md:9344-9345`).
- **Integration tests may change only mechanically** — imports, renamed API calls. Never weaken
  normalization, assertions, or auto-discovery; any change needs explicit verifier sign-off with
  logged justification (`docs/history/refactor/CHARTER.md:18-21`).
- **Unit tests may be rewritten to fit new APIs, but assertion strength must be preserved** — same
  behaviours checked, not fewer (`docs/history/refactor/CHARTER.md:22-23`). The worked example: T19a had to
  migrate a static-reading test and keep **both** of its assertions
  (`ARCHITECTURE.md:923-928`).
- **Coverage invariant v3** (`docs/history/refactor/CHARTER.md:32-46`): functions **≥ 92.0 %**; uncovered scoped
  statements must not grow beyond phase-start + 25 without per-hunk justification; test-count
  decreases need journaled justification; statements % and branch % are indicators only (branch
  carries ±0.02 RNG run-noise). Latest measured: 970/1049 = 92.4690 %, uncovered scoped statements
  2138 (`docs/history/refactor/log.md:9159-9162`).
- **`vitest.config.ts`'s `include` list is the coverage scope, and a new directory outside it is
  invisible** (`vitest.config.ts:21-38`; the obligation to update it mechanically is
  `ARCHITECTURE.md:1588-1590`). `src/mpm/**/*.ts` and `src/api/**/*.ts` are already in
  scope, so a module under either needs no config change; a genuinely new top-level directory does.
- **The four evidence instruments** (`ARCHITECTURE.md:11-23`): emitted-JS diff;
  JSDoc-pruned token-stream proof (`docs/history/ornamentation/tools/toks2.mjs` in this worktree); pipeline
  byte-probe (`docs/history/ornamentation/tools/probe.mjs`, `probe2.mjs`; each takes a dist dir as `argv[1]`);
  and the **negative control** — "deliberately break the thing you claim is load-bearing and prove
  the gate goes red. **A gate that never fails is not a gate.**"
- **For anything touching `Performance.ts`, add a call tracer** — the byte probe demonstrably
  misses real reorderings (§2.6, `docs/history/refactor/log.md:9295-9306`).
- **Per-test timeouts where non-termination is possible.** `vitest.config.ts` sets a 30 s global
  `testTimeout`; TD1 requires an *explicit* per-test timeout on every case in its family so a
  regression fails the suite instead of hanging it (`ARCHITECTURE.md:1216-1221`).
- **Blind spots are found, not assumed.** Both [T7] and [T8] verifiers shipped controls that
  flipped 0 and then proved *why* (`docs/history/refactor/log.md:2267-2271`, `:2597-2599`,
  `docs/history/refactor/log.md:9323-9338`). A zero-flip control is a claim about your probe until you show
  otherwise.
- **Java repo is read-only** (`docs/history/refactor/CHARTER.md:48`); **use `git rm`, never bare `rm`**
  (`:49-50`); **one work item = one commit** on the campaign branch (`:24-28`).

---

## Quick index of the ten most citable facts

| # | fact | citation |
|---|---|---|
| 1 | `Performance`'s private copy of `renderMillisecondsModifiersToMap` is what actually runs; `OrnamentationMap`'s is dead | `docs/history/refactor/log.md:2376-2401`, `:9175-9192` |
| 2 | `OrnamentData.apply` always returns `[]`; the consuming loop is dead by construction | `docs/history/refactor/log.md:1992-1995`, `src/mpm/elements/maps/data/OrnamentData.ts:80-99` |
| 3 | ms-domain ornament rendering is unreachable and unprotected; change nothing without a purpose-built probe | `ARCHITECTURE.md:1538-1542` |
| 4 | `Timed<T>` makes the symbolic→ms crossing a compile error to violate | `src/mpm/elements/Performance.ts:57-58`, `docs/history/refactor/log.md:9040-9054` |
| 5 | `perform` opens with `msm.clone()`; that call **is** mutation boundary 3 | `ARCHITECTURE.md:869-871` |
| 6 | New render knobs go on `RenderOptions`, never a static; the audit must return nothing | `ARCHITECTURE.md:905-940` |
| 7 | Facade is frozen; additions must be plain data, output-`null`-not-`undefined`, and are gated by `dist/api/**` byte identity | `ARCHITECTURE.md:206-220`, `:685-693`, `docs/history/refactor/log.md:9114-9116` |
| 8 | Fixtures are immutable; byte-moving fixes take the Java-patch → regenerate → apply route | `docs/history/refactor/CHARTER.md:15-17`, PARITY.md §2 |
| 9 | Pipeline transcript hash `169e964b…` must not move | PARITY.md evidence-standard paragraph, `docs/history/refactor/log.md:9103-9104` |
| 10 | Byte-identical fixture output is insufficient evidence for `Performance.ts`; use a tracer | `docs/history/refactor/log.md:9295-9306`, `:9363-9367` |
