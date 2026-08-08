# meico-ts — Target Architecture (T12)

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
L0  src/units.ts              brands; type-only, emits nothing            (NEW, T13/T19a)
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

**RULE M2 (Helper dissolves).** `src/mei/Helper.ts` ceases to exist as a class. Its 44
statics are distributed by the table in §8.2 (T14). The dissolution is what removes all 33
`mpm → mei` edges: the seven members the MPM/MSM/MIDI layers actually use
(`getAttribute` ×150, `getAttributeValue` ×27, `getFirstChildElement` ×18,
`addToListAttribute` ×14, `getAllChildElements` ×11, `getFilenameWithoutExtension` ×1,
`addUUID` ×1) all land in L1.

**RULE M2a (there are TWO navigation implementations, and T14 must not merge them).**
`src/msm/Msm.ts` carries its own **module-local** copies of eight of these helpers —
`getAttribute`, `getAttributeValue`, `getFirstChildElement`, `getAllChildElements`,
`getNextSiblingElement`, `cloneElement`, `getFilenameWithoutExtension`, `addUUID`
(`Msm.ts:25-175`). T9 established that the two sets have **behaviourally drifted**:
`mei/Helper.getAllChildElements` uses an XPath `child::*[local-name()=…]` where the `Msm.ts`
copy uses `getChildElements(name)`, and those can disagree on namespaced children;
`cloneElement` differs from Java in both copies, in *different* shapes. The file's own class
comment warns against deduplicating them on sight.

**Ruling: T14 moves `mei/Helper`'s members and leaves `Msm.ts`'s module-locals exactly where
and as they are.** Merging them is not a move — it is a behaviour change on the
byte-compared serialization path, and T9's note is right that it owes a *per-method
behavioural* comparison, not a textual one. Recommend a dedicated later item (§8.1 note) that
does that comparison with a purpose-built probe per method. Until then the duplication stays
and stays commented.

Useful corroboration for RULE N2b, though: `Msm.ts`'s copies of `getAllChildElements` and
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

**RULE M4 (registration stays, and stays explicit).** `GenericMap.registerMapFactory` is the
right pattern and does not change. `Mpm.ts` keeps its nine side-effect imports; T18 replaces
them with one `import './elements/maps/index.js'` barrel whose only job is to run the
registrations, with a comment saying so. A worker must not convert the registry to a
`switch` — that would re-create the cycle in a different shape.

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

### 2.3 Field mapping for `extractPerformanceData`

Read from the augmented MSM, which is the same document the equivalence fixtures compare, so
every field below is already proven against Java:

| facade field | MSM source |
|---|---|
| `parts[].name` / `.midiChannel` / `.midiPort` | `<part name= number= midi.channel= midi.port=>` |
| `notes[].id` | `<note xml:id=>` |
| `notes[].pitch` | `<note midi.pitch=>` |
| `notes[].date` / `.duration` | `<note date= duration=>` (symbolic ticks) |
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
reference to the two render entry points that need it — `MovementMap.renderMovementToMap(ctx)`
and `ImprecisionMap.renderImprecisionToMap(map, shakePolyphonicPart, ctx)`. Nothing is stored
on a class, a module, or `globalThis`.

Inside `ImprecisionMap.renderImprecisionToMap`, the seed decision becomes exactly:

```ts
if (dd.seed !== null) random.setSeed(dd.seed);                        // unchanged, MPM wins
else if (ctx?.options.seed !== undefined)                             // new branch only
  random.setSeed(deriveSeed(ctx.options.seed, ordinal, impIndex));
// else: leave the constructor's Math.random() seed — today's behaviour, untouched
```

with `deriveSeed` a pure integer hash (`h = Math.imul(h ^ p, 0x27d4eb2d) >>> 0`, never 0),
and `ordinal = ctx.streamOrdinal++` taken once per `renderImprecisionToMap` call. The ordinal
is order-dependent, which is exactly right: for identical input and options the call order is
fixed, so the derived seeds are reproducible; and it needs no counter that outlives the call.

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
> when `options.seed` is undefined and prove (a) goes red.

---

## 3. Null-vs-undefined policy

