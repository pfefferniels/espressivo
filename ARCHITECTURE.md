# meico-ts — Target Architecture (T12)

> ## ⚠ Superseded in part by the functional-core campaign (2026-08-19/20)
>
> **Read this box before applying any RULE below.**
>
> This document is the design ruling of the T12–T21 campaign, whose job was to make an
> idiomatic TypeScript port that is provably equivalent to Java meico. It succeeded, and most
> of what is here still governs. But several of its rules were written to *protect* a port
> under a byte-equivalence gate, and they now forbid the direction the codebase is being taken
> in. Those rules are listed here so that nobody applies one in good faith and undoes current
> work — the same failure mode as a comment that describes what code used to do.
>
> The new direction, decided by the project owner: move the architecture toward a functional
> one with a strong type system — Sean Parent's axes of *no incidental data structures*, *no
> inheritance*, *no raw loops*, and *regular types with no invalid states* — down to the level
> of individual expressions. **The only hard gate is byte-equivalence and the test suite.**
> Public API may break freely.
>
> | rule | status |
> | --- | --- |
> | **C1** — a type stays class-based if it wraps a live XML subtree | **superseded.** The live XOM tree being the domain model is the *root cause* this campaign exists to remove. `DistributionData` has already become a six-armed sum type; the `*Def` and `*Style` hierarchies are next. |
> | **C3** — the `*Data` holders stay classes | **superseded**, and already amended in place at its own site. Seven of the eight had a *dead* XML constructor that was a second, divergent reader of every instruction element; all seven are deleted. |
> | **C5** — no mass `getX()`/`setX()` conversion | **superseded in principle**, but its *reasoning* is still worth reading: (ii) named a real collision hazard, and (iii) correctly observed that a thousand mechanical edits is the worst diff shape for an equivalence review. The conclusion changes; the caution does not. Convert incrementally, per module, gated. |
> | **E1** — the interior keeps Java's logs-and-returns-null behaviour, bug-for-bug | **narrowed.** Parity of *output* still binds absolutely. What no longer binds is the *mechanism*: returning a `Result` instead of logging to the console and returning `null` skips exactly the same elements and produces exactly the same bytes, while keeping the reason as a value. Behaviour-preserving by construction. |
> | **I6** — no allocation-heavy immutability in hot loops | **still binding, and now measurable.** `npm run bench` exists; `scripts/bench-baseline.json` pins it. Do not trade a measured win for elegance. |
> | **N6 / the lint scope** | **extended.** More compiler flags and lint rules are on; see `tsconfig.json`, which documents each one's measured cost and why the two expensive ones are still off. |
>
> Two instruments this document names **do not exist** and should not be looked for: the
> `scratchpad/` pipeline byte-probes and token-stream tools belonged to agent scratchpads and
> were never in the tree. The byte gate *is* the suite — `npm run gate` runs its four suites,
> 121 tests, in about two seconds. `npm run bench` is the performance gate.
>
> **Where the campaign got to**, so the numbers above are read against something:
>
> | | before | after |
> | --- | --- | --- |
> | ESLint findings | 1053 | 356 |
> | `no-non-null-assertion` | 841 | 170 |
> | `noUncheckedIndexedAccess` in `src/` | 885 | 0 — the flag is **on** |
> | indexed `for (let …)` loops | 337 | ~202 |
> | tests | 5480 | 6071 |
>
> Two figures deliberately *not* in that table. `tests/` is at 1047 under
> `noUncheckedIndexedAccess` and opted out in `tsconfig.tests.json`; it is a separate job and
> `scripts/strict-ratchet.mjs` keeps it monotonic. And `console.*` still stands at 167 in
> `src/`, because 73 tests spy on it — retiring it is a `Result` campaign with a real
> test-migration cost, not a sweep.
>
> Everything not named above still applies, in particular the unit and type discipline of §7
> and the parity ledger of §6.3.


Status: **design ruling**, produced by the T12 architect on 2026-08-08 against the tree at
`304e90a` (last green, post-T20b). No code was changed to produce it.

**How to read this.** Every numbered **RULE** is meant to be applied by a fresh worker with
no memory of the conversation that produced it, without judgement calls. Where a rule has a
boundary case, the boundary is stated. Where a rule could change behaviour, it carries an
**EQ-RISK** block naming the drift and the **GATE** — the evidence the applying item must
produce. The four established instruments are:

- **emitted-JS diff** — build both trees, `diff -r dist/`. A zero-line diff proves
  "type-level only". (Trap, inherited: a dist tree built outside the repo needs its own
  `node_modules` symlink; pass `--declarationMap false` alongside `--declaration false` or
  `tsc` trips TS5069 and emits anyway.)
- **token-stream proof** — `scratchpad/t8verify/toks2.mjs` emits a JSDoc-pruned token
  stream; a zero-line token diff survives reformatting and is the right gate for
  comment-heavy diffs.
- **pipeline byte-probe** — fixtures → MSM/MPM/MIDI hashes on both builds
  (`scratchpad/t5verify/probe.mjs`, `t7work/probe.mjs`; each takes a dist dir as argv[1] and
  imports `Mpm` first because of the circular-import hazard).
- **negative control** — deliberately break the thing you claim is load-bearing and prove
  the gate goes red. A gate that never fails is not a gate.

Charter invariants are not restated here; they win over anything below. Where this document
and `CHARTER.md` appear to disagree, the charter is right and this document has a bug —
log it.

---

## 1. Layering and the target module map

### 1.1 The measured starting point

Cross-directory import edges in the tree today (runtime edges; type-only counted
separately):

| edge | runtime | note |
|---|---|---|
| `mpm → mei` | **33** | **all 33 are `import { Helper } from '.../mei/Helper.js'`** — verified: exactly 33 files under `src/mpm/` import that module and there is no other `mpm → mei` import |
| `mei → mpm` | 22 | legitimate: the converter builds MPM output |
| `mei → msm` | 2 | legitimate |
| `mpm → msm` | 1 | `Mpm extends AbstractMsm` |
| `msm → mpm` | 0 | 1 **type-only** (`Performance` in `Msm.exportExpressiveMidi`) |
| `msm → midi` | 3 | `Msm.exportMidi` builds a `Midi` |
| `mei → (root)` | 1 | `Meico.version`, and it is serialization-visible — see RULE M6 |

So there is exactly **one** package-level cycle, `mei ⇄ mpm`, and **one** module-level cycle,
`Mpm ⇄ GenericStyle`/`maps/*`. Both have a single cause each, and both causes are removable
without touching any rendering code:

- the package cycle exists **only** because `Helper` — a static-utility class in the MEI
  layer — is where the XML navigation primitives live;
- the module cycle exists **only** because `Mpm.ts` eagerly imports every map module (to run
  their `GenericMap.registerMapFactory(...)` side effects) while every map and style module
  imports `Mpm` back for the ~20 name constants (`Mpm.TEMPO_MAP`, `Mpm.MPM_NAMESPACE`, …).

### 1.2 Target layers

Layers are numbered; **an import may only go to a strictly lower layer, or sideways within
the same directory.** This is the whole dependency rule.

```
L0  src/units.ts              brands; type-only (see RULE U1 for what it
                              actually emits)                             (NEW, T19a)
    src/version.ts            export const VERSION                        (from Meico.ts, T14)
    src/xml/XomTypes.ts       DOM emulation — the mutable interior
    src/xml/XmlBase.ts
    src/xml/AbstractXmlSubtree.ts

L1  src/xml/tree.ts           XML navigation                              (NEW, from Helper)
    src/xml/ids.ts            xml:id / UUID / list-attribute helpers       (NEW, from Helper)
    src/xml/prettyPrint.ts    prettyXml                                    (NEW, from Helper)
    src/music/pitch.ts        pitch + accidental conversions               (NEW, from Helper)
    src/music/duration.ts     duration conversions                         (NEW, from Helper)
    src/music/text.ts         extractAllIntegersFromString, repeatString,
                              getFilenameWithoutExtension                  (NEW, from Helper)
    src/compat/unsupported.ts XSLT / schema / file-write stubs             (NEW, from Helper)
    src/supplementary/KeyValue.ts
    src/supplementary/RandomNumberProvider.ts

L2  src/midi/**               Midi, MidiTypes, events.ts, InstrumentsDictionary

L3  src/msm/**                AbstractMsm, Msm, Goto, dateMap.ts (NEW, from Helper.addToMap)

L4  src/mpm/names.ts          the ~20 string constants                     (NEW, leaf)
    src/mpm/RenderOptions.ts  seed + sampling knobs                        (NEW, T19a)
    src/mpm/**                Mpm, elements/**

L5  src/mei/**                Mei, Mei2MsmMpmConverter (+ dispatch table), mei-local helpers

L6  src/api/**                the public facade                            (NEW, T13)

L7  src/index.ts              barrel: facade + the existing class surface
```

**RULE M1 (dependency direction).** `src/mpm/**` must not import anything from `src/mei/**`.
`src/msm/**` must not import anything from `src/mpm/**` or `src/mei/**` except `import type`.
`src/midi/**` must not import from `src/msm/**`, `src/mpm/**` or `src/mei/**` at all.
`src/xml/**`, `src/music/**`, `src/supplementary/**`, `src/units.ts`, `src/version.ts` import
nothing from any higher layer. T18 adds `eslint-plugin-import`'s `no-restricted-paths` (or
equivalent) encoding exactly this table, plus `import/no-cycle`, so it cannot regress.

**RULE M2 (Helper dissolves).** `src/mei/Helper.ts` ceases to exist as a class. Its **45**
statics (41 public + 4 private) are distributed by the table in §8.2 (T14). The dissolution is
what removes all 33 `mpm → mei` edges.

**The cross-layer surface is five members, not seven, and it is `mpm/`-only.** Re-measured for
this revision by anchoring on the call paren and discarding comment lines — the earlier
figures came from a bare identifier grep that counted `{@link Helper.x}` references and
error-message text as call sites, and were carried into the first draft uncorrected:

| member | call sites outside `src/mei/` | in |
|---|---|---|
| `getAttribute` | 150 | `mpm/` only |
| `getAttributeValue` | 27 | `mpm/` only |
| `getFirstChildElement` | 18 | `mpm/` only |
| `addToListAttribute` | 14 | `mpm/` only |
| `getAllChildElements` | 11 | `mpm/` only |

**220 call sites** across the 33 files. The column counts *call sites*, not matching lines:
`Performance.ts:442` puts two `Helper.getAttributeValue(` calls in one template literal, so a
line-based grep reports 26/219 and a call-based one 27/220. The other four members are
identical either way. **`addUUID` and `getFilenameWithoutExtension` are *not* on
this list**: `Helper.addUUID` has **zero** real call sites anywhere in `src/` (all five
occurrences are JSDoc `{@link}` or prose — `src/msm/Msm.ts:163` defines its own local
`addUUID`, which is what `Msm.ts:1831` calls), and `Helper.getFilenameWithoutExtension`'s six
call sites are all inside `src/mei/` (the `Msm.ts:1136` hit is a comment). `src/msm/` and
`src/midi/` import `Helper` **not at all**.

**RULE M2a (there are THREE navigation implementations, and T14 must not merge them).**
Two files carry their own **module-local** copies of these helpers:

- `src/msm/Msm.ts:25-175` — eight: `getAttribute`, `getAttributeValue`,
  `getFirstChildElement`, `getAllChildElements`, `getNextSiblingElement`, `cloneElement`,
  `getFilenameWithoutExtension`, `addUUID` (at lines 25, 45, 51, 63, 81, 134, 144, 163).
- `src/mpm/Mpm.ts:33,45` — two: `getFirstChildElement`, `getAllChildElements`. *(This one was
  missed by the first draft, which said "TWO implementations".)*

T9 established that the sets have **behaviourally drifted**:
`mei/Helper.getAllChildElements` uses an XPath `child::*[local-name()=…]` where the local
copies use `getChildElements(name)`, and those can disagree on namespaced children;
`cloneElement` differs from Java in both copies, in *different* shapes. `Msm.ts`'s own class
comment warns against deduplicating them on sight.

**Ruling: T14 moves `mei/Helper`'s members and leaves both files' module-locals exactly where
and as they are.** Merging them is not a move — it is a behaviour change on the
byte-compared serialization path, and T9's note is right that it owes a *per-method
behavioural* comparison, not a textual one. A dedicated later item (T16b, §8.1) does that
comparison with a purpose-built probe per method. Until then the duplication stays and stays
commented.

Useful corroboration for RULE N2b, though: the local copies of `getAllChildElements` and
`cloneElement` are **already** typed non-null (`Element[]`, `Element`), which is the shape
N2b narrows `mei/Helper`'s toward.

**RULE M3 (the name constants move to a leaf).** `src/mpm/names.ts` exports the constants
that `Mpm` holds today (`MPM_NAMESPACE`, the six `*_STYLE`, the twelve `*_MAP`). It imports
nothing. `Mpm` re-exports them as static members with the same names and values so no
existing call site breaks; every module under `src/mpm/elements/**` imports `names.js`
instead of `Mpm.js`. This alone breaks the `Mpm ⇄ GenericStyle`/`maps` cycle: after it, the
maps and styles no longer import `Mpm`, and `Mpm`'s side-effect imports of the map modules
become a one-directional edge. The deep-import hazard documented in `GenericStyle.ts` and in
the charter then disappears, and the "import `Mpm` first" workaround in every probe script
becomes unnecessary (leave the probes alone anyway — they still work).

**RULE M4 (SUPERSEDED — the registry is gone; the table lives in its own module).** As
written, this rule said that `GenericMap.registerMapFactory` was the right pattern, that
`Mpm.ts` keeps a bare `import './elements/maps/index.js'` barrel to run the thirteen
registrations, and that a worker must not convert the registry to a `switch` because that
would re-create the `Mpm` ⇄ maps cycle in a different shape.

