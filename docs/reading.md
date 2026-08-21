# Reading an MPM as data

> Back to the [README](../README.md).

The rest of espressivo's API takes documents in and gives documents or MIDI back. This guide is
for the other job: you already have an MPM, and you want to **show it** — draw its instructions
on a timeline, chart what one `<tempo>` does across its span, tell a user what they clicked on.

For that, the entry point is not the facade but the **object model**: `Mpm` and the classes
below it, exported from the package root since 0.9. The methods were always public; what
changed is that their types are nameable, so you can hold a `Performance` or a `Tempo` in a
typed field without deep-importing past `dist/`.

## The one sentence to read first

**The numbers here are the renderer's.** `tempoAt`, `dynamicsAt` and the `get*DataOf`
accessors are the same code paths `renderExpressiveMidi` runs — shared with it, not
reimplemented beside it. If you chart from them, the chart and the audio cannot disagree.

That makes them a **different object** from the curves `compareMpm` integrates. Those live in
`src/comparison/` and are deliberately the _ideal_ mathematical curve, because a metric needs
something smooth to integrate ([`comparison.md`](comparison.md) §5.0 rule 3). The renderer's
own resolution is a staircase that approximates it to within one tick. Both are correct; they
answer different questions. **If you are drawing what a listener will hear, you want this
guide. If you are measuring how far apart two performances are, you want `compareMpm`.**

## The shape of a document

```
Mpm
└── Performance            getPerformance(i) / getPerformanceByName(name) / getAllPerformances()
    ├── Global             getGlobal()
    │   ├── Header         getHeader()   — styleDefs: what "forte" and "Allegro" mean
    │   └── Dated          getDated()    — the instruction maps
    └── Part[]             getAllParts() / getPart(number)
        ├── Header
        └── Dated
```

A part's maps **shadow** the global ones of the same name — a part with its own `dynamicsMap`
ignores the global one entirely, rather than merging with it. So resolving "the dynamics map
governing part 0" means: look in the part, fall back to global.

```ts
import { Mpm, DYNAMICS_MAP } from 'espressivo';

const performance = new Mpm(mpmText).getPerformance(0)!;
const part = performance.getPart(1)!;
const dynamics =
  part.getDated()?.getMapOfKind(DYNAMICS_MAP) ??
  performance.getGlobal()?.getDated()?.getMapOfKind(DYNAMICS_MAP) ??
  null;
```

`getMapOfKind` is typed: `getMapOfKind(DYNAMICS_MAP)` gives you a `DynamicsMap`, with
`getDynamicsDataOf`, rather than a bare `GenericMap`. It is a _checked_ narrowing, not a cast —
it answers null for an element that parsed as a plain `GenericMap`.

## Taking an inventory

`GenericMap` is the whole read surface for any map, known kind or not:

| method                                           | what it answers                                              |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `size()`                                         | how many dated entries                                       |
| `getAllElements()`                               | every entry as `{ key: date, value: Element }`, in map order |
| `getElement(i)`                                  | the element at index `i`                                     |
| `getElementByID(id)` / `getElementIndexByID(id)` | the entry carrying that `xml:id`                             |
| `getElementBeforeAt(date)`                       | the last entry at or before `date` — style switches skipped  |
| `getStyleAt(date, kind)`                         | the `<styleDef>` in force, local header first, global second |
| `getType()`                                      | `'tempoMap'`, `'imprecisionMap.timing'`, …                   |

So an inventory across every map of every environment is a walk, not an API you need from us:

```ts
for (const environment of [performance.getGlobal(), ...performance.getAllParts()]) {
  for (const [name, map] of environment?.getDated()?.getAllMaps() ?? []) {
    for (const { key: date, value: element } of map.getAllElements()) {
      element.getLocalName(); // 'tempo' | 'dynamics' | 'style' | …
      element.getAttributeValue('id'); // xml:id, or null
      date; // parseFloat(@date)
    }
  }
}
```

**`getAllMaps()` is kind-erased**, so that walk holds `GenericMap` and cannot reach
`getTempoDataOf`. Narrow with `mapOfKind`, which is `getMapOfKind`'s other door — same checked
test, but applied to a map you already hold rather than looked up by name:

```ts
import { mapOfKind, TEMPO_MAP } from 'espressivo';

for (const [name, map] of environment?.getDated()?.getAllMaps() ?? []) {
  const tempo = mapOfKind(map, TEMPO_MAP); // TempoMap | null
  if (tempo !== null) tempo.getTempoDataOf(0);
}
```

`map instanceof TempoMap` is equivalent — `mapOfKind` is that same test behind a `MapKind` key
— so use whichever reads better; the point is that both are checked, and neither is a cast.

The one case where the class test decides nothing: the five `imprecisionMap.*` kinds all parse
to `ImprecisionMap`, so neither `mapOfKind` nor `instanceof` can tell timing from tuning. Their
domain is the map's **name**, not its class — which the walk above already hands you as the key
of `getAllMaps()`, and which `getType()` answers for a map you hold on its own.