The tree carries **1080** `no-non-null-assertion` violations. They are a symptom: the port
maps Java's implicitly-nullable returns to honest `T | null` types and then asserts `!` at
every call site. The cure is narrowing *return types*, never bulk-deleting `!` and never
bulk-adding guards.

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
  guarded case, delete the guard and drop `| null` from the return type. The known instance,
  flagged by T10: `Helper.getAllChildElements` is typed `Element[] | null` but returns null
  only for a null element or an empty name string (`Helper.ts:123,129`); at all 8 call sites
  in the mei cluster the null is unreachable. Under the new signature
  `allChildElements(parent: Element, name?: string): Element[]` — always an array, empty when
  nothing matches — a large family of dead guards deletes itself repo-wide. Apply the same
  test to every moved function; do not apply it anywhere the guard tests a *value* rather
  than the parameter's nullness.

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
(verified). This retires the ~211 `this.getXml()!` sites that T6 (61) and T7 (150) both
deferred to T12 — and it needs **no test edits**: the name and arity are unchanged, and the
16 test sites that assert `expect(x.getXml()).not.toBeNull()` still compile and still pass.

**RULE N4 (facade output has no `undefined`).** In `src/api/types.ts`, every field of every
*output* type is always present; absence is `null`. Every *input* option is `?:` and is never
`null`. Reason: `JSON.stringify` silently drops `undefined` properties, so an output type
containing `undefined` is not round-trip stable under JSON and fails RULE F1's second test.
This is mechanically checkable — grep `src/api/types.ts` for `?:` and confirm every hit is
inside an `*Options` or `*Input` type.

**RULE N5 (`x == null` stays; the lint rule bends).** All 44 `eqeqeq` violations are the
`x == null` idiom and all 44 are in `Helper.ts`. In TypeScript that is the *correct*
idiomatic test for "null or undefined", and it is load-bearing here because the XOM layer
returns `null` on some paths and `undefined` on others. **T14 relaxes the rule to
`['error', 'always', { null: 'ignore' }]` and edits not one comparison.** Any worker who
"fixes" a `== null` to `=== null` has introduced a bug.

### Migration ownership

| item | applies |
|---|---|
| **T14** | N2a + N2b to the functions it moves out of `Helper`; N5's config change |
| **T16** | N3's `getXml()` narrowing and the `!` deletions it enables across `mpm/elements/**`; N1 to every signature it rewrites |
| **T13** | N4 |
| **T15** | N1/N2 opportunistically inside the converter — but never as part of a dispatch-table hunk |
| **T21** | audits: `no-non-null-assertion` count must be strictly below 1080 and journaled |

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
> `AbstractXmlSubtree` subclass, showing each construction path assigns before returning.
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
exactly the three remaining `no-extraneous-class` sites: `Helper` (44 statics, 0 instance
members — T14), `EventMaker` (T20), `Meico` (→ `export const VERSION`, T14). **After T20,
`@typescript-eslint/no-extraneous-class` must be 0 and stay 0** — that is the measurable form
of this rule.

**RULE C3 (`*Data` holders stay classes; their arithmetic leaves).** `TempoData`,
`DynamicsData`, `MovementData`, `ArticulationData`, `OrnamentData`, `RubatoData`,
`MetricalAccentuationData`, `DistributionData` stay classes: they parse from XML, they carry
lazily-computed private memos (`MovementData.x1`/`x2`), and their methods hold
parity-critical arithmetic. What changes (T16) is that the *duplicated* arithmetic moves into
one pure module:

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
`readonly [K, V]` tuple. T4 established there are only **8** mutating sites:
`GenericMap.ts:136`, `ImprecisionMap.ts:437,474,480` (`setKey`), `RubatoDef.ts:181,189`
(`setKey`), `RubatoDef.ts:185,190` (`setValue`). For each, T16 either rewrites it to construct
a fresh tuple, or journals why it cannot and keeps a local mutable pair. `KeyValue` is deleted
from `src/` only if all 8 go; either way it never appears in a *new* signature and never
crosses the facade (RULE F6). When grepping: `.setValue(` has 124 hits in `src/`, and all but
two are `Attribute.setValue` from XomTypes.

---

## 5. Immutability policy

The charter's directive, made operational.

**RULE I1 (the five mutation boundaries — this list is exhaustive).** Mutation of an object
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