The last clause was the load-bearing one and it was **true only of a table placed inside
`GenericMap.ts`**: the nine map classes extend `GenericMap`, so a table there imports its own
subclasses. A table in a *separate* module has the edges the other way round —
`maps/map.ts` → the nine → `GenericMap` — and is acyclic, which `import/no-cycle` confirms on
every lint run. That is the same move `styles/style.ts` had already made for the six style
subclasses.

What the registry cost, measured rather than argued: the registrations ran as import side
effects, so `package.json` carried
`"sideEffects": ["./dist/mpm/Mpm.js", "./dist/mpm/elements/maps/*.js"]` to stop a bundler
eliding the bare barrel import. Bundling the facade with rollup's
`treeshake.moduleSideEffects: false` — exactly the licence an absent `sideEffects` field
grants — produced a build in which **all thirteen map names parsed into a plain
`GenericMap`**, with the whole vitest suite green throughout, because vitest does not
tree-shake. `Mei2MsmMpmConverter` value-imports four of the nine map modules, so the same
hazard was already live in a partial form for anyone reaching it without going through
`Mpm.ts`.

So: **the dispatch table is `MAP_SHAPE` in `src/mpm/elements/maps/map.ts`**, a
`Record<MapKind, MapShape>` declared total over the thirteen `<dated>` child names
`mpm/names.ts` publishes; a fourteenth is a compile error there rather than a silent
fallback. `GenericMap` knows nothing of it, and must not — a table in `GenericMap.ts` is
still the cycle this rule was written to forbid. `package.json` has no `sideEffects` field
and must not regain one; the barrel and `Mpm.ts`'s bare import of it are deleted.