Three things that walk will teach you, all worth knowing before you design around them.

**A map contains `<style>` switches as well as instructions.** They are dated entries like any
other and they show up in `getAllElements()`. Filter on `getLocalName()`; do not assume every
entry is an instruction.

**Most MPM in the wild carries no `xml:id` at all.** Of the 24 reference documents in this
repository, 15 have zero — `@xml:id` is optional in MPM and the MEI converter only emits one
where the source had one. A viewer whose selection model is _only_ `xml:id` will silently fail
to select anything on those documents. Use `(container, index)` as the load-bearing locator and
treat `xml:id` as the nicety it is; this is exactly the reasoning behind `SiteRef` in the
expression engine, which orders its fields the same way.

## One instruction, resolved

`get*DataOf(index)` is where an element becomes arithmetic. It resolves the style-relative name
(`volume="forte"` → a number, through the `<styleDef>` in scope), fills in every absent
attribute with the renderer's default, and closes the span against the next instruction of the
same name:

```ts
import { Mpm, TEMPO_MAP, tempoAt } from 'espressivo';

const map = performance.getGlobal()!.getDated()!.getMapOfKind(TEMPO_MAP)!;

for (let i = 0; i < map.size(); ++i) {
  const tempo = map.getTempoDataOf(i); // Tempo | null — null where the renderer SKIPS it
  if (tempo === null) continue;

  tempo.kind; // 'constant' | 'transitioning' — a real sum type, not a nullable bag
  tempo.bpm; // @bpm resolved to a number
  tempo.bpmString; // @bpm as written — 'Allegro', for printing back to the user
  tempo.beatLength; // @beatLength: 0.25 is a quarter, so bpm counts quarters
  tempo.startDate; // ticks
  tempo.endDate; // ticks, or Number.MAX_VALUE where nothing follows
}
```

`Tempo` is `ConstantTempo | TransitioningTempo`, and that is load-bearing: only the
transitioning arm has `transitionTo`, `meanTempoAt` and `exponent`, so there is no arm on which
you can read a field that isn't there. Narrow on `kind` and the compiler does the rest.
`Dynamics` is a single record instead, for a documented reason — constant-ness is a predicate
over its values (`isConstantDynamics`), not a structural fact, because the sub-note sampler
draws a Bézier for constant spans too, and it just comes out flat.

To chart it, sample. Note the first line: **the last instruction of a map has an `endDate` of
`Number.MAX_VALUE`**, so every consumer drawing one needs a finite window of its own choosing.
A quarter note or a bar are both defensible; what matters is that you pick one rather than
letting `MAX_VALUE` into the arithmetic, where it turns the whole span into a single pixel.

```ts
/** A drawable end for a span that runs to the end of time. */
const spanEnd = (instruction: { startDate: number; endDate: number }, fallbackTicks: number) =>
  instruction.endDate === Number.MAX_VALUE
    ? instruction.startDate + fallbackTicks
    : instruction.endDate;

const end = spanEnd(tempo, performance.getPulsesPerQuarter());
const points = Array.from({ length: 100 }, (_, k) => {
  const date = tempo.startDate + ((end - tempo.startDate) * k) / 99;
  return [date, tempoAt(tempo, date)] as const;
});
```

`tempoAt(tempo, date)` gives **bpm counted in the instruction's own `@beatLength`** — the
number the document says and the user recognises. Multiply by `beatLength * 4` if you want it
normalized to quarter-note bpm. `dynamicsAt(d, date)` is the sibling for dynamics, and
`positionAt(m, date)` for `<movement>` (pedalling).

For dynamics you also get the Bézier already derived: `d.x1` and `d.x2` are the inner control
points' x-positions, computed once from `@curvature` and `@protraction` and clamped on the way
in. `innerControlPointsXPositions(curvature, protraction)` is exported too if you want the
geometry without an instruction, and `sampleSegment` is the renderer's own adaptive subdivision
if a fixed 100 points is the wrong grid for a long ramp.

## Three renderer behaviours a hand-rolled reader gets wrong

These are not edge cases; the first one fires on the last instruction of nearly every real
document.

**1. A trailing transition is inert.** The span-end of the last `<tempo>` in a map is
`Number.MAX_VALUE`, so the fraction of the way through the span is ~0 for every real date and
the tempo never leaves `@bpm`. This repository's own `all_maps.mpm` ends with
`bpm="120" transition.to="90"` and performs a flat 120 — reading it as a ritardando would
invent the most audible gesture in the file. `<dynamics>` behaves identically. `tempoAt` and
`dynamicsAt` already account for this; a `lerp(from, to, u)` of your own would not.

This reaches further than the curve. **Label a chart's endpoints with what the instruction
performs there, not with `@transition.to` as written** — `tempoAt(tempo, end)` rather than
`tempo.transitionTo`. On an inert trailing transition the attribute says 90 and the performance
says 120, and a label reading the attribute announces a ritardando the listener will never
hear. The two agree everywhere else, so this costs nothing to get right.