**RULE I2 (outside those five: no argument mutation).** Any exported function outside the
five boundaries that assigns to a parameter, or to a property or element of a parameter, is a
violation. `no-param-reassign` is at **5 warnings**; T21 drives it to 0 and promotes it to
`error`.

**RULE I3 (facade guarantees).** (a) The facade never mutates its inputs — free, because
inputs are strings (RULE F2). (b) Every facade return value is freshly allocated: two calls
with equal inputs return values that are `!==` at every level (F1's referential test).
(c) Every facade return value survives `structuredClone` unchanged (F1's clone test).

**RULE I4 (`readonly` where it is free — and where it is not).** Apply: `readonly` on private
fields never reassigned after construction (`prefer-readonly`, ~17 repo-wide per T4's
re-measurement — target 0 by T21); `readonly T[]` / `ReadonlyMap` on **parameters and return
types** that are only read; `as const` on static data tables — `InstrumentsDictionary`
currently has **zero** `as const` and is the main candidate (T20).
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
default is unchanged and every fixture is generated with it. Record it in the parity ledger
(§6.3), and record the corollary: anyone regenerating fixtures from Java must likewise leave
the Java static at its default.

Owner: **T19a** (see §8.1). Audit: after T19a, `grep -rnE "^\s+(private |protected |public )?
static [a-zA-Z_]" src | grep -v "static readonly" | grep -v "static [a-zA-Z0-9_]*("` must
return nothing. T21 re-runs it.

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
does not reach. Parity beats correctness — the charter says so and three items have already
deferred to this ruling.

The one sanctioned exception is the `require*` accessor family (N2a) and the `getXml()`
narrowing (N3), each with its own gate above, and each justified by *provable
unreachability*, not by taste.

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

Four malformed-input divergences from Java are recorded across `log.md` and belong to this
policy. **All four stay frozen in Phase 3.** T22 writes them into a `PARITY.md` /
README section; each fix needs its own item and user sign-off because each changes behaviour.

| # | divergence | where | why frozen |
|---|---|---|---|
| P1 | `parseFloat` yields `NaN` where Java's `Double.parseDouble` **throws**, so a malformed `value="abc"` produces a `NaN`-valued def that is *kept*, where Java's factory returns null and the style skips it | every `parseFloat` in the port; found in `TempoDef`, `DynamicsDef`, `RubatoDef`, `AccentuationPatternDef`, all 12 `ArticulationDef` attributes (T6) | codebase-wide, no fixture exercises it, fixing it changes output on malformed input |
| P2 | `getPreviousPosition` yields 0 where Java throws NPE on a `<movement>` with no `transition.to` | `MovementMap` (T7) | same family as P1 |
| P3 | **`ArticulationData.articulateNote`'s `absoluteDurationChange` branch is a non-terminating loop** on any note with positive `duration.perf`, reproduced verbatim from Java | `ArticulationData` (T7) | see below — this one is different |
| P4 | `RandomNumberProvider.getValue(NaN)` recurses to stack overflow; `getValue(Infinity)` hangs | `RandomNumberProvider` (T4) | present identically in the baseline; bug-for-bug per charter |

> **RECOMMENDATION TO THE CONDUCTOR (P3).** P1, P2 and P4 are quality-of-implementation
> issues on malformed input. **P3 is different in kind**: a *well-formed* MPM using
> `<articulation absoluteDurationChange="…">` on a normal note hangs the renderer with no
> output and no error. The one-character fix (`>=` → `<=`) matches Java's own comment and
> matches `ArticulationDef`'s spelling. It is still a behaviour change ("hang" → "produce
> output"), so it needs its own item and the user's sign-off — but it is the only known input
> that makes the library unusable, and the facade is about to be adopted downstream.
> **Raise it with the user now**, alongside the other three, rather than at T22.

---

## 7. Unit and type discipline

The failure this prevents actually happened: `MovementData.getMovementSegment` takes
`position` in a normalized 0..1 domain and returns values scaled ×127, so the sampling
threshold `maxStepSize` means one thing going in and another coming out. Fixtures generated
against a 0..127 input subdivided ~1270 times too often and stored **16129 = 127 × 127** —
double-scaled. It cost a ground-truth regeneration (T20b) to find.

**RULE U1 (compile-time brands, zero runtime).**

```ts
// src/units.ts — leaf module. Emits nothing.
declare const brand: unique symbol;
type Branded<Name extends string> = number & { readonly [brand]: Name };

export type Ticks        = Branded<'ticks'>;       // symbolic MSM/MPM time
export type Milliseconds = Branded<'ms'>;          // performance time
export type Normalized   = Branded<'normalized'>;  // 0..1
export type Midi7Bit     = Branded<'midi7'>;       // 0..127
export type Bpm          = Branded<'bpm'>;
```

**RULE U2 (no runtime converters).** There are **no** `asTicks(n)` helper functions —
a helper function *emits*, and then "type-level only" can no longer be proven by a zero-line
emitted-JS diff. Construction uses an `as` cast at the (few) sites where a raw number becomes
a branded one: `parseFloat(attr.getValue()) as Ticks`. `as` erases completely.

**RULE U3 (where brands apply — and only here).**

- **(a) the facade's plain-data types**: `PerformedNote.date`/`.duration` (`Ticks`),
  `.milliseconds.date`/`.end` (`Milliseconds`), `.velocity`/`.pitch` (`Midi7Bit`),
  `ControlChangePoint.value` (`Midi7Bit`), `PerformOptions.movementSampleMaxStep`
  (`Normalized`);
- **(b) the four declarations the confusion actually bit**: `MovementData.position` and
  `.transitionTo` (`Normalized | null`), `MovementData.getMovementSegment(maxStepSize:
  Normalized): readonly (readonly [Ticks, Midi7Bit])[]`,
  `DynamicsData.getSubNoteDynamicsSegment`, and
  `DEFAULT_MOVEMENT_SAMPLE_MAX_STEP: Normalized`.

**RULE U4 (where brands must NOT apply).** Nowhere inside the parity-frozen arithmetic.
Branding a value forces an `as` at every arithmetic site, and the files where that churn
would land — `Performance.perform`, the render loops, `computeDuration`, `computePitch` — are
exactly the files where a reviewer must be able to scan for arithmetic changes. If applying a
brand to a declaration would require more than ~5 `as` casts elsewhere, do not apply it;
document the unit in the JSDoc instead. (Rejected alternatives: runtime value objects —
allocation in hot loops, forbidden by the charter; JSDoc-only conventions — unenforced, which
is how the 16129 bug survived.)

> **EQ-RISK (U1–U4).** None, *if* the rules are followed — which is why the gate is a bright
> line. **GATE: a zero-line emitted-JS diff.** If `diff -r dist/` is non-empty after a
> branding change, a runtime construct crept in (almost certainly a converter function
> against RULE U2); revert it. The `.d.ts` diff will of course be non-empty — that is the
> point of the change.

---

## 8. Item mapping (T13–T21) and resequencing

### 8.1 Recommended order

The conductor decides; this is the architect's recommendation, with reasons.

```
T14  →  T18  →  T19a  →  T13  →  T16  →  T15  →  T17  →  T19  →  T20  →  T21
```

Two changes to the queue's current order:

1. **T14 and T18 move ahead of T13.** T14 is what removes all 33 `mpm → mei` edges; T18 is
   what removes the `Mpm ⇄ GenericStyle` cycle. A facade barrel published *before* those is a
   facade whose import order is load-bearing — the exact hazard the charter warns about —
   and every consumer inherits it.
2. **A new small item T19a is split out of T19 and run before T13.** T13's contract includes
   the imprecision seed and (via `PerformOptions`) the movement sampling step; both need the
   `RenderOptions`/`RenderContext` plumbing of §2.4. Putting that plumbing in T19 would either
   block T13 behind the largest remaining item or force T13 to ship options it cannot honour.

> **T19a — render options plumbing** *(new, recommended)*
> Add `src/mpm/RenderOptions.ts`; thread an optional `RenderContext` from
> `Performance.perform` into `MovementMap.renderMovementToMap` and
> `ImprecisionMap.renderImprecisionToMap`; implement RULE F7's seed branch; delete the
> `MovementMap.movementSampleMaxStep` mutable static per RULE I5. No other file changes.
> Gates: §2.4's EQ-RISK block and §5 RULE I5's.

The rest of the order is dependency-driven: T16's `getXml()` narrowing (N3) touches the same
files T15 must restructure, so doing T16 first means T15 diffs against already-clean code;
T17 is scoped down (below) and independent; T19 and T20 are the last behaviour-adjacent
items; T21 audits everything.

> **T16b — reconcile the two XML-navigation implementations** *(new, recommended, low
> priority — after T16, or defer past Phase 3)*
> Per RULE M2a, `src/msm/Msm.ts` keeps eight module-local copies of navigation helpers that
> have behaviourally drifted from `mei/Helper`'s. Merging them onto `src/xml/tree.ts` needs a
> **per-method** behavioural comparison — a probe that feeds both implementations the same
> element trees, including namespaced children and elements with same-local-name children in
> different namespaces, and requires identical results before either is deleted. Any method
> where they differ stays duplicated, with the difference documented. This is genuinely
> optional: the duplication costs ~150 lines and no correctness, and the merge touches the
> byte-compared serialization path. Recommend scheduling it only if Phase 3 finishes early.

### 8.2 T14 — dissolve `Helper`

Pure moves and renames; **no logic edits** except the two mechanical rules N2b (delete a guard
whose condition the parameter type excludes) and RULE M6. `src/msm/Msm.ts`'s eight
module-local navigation helpers are **out of scope and untouched** — see RULE M2a. The full
44-member disposition:

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

Measured input for T21 while T14 is in there: **17 of `Helper`'s 40 public statics have zero
`src/` callers** — they are reached only from `tests/`. Namely `validateAgainstSchema(String)`,
all four XSLT members, `writeStringToFile`, `prettyXml`, `duration2word`,
`decimalDuration2HtmlUnicode`, `accidString2word`, `accidDecimal2unicodeString`, `midi2pname`,
`getClosest`, `getClosestByAttr`, `getAllPreviousSiblingElements`,
`updateMpmNoteidsAfterResolvingRepetitions`. **T14 moves them all and deletes none.**

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

Implements §2 in full, plus RULE N4 and RULE I3. Integration tests may switch to the facade
**only mechanically** and only if the switch is genuinely mechanical; otherwise leave them
calling the classes — the facade is additive and does not need them as proof. New unit tests
for: F1's three plain-data tests, F7's determinism trio, E2/E3's error cases, and the field
mapping of §2.3 against a known augmented-MSM fixture.

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

Applies N3 (the `getXml()` narrowing and the ~211 `!` deletions it enables), C3 (the shared
`bezier` module), C4, C6 (`KeyValue` → tuples), I4 (`readonly`, `prefer-readonly` → 0 in this
cluster), and the four deduplications already scouted:

- `GenericStyle.parseDefs<D>(childName, create)` collapses ~30 lines per file across the 6
  style subclasses (T6's finding);
- `GenericMap.resolveEntry(index, localName)` + `findStyleNameAt(index)` remove ~14 duplicated
  lines from each of the 8 `getXDataOf` accessors (T7's finding);
- `setId`/`getId`/`getName`/`setName` are byte-identical in `GenericStyle` and `AbstractDef`,
  with two further near-copies in `TemporalSpread`/`DynamicsGradient` that are not even in the
  `AbstractXmlSubtree` hierarchy — one shared base or mixin removes four copies (T6);
- `TemporalSpread` and `DynamicsGradient` move out of `defs/OrnamentDef.ts` into their own
  modules (importing either currently drags `OrnamentDef` in) — an import-graph change, so
  coordinate with T18.

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
| `XmlBase.fixDuplicateIds` (0 callers) | delete |
| `XomTypes.Element.setNamespaceURI` (dead after T11) | delete |
| `EventMaker.byteToShort` (0 callers beyond its test) | delete |
| `Msm.getMinimalPPQ` (0 `src/` callers after T9b fixed it) | **keep** — T9b just corrected it against Java and pinned it with tests; deleting it discards that work |
| the ms-domain ornament renderer (dead per T7's verifier) | **keep, and mark.** It is a Java-parity code path; deleting it makes a future parity comparison harder. Add a comment saying no fixture reaches it |

Audits T21 runs: `no-extraneous-class` = 0; no non-`readonly` static fields in `src/`;
`no-param-reassign` = 0 and promoted to `error`; `prefer-readonly` = 0; `import/no-cycle`
clean; `no-non-null-assertion` strictly below 1080 with the delta journaled; coverage per
charter invariant 7; `vitest.config.ts`'s include list updated for the moved paths
(mechanical only — and note that `src/api/**`, `src/music/**`, `src/xml/**` must be **in**
scope, `src/compat/**` deleted).

---

## 9. Equivalence-risk summary

Every policy above with a non-trivial drift risk, in one table, so a conductor can check that
the applying item produced the right evidence.

| policy | drift risk | required gate |
|---|---|---|
| M2/M3 module moves | module evaluation order changes; cycle failure relocates | emitted-JS classification (bodies byte-identical modulo wrapper) + pipeline byte-probe + deep-import negative control both directions |
| M2a merging the two navigation implementations | they disagree on namespaced children; the difference reaches serialized bytes | **forbidden in T14.** If ever done (T16b): per-method differential probe over namespaced trees + full byte-probe; any disagreeing method stays duplicated |
| F7 seed plumbing | new branch could apply when no seed is given | deterministic-fixture byte-probe + structural check on imprecision fixtures + determinism trio + negative control |
| I5 `movementSampleMaxStep` | optional param dropped on one branch | default-path byte-probe + positive test that a non-default step changes the `positionMap` event count + negative control |
| N2a `require*` accessors | `TypeError` → typed throw on unreachable paths | per-site unreachability argument + byte-probe + forced-throw negative control |
| N3 `getXml()` narrowing | same, ×211 sites | global `setXml(null)` check + per-subclass construction audit + emitted-JS classification of every deleted guard + negative control |
| C3 shared Bézier module | float reassociation while moving arithmetic | full byte-probe + 10⁴-triple bit-identity probe incl. sign of zero + reassociation negative control |
| U1–U4 branded units | a runtime converter creeping in | **zero-line emitted-JS diff** |
| T15 dispatch table | a case silently changes descend/finish | mechanical dispatch census, zero-line diff before vs after + per-group verify + case-flip negative control |
| T17 XomTypes parse removal | serialization bytes change | full-suite byte equality + recorded runtime measurement |
| T20 `as const` + EventMaker | MIDI event order / byte layout | midi-byte-equivalence suite + `Uint8Array` hash probe |
| T18 `Mei.exportMsmMpm` starts working | "throws" → "works" | journal it explicitly; do not bury it in a cleanup hunk |

---

## 10. Open questions for the conductor

1. **Q1 — facade field naming** (§2.3): nested `milliseconds: { date, end }` versus flat
   `millisecondsDate`/`millisecondsDateEnd`. Confirm with the mpmify consumer if cheap;
   **default is nested** so T13 is not blocked.
2. **Q2 — P3, the articulation hang** (§6.3): recommend raising all four parity divergences
   with the user **now**, and P3 with priority — it is the only known well-formed input that
   makes the library unusable, and a downstream project is about to adopt the facade. Needs
   its own item and sign-off; not Phase-3 work under the current charter.
3. **Q3 — logging.** The interior `console.log`s verbosely on every conversion and every
   `perform` (part-by-part). That is user-hostile for a library and there is no way to
   silence it. Threading a logger through ~100 call sites contradicts nothing but costs a
   lot; a module-level `setLogger` in a leaf `src/logging.ts` contradicts RULE I5's "no shared
   mutable statics" in letter, though it affects only diagnostics and never rendered output.
   **Architect's recommendation:** defer to T22, and if it is done, do it as the leaf
   `setLogger` with an explicit comment naming it the single sanctioned exception to I5.
   T13 does **not** attempt to silence the interior.
4. **Q4 — T19a.** Approve or reject the new item (§8.1). If rejected, T13 must ship
   `PerformOptions.seed` and `.movementSampleMaxStep` as accepted-and-ignored (bad) or T13
   must wait for T19 (slow). T19a is small and de-risks T19.
5. **Q5 — the Java fork's uncommitted state.** Carried forward from T20b and still open: the
   five movement fixes exist only as working-tree edits on `450193e4` plus the patch snapshot
   at `/Users/nielspfeffer/Projects/mpmify/ml/patches/meico-movement-fixes-on-450193e4.patch`
   (sha256 `3c5fc1b2…`). Not this document's business, but it gates any future regeneration,
   and RULE I5 adds a second thing to remember about the fork (leave its
   `movementSampleMaxStep` static at its default).