**RULE M5 (no directory renames beyond those listed).** `src/supplementary/` keeps its name
(a Java package name, but renaming it rewrites every import in the tree for zero benefit and
churns `vitest.config.ts`'s coverage include list). `src/xml/XomTypes.ts` keeps its name —
see RULE T17-A. The only new directories are `src/music/`, `src/compat/`, `src/api/`.

**RULE M6 (`Meico.version` is output, not metadata).** `Meico.ts` becomes
`src/version.ts` with `export const VERSION = '0.11.2';`. The string is
**serialization-visible** — `Mei2MsmMpmConverter.ts:646,653` writes it into MPM metadata —
so it must **not** be synced to `package.json`'s `version` (currently `0.8.8`) by T14, T22,
or anyone else. Changing it changes fixture bytes. `index.ts` keeps exporting a `Meico`
object with a `version` property for source compatibility.

> **EQ-RISK (M2, M3).** Moving a module changes module *evaluation order*, and this tree has
> a live import cycle whose failure mode is order-dependent. A split that looks like a pure
> move can relocate an initialization-order failure rather than remove it.
> **GATE:** T14 and T18 each need (a) an emitted-JS classification showing every moved
> function body is byte-identical modulo its module wrapper, (b) a full pipeline byte-probe
> on both trees, and (c) a **negative control** for the cycle claim specifically: after T18,
> deep-importing `GenericStyle.js` first in a fresh process must *succeed*; before T18 it
> throws. Prove both directions, in a script, in the scratchpad.

---

## 2. The public facade (T13)

### 2.1 Shape and hard constraints

The facade lives in `src/api/` (`types.ts`, `errors.ts`, `pipeline.ts`, `index.ts`) and is
**additive**: every existing entry point keeps working, `index.ts` keeps its current exports
and gains the facade.

**RULE F1 (plain data, and how it is proven).** Every facade input and output is a value that
survives `structuredClone` and `postMessage` unchanged. The permitted types are: `string`,
`number`, `boolean`, `null`, `Uint8Array`, plain object literals, and arrays of those. No
class instances, no `Map`/`Set`, no functions, no getters, and — the charter's explicit
prohibition — **no XomTypes type (`Element`, `Attribute`, `Document`, `Nodes`, `Elements`,
`Text`, `Builder`) may appear in any facade signature**, not even behind `readonly`.

`Uint8Array` is technically a class instance, so read "no class instances" as "no class
instances **other than** the `Uint8Array` binary payloads that RULE F3 sanctions" — F3 gives
the reasoning, and the structured-clone algorithm handles typed arrays natively, which is the
property this rule is actually about.

T13 ships three mechanical tests over a representative result:
`expect(structuredClone(r)).toEqual(r)`,
`expect(JSON.parse(JSON.stringify(r))).toEqual(r)` (for every type except the `Uint8Array`
payloads), and a referential test: two calls with equal inputs return values that are `!==`
at every level, so React-style `useMemo`/`===` memoization behaves.

**RULE F2 (XML crosses the boundary as text).** MEI, MSM and MPM documents enter and leave
the facade as XML **strings**. This is not a compromise, it is the design: a string is plain
data by construction, it makes F1 free, it makes RULE I3 (never mutate inputs) free, and it
keeps the XML interior genuinely interior. The cost — a parse per stage — is paid only by
callers who chain stages themselves; the combined functions (`performMsmToData`,
`renderExpressiveMidi`) parse once.

**RULE F2a (which serializer — "XML strings" is not a specification).** Every facade function
that returns document text produces it with **`getRootElement().toXML()`**, never
`Document.toXML()` and never `XmlBase.toXML()`. The difference is observable and it matters:
`Document.toXML()` prefixes exactly `<?xml version="1.0" encoding="UTF-8"?>\n`
(`XomTypes.ts:27`) and `XmlBase.toXML()` delegates to it (`XmlBase.ts:76-78`), whereas the
equivalence suite compares `augmented.getRootElement()!.toXML()`
(`tests/integration/full-xml-equivalence.test.ts:223,291,335,355`) — and the Java-generated
fixtures open with `<?xml version="1.0"?>`, which is a *third* spelling. Choosing the
declaration-free form means facade output is the exact byte sequence the ground-truth
comparison already validates. Facade *inputs* accept either form, since the parser tolerates
a missing declaration.

> **RULE F2 is empirically de-risked** — this was measured during T12 review rather than
> assumed. Across all 16 MEI fixtures, `convert → serialize → re-parse → perform` is
> byte-identical (after UUID canonicalization) to `convert → perform` on the in-memory
> objects: **0 divergences**. A separate probe showed parse→serialize reaches a fixed point at
> n=1, and that `perform()` does not mutate its input MSM (confirming RULE I1 boundary 3 and
> RULE I3a empirically, not just by reading `msm.clone()`). T13 must still **re-run** this as
> its own gate — see §8.4 — because it is the assumption the whole boundary design rests on.

**RULE F3 (`Uint8Array` is an approved facade type for binary payloads).** MIDI files are
bytes; there is no better plain representation. `Uint8Array` is structured-clone-safe and
transferable, so it satisfies F1's two concrete tests. It is *not* cleanly
`JSON.stringify`-able; the facade documents that a caller needing JSON should base64-encode,
and F1's JSON test excludes the byte fields.

**RULE F4 (no file I/O, no process access).** Nothing under `src/api/` imports `fs`, `path`,
`process`, or calls `require`. No facade function takes or returns a file path. (The `file`
fields the interior classes carry — `Mei.getFile()`, `Msm.setFile()` — stay interior; note
that they *are* serialization-visible via the MPM `RelatedResource`, so an optional
`sourceName` option exists on the convert call to reproduce that behaviour, see §2.2.)

### 2.2 Signatures

```ts
// ---------- src/api/types.ts ----------

/** MEI/MSM/MPM XML source text. */
export type XmlText = string;

export interface ConvertOptions {
  /** Tick grid floor; raised automatically if the source needs finer resolution. Default 720. */
  readonly ppq?: number;
  /** Keep MIDI channel 10 free when assigning channels to parts. Default true. */
  readonly dontUseChannel10?: boolean;
  /** Convert as written, skipping `expansion` resolution. Default false. */
  readonly ignoreExpansions?: boolean;
  /** Strip the conversion's working attributes from the MSM. Default true. */
  readonly cleanup?: boolean;
  /**
   * Base name written into the MPM metadata's related-resource entry, mirroring what the
   * class API derives from a file path. Omit for no related-resource entry.
   */
  readonly sourceName?: string;
}

/** One `mdiv` of the source: the score and the performance instructions for it. */
export interface MovementDocuments {
  readonly index: number;
  readonly title: string;
  readonly msm: XmlText;
  readonly mpm: XmlText;
}

export interface PerformanceInfo {
  readonly index: number;
  readonly name: string;
  readonly ppq: number;
}

export interface PerformOptions {
  /** Which performance in the MPM. Name or 0-based index; default: index 0. */
  readonly performance?: string | number;
  /**
   * Base seed for imprecision distributions that carry no `seed` attribute of their own.
   * Omit for today's behaviour (each distribution seeded from `Math.random()`).
   * A per-distribution `seed` in the MPM always wins over this.
   */
  readonly seed?: number;
  /**
   * Max step, in the normalized 0..1 position domain, between sampled movement points.
   * Default 0.1. Larger values emit fewer control-change events for a long ramp.
   */
  readonly movementSampleMaxStep?: number;
}

export interface MidiOptions {
  /** Synthesise a program change per part from its name. Default true. */
  readonly generateProgramChanges?: boolean;
}

export interface PerformedNote {
  /** The note's `xml:id`, or null if it has none. */
  readonly id: string | null;
  readonly pitch: number;                 // Midi7Bit
  readonly date: number;                  // Ticks, symbolic
  readonly duration: number;              // Ticks, symbolic
  readonly velocity: number;              // Midi7Bit
  readonly milliseconds: {
    readonly date: number;                // MSM `milliseconds.date`
    readonly end: number;                 // MSM `milliseconds.date.end`
  };
}

export type ControlChangeKind = 'channelVolume' | 'position';

export interface ControlChangePoint {
  readonly date: number;                  // Ticks, symbolic
  readonly milliseconds: number;
  readonly value: number;                 // Midi7Bit
}

export interface ControlChangeStream {
  /** `channelVolume` carries sub-note dynamics; `position` carries movement (pedalling). */
  readonly kind: ControlChangeKind;
  /** `sustain` | `soft` | any other MPM controller name; null for channelVolume. */
  readonly controller: string | null;
  /** The MIDI controller number the renderer would use: 7, 64, 67, or 0 for unrecognised. */
  readonly ccNumber: number;
  readonly points: readonly ControlChangePoint[];
}

export interface PerformedPart {
  readonly index: number;
  readonly name: string | null;
  readonly midiChannel: number | null;
  readonly midiPort: number | null;
  readonly notes: readonly PerformedNote[];
  readonly controlChanges: readonly ControlChangeStream[];
}

export interface PerformanceData {
  readonly title: string;
  readonly ppq: number;
  readonly parts: readonly PerformedPart[];
}

// ---------- src/api/pipeline.ts ----------

/** MEI ⇒ one MSM + MPM pair per `mdiv`, index-aligned. */
export function convertMeiToMsmMpm(
  mei: XmlText,
  options?: ConvertOptions,
): readonly MovementDocuments[];

/** The performances an MPM offers, so a caller can pick one by name. */
export function listPerformances(mpm: XmlText): readonly PerformanceInfo[];

/** Apply an MPM performance to an MSM. Returns the augmented (performed) MSM as text. */
export function performMsm(
  input: { readonly msm: XmlText; readonly mpm: XmlText },
  options?: PerformOptions,
): XmlText;

/** Read the performance data out of an already-augmented MSM. */
export function extractPerformanceData(augmentedMsm: XmlText): PerformanceData;

/** The batch path: MSM+MPM in, plain per-note data out. One parse, no file I/O. */
export function performMsmToData(
  input: { readonly msm: XmlText; readonly mpm: XmlText },
  options?: PerformOptions,
): PerformanceData;

/** The score as written: symbolic timing, one tempo event. */
export function renderMidi(
  input: { readonly msm: XmlText },
  options?: MidiOptions & { readonly bpm?: number },
): Uint8Array;

/** The score as performed: millisecond timing, dynamics, articulation, CC streams. */
export function renderExpressiveMidi(
  input: { readonly msm: XmlText; readonly mpm?: XmlText },
  options?: PerformOptions & MidiOptions,
): Uint8Array;

export const VERSION: string;
```

**RULE F5 (named-parameter objects at every multi-document call).** `renderExpressiveMidi(
{ msm, mpm })`, not `renderExpressiveMidi(msm, mpm)`. Two XML strings are
interchangeable to the type system; the object keys are what make swapping them impossible.
Zero runtime cost. This is deliberately used *instead of* branding the XML strings, which
would force casts on every caller that reads a file.

**RULE F6 (`KeyValue` never crosses the facade).** `convertMeiToMsmMpm` returns
`readonly MovementDocuments[]` — the index-aligned `KeyValue<Msm[], Mpm[]>` dies at the
boundary. Nor do `Msm`, `Mpm`, `Mei`, `Midi`, `Performance` instances appear in facade
signatures.

> **On the recorded contract's wording.** state.json's T13 entry says the batch path takes
> "MSM+MPM-as-objects/JSON". This design takes them as **text** (RULE F2), which is a
> deliberate reading of that phrase, not an oversight: the requirement it encodes is
> *in-memory, no file I/O* — which F4 satisfies — and text is the only representation that
> makes RULE F1 free. T13's verifier will check the facade against state.json, so this
> sentence is here to be cited rather than re-litigated. If the consumer genuinely needs a
> parsed-object input, the additive answer is a future `performParsedMsmToData` overload, not
> a change to the boundary type.

### 2.3 Field mapping for `extractPerformanceData`

Read from the augmented MSM, which is the same document the equivalence fixtures compare, so
every field below is already proven against Java:

| facade field | MSM source |
|---|---|
| `parts[].name` / `.midiChannel` / `.midiPort` | `<part name= number= midi.channel= midi.port=>` |
| `notes[].id` | `<note xml:id=>` |
| `notes[].pitch` | `<note midi.pitch=>` |
| `notes[].date` / `.duration` | `<note date= duration=>` — **symbolic** ticks, not performed; see the `duration.perf` note below |
| `notes[].velocity` | `<note velocity=>` |
| `notes[].milliseconds.date` / `.end` | `<note milliseconds.date= milliseconds.date.end=>` |
| `controlChanges` kind `channelVolume` | `<dated><channelVolumeMap><volume date= value= milliseconds.date=>` — this is where **sub-note dynamics** land; `ccNumber` 7 |
| `controlChanges` kind `position` | `<dated><positionMap><position date= value= controller= milliseconds.date=>` — this is where **movement** lands; `ccNumber` from `controller`: `sustain` → 64, `soft` → 67, anything else (including absent) → 0, mirroring `Msm.ts:1432-1441` |

Notes are read from `<part><dated><score>`; a note missing `milliseconds.date` or
`velocity` means the MSM was not performed — see RULE E3.

There is deliberately **no** flat all-notes list: `data.parts.flatMap(p => p.notes)` is one
line and adding a second representation invites the two to drift.

> **OPEN QUESTION Q1 (conductor → downstream).** The recorded contract names
> `milliseconds.date` and `milliseconds.date.end`. This design nests them as
> `milliseconds: { date, end }`. If the mpmify consumer needs the literal dotted keys, the
> alternative is flat `millisecondsDate` / `millisecondsDateEnd`. **Default if no answer
> arrives: ship the nested form** — it is the closest idiomatic reading of the dotted path
> and T13 should not block on this.

> **OPEN QUESTION Q6 — the performed-tick domain is not exposed.** `date` and `duration`
> above are the **symbolic** MSM values; the augmented MSM also carries `date.perf`,
> `duration.perf` and `date.end.perf`, which are what an articulation actually modifies. As
> specified, a consumer can recover performed *time* (through `milliseconds.*`) but not a
> performed *tick* ratio. Adding `datePerf` / `durationPerf` to `PerformedNote` is additive
> and cheap. **Architect's recommendation: add them.** If the conductor declines, T13 keeps
> the omission and this note records that it is deliberate rather than overlooked.

### 2.4 Seed plumbing

The seed is not a facade-only concern: `RandomNumberProvider` is already deterministic per
seed, but nothing today can set that seed except a `seed` attribute inside the MPM. The
plumbing (implemented by **T19a**, see §8.1) is:

```ts
// src/mpm/RenderOptions.ts — leaf module, imports nothing
export interface RenderOptions {
  readonly seed?: number;
  readonly movementSampleMaxStep?: number;
}
export const DEFAULT_MOVEMENT_SAMPLE_MAX_STEP = 0.1;

/** Per-render, per-call state. Created in `Performance.perform`; never module-level. */
export interface RenderContext {
  readonly options: RenderOptions;
  /** Monotonic ordinal of imprecision streams within this render. Mutable by design. */
  streamOrdinal: number;
}
```

`Performance.perform(msm, options?)` creates **one local** `RenderContext` and passes it by
reference down. Nothing is stored on a class, a module, or `globalThis`.

**The full call chain — all four hops, not two.** An earlier draft named only the two
`render*ToMap` entry points and so could not actually deliver a seed to the facade's headline
MIDI function. `Performance.perform` has exactly **one** `src/` caller:

Line numbers below are **as implemented**, re-derived from the committed T19a tree
(`f947836`); the first draft's were pre-implementation guesses and matched neither the
baseline nor the work tree.

| # | hop | file:line |
|---|---|---|
| 1 | `Msm.exportExpressiveMidi(performance?, generateProgramChanges?, options?)` → `performance.perform(this, options)` | `src/msm/Msm.ts:1033` (the pass-through; the method signature is a few lines above) |
| 2 | `Performance.perform(msm, options?)` builds the `RenderContext` | `src/mpm/elements/Performance.ts:354` (signature) |
| 3 | → `MovementMap.renderMovementToMap(ctx)` | called at `Performance.ts:553` |
| 4 | → `ImprecisionMap.renderImprecisionToMap(map, shakePolyphonicPart, ctx)` | called at `Performance.ts:457` (global) and `578, 596, 598, 600, 602` (per part) |

Hop 1 is the one that matters and the one that was missing: without it,
`renderExpressiveMidi` — the facade function the downstream consumer actually calls — cannot
honour `seed` or `movementSampleMaxStep` at all, because `Msm.exportExpressiveMidi` is what
invokes `perform`.

Hop 1 crosses a layer boundary: `src/msm/` would need `RenderOptions` from `src/mpm/`, which
RULE M1 permits only as `import type`. That is sufficient **and it constrains the design**:
`Msm.ts` may `import type { RenderOptions }` and pass the object straight through, but it must
never need `DEFAULT_MOVEMENT_SAMPLE_MAX_STEP` or any other runtime value from `src/mpm/`. So
every default must be resolved **inside** `src/mpm/`, at the point of use — never in `Msm.ts`.
A worker who finds themselves wanting to import the constant into `Msm.ts` has taken a wrong
turn.

Inside `ImprecisionMap.renderImprecisionToMap`, the seed decision becomes exactly this, at
`src/mpm/elements/maps/ImprecisionMap.ts:352-354`:

```ts
if (dd.seed !== null) random.setSeed(dd.seed);                        // unchanged, MPM wins
else if (ctx?.options.seed !== undefined)                             // new branch only
  random.setSeed(deriveSeed(ctx.options.seed, ordinal, impIndex));
// else: leave the constructor's Math.random() seed — today's behaviour, untouched
```

**`impIndex` is not a new variable** — it already exists, under that exact name, as the loop
index declared at `ImprecisionMap.ts:285`
(`for (let impIndex = 0; impIndex < this.size(); ++impIndex)`), the per-distribution loop that
constructs `random` and owns the `if (dd.seed !== null)` line at :352. One
`RandomNumberProvider` is constructed per distribution entry, so `impIndex` distinguishes the
distributions *within* one map, and `ordinal` distinguishes the maps *within* one render.
Together they are unique per provider.

**`ordinal`** is `ctx.streamOrdinal++`, read **once** at the top of `renderImprecisionToMap`
(not per distribution), so it counts calls, not entries. It is order-dependent by design: for
identical input and options the call order is fixed, so the derived seeds reproduce, and no
counter outlives the call.

**`deriveSeed` — the exact function, so two workers cannot write two different ones:**

```ts
/** Deterministic sub-seed. Pure; no state. Never returns 0 (Mulberry32 must not be seeded 0). */
function deriveSeed(base: number, ...parts: readonly number[]): number {
  let h = base >>> 0;                      // initial h is the base seed itself, unsigned
  for (const p of parts) {                 // fold left-to-right, in argument order
    h = Math.imul(h ^ (p >>> 0), 0x27d4eb2d) >>> 0;
  }
  return h || 1;                           // 0 -> 1, matching RandomNumberProvider's own guard
}
```

Call it as `deriveSeed(ctx.options.seed, ordinal, impIndex)` — that argument order is
normative. `h` starts as `base >>> 0`; the fold is left-to-right; the result is coerced away
from 0 exactly as `RandomNumberProvider`'s field initializer does (`… || 1`).

**RULE F7 (seed semantics).** A `seed` in the MPM always wins. `options.seed` supplies a seed
only where the MPM supplies none. Omitting `options.seed` must be **bit-identical** to
today.

> **EQ-RISK (F7).** The new parameter changes the arity of `renderImprecisionToMap` and
> `renderMovementToMap`, so the emitted-JS diff will not be empty and cannot be the gate.
> **GATE:** (a) pipeline byte-probe over every *deterministic* fixture, before and after —
> must be identical; (b) the imprecision fixtures are charter-exempt from byte comparison, so
> gate them structurally instead: same element counts, same attribute names, values finite
> and within the distribution's declared limits; (c) a **new** determinism test — same input
> + same `seed` twice ⇒ byte-identical MIDI; same input + different `seed` ⇒ different MIDI;
> same input + no `seed` twice ⇒ different MIDI (proving the default path was not
> accidentally made deterministic); (d) **negative control** — make the derivation apply even
> when `options.seed` is undefined, and prove the **third leg of gate (c)** goes red (the
> no-seed pair becomes byte-identical where it must differ).
>
> **Gate (d) must name gate (c), not gate (a)** — T19a's verifier proved by sabotage that
> naming (a) makes the control vacuous: (a)'s fixture set is by definition the
> imprecision-free one, and both imprecision fixtures carry `seed="42"`, so F7's *first*
> branch fires and the sabotaged `else` is never reached. A control that cannot fail is not a
> control, and this one silently could not.

---

## 3. Null-vs-undefined policy

> **Figures updated 2026-08-20.** This section opened by saying the tree carried **1080**
> `no-non-null-assertion` violations. It carries **170**. The diagnosis below was right and is
> left standing because it is what the cure was built on; only the count has moved.

The port maps Java's implicitly-nullable returns to honest `T | null` types and then asserts
`!` at every call site. That is the symptom. **The cure is narrowing *return types*, never
bulk-deleting `!` and never bulk-adding guards** — and that instruction turned out to be the
load-bearing one. `src/mei` alone went from 532 to zero without a single `!` becoming an `as`:
roughly 290 collapsed into a named path or accessor, 110 were restructured to read once and
branch instead of test-then-assert, 75 became a `require*` call that throws a typed
`MissingNodeError` naming what was missing, and 57 were fixed at the *type* rather than the
call site — `addStyleDef`'s spurious `| null` alone accounted for 15.

Two things that made it mechanical rather than risky, worth knowing before the next 170:

- `src/xml/tree.ts` gained `requireAttributeValue`, whose docstring carries the proof that it
  is **exactly** `element.getAttributeValue(name)!` — this port's `Element.getAttribute`
  already matches on local name, so `attribute()`'s namespaced fallbacks are unreachable when
  the plain lookup misses. That proof is what let ~150 sites convert without a behaviour
  question.
- Java's behaviour on a missing value is the spec. Java NPEs where a reference is unresolved,
  so a `require*` throw is usually the parity-correct answer and a `continue` is not. Where
  Java would *not* throw, converting is a behaviour change and needs a control — and there was
  exactly one such site (`makeTimeSignature`'s `sym` block, reached by either `@sym` or
  `@meter.sym`, where the assertion was already false and harmlessly so).

**RULE N1 (the meaning split, everywhere).** `null` means *"the domain says there is nothing
here"*. `undefined` means *"the caller did not supply this"*. They are never
interchangeable. A function must not return `undefined` for a domain-meaningful absence, and
must not accept `null` to mean "use the default". Optional parameters and optional object
properties use `?:` (i.e. `undefined`); domain absence in a return type or in stored state
uses `| null`.

Grandfathered exception, for parity: the `seed?: number | null` style parameters on
`ImprecisionMap.addDistribution*` keep both, because the serializing code distinguishes them
today. Do not "clean up" a signature that already accepts both.

**RULE N2 (XML layer keeps `null`).** Every accessor in `src/xml/**` that can find nothing
returns `| null`, matching the DOM and matching XomTypes today. Do not migrate this layer to
`undefined`. Two additions:

- **N2a — throwing siblings.** For each of the four navigation primitives that dominate the
  call sites, `src/xml/tree.ts` exports both forms:
  ```ts
  export function firstChildElement(parent: Element, name?: string): Element | null;
  export function requireFirstChildElement(parent: Element, name?: string): Element;
  ```
  and the same pair for `attribute` / `requireAttribute`, `parentElement` /
  `requireParentElement`, `allChildElements` (see N2b). The `require*` form throws
  `MissingNodeError` (§6). A call site that today reads `Helper.getFirstChildElement(...)!`
  becomes `requireFirstChildElement(...)` — **which is a behaviour change** (a `TypeError`
  on property access becomes a typed throw at the call), so see the gate below.
- **N2b — provable narrowing, mechanically decidable.** If a function returns `null` *only*
  from a guard over its own parameters, and the declared parameter types already exclude the
  guarded case, delete the guard and drop `| null` from the return type.

  The known instance, flagged by T10: `Helper.getAllChildElements` is typed `Element[] | null`
  but returns null only from two guards — `if (arg1 === null || arg1 === undefined)` at
  **`Helper.ts:160`** and `if (ofThis == null || name === '')` at **`Helper.ts:166`**. Under
  the new signature `allChildElements(parent: Element, name?: string): Element[]` — always an
  array, empty when nothing matches — a large family of dead guards deletes itself repo-wide.

  **The empty-name caveat, stated rather than left as a contradiction.** This rule's own
  closing sentence says "do not apply it anywhere the guard tests a *value* rather than the
  parameter's nullness" — and `name === ''` is exactly such a value test, which
  `name?: string` does not exclude. The narrowing is nevertheless approved **for this
  function specifically**, on evidence rather than on the rule: all **16** call sites pass
  either a string literal or no name at all, so `name === ''` is unreachable in practice.
  A worker must re-verify that (one grep) before narrowing, and must not generalise the
  override to any other function.

  The 16 sites: **5 in `mei/`** — `Mei2MsmMpmConverter.ts:683,3986,3995` plus two self-calls
  at `Helper.ts:200,226` — and **11 in `mpm/`**: `Header.ts:95`, `Performance.ts:121`,
  `Metadata.ts:143`, `OrnamentationStyle.ts:42`, `MetricalAccentuationStyle.ts:45`,
  `DynamicsStyle.ts:39`, `RubatoStyle.ts:39`, `ArticulationStyle.ts:42`, `TempoStyle.ts:39`,
  `AccentuationPatternDef.ts:42`, `OrnamentDef.ts:374`. Ten of the eleven `mpm/` sites carry a
  `?? []` that the narrowing makes dead. (See RULE M5a in §8.2 for who may delete them.)

  Apply the same test to every other moved function.

> **EQ-RISK (N2b).** Deleting a guard is not the same risk as N2a's and needs its own gate:
> N2a turns a `TypeError` into a *typed* throw, whereas N2b turns "returns null → the
> caller's `if (x)` or `?? []` skips the work → execution continues" into an **unguarded
> `TypeError` inside the function**. That is a strictly worse failure mode than the one N2a
> was gated for, so it gets the same gate, not a weaker one.
> **GATE:** (a) per-site argument that the guarded case cannot occur — from the parameter's
> declared type, or, where the guard tests a value, from an enumeration of every call site as
> above; (b) pipeline byte-probe identical; (c) **negative control** — pass the guarded value
> (a `null` parent, or `''` as the name) at one call site and prove it now throws where it
> previously returned null. Any function whose guarded case cannot be shown unreachable keeps
> its guard and its `| null`.

**RULE N3 (model layer keeps `null`, and narrows one thing).** `src/msm/**` and
`src/mpm/**` keep `| null` in every signature a parity path can produce: factories returning
`null` on parse failure, `getMap`, `getPart`, `getPerformance`. That null *is* the behaviour
(Java logs and returns null; see §6).

The one narrowing, and it is the biggest single lever in the codebase:

```ts
// src/xml/AbstractXmlSubtree.ts
getXml(): Element;                 // was: Element | null
getXmlOrNull(): Element | null;    // new, for code that must distinguish
```

`AbstractXmlSubtree.setXml` stores the reference verbatim and every subclass assigns it
before returning; there is **no `setXml(null)` call anywhere in `src/` or `tests/`**
(verified). This retires the **154** `getXml()!` sites — measured, and the figure the earlier
draft's "~211" got wrong by adding T6's and T7's per-cluster deferral counts, which overlap.
All 154 are under `src/mpm/`; 108 of them are spelled `this.getXml()!` and 46 have another
receiver. (`getXml()` is called 173 times in `src/` in total.) It needs **no test edits**: the
name and arity are unchanged, and the **8** test sites that assert
`expect(map.getXml()).not.toBeNull()` still compile and still pass. Of the ~166 other
`getXml()` uses in `tests/`, the rest are either `getXml()!` — which still compiles, and
`no-unnecessary-type-assertion` is scoped to `src/` by RULE N6 — or `toBe(...)` identity
assertions, and `TemporalSpread`/`DynamicsGradient` sites are outside the narrowing per C1a.

**Not covered by this narrowing, and a trap:** `TemporalSpread.getXml()` and
`DynamicsGradient.getXml()` (`OrnamentDef.ts:173,299`) are already typed `Element` but are
**not plain field reads** — they lazily generate and cache (`if (this.xml === null) return
this.generateXML();`). That is precisely why those two classes sit outside the
`AbstractXmlSubtree` hierarchy. See RULE C1a in §8.6 before touching them.

**RULE N4 (facade output has no `undefined`).** In `src/api/types.ts`, every field of every
*output* type is always present; absence is `null`. Every *input* option is `?:` and is never
`null`. Reason: `JSON.stringify` silently drops `undefined` properties, so an output type
containing `undefined` is not round-trip stable under JSON and fails RULE F1's second test.
This is mechanically checkable, but the check must cover **both** files: grep `src/api/`
(not just `types.ts`) for `?:` and confirm every hit is inside an `*Options` type or an
inline input-object parameter. `pipeline.ts` declares input objects inline — e.g.
`{ readonly msm: XmlText; readonly mpm?: XmlText }` on `renderExpressiveMidi` — so a
`types.ts`-only grep would miss them.

**RULE N5 (`x == null` stays; the lint rule bends).** All 44 `eqeqeq` violations are the
`x == null` idiom and all 44 are in `Helper.ts`. In TypeScript that is the *correct*
idiomatic test for "null or undefined", and it is load-bearing here because the XOM layer
returns `null` on some paths and `undefined` on others. **T14 relaxes the rule to
`['error', 'always', { null: 'ignore' }]` and edits not one comparison.** Any worker who
"fixes" a `== null` to `=== null` has introduced a bug.

**RULE N6 (type-aware linting: three rules, enabled by T21, not before).** `eslint.config.js`
lines 8-13 park this decision on T12 explicitly ("entangled with the null-vs-undefined policy
that item T12 has to settle first"), so it is settled here. Type-aware linting is **not**
enabled today, which means several audits in §8.10 currently reference rules that never run —
and a gate that cannot fail is not a gate.

- **Enable exactly three type-aware rules, no preset**:
  `@typescript-eslint/prefer-readonly` (makes RULE I4 measurable),
  `@typescript-eslint/no-unnecessary-condition` (flags the `?? []` and `if (x)` guards that
  N2b and N3 make dead — the direct safety net for this section's policy), and
  `@typescript-eslint/no-unnecessary-type-assertion` (flags `!` that the narrowing made
  redundant, which is exactly N3's cleanup surface).
- **Scope `projectService: true` to `src/` only.** Turning it on over `tests/` adds a large
  volume of findings in code that is not parity-critical.
- **Timing: T21, after T14 and T16 have applied N2b/N3/I4.** Enabling earlier just inflates
  `lint-debt.md` with findings whose fix is already scheduled.
- **Rejected: `tseslint.configs.recommendedTypeChecked`.** It would add hundreds of findings
  entangled with parity-frozen code, on a lint gate that is deliberately not part of
  `npm run verify` — the config comment's own reasoning, which still holds for the preset even
  though it no longer holds for the three rules above.
- Until T21 enables them, §8.10's `prefer-readonly` and `no-unnecessary-condition` audits are
  **not runnable**; T21 must enable the rules *first* and then audit, in that order.

### Migration ownership

| item | applies |
|---|---|
| **T14** | N2a + N2b to the functions it moves out of `Helper`; N5's config change |
| **T16** | N3's `getXml()` narrowing and the `!` deletions it enables across `mpm/elements/**`; N1 to every signature it rewrites |
| **T13** | N4 |
| **T15** | N1/N2 opportunistically inside the converter — but never as part of a dispatch-table hunk |
| **T21** | audits: `no-non-null-assertion` count must be strictly below 1080 and journaled *(historical threshold; the count is now 170 — see §3)* |

> **EQ-RISK (N2a).** Replacing `f(...)!` with `requireF(...)` moves the failure from "the
> next property access throws `TypeError`" to "the accessor throws `MissingNodeError`". On
> every path a fixture reaches, neither throws, so output is unchanged — but on an
> unreachable path the *exception type* differs, and T6/T10 both refused this change for
> exactly that reason. It is sanctioned here on one condition:
> **GATE:** for each converted site the worker asserts *why* the null is unreachable
> (parameter nullness, or a preceding assignment in the same function), the pipeline
> byte-probe is identical, and a **negative control** exists: force one `require*` to throw
> and prove a test goes red. Sites where unreachability cannot be argued from the local code
> keep the `!` and get a one-line comment. Do not convert a site to satisfy a lint count.
>
> **EQ-RISK (N3).** Same shape, one order of magnitude larger. The unreachability argument
> here is *global* (no `setXml(null)` exists), so T16 must re-run that check on its own tree
> — `grep -rn "setXml(null)" src tests` must be empty — and enumerate every
> `AbstractXmlSubtree` subclass, showing for each that **no `getXml()` read precedes the
> `setXml` assignment**. Note the exact wording: "assigns before returning" is *not* strong
> enough, because the field initializes to `null` and a `parseData` body could read before it
> assigns. The pattern to confirm is `ImprecisionMap.parseData`'s — `super.parseData(xml)` on
> line 61, first `getXml()` read on line 62, in that order.
> **GATE:** emitted-JS classification (removing a `!` emits nothing, so the *only* legitimate
> emitted change from N3 is deleted `if (x === null)` guards — each must be listed), plus the
> full pipeline byte-probe, plus a negative control: delete one constructor's `setXml` call
> and prove tests go red.

---

## 4. Class-vs-function policy

**RULE C1 (what stays a class).** A type stays class-based if **any** of:

- **(a) it wraps a live XML subtree whose identity is load-bearing** — `XmlBase`,
  `AbstractXmlSubtree`, `AbstractMsm`, `Msm`, `Mpm`, `Mei`, `Performance`, `Part`, `Global`,
  `Header`, `Dated`, `GenericMap` + all subclasses, `GenericStyle` + all subclasses,
  `AbstractDef` + all subclasses, `Metadata`, `Author`, `Comment`, `RelatedResource`, `Goto`,
  and every XomTypes type (`Element`, `Attribute`, `Document`, `Text`, `Nodes`, `Elements`,
  `Builder`, the exception types);
- **(b) it carries mutable state across calls whose ordering is parity-relevant** —
  `RandomNumberProvider` (the memoized `series`), `Mei2MsmMpmConverter` (the cursor),
  `Midi`, `Sequence`, `Track`, `MidiEvent`;
- **(c) `instanceof` is used on it anywhere in `src/` or `tests/`** — constructor-overload
  dispatch (`arg instanceof Document`, `meiOrRoot instanceof Mei`) and message dispatch
  (`msg instanceof ShortMessage`, `instanceof MetaMessage` in the integration tests).

**RULE C2 (what becomes plain functions).** A static-only class with no instance state and no
`instanceof` use becomes a module of exported functions. There are exactly three, and they are
exactly the three remaining `no-extraneous-class` sites: `Helper` (45 statics, 0 instance
members — T14), `EventMaker` (T20), `Meico` (→ `export const VERSION`, T14). **After T20,
`@typescript-eslint/no-extraneous-class` must be 0 and stay 0** — that is the measurable form
of this rule.

**RULE C3 (`*Data` holders stay classes; their arithmetic leaves).** `TempoData`,
`DynamicsData`, `MovementData`, `ArticulationData`, `OrnamentData`, `RubatoData`,
`MetricalAccentuationData`, `DistributionData` stay classes: they parse from XML, they carry
lazily-computed private memos (`MovementData.x1`/`x2`), and their methods hold
parity-critical arithmetic. What changes (T16) is that the *duplicated* arithmetic moves into
one pure module:

> **AMENDED — `DistributionData` is no longer one of them.** The functional-core campaign
> replaced it with `src/mpm/elements/maps/data/distribution.ts`: a six-armed discriminated
> union, one arm per `distribution.*` family, parsed by a free `parseDistribution` returning
> a `Result`. It met none of the three tests this rule states. It carried no memo; its only
> arithmetic was a min/max scan over the measurement list, which is now a free function
> beside the type; and it was the *reason* the rule's parenthetical about parsing from XML
> was worth honouring least — one class covering six families with ten `| null` fields, all
> parsed unconditionally, cost thirty non-null assertions at the single read site. The
> other seven `*Data` classes are untouched by that reasoning, and this rule still governs
> them.

```ts
// src/mpm/elements/maps/data/bezier.ts — pure functions, no classes, no XML
export function innerControlPointsXPositions(curvature: number, protraction: number): readonly [number, number];
export function tForDate(x1: number, x2: number, date: number): number;
export function sampleSegment(...): readonly (readonly [number, number])[];
```

`computeInnerControlPointsXPositions` and `getTForDate` are byte-identical between
`MovementData` and `DynamicsData`; `getSubNoteDynamicsSegment` and `getMovementSegment`
differ only in endpoint handling and the ×127 scale (T7's finding). The classes keep thin
delegating methods so no call site changes.

> **EQ-RISK (C3).** This moves bit-identity-critical floating-point arithmetic across a call
> boundary. Nothing about JS semantics makes that unsafe *in principle* — but expression
> reassociation while moving it is exactly the mistake this project is built to catch.
> **GATE:** the pipeline byte-probe on every fixture, plus a targeted probe that feeds both
> the old and new code the same ~10⁴ pseudo-random `(curvature, protraction, date)` triples
> and requires bit-identical output including sign of zero, plus a **negative control**
> (reassociate one expression, e.g. `a*b + a*c` → `a*(b+c)`, and prove the targeted probe
> goes red). Endpoint handling and the ×127 scale must remain in the *callers*, not be
> parameterized into the shared function, unless the probe proves the parameterized form
> identical.

**RULE C4 (factories).** Existing `createXxx` static factories keep their names (they are
public API). **No new `createXxx` names**: a new factory is `fromXml` / `fromName` / a plain
exported function. The 9 `unified-signatures` pairs of the `string | Element` kind that T6
deliberately did **not** collapse stay uncollapsed — merging `(name: string)` with
`(xml: Element)` erases the API's statement that these are two construction modes, and for
the 7 styles it would make `createXStyle(element, 'id')` typecheck while the implementation
ignores the id. T16 may replace them with two *differently named* functions
(`createXStyle(name, id?)` and `parseXStyle(xml)`) keeping the old overloads as delegates.

**RULE C5 (no mass `getX()`/`setX()` conversion — this is the ruling T4 and lint-debt asked
for).** Java-style accessors **stay** everywhere they exist today. New code — the facade
types, the modules T14/T16 extract — uses `readonly` properties and plain functions.
Rationale, in order of weight: (i) the facade *is* the migration path, so downstream consumers
will read plain data and gain nothing from interior accessor conversion; (ii) T4 measured a
real hazard — `getLowCut()` → `get lowCut()` collides with the private field of the same name
and forces `#`-private fields or a constructor redesign; (iii) it is ~1000 mechanical edits
producing an emitted-JS diff in every file, which is precisely the diff shape the equivalence
gate reviews worst; (iv) it breaks the public API of a package that a downstream project is
about to adopt. The 18 accessors in `RandomNumberProvider` and everything T6–T11 left alone
stay as they are. `setSeed`/`setInitialValue` would have had to stay methods anyway — they
reset `series` as a side effect.

**RULE C6 (`KeyValue` → tuples).** T16 converts every **read-only** `KeyValue` site to a
`readonly [K, V]` tuple. There are exactly **8** mutating sites — the count T4 established and
`KeyValue.ts`'s own class comment repeats. The line numbers below are re-measured for this
revision; the first draft's were stale (its `GenericMap.ts:136` is a `throw`, and its
`RubatoDef.ts:181,189` are `Attribute.setValue`):

| call | sites |
|---|---|
| `setKey` | `GenericMap.ts:191`, `ImprecisionMap.ts:527,564,570`, `RubatoDef.ts:210,218` |
| `setValue` | `RubatoDef.ts:214,219` |

For each, T16 either rewrites it to construct a fresh tuple, or journals why it cannot and
keeps a local mutable pair. `KeyValue` is deleted from `src/` only if all 8 go; either way it
never appears in a *new* signature and never crosses the facade (RULE F6). When grepping:
`.setValue(` has 124 hits in `src/` and all but two are `Attribute.setValue` from XomTypes —
note in particular that `ImprecisionMap.ts:624,625` are `entry.getValue().setValue(...)`,
i.e. `Attribute.setValue` reached *through* a KeyValue, and are not on the list.

---

## 5. Immutability policy

The charter's directive, made operational.

**RULE I1 (the six mutation boundaries — this list is exhaustive).** Mutation of an object
that outlives the current expression is allowed **only** here:

1. **`src/xml/**`** — the XomTypes document tree. Inherently mutable, load-bearing for
   serialization parity. Do **not** force persistent data structures on it.
2. **`Mei2MsmMpmConverter` during one `convert()` call** — its cursor fields, its deferred
   lists, and the MEI tree it rewrites (`resolveCopyofs`, `removeRendElements`,
   `resolveExpansions`). This is why `cleanup` snapshots the document and restores it.
3. **`Performance.perform` and every `render*ToMap`** — they mutate the MSM **clone**, never
   the caller's. `perform` already opens with `msm.clone()`; that call **is** the boundary
   and must not be removed or moved.
4. **`Midi` / `Sequence` / `Track` while a MIDI file is being built.**
5. **`RandomNumberProvider.series`** — memoization of an append-only sequence.
6. **`RenderContext.streamOrdinal` for the duration of one `Performance.perform` call**
   (§2.4). It is mutable by design — a counter passed by reference down the render chain —
   and the first draft's "five boundaries" list omitted the very object it introduced. It
   qualifies under the same reasoning as boundary 3, whose lifetime it shares exactly: created
   at the top of `perform`, unreachable after it returns, never stored on a class or module.

**RULE I2 (outside those six: no argument mutation).** Any exported function outside the
six boundaries that assigns to a parameter, or to a property or element of a parameter, is a
violation. `no-param-reassign` is at **3 warnings in `src/`** — `OrnamentationMap.ts:102`,
`DynamicsData.ts:160`, `MovementData.ts:126` — plus 2 in `tests/integration/`, for the 5
repo-wide total that `lint-debt.md` reports. T21 drives the `src/` three to 0 and promotes the
rule to `error`.

**RULE I3 (facade guarantees).** (a) The facade never mutates its inputs — free, because
inputs are strings (RULE F2). (b) Every facade return value is freshly allocated: two calls
with equal inputs return values that are `!==` at every level (F1's referential test).
(c) Every facade return value survives `structuredClone` unchanged (F1's clone test).

**RULE I4 (`readonly` where it is free — and where it is not).** Apply: `readonly` on private
fields never reassigned after construction; `readonly T[]` / `ReadonlyMap` on **parameters and
return types** that are only read; `as const` on static data tables — `InstrumentsDictionary`
currently has **zero** `as const` and is the main candidate (T20).

On the `prefer-readonly` count: T4's "~17 repo-wide" is **not reproducible today**, because
the rule is type-aware and type-aware linting is not enabled (RULE N6). Any figure measured
now reads 0 for that reason alone, not because the tree is clean. T21 enables the rule first,
then measures, then drives it to 0 — in that order.
**Do not apply** `readonly T[]` to a *field* that is mutated in place — `MovementData`'s
`series`/`ts` are `splice`d and `unshift`ed during sampling, and `GenericMap`'s element lists
are appended to. `readonly` on arrays goes on the boundary, not on working state.

**RULE I5 (no shared mutable statics — resolving `movementSampleMaxStep`).** There is exactly
**one** non-`readonly` static field in all of `src/` (verified): `MovementMap.
movementSampleMaxStep = 0.1`, added by T20b to mirror the Java fork and flagged there as a
charter tension. The resolution:

- **delete the mutable static;**
- add `static readonly DEFAULT_MOVEMENT_SAMPLE_MAX_STEP = 0.1` (a constant, not shared
  mutable state) — or take the constant from `src/mpm/RenderOptions.ts`;
- the knob becomes `RenderOptions.movementSampleMaxStep`, threaded through the
  `RenderContext` of §2.4 into `MovementMap.renderMovementToMap(ctx?)` →
  `generateMovement(data, map, ctx?)` → `getMovementSegment(step)`;
- the mpmify consumer reaches it through `PerformOptions.movementSampleMaxStep`.

This is a **structural** divergence from the Java fork with **zero** behavioural effect: the
default is unchanged and every fixture is generated with it. It is **row D1 of the parity
ledger in §6.3**, including the corollary that anyone regenerating fixtures from Java must
likewise leave the Java static at its default.

**T19a also owns a unit-test migration, and must not simply delete the test.**
`tests/mpm/elements/MovementMap.test.ts:815-827` both *reads* and *writes* the static
(`expect(MovementMap.movementSampleMaxStep).toBe(0.1)` at :816, then assignments at :824 and
:827). Charter invariant 4 requires assertion strength to be preserved, so it migrates to the
`RenderOptions` path with **both** of its assertions intact: the 0.1 default *and* the
sampling-density effect of a non-default value. Dropping either is a test weakening.

Owner: **T19a** (see §8.1). Audit command — the first draft's version false-positives on
`src/msm/Msm.ts:508` (`static override makePart(`, whose parameters wrap to the next line, so
the `(`-filter misses it). Use a field-shaped match instead, which returns exactly the one
real line today:

```sh
grep -rnE "^[[:space:]]*(private |protected |public )?static (readonly )?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[:=]" \
  src --include='*.ts' | grep -v "static readonly"
```

After T19a it must return nothing. T21 re-runs it.

> **EQ-RISK (I5).** Every default-valued render is unchanged by construction, so the risk is
> not in the value but in the threading: an optional parameter added to four functions in the
> rendering path can be dropped on one branch, silently reverting to the default where the
> caller asked for something else.
> **GATE:** pipeline byte-probe identical on all fixtures with no options passed;
> **plus** a positive test that a non-default `movementSampleMaxStep` actually changes the
> event count in the rendered `positionMap` (T20b measured the sensitivity: 0.1 over a 0..1
> range yields 17 `<position>` elements for the `movement` fixture, and feeding it a 0..127
> range yielded 1625 — so this knob is very visible); **plus** a negative control: drop the
> parameter on one call site and prove the positive test goes red.

**RULE I6 (no allocation-heavy immutability in hot loops).** Per the charter: do not convert
rendering inner loops to allocate fresh arrays/objects per iteration. If a spot looks like it
wants persistent structures, write a `DISCOVERED:` note instead of doing it. The known hot
spots are `getMovementSegment`/`getSubNoteDynamicsSegment` (splice-based subdivision),
`GenericMap`'s per-entry scans, and the `query()` round trip in XomTypes (§8.7).

---

## 6. Error-handling policy

### 6.1 Interior (L0–L5): frozen

**RULE E1.** The interior keeps Java's logs-and-returns-null behaviour, bug-for-bug. Do not
add throws, do not add guards, do not "fix" a malformed-input path, on any path a fixture
does not reach — **except where §6.3 records an approved divergence**, which an item may then
implement exactly as §6.3 and §8.0 specify and no further. Parity beats correctness — the
charter says so and three items have already deferred to this ruling.

Two further sanctioned exceptions, each justified by *provable unreachability* rather than by
taste, each with its own gate above: the `require*` accessor family (N2a) and the `getXml()`
narrowing (N3).

### 6.2 Facade (L6): validates and throws

**RULE E2.** `src/api/errors.ts`:

```ts
export class MeicoError extends Error {}
export class ParseError extends MeicoError {}              // not well-formed, or wrong root element
export class EmptyDocumentError extends MeicoError {}      // parsed, but nothing to convert
export class PerformanceNotFoundError extends MeicoError {}// named/indexed performance absent
export class InvalidOptionError extends MeicoError {}      // ppq <= 0, non-finite seed, …
export class MissingNodeError extends MeicoError {}        // thrown by the require* accessors (N2a)
```

The facade converts every interior `null`-meaning-failure into a thrown typed error and
**never returns `null` itself** (consistent with N4). Every error carries the offending
document kind and, where cheap, the element name — never a stack of interior XomTypes
objects.

**RULE E3 (the un-performed MSM).** `extractPerformanceData` on an MSM that was never
performed finds no `milliseconds.date` / `velocity`. The interior falls back to symbolic
values per element and logs (`Msm.readMillisecondsDateFromElement`). The facade must **not**
silently return that: `extractPerformanceData` throws `EmptyDocumentError` (message: "this
MSM carries no performance attributes; call performMsm first") when **no** note in the
document has `milliseconds.date`. When *some* do, it returns what is there and the per-note
`milliseconds` values are whatever the interior produced — do not invent a repair.

### 6.3 The parity ledger

Five divergences from Java are recorded across `log.md` and belong to this policy. **P1, P2
and P4 stay frozen in Phase 3. P3 is APPROVED for repair as TD1. D1 is a structural
divergence with no behavioural effect.** T22 writes all five into a `PARITY.md` / README
section.

| # | status | divergence | where | note |
|---|---|---|---|---|
| P1 | **frozen** | `parseFloat` yields `NaN` where Java's `Double.parseDouble` **throws**, so a malformed `value="abc"` produces a `NaN`-valued def that is *kept*, where Java's factory returns null and the style skips it | every `parseFloat` in the port; found in `TempoDef`, `DynamicsDef`, `RubatoDef`, `AccentuationPatternDef`, all 12 `ArticulationDef` attributes (T6) | codebase-wide, no fixture exercises it, fixing it changes output on malformed input |
| P2 | **frozen** | `getPreviousPosition` yields 0 where Java throws NPE on a `<movement>` with no `transition.to` | `MovementMap` (T7) | same family as P1 |
| P3 | **APPROVED as TD1** (conductor, 2026-08-08, governance authority — no user sign-off) | **`ArticulationData.articulateNote`'s `absoluteDurationChange` branch is a non-terminating loop**, reproduced verbatim from Java | `src/mpm/elements/maps/data/ArticulationData.ts:203-208` (T7) | repaired by **TD1**, spec in §8.0. Deliberate divergence from the Java reference, in the repair direction Java's *own* `ArticulationDef` already takes |
| P4 | **frozen** | `RandomNumberProvider.getValue(NaN)` recurses to stack overflow; `getValue(Infinity)` hangs | `RandomNumberProvider` (T4) | present identically in the baseline; bug-for-bug per charter |
| D1 | **approved, structural only** | `MovementMap.movementSampleMaxStep` (a mutable static mirroring the Java fork) is deleted; the knob moves to `RenderOptions` | `MovementMap.ts:30` (T20b) | RULE I5. **Zero behavioural effect** — the default is unchanged and every fixture is generated with it. Corollary: anyone regenerating fixtures from Java must likewise leave the Java static at its default. Owner: T19a |

P1, P2 and P4 remain quality-of-implementation issues on *malformed* input, which is why they
stay frozen. P3 was different in kind — a **well-formed** MPM using
`<articulation absoluteDurationChange="…">` hangs the renderer with no output and no error —
and the conductor has approved its repair as TD1 under governance authority.

---

## 7. Unit and type discipline

The failure this prevents actually happened: `MovementData.getMovementSegment` takes
`position` in a normalized 0..1 domain and returns values scaled ×127, so the sampling
threshold `maxStepSize` means one thing going in and another coming out. Fixtures generated
against a 0..127 input subdivided ~1270 times too often and stored **16129 = 127 × 127** —
double-scaled. It cost a ground-truth regeneration (T20b) to find.

**RULE U1 (compile-time brands, zero runtime).**

```ts
// src/units.ts — leaf module, type-only. See the gate below for what it emits.
declare const brand: unique symbol;
type Branded<Name extends string> = number & { readonly [brand]: Name };

export type Ticks        = Branded<'ticks'>;       // symbolic MSM/MPM time
export type Milliseconds = Branded<'ms'>;          // performance time
export type Normalized   = Branded<'normalized'>;  // 0..1
export type Midi7Bit     = Branded<'midi7'>;       // 0..127
export type Bpm          = Branded<'bpm'>;
```

It is **not** true that this module "emits nothing", and the gate below depends on knowing
exactly what it does emit. Compiled under this repo's `tsconfig.json` (measured, not assumed:
`declaration`, `declarationMap` and `sourceMap` are all on) it produces **four** new files —
`dist/units.js`, `dist/units.js.map`, `dist/units.d.ts`, `dist/units.d.ts.map`.

**The "44 bytes" figure holds only for a comment-free module.** 44 = `export {};\n` (11) +
`//# sourceMappingURL=units.js.map` (33), and `tsconfig.json` does not set `removeComments`,
so any JSDoc in `src/units.ts` is emitted verbatim into `dist/units.js`. As actually shipped
by T19a the file is **1483 bytes: 1439 of doc header plus that same 44-byte tail.** The
invariant to check is therefore the *code* content, not the size — strip comments and the
output must be exactly `export {};`. (Measured on the committed tree; the T19a verifier's
"1483 bytes of doc header + the same 44" reads as 1527 total, which is off by the header —
1483 is the whole file.)

**RULE U2 (no runtime converters).** There are **no** `asTicks(n)` helper functions —
a helper function *emits*, and then "type-level only" can no longer be proven by a zero-line
emitted-JS diff. Construction uses an `as` cast at the (few) sites where a raw number becomes
a branded one: `parseFloat(attr.getValue()) as Ticks`. `as` erases completely.

**RULE U3 (where brands apply — and only here).**

- **(a) the facade's *output* types only** (`src/api/types.ts`): `PerformedNote.date`/
  `.duration` (`Ticks`), `.milliseconds.date`/`.end` (`Milliseconds`), `.velocity`/`.pitch`
  (`Midi7Bit`), `ControlChangePoint.date` (`Ticks`), `.milliseconds` (`Milliseconds`),
  `.value` (`Midi7Bit`), `PerformanceData.ppq` (`Ticks`).
- **(b) three interior declarations — the ones the confusion actually bit**:
  `MovementData.position` and `.transitionTo` (`Normalized | null`),
  `MovementData.getMovementSegment(maxStepSize: Normalized)` — the **parameter only** — and
  `DEFAULT_MOVEMENT_SAMPLE_MAX_STEP: Normalized`.

**RULE U3a (facade *inputs* are never branded).** Every `*Options` field is plain `number`,
including `PerformOptions.movementSampleMaxStep`. §2.2's signature block is **normative** and
overrides any reading of U3 to the contrary. Reason: RULE U2 forbids converter functions, so
a branded input would force every downstream caller to write `0.05 as Normalized` — hostile
to the exact consumer the facade exists for. Brands are free for *readers* of output data and
costly for *writers* of input, so they go on outputs only. The facade's implementation applies
the brand internally with one `as` at the boundary.

**RULE U4 (where brands must NOT apply).** Nowhere inside the parity-frozen arithmetic.
Branding a value forces an `as` at every arithmetic site, and the files where that churn
would land — `Performance.perform`, the render loops, `computeDuration`, `computePitch` — are
exactly the files where a reviewer must be able to scan for arithmetic changes. If applying a
brand to a declaration would require more than ~5 `as` casts elsewhere, do not apply it;
document the unit in the JSDoc instead. (Rejected alternatives: runtime value objects —
allocation in hot loops, forbidden by the charter; JSDoc-only conventions — unenforced, which
is how the 16129 bug survived.)

**RULE U4a (`getMovementSegment`'s return type is explicitly exempt).** An earlier draft
mandated `getMovementSegment(...): readonly (readonly [Ticks, Midi7Bit])[]`. That is
**withdrawn** — it contradicts three other rules at once. The method returns its own mutable
working array: `series` is `splice`d and `unshift`ed during subdivision and then mutated in
place (`for (const tuple of series) tuple[1] *= 127;`, `MovementData.ts:190-208`). A
`readonly` tuple return type is therefore exactly the working state RULE I4 says must **not**
be `readonly`, and reallocating it to satisfy the type is exactly what RULE I6 forbids in a
sampling loop. Brand the **parameter** and the two **field** declarations; leave the return
type `number[][]` and document the units in its JSDoc. Likewise `DynamicsData.
getSubNoteDynamicsSegment` — same shape, same exemption.

Budget check for U3(b), so a worker knows this is within U4's threshold. The real cost is
**8 `as Normalized` casts**, enumerated from the committed T19a tree (`f947836`):
`MovementData.ts:21,41,46`, `MovementMap.ts:101,102,104,190`, `RenderOptions.ts:42`.
That is above U4's "~5" heuristic, and it is applied anyway as the one documented override:
these two fields are the *origin* of the 16129 bug, every cast sits at a parse or construct
boundary rather than inside arithmetic, and U4's threshold exists to protect arithmetic-dense
code, which these sites are not. No other declaration gets this override.

*(This paragraph's earlier "9 sites" figure was a pre-implementation estimate and wrong in
both directions: it listed `MovementData.ts:150,165,197,201`, which are **read** positions
where a branded number widens to `number` freely — the tree compiles with no cast at any of
them — and it omitted the two declaration initializers that do need one. U4's override
verdict is unaffected either way.)*

> **EQ-RISK (U1–U4a).** None, *if* the rules are followed — which is why the gate is a bright
> line. **GATE, stated so it can actually pass:**
> **(i)** a **zero *code* diff over every pre-existing `dist/` file** — measured with a
> comment-immune instrument, not `diff`. Re-emit each `dist/*.js` through
> `ts.transpileModule` with `removeComments: true` (or the equivalent JSDoc-pruned token
> stream, `t8verify/toks2.mjs`) and require zero differences. **"Zero-*line* diff" is wrong
> and was unsatisfiable**: RULE U4a *orders* the `getMovementSegment` JSDoc, `tsconfig.json`
> does not set `removeComments`, so that JSDoc necessarily lands in the emitted
> `MovementData.js` — the first draft's wording told the worker to revert exactly the
> documentation another rule required. Comments in emitted JS are not the hazard this gate
> exists for; runtime constructs are.
> **(ii)** the only permitted **new** emitted artifacts are `dist/units.js` and its three
> siblings (`units.js.map`, `units.d.ts`, `units.d.ts.map`), and `dist/units.js`'s **code**
> content — after the same comment stripping — must be exactly `export {};` (see the byte
> note under RULE U1: the shipped file is much larger than 44 bytes because of its header);
> **(iii)** `.d.ts` diffs on pre-existing files are expected and are the point of the change.
> Any *other* new file, or any **code** change to a pre-existing `.js`, means a runtime
> construct crept in (almost certainly a converter function against RULE U2) — revert it.
>
> **OWNER — decided, not left open.** U1, U2, U3(b), U4 and U4a belong to **T19a**, whose
> file scope in §8.1 is amended to name them; U3(a) and U3a belong to **T13**, which creates
> `src/api/types.ts` anyway. T19a is *not* a single measurement: it produces **two, in this
> order**, so that neither gate is contaminated by the other —
> **(M-a) units-only**: add `src/units.ts` and the U3(b) brand annotations *alone*, build,
> and require gate (i)–(iii) above;
> **(M-b) RenderOptions on top**: then make the §2.4 / RULE I5 changes, gated by §2.4's and
> I5's byte-probes. A single combined measurement cannot distinguish "a brand emitted
> something" from "RenderOptions emitted something", and RenderOptions emits by design.

---

## 8. Item mapping (T13–T21) and resequencing

### 8.0 TD1 — repair the articulation non-termination (DELIBERATE DIVERGENCE #1)

Approved by the conductor on 2026-08-08 under governance authority (no user sign-off) and
dispatched immediately after T12. **This item is an approved exception to RULE E1**; §6.3
row P3 is its authority.

**The fix is two changes, not one.** An earlier draft of this document said "the
one-character fix (`>=` → `<=`)"; that was wrong and a worker who implements only the
comparison flip ships an item that still hangs. Both spellings, verified in the tree:

```ts
// src/mpm/elements/maps/data/ArticulationData.ts:203-208  — the defect
if (this.absoluteDurationChange !== 0.0) {
  let durNew = duration + this.absoluteDurationChange;
  for (let reduce = 2.0; durNew >= 0.0; reduce *= 2.0)     // no guard, >=
    durNew = duration + this.absoluteDurationChange / reduce;
  durationAtt.setValue(String(durNew));
  Helper.addToListAttribute(note, 'modified', this.xmlId);
}

// src/mpm/elements/styles/defs/ArticulationDef.ts:355-363 — the model to mirror
if (this.absoluteDurationChange !== 0.0) {
  const dur = parseFloat(durationAtt.getValue());
  if (dur > 0.0) {                                         // guard
    let durNew = dur + this.absoluteDurationChange;
    for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)   // and <=
      durNew = dur + this.absoluteDurationChange / reduce;
    durationAtt.setValue(String(durNew));
  }
}
```

Java agrees with both readings: `ArticulationData.java:197` carries the `>=` loop *and* the
comment "as long as the duration change causes the duration to become 0.0 or negative" (so
the comparison is against the author's stated intent), while `ArticulationDef.java:420-423`
has `if (dur > 0.0)` **and** `durNew <= 0.0`.

**Why the guard is load-bearing, not belt-and-braces.** With `<=` and **no** guard, a note
with `duration.perf <= 0` and a negative `absoluteDurationChange` still never terminates:
`durNew` converges to `duration` ≤ 0, so the condition stays true forever. And
`duration.perf="0.0"` is not hypothetical — it occurs in
`tests/integration/fixtures/performance-reference/composite_advanced_augmented.msm`.

**TD1's specification:**

1. Apply **both** changes to `ArticulationData.articulateNote` — the `> 0.0` guard and the
   `>=` → `<=` flip — mirroring the *control flow* of `ArticulationDef.ts:355-363` /
   `ArticulationDef.java:420-423`.
   **Guard the hoisted `duration` local; do NOT re-read the attribute.** The guard is
   `if (duration > 0.0)`, using the `const duration = parseFloat(durationAtt.getValue())`
   that already sits at the top of the `durationAtt !== null` block. Copying
   `ArticulationDef`'s `const dur = parseFloat(durationAtt.getValue())` *inside* the branch
   would be a **third** behaviour change, and one requirement 3's tests would not catch:
   `ArticulationData` hoists deliberately so that the duration modifiers do **not** compose —
   its own class comment says so (`ArticulationData.ts:144-148`: "`duration` is read once, up
   front, and every branch computes from that original value … the last one to fire simply
   overwrites"), and Java hoists identically at `ArticulationData.java:182`. `ArticulationDef`
   re-reads inside the branch, so *its* modifiers do compose — that difference between the two
   classes is real and must survive TD1. TD1's value is a minimal, precisely-scoped
   divergence: termination, and nothing else it did not intend.
2. **Journal the `addToListAttribute` suppression.** `ArticulationData`'s branch ends with
   `Helper.addToListAttribute(note, 'modified', this.xmlId)` (line 208), which
   `ArticulationDef`'s does not have. Putting the work inside `if (dur > 0.0)` means a note
   with `dur <= 0` no longer gets its `modified` list entry. That is a **second** observable
   change beyond termination, it is serialization-visible, and TD1 must state it explicitly
   rather than let a verifier discover it.
3. **Pinning tests, and they must include the case that discriminates the two fixes:**
   (a) `duration.perf > 0` with a negative `absoluteDurationChange` — terminates, produces the
   expected positive duration; (b) **`duration.perf <= 0` with a negative
   `absoluteDurationChange`** — terminates (this is the case the comparison-only fix fails);
   (c) the `modified` attribute assertion for both. Every case runs under an explicit
   per-test timeout, so a regression to non-termination fails the suite instead of hanging it.
4. **The branch is unreached by every fixture** — confirmed, `grep -rl absoluteDurationChange
   tests/integration/fixtures` returns 0 files. So the whole integration suite must stay
   byte-identical; that is TD1's regression gate, and the new unit tests are its only
   positive evidence.
5. **Negative control** (required, because requirement 4's byte-identity passes for *any*
   edit to an unreached branch): revert the guard alone, keeping `<=`, and prove test case
   (b) hangs and times out. A gate that passes for both the right and the wrong fix is not a
   gate — which is precisely how the earlier one-character spec would have signed off a
   still-hanging renderer.

### 8.1 Recommended order

The conductor decides; this is the architect's recommendation, with reasons.

```
TD1  →  T14  →  T18  →  T19a  →  T13  →  T16  →  T15  →  T17  →  T19  →  T20  →  T21
```

**TD1 first** — it is already dispatched (§8.0), self-contained, and touches one file that no
other item in this list restructures. Running it before T14 also means the articulation hang
is gone before anything starts moving code around it.

Two changes to the queue's current order:

1. **T14 and T18 move ahead of T13.** T14 is what removes all 33 `mpm → mei` edges; T18 is
   what removes the `Mpm ⇄ GenericStyle` cycle. A facade barrel published *before* those is a
   facade whose import order is load-bearing — the exact hazard the charter warns about —
   and every consumer inherits it.
2. **A new small item T19a is split out of T19 and run before T13.** T13's contract includes
   the imprecision seed and (via `PerformOptions`) the movement sampling step; both need the
   `RenderOptions`/`RenderContext` plumbing of §2.4. Putting that plumbing in T19 would either
   block T13 behind the largest remaining item or force T13 to ship options it cannot honour.

> **T19a — render options plumbing + branded units** *(new, recommended)*
>
> **Explicit file scope** — the first draft said "No other file changes", which contradicted
> the item actually owning `src/units.ts`. The scope is these files and no others:
> `src/units.ts` (new), `src/mpm/RenderOptions.ts` (new),
> `src/mpm/elements/Performance.ts`, `src/mpm/elements/maps/MovementMap.ts`,
> `src/mpm/elements/maps/ImprecisionMap.ts`, `src/mpm/elements/maps/data/MovementData.ts`,
> `src/msm/Msm.ts` (the hop-1 `import type` + pass-through only),
> `tests/mpm/elements/MovementMap.test.ts` (the migration RULE I5 requires), plus new tests.
>
> **Work:** add the brand module and apply U3(b); add `RenderOptions`/`RenderContext`; thread
> the context through all **four** hops of §2.4's table; implement RULE F7's seed branch with
> §2.4's exact `deriveSeed`; delete the `MovementMap.movementSampleMaxStep` mutable static per
> RULE I5 and migrate its unit test.
>
> **Two separate evidence measurements, in this order** (RULE U1–U4a's gate explains why a
> single combined one cannot work): **(M-a)** units-only — brands alone, gated by the
> pre-existing-`dist/`-files **code** diff (comment-immune, per RULE U1–U4a's gate (i));
> **(M-b)** RenderOptions on top, gated by §2.4's EQ-RISK
> block and RULE I5's.

The rest of the order is dependency-driven: T16's `getXml()` narrowing (N3) touches the same
files T15 must restructure, so doing T16 first means T15 diffs against already-clean code;
T17 is scoped down (below) and independent; T19 and T20 are the last behaviour-adjacent
items; T21 audits everything.

> **T16b — reconcile the three XML-navigation implementations** *(new, recommended, low
> priority — after T16, or defer past Phase 3)*
> Per RULE M2a, `src/msm/Msm.ts:25-175` keeps eight module-local copies of navigation helpers
> and `src/mpm/Mpm.ts:33,45` keeps two more (`getFirstChildElement`, `getAllChildElements`),
> all behaviourally drifted from `mei/Helper`'s. Merging them onto `src/xml/tree.ts` needs a
> **per-method** behavioural comparison — a probe that feeds both implementations the same
> element trees, including namespaced children and elements with same-local-name children in
> different namespaces, and requires identical results before either is deleted. Any method
> where they differ stays duplicated, with the difference documented. This is genuinely
> optional: the duplication costs ~150 lines and no correctness, and the merge touches the
> byte-compared serialization path. Recommend scheduling it only if Phase 3 finishes early.

### 8.2 T14 — dissolve `Helper`

Pure moves and renames; **no logic edits** except the two mechanical rules N2b (delete a guard
whose condition the parameter type excludes) and RULE M6. `src/msm/Msm.ts`'s eight and
`src/mpm/Mpm.ts`'s two module-local navigation helpers are **out of scope and untouched** —
see RULE M2a. The full **45**-member disposition:

| destination | members |
|---|---|
| `src/xml/tree.ts` | `getFirstChildElement`, `getAllChildElements`, `getAllDescendantsByName`, `getAllDescendantsWithAttribute`, `getNextSiblingElement`, `getPreviousSiblingElement`, `getAllPreviousSiblingElements`, `getParentElement`, `getClosest`, `getClosestByAttr`, `cloneElement`, `getAttribute`, `getAttributeValue` — **plus** the `require*` siblings of N2a |
| `src/xml/ids.ts` | `addUUID`, `copyId`, `copyIdNoNs`, `copyIdNs` (private), `addToListAttribute` |
| `src/xml/prettyPrint.ts` | `prettyXml` |
| `src/msm/dateMap.ts` | `addToMap` (42 mei call sites; it knows the `date` attribute, so it is MSM-domain, not XML-generic) |
| `src/music/pitch.ts` | `pname2midi`, `midi2pname`, `midi2PnameAndAccid`, `midi2PnameAccidOct`, `getMidiOctave` (private), `accidString2decimal`, `accidDecimal2String`, `accidString2word`, `accidDecimal2unicodeString` |
| `src/music/duration.ts` | `duration2decimal`, `duration2word`, `pulseDuration2decimal`, `decimalDuration2HtmlUnicode`, `durationRemainder2UnicodeDots` (private) |
| `src/music/text.ts` | `extractAllIntegersFromString`, `repeatString` (private), `getFilenameWithoutExtension` |
| `src/mei/mpmNoteIds.ts` | `updateMpmNoteidsAfterResolvingRepetitions` (MEI-specific, stays in L5) |
| `src/compat/unsupported.ts` | `validateAgainstSchema`, `validateAgainstSchemaString`, `xslTransformToDocument`, `xslTransformToString`, `makeXsltTransformer`, `makeXslt30Transformer`, `writeStringToFile` — the group that this port cannot implement; each logs and returns a failure value. Grouping them in one module makes T21's decision a whole-file deletion rather than surgery. |

`index.ts` keeps exporting a `Helper` object whose properties delegate to the new functions,
so the published API does not break; T22 marks it deprecated.

**RULE M5a (T14 may delete the guards, and must not leave them).** N2b is assigned to T14,
but 11 of `getAllChildElements`'s 16 call sites live in `src/mpm/elements/**` — T16's cluster
— and all 11 carry a guard the narrowing makes dead. They are **not** all the same shape, and
a worker told to look for eleven `?? []` will find eight:

- **eight `?? []`** — `DynamicsStyle.ts:39`, `OrnamentationStyle.ts:42`, `RubatoStyle.ts:39`,
  `TempoStyle.ts:39`, `ArticulationStyle.ts:42`, `MetricalAccentuationStyle.ts:45`,
  `AccentuationPatternDef.ts:42`, `OrnamentDef.ts:374`. Deleting these is a token removal.
- **three `if (x)` guards** — `Header.ts:95`, `Performance.ts:121`, `Metadata.ts:143`.
  Deleting these means re-indenting the guarded body, so they are the ones to review closely.

**T14 owns those deletions** even though the files belong to another item's cluster: leaving a
dead guard behind is leaving the tree in a state where the return type and the call sites
disagree, and T16 would have to re-derive N2b's unreachability argument to clean it up. The
exception is narrow and mechanical — T14 may touch those 11 sites and nothing else in
`src/mpm/`, and its log entry must list them individually.

**Measured input for T21 while T14 is in there: 22 of `Helper`'s 41 public statics have zero
`src/` call sites** — they are reached only from `tests/`. (Re-measured for this revision; the
first draft said 17 and the T12 verifier said 19. Both undercounted, because a bare identifier
grep counts `{@link Helper.x}` and error-message text as usage. The list below anchors on the
call paren and discards comment lines.)

`validateAgainstSchema`, `validateAgainstSchemaString`, `xslTransformToDocument`,
`xslTransformToString`, `makeXsltTransformer`, `makeXslt30Transformer`, `writeStringToFile`,
`prettyXml`, `getAllPreviousSiblingElements`, `getClosest`, `getClosestByAttr`,
`updateMpmNoteidsAfterResolvingRepetitions`, `addUUID`, `copyIdNoNs`, `duration2word`,
`pulseDuration2decimal`, `decimalDuration2HtmlUnicode`, `accidDecimal2String`,
`accidString2word`, `accidDecimal2unicodeString`, `midi2pname`, `midi2PnameAccidOct`.

Three of those are worth flagging individually because they look live and are not:
**`addUUID`** (the `src/` uses are `Msm.ts`'s *own* local copy, not `Helper`'s),
**`accidDecimal2String`** and **`midi2PnameAccidOct`** (whose only `src/` occurrences are a
`{@link}` and an error string respectively).

Four further publics are called **only from inside `Helper.ts`** and so become module-private
on the move: `getAllDescendantsByName` (`Helper.ts:206`), `getAllDescendantsWithAttribute`
(`:232`), `getPreviousSiblingElement` (`:378,382`), `midi2PnameAndAccid` (`:1373`). T14 keeps
them exported anyway — they are published API and §8.10 rules on them — but should not be
surprised to find no external caller.

**T14 moves all 45 and deletes none.** §8.10 owns every deletion decision.

### 8.3 T18 — cycles

Implements M3 and M4, then adds the lint enforcement of M1 (`import/no-cycle` plus a
path-restriction rule encoding §1.2's table). Also closes the two `no-require-imports` sites
in `Helper` (they move to `src/compat/unsupported.ts` in T14) and the third,
`Mei.ts:292` — the `require('./Mei2MsmMpmConverter.js')` inside `Mei.exportMsmMpm`, which
*throws at runtime today* because it is CommonJS in an ESM build. After M3 the cycle is gone
and it becomes a normal top-level import, so `Mei.exportMsmMpm` starts working. **That is a
behaviour change** (from "throws" to "works") on a method the pipeline does not use — the
integration tests reach the converter directly. Journal it; do not hide it in a "cycle
cleanup" hunk.

### 8.4 T13 — facade

Implements §2 in full, plus RULE N4, RULE I3, and U3(a)/U3a's brands on the output types.
Integration tests may switch to the facade **only mechanically** and only if the switch is
genuinely mechanical; otherwise leave them calling the classes — the facade is additive and
does not need them as proof. New unit tests for: F1's three plain-data tests, F7's determinism
trio, E2/E3's error cases, and the field mapping of §2.3 against a known augmented-MSM
fixture.

**Required gate — the RULE F2 round trip.** The whole boundary design rests on the assumption
that serializing and re-parsing between stages is lossless, so T13 must *measure* it rather
than inherit it: for every MEI fixture, `convert → serialize → re-parse → perform` must be
byte-identical (after UUID canonicalization) to `convert → perform` on the in-memory objects.
This was run during T12 review over all 16 MEI fixtures with **0 divergences**, and the same
probe showed parse→serialize reaching a fixed point at n=1 — so the expected result is known
and a *failure* means T13 introduced something, not that the assumption was wrong.

**Three behaviours §2 leaves to T13, ruled here so they are not invented twice:**

1. **`MovementDocuments.index` / `.title`.** `index` is the position in the converter's
   returned arrays (`KeyValue<Msm[], Mpm[]>`), which are index-aligned per `mdiv`. `title` is
   `Msm.getTitle()` of that movement's MSM — not the MEI's title, and not the MPM's.
2. **`renderExpressiveMidi` with `mpm` omitted.** It renders the MSM as-is, which requires the
   MSM to already carry the performance attributes — mirroring `Msm.exportExpressiveMidi`'s
   own no-performance path. If no note in the document has `milliseconds.date`, throw
   `EmptyDocumentError` per RULE E3 rather than emitting MIDI-in-name-only. `PerformOptions`
   fields are then meaningless and passing them is an `InvalidOptionError`.
3. **`ConvertOptions.sourceName` sets exactly two things**, and a worker must set both or
   neither: the MPM metadata's `RelatedResource` URI, **and** the generated `<comment>` text
   (`Mei2MsmMpmConverter.ts:643-654` writes "This MPM has been generated from '<name>' using
   the meico MEI converter v<VERSION>."). The converter branches on `mei.getFile() !== null`
   to choose between that comment and its file-less variant, so `sourceName` must drive that
   same branch. Omitting `sourceName` must produce the file-less variant byte-for-byte.

### 8.5 T15 — converter dispatch (highest risk in the project)

The trap, from T10's reading of the code: **`continue` vs `break` *is* the traversal policy.**
`break` falls through to the `convertElement(e)` at the bottom of the loop, i.e. descend;
`continue` means finished. So the set of `break` cases is exactly the set of elements whose
children reach the converter generically, and moving one case between the groups silently
changes what gets converted. A handler table must therefore make that decision **explicit**:

```ts
type Traversal = 'done' | 'descend';
type ElementHandler = (c: Mei2MsmMpmConverter, e: Element) => Traversal;

const IGNORE: ElementHandler = () => 'done';
const DESCEND: ElementHandler = () => 'descend';

const HANDLERS: Readonly<Record<string, ElementHandler>> = { … };

// the loop:
for (const e of childElements(root)) {
  this.checkEndid(e);                                  // before dispatch, for EVERY element
  const handler = HANDLERS[e.getLocalName()];
  if (handler === undefined) continue;                 // == today's `default: continue`
  if (handler(this, e) === 'descend') this.convertElement(e);
}
```

Mechanical translation rules — apply these, do not improvise:

| today | becomes |
|---|---|
| `case 'x': continue;` | `x: IGNORE` |
| `case 'x': this.processX(e); continue;` | `x: (c, e) => { c.processX(e); return 'done'; }` |
| `case 'x': break;` | `x: DESCEND` |
| `case 'x': this.processX(e); break;` | `x: (c, e) => { c.processX(e); return 'descend'; }` |
| `case 'tuplet':` (descends only when `processTuplet` returns false) | `tuplet: (c, e) => (c.processTuplet(e) ? 'done' : 'descend')` |
| `chord` (skips grace chords whole), `bTrem`/`fTrem` (routed to `processChord`) | explicit in the handler body, unchanged logic |
| absent from the table | unknown element, skipped whole — matches `default: continue` |

**Mandatory evidence gate for T15** (in addition to the charter's per-sub-round verify):

1. **Before** touching anything, generate a **dispatch census** mechanically from the current
   source: for each of the ~120 cases, `(localName, handler calls in order, terminator)`.
   Save it in the scratchpad.
2. **After**, regenerate the same census from the handler table and require a **zero-line
   diff**. This, not review, is the proof.
3. Sub-round per element group, `npm run verify` green after each.
4. **Negative control:** move one case from `DESCEND` to `IGNORE` and prove the integration
   suite goes red. If it does not, that element is not covered by any fixture and the change
   is *unproven* — journal it as such.
5. **Do not split the cursor.** `currentMdiv`/`currentPart`/`currentLayer`/`currentMeasure`/
   `currentChord`/`currentMsmMovement`/`currentWork`/`currentPerformance` and the deferred
   lists (`accid`, `endids`, `tstamp2s`, `lyrics`, `arpeggiosToSort`, `allNotesAndChords`)
   may be *renamed* into a `ConversionContext` type only if every field moves verbatim.
   Changing a field's lifetime or a drain point is out of scope: `reset()` semantics and the
   drain points are subtle (documented in the class comment T10 wrote) and the fixture suite
   cannot prove lifetime changes.
6. Keep `convert(mei: Mei)` as the public entry point with its current name — 10 integration
   test call sites use it. Drop only the `convert(root: Element)` overload, making the walker
   the private `convertElement`. Then **zero** integration test edits are needed.

### 8.6 T16 — model layer

Applies N3 (the `getXml()` narrowing and the **154** `!` deletions it enables), C3 (the shared
`bezier` module), C4, C6 (`KeyValue` → tuples), I4 (`readonly`, `prefer-readonly` → 0 in this
cluster — after T21 enables the rule, per RULE N6), and the four deduplications already
scouted:

- `GenericStyle.parseDefs<D>(childName, create)` collapses ~30 lines per file across the 6
  style subclasses (T6's finding);
- `GenericMap.resolveEntry(index, localName)` + `findStyleNameAt(index)` remove ~14 duplicated
  lines from each of the 8 `getXDataOf` accessors (T7's finding);
- `setId`/`getId`/`getName`/`setName` are byte-identical in `GenericStyle` and `AbstractDef`,
  with two further near-copies in `TemporalSpread`/`DynamicsGradient` — one shared base or
  mixin removes four copies (T6). **See RULE C1a immediately below before writing that base.**
- `TemporalSpread` and `DynamicsGradient` move out of `defs/OrnamentDef.ts` into their own
  modules (importing either currently drags `OrnamentDef` in) — an import-graph change, so
  coordinate with T18.

**RULE C1a (`TemporalSpread` and `DynamicsGradient` must NOT be put under
`AbstractXmlSubtree`).** The shared base of the previous bullet covers **id and name accessors
only**. These two classes sit outside that hierarchy deliberately: their `getXml()`
(`OrnamentDef.ts:173` and `:299`) is `if (this.xml === null) return this.generateXML();` —
**lazy generate-and-cache**, not a field read. Moving them under `AbstractXmlSubtree` would
replace generate-on-demand with RULE N3's narrowed plain-field accessor, and serialization of
programmatically built ornaments would silently change: an object whose element has not been
generated yet would start returning nothing instead of generating it. If a worker wants the
`toXml`/`setXml` copies deduplicated too, that needs its own probe over programmatically
constructed (not parsed) ornaments; the id/name mixin does not.

Also here: `Mpm.addMetadata`'s third parameter or `RelatedResource.createRelatedResource`'s
return type must be reconciled so `Mei2MsmMpmConverter.ts`'s last `any` — and with it the only
`eslint-disable` left in the tree — can go (T10's `DISCOVERED`). Nullable element type on the
parameter is the smaller change.

### 8.7 T17 — re-scoped, and it should happen

state.json leaves T17 to this document's judgement. **Ruling: do it, but not as written.**
Extracting XomTypes behind a "slim internal interface" is high risk (attribute ordering and
namespace handling are load-bearing for byte-identical serialization — the charter says so)
and low reward. Renaming it to `dom.ts` is pure churn and destroys the XOM provenance that
parity reviewers use. **Both are rejected.**

What T17 *should* do is the finding T5 buried in its DISCOVERED list, which has an enormous
measurable payoff and a bright-line gate:

1. **Remove the per-node throwaway parse.** `Element`, `Attribute` and `Text` constructors
   each run `new DOMParser().parseFromString('<dummy/>', 'text/xml')` to own a placeholder DOM
   node that serialization never reads. Building a document performs **one full XML parse per
   node**. An unattached-node factory, or dropping `_domNode` for constructed (as opposed to
   parsed) nodes, removes it. This is the layer's dominant cost by a wide margin.
2. **`query()`** serializes the whole subtree to a string, re-parses it, and maps hits back by
   positional path on *every* call, from call sites across `mei/`, `msm/` and `mpm/`. Memoize
   the parse or back the tree with a real DOM; that also retires `findCorrespondingElement`.
   Attempt only if (1) lands cleanly.
3. Add the internal seam that `Element.wrap`'s `text['_domNode'] = child` bracket-access needs.
4. Collapse the 2 `unified-signatures` pairs T5 deferred as public-API changes (`Attribute`'s
   2-arg/3-arg, `XmlBase`'s no-arg/`Document` constructors).
5. Decide `XmlBase.validate(_schema?)` — `isValidFlag` is never set true and `validate()`
   returns an English string; there is no schema validation in this port. Either delete it
   (with `src/compat/unsupported.ts`, T21) or give it an honest result type.

If (1) proves entangled with serialization, T17 stops after (3)–(5) and journals. Gate for
(1) and (2): full-suite byte equality **plus** a before/after runtime measurement recorded in
`log.md` (this is the one item allowed to claim a performance win, so it must measure one).

### 8.8 T19 — performance pipeline

After T19a has taken the options plumbing out of it, T19 is: compose `Performance.perform`
into named stages (global preprocessing → per-part map collection → render passes → ms-domain
passes) and make the pass ordering **structural** rather than a convention held up by the
order of calls. T8/T7 recorded that ArticulationMap's two-pass and OrnamentationMap's
three-pass structures are enforced *only* by call order in `perform`, with nothing in the maps
preventing a caller from running the millisecond pass before the tempo map.

**Floating-point operation order must not change.** Ornamentation ms-domain rendering
(`OrnamentationMap.java:477-509` parity) is the most sensitive spot; note that T7's verifier
found the ms-domain ornament renderer is **dead code** on today's fixtures, so the suite will
*not* catch a regression there — treat it as unprotected and change nothing in it without a
purpose-built probe.

### 8.9 T20 — MIDI layer

`EventMaker` → module functions (RULE C2, and the last `no-extraneous-class` site).
`InstrumentsDictionary`'s tables → `as const` (RULE I4; currently zero `as const` in that
file). `Midi`/`Sequence`/`Track`/`MidiEvent`/`ShortMessage`/`MetaMessage` stay classes
(C1b, C1c — the integration tests `instanceof` them). Event ordering and byte layout frozen;
gate is the midi-byte-equivalence suite plus a `Uint8Array` hash probe over every fixture.
`EventMaker.byteToShort` has no caller beyond its own test → T21.

### 8.10 T21 — dead code and audits

Deletion candidates already identified, each with its own disposition rule — **delete a stub
that cannot work; keep a working public utility**:

| candidate | disposition |
|---|---|
| `src/compat/unsupported.ts` (the 7 XSLT/schema/file-write members) | **delete the module and its tests.** They are stubs that log and return null/false; the file-write path uses `require()` in an ESM build. Verify each is genuinely non-functional before deleting, then journal the test-count decrease per charter 7c |
| `Helper`'s music-theory conversions with 0 `src/` callers (`duration2word`, `decimalDuration2HtmlUnicode`, `accidString2word`, `accidDecimal2unicodeString`, `midi2pname`, `prettyXml`) | **keep.** They work, they are genuinely useful public API for a music library, and their tests are real coverage |
| `getClosest`, `getClosestByAttr`, `getAllPreviousSiblingElements`, `updateMpmNoteidsAfterResolvingRepetitions` | keep — small, working, plausibly used by consumers |
| `Helper.copyIdNoNs` and `Helper.pulseDuration2decimal` (0 `src/` callers; **absent from the first draft's list entirely**) | **keep**, by this table's own stated rule — both are small working utilities with real tests, not stubs |
| `Helper.addUUID`, `Helper.accidDecimal2String`, `Helper.midi2PnameAccidOct` (0 `src/` callers; each *looks* used but its `src/` occurrences are `{@link}` or error-message text) | **keep.** `addUUID` in particular: `Msm.ts` has its own local copy, so `Helper`'s is unreferenced — but it is published API and id generation order is parity-critical, so deleting it is not worth the risk for a dead-code count |
| `XmlBase.fixDuplicateIds` (0 callers) | delete |
| `XomTypes.Element.setNamespaceURI` (dead after T11) | delete |
| `EventMaker.byteToShort` (0 callers beyond its test) | delete |
| `Msm.getMinimalPPQ` (0 `src/` callers after T9b fixed it) | **keep** — T9b just corrected it against Java and pinned it with tests; deleting it discards that work |
| the ms-domain ornament renderer (dead per T7's verifier) | **keep, and mark.** It is a Java-parity code path; deleting it makes a future parity comparison harder. Add a comment saying no fixture reaches it |

**Audits T21 runs — but note the ordering constraint.** `prefer-readonly` and
`no-unnecessary-condition` are type-aware rules that **are not enabled today**, so auditing
them before enabling them measures 0 for the wrong reason. T21 therefore does RULE N6's
enablement *first*, then audits:

1. enable the three type-aware rules per RULE N6 (`prefer-readonly`,
   `no-unnecessary-condition`, `no-unnecessary-type-assertion`), scoped to `src/`;
2. `no-extraneous-class` = 0;
3. no non-`readonly` static fields in `src/` — using RULE I5's corrected command, not the
   `(`-filtered one;
4. `no-param-reassign` = 0 in `src/` and promoted to `error`;
5. `prefer-readonly` = 0 (now measurable);
6. `no-unnecessary-condition` — every finding is either fixed or journaled; this is the rule
   that catches leftover `?? []` guards from N2b and redundant `!` from N3;
7. `import/no-cycle` clean;
8. `no-non-null-assertion` strictly below 1080 with the delta journaled *(historical; now 170)*;
9. coverage per charter invariant 7;
10. `vitest.config.ts`'s include list updated for the moved paths (mechanical only — note that
    `src/api/**`, `src/music/**`, `src/xml/**`, `src/units.ts` must be **in** scope, and
    `src/compat/**` is deleted).

---

## 9. Equivalence-risk summary

Every policy above with a non-trivial drift risk, in one table, so a conductor can check that
the applying item produced the right evidence.

| policy | drift risk | required gate |
|---|---|---|
| M2/M3 module moves | module evaluation order changes; cycle failure relocates | emitted-JS classification (bodies byte-identical modulo wrapper) + pipeline byte-probe + deep-import negative control both directions |
| M2a merging the three navigation implementations | they disagree on namespaced children; the difference reaches serialized bytes | **forbidden in T14.** If ever done (T16b): per-method differential probe over namespaced trees + full byte-probe; any disagreeing method stays duplicated |
| **TD1 articulation repair** (§8.0) | the fix is guard **+** `<=`; the comparison alone still hangs on `duration.perf <= 0`, and byte-identity passes either way because no fixture reaches the branch | full-suite byte identity + a pinning test for **(duration ≤ 0, negative change)** under an explicit timeout + `modified`-attribute assertions + negative control (revert the guard, keep `<=`, prove that test times out) |
| F7 seed plumbing | new branch could apply when no seed is given | deterministic-fixture byte-probe + structural check on imprecision fixtures + determinism trio + negative control |
| I5 `movementSampleMaxStep` | optional param dropped on one branch | default-path byte-probe + positive test that a non-default step changes the `positionMap` event count + negative control + the `MovementMap.test.ts:815-827` migration with both assertions preserved |
| N2a `require*` accessors | `TypeError` → typed throw on unreachable paths | per-site unreachability argument + byte-probe + forced-throw negative control |
| **N2b guard deletion** | "returns null → caller's `?? []` skips the work" becomes an unguarded `TypeError` — a *worse* failure mode than N2a's | per-site unreachability argument (from the parameter type, or from an enumeration of all call sites where the guard tests a value) + byte-probe + negative control passing the guarded value |
| N3 `getXml()` narrowing | same, ×**154** sites | global `setXml(null)` check + per-subclass audit that **no `getXml()` read precedes the assignment** + emitted-JS classification of every deleted guard + negative control |
| C3 shared Bézier module | float reassociation while moving arithmetic | full byte-probe + 10⁴-triple bit-identity probe incl. sign of zero + reassociation negative control |
| U1–U4a branded units | a runtime converter creeping in | **zero *code* diff over every pre-existing `dist/` file**, measured comment-immune (re-emit with `removeComments: true`, or the JSDoc-pruned token stream); the only permitted new artifacts are `dist/units.js` (stripped content exactly `export {};`) and its three siblings. A *line* diff is **not** the gate — RULE U4a's mandated JSDoc lands in the emitted JS, so a line-based gate contradicts it |
| **F2 round trip** (T13) | serialize/re-parse between facade stages could be lossy | per-fixture byte identity of `convert → serialize → re-parse → perform` vs `convert → perform`; measured at 0 divergences over 16 fixtures during T12 review, so a failure means T13 introduced it |
| T15 dispatch table | a case silently changes descend/finish | mechanical dispatch census, zero-line diff before vs after + per-group verify + case-flip negative control |
| T17 XomTypes parse removal | serialization bytes change | full-suite byte equality + recorded runtime measurement |
| T20 `as const` + EventMaker | MIDI event order / byte layout | midi-byte-equivalence suite + `Uint8Array` hash probe |
| T18 `Mei.exportMsmMpm` starts working | "throws" → "works" | journal it explicitly; do not bury it in a cleanup hunk |

---

## 10. Open questions for the conductor

**Resolved since the first draft** — recorded so nobody reopens them:

- ~~**Q2 — P3, the articulation hang.**~~ **CLOSED.** The conductor approved the repair as
  **TD1** on 2026-08-08 under governance authority (no user sign-off). §6.3 row P3 is the
  authority, §8.0 is the spec, and RULE E1 now carries the approved-divergence exception. The
  spec changed materially in this revision: the fix is a **guard plus** the comparison flip,
  not "one character" — see §8.0 for why the comparison alone still hangs.
- ~~**Q4 — approve or reject T19a.**~~ **CLOSED**, approved and now carrying an explicit file
  scope and two separate evidence measurements (§8.1).
- ~~**Q — who owns the branded units.**~~ **CLOSED** and no longer a question: U1/U2/U3(b)/U4/
  U4a belong to T19a, U3(a)/U3a to T13 (RULE U1–U4a's gate block).
- ~~**Q — type-aware linting.**~~ **CLOSED** by RULE N6: three named rules, enabled by T21,
  no preset. `eslint.config.js` had parked this on T12 and the first draft failed to rule.

Still open:

1. **Q1 — facade field naming** (§2.3): nested `milliseconds: { date, end }` versus flat
   `millisecondsDate`/`millisecondsDateEnd`. Confirm with the mpmify consumer if cheap;
   **default is nested** so T13 is not blocked.
2. **Q3 — logging.** The interior `console.log`s verbosely on every conversion and every
   `perform` (part-by-part). That is user-hostile for a library and there is no way to
   silence it. Threading a logger through ~100 call sites contradicts nothing but costs a
   lot; a module-level `setLogger` in a leaf `src/logging.ts` contradicts RULE I5's "no shared
   mutable statics" in letter, though it affects only diagnostics and never rendered output.
   **Architect's recommendation:** defer to T22, and if it is done, do it as the leaf
   `setLogger` with an explicit comment naming it the single sanctioned exception to I5.
   T13 does **not** attempt to silence the interior.
3. **Q5 — the Java fork's uncommitted state.** Carried forward from T20b and still open: the
   five movement fixes exist only as working-tree edits on `450193e4` plus the patch snapshot
   at `/Users/nielspfeffer/Projects/mpmify/ml/patches/meico-movement-fixes-on-450193e4.patch`
   (sha256 `3c5fc1b2…`). Not this document's business, but it gates any future regeneration,
   and RULE I5 adds a second thing to remember about the fork (leave its
   `movementSampleMaxStep` static at its default).
4. **Q6 — `duration.perf` is not exposed by the facade** (raised by the T12 verifier's
   contract check). `PerformedNote.date`/`.duration` are **symbolic** ticks, so a consumer
   cannot derive an articulation ratio except indirectly through the millisecond fields.
   Adding `datePerf`/`durationPerf` (from the MSM's `date.perf` / `duration.perf`) is cheap
   and additive. **Architect's recommendation: add them** — the ML consumer that asked for
   this batch path is exactly the sort that wants the performed-tick domain. Not a blocker:
   if the conductor says no, T13 ships without them and §2.3 records the omission as
   deliberate rather than forgotten.