**2. A skipped instruction is not a gap in the previous one.** `getTempoDataOf` returns null
when `@bpm` or `@beatLength` is absent, and the renderer then times the following notes at
MPM's no-tempo default of **100 quarter-bpm** — it does not extend the previous instruction.
The same applies to a `<dynamics>` with no `@volume`, which pins its notes to velocity 100.
Where you `continue` past a null, draw the default, not a held value.

**3. An unresolvable name is a number, not an absence.** `volume="-"` with no matching
`<dynamicsDef>` does not fail; it logs and performs **100.0**. So `Dynamics.volume` is always a
number and you never have to render "unknown" — but if you want to _show_ that the document is
broken, compare `volumeString` against what it resolved to, because the resolved value alone
cannot tell you.

## Metrical accentuation, which needs its def

An `<accentuationPattern>` carries only a `@name.ref`; the pattern and its length live on the
`<accentuationPatternDef>` in the header. `getMetricalAccentuationDataOf(i)` does that lookup
for you and hands back the def itself:

```ts
const md = accentuationMap.getMetricalAccentuationDataOf(i);
md?.accentuationPatternDef?.getLength(); // @length, in beats
md?.accentuationPatternDef?.getAccentuationAt(beat);
md?.loop; // does it repeat past its own length?
md?.endDate; // the next <accentuationPattern>, or MAX_VALUE
```

If you are computing which notes a pattern covers, the renderer's rule
(`MetricalAccentuationMap.ts:167`) is:

```
covered  ⟺  date < md.endDate  AND  (md.loop  OR  date < md.startDate + patternLengthTicks)
patternLengthTicks = def.getLength() * 4 * ppq / timeSignatureDenominator
```

Note both halves. `@length` is in **beats relative to the time-signature denominator**, not in
ticks — the tick conversion needs the ppq _and_ the denominator in force, so `length * 720` is
right only at 720 ppq in a `/4` metre. And the next instruction bounds the span regardless of
length or loop.

## What this is not

**Not free for a browser bundle.** The object model is a connected graph of classes — a map
reaches its styles, which reach their defs — so importing one entry point pulls in far more
than the four facade functions do. A real migration measured **~384 kB → ~408 kB gzip** when it
moved from a plain-data reader to this API. That is the honest price of reading through the
renderer's own code instead of a parallel implementation of it, and for that consumer it was
not a close call: the same change fixed a whole instruction type that had been silently
returning nothing. But if your consumer only ever converts and renders, stay on `src/api/**`,
which is much smaller.

**Not a plain-data boundary.** These types hold live XOM `Element`s and are outside RULE F1 —
`structuredClone` will not carry a `Performance` to a worker. The resolved records (`Tempo`,
`Dynamics`, `Movement`, `Rubato`, `MetricalAccentuation`) _are_ plain readonly fields and do
survive the trip; the classes they came from do not. If you need plain data across a boundary,
that is what `src/api/**` is for.

**Not byte-faithful to your input.** `new Mpm(text)` repairs as it parses — every map is
re-sorted by date, `rubatoDef` gains attributes, `accentuationPatternDef` gains `length="4"`
where it declared none. Serializing it back gives you a normalized document, not the one you
passed in. Where that matters — a diff, a round trip, anything asserting on bytes — use
`canonicalMpm` or the expression facade, which parse without repairing for exactly this reason.

**Not a parity claim.** Nothing here is new behaviour, so nothing here is new risk: these are
the accessors the byte-equivalence suite already drives on every fixture. `PARITY.md` is
unchanged by this guide.

## Reference

Exported from the package root:

- **Navigation** — `Mpm`, `Performance`, `Global`, `Part`, `Header`, `Dated`, `Metadata`
- **Maps** — `GenericMap` and `TempoMap`, `DynamicsMap`, `ArticulationMap`, `MovementMap`,
  `RubatoMap`, `MetricalAccentuationMap`, `AsynchronyMap`, `ImprecisionMap`, `OrnamentationMap`;
  plus `MapKind`, `MAP_KINDS`, `isMapKind`, `mapOfKind`
- **Styles and defs** — `Style`, `StyleKind`, `styleOfKind`, `numericBpmValue`,
  `numericDynamicsValue`; `TempoDef`, `DynamicsDef`, `ArticulationDef`, `RubatoDef`,
  `AccentuationPatternDef`, `OrnamentDef`, `TemporalSpread`, `DynamicsGradient`
- **Resolved instructions** — `Tempo`, `Dynamics`, `Movement`, `Rubato`, `Articulation`,
  `MetricalAccentuation`, `Ornament`, `Distribution`; with `tempoAt`, `dynamicsAt`,
  `positionAt`, `isConstantDynamics`, `subNoteDynamicsSegment`, `movementSegment`
- **Curve geometry** — `innerControlPointsXPositions`, `bezierPoint`, `sampleSegment`,
  `tForDate`, `CurvePoint`
- **Names** — `TEMPO_MAP`, `DYNAMICS_MAP`, … and the six `*_STYLE` collection names
