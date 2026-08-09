# LarsEngeln meico v0.12.0 — MPM v3 Ornamentation: Implementation-Semantics Report

**Purpose.** This is the port blueprint for meico-ts. It documents what the Java reference
implementation of MPM v3 ornamentation *actually does*, line by line, and where that diverges
from the MPM v3 specification.

**Provenance**

| | |
|---|---|
| PR | cemfi/meico#31 "v0.12.0", head `LarsEngeln:develop` |
| Clone | `/private/tmp/claude-501/.../scratchpad/orn-research/clones/meico-lars` |
| HEAD | `3deb141` ("v0.12.0") |
| Diff base | `cdb330a` (= `git merge-base cemfi/master develop`, v0.11.14) |
| Shape | **a single squashed commit**; 21 files, +3962 / −233 |
| Tests | **none** — `git diff --name-only` matches nothing named `*test*`; `build.xml:8` sets `skip.tests=true`; the repo has no test sources at all |
| Review | zero review comments on the PR |

Spec reference used for the fidelity audit: `scratchpad/mpm-develop` @ `1de00bb`,
ODD edition 3.0.1 with revisionDesc through 3.0.2. (The second clone at
`orn-research/clones/MPM` is byte-identical — verified — so there is one source of truth.)

Files changed:

```
src/meico/mei/Helper.java                            | 227 ++-
src/meico/mei/Mei.java                               |  37 +-
src/meico/mei/Mei2MsmMpmConverter.java               | 467 ++++-
src/meico/mei/MeiElement.java                        |  86 +   (new)
src/meico/mei/MeiOrnamentExpander.java               | 740 +   (new)
src/meico/mei/OrnamentExpansion.java                 | 136 +   (new)
src/meico/mpm/elements/Performance.java              |  22 +-
src/meico/mpm/elements/TemporalValue.java            | 549 +   (new)
src/meico/mpm/elements/maps/ArticulationMap.java     |  41 +
src/meico/mpm/elements/maps/GenericMap.java          |  20 +
src/meico/mpm/elements/maps/OrnamentationMap.java    | 838 ++++-
src/meico/mpm/elements/maps/data/OrnamentData.java   |  47 +-
src/meico/mpm/elements/styles/defs/OrnamentDef.java  | 293 ++-
src/meico/msm/Msm.java                               |  18 +-
src/meico/msm/MsmElement.java                        | 104 +   (new)
src/meico/supplementary/Stopwatch.java               |  67 +   (new)
src/meico/xml/RichElement.java                       | 335 +   (new)
src/resources/ornaments.dict                         |  42 +   (new)
```

---

## 0. The one-paragraph summary a porter needs first

Ornamentation rendering **moved wholesale from the symbolic (ticks) domain into the physical
(milliseconds) domain**, after tempo rendering. Every timing value the renderer writes ends up in
`ornament.milliseconds.date.offset` / `ornament.milliseconds.duration`, unconditionally — the
domain dispatch that would have written tick-domain attributes is dead code
(`OrnamentDef.java:525-526`). Ornament notes are **new MSM `<note>` elements cloned from the
principal note**, carrying the principal's performance attributes but their own pitch; the
principal note is then **deleted and re-inserted as zero or more "split" leftovers** covering the
time not occupied by ornament notes. Multiple ornaments on one principal are laid out with a
cursor, front-anchored ones from the start and `alignment="at end"` ones packed against the end,
with proportional shrinking if they collectively overflow. The v3 unit-suffix syntax
(`"360ticks"`, `"20.5ms"`, `"80%"`) is **only partially implemented and mostly broken**: the code
still relies on the v2 `@time.unit` attribute, which v3 removed.

---

## 1. Pipeline placement

### 1.1 Where ornamentation runs now

`Performance.perform()` — `src/meico/mpm/elements/Performance.java`. Per-part ordering (line
numbers are post-change):

```
569  DynamicsMap.renderDynamicsToMap(score, dynamicsMap)
576  ArticulationMap.renderArticulationToMap_noMillisecondModifiers(score, articulationMap)
579  RubatoMap.renderRubatoToMap(m, rubatoMap)
582  addedOrnamentNotes.putAll(OrnamentationMap.renderOrnamentationToMap(score, ornamentationMap))   ← PHASE A (ticks)
585  TempoMap.renderTempoToMap(m, this.getPPQ(), tempoMap)        ← ticks become milliseconds here
589  AsynchronyMap.renderAsynchronyToMap(pedalMap, asynchronyMap)
599  AsynchronyMap.renderAsynchronyToMap(score, asynchronyMap)
601  ArticulationMap.renderArticulationToMap_millisecondModifiers(score, articulationMap)
602  OrnamentationMap.renderMillisecondsModifiersToMap(score, ornamentationMap)                      ← PHASE B (ms)
604+ ImprecisionMap.renderImprecisionToMap(...)  ×4
```

The call sites are unchanged from master. **What changed is what happens behind them.**

### 1.2 The relocation, precisely

In master, `apply()` — the method that instantiates ornament notes and computes their spacing —
was invoked from the *tick-domain* entry points:

```java
// master, cdb330a
public void renderGlobalOrnamentationMap(ArrayList<GenericMap> maps) {
    if ((maps == null) || maps.isEmpty()) return;
    this.apply(maps);                                       // ← tick domain
}
public void renderOrnamentationToMap(GenericMap map) {
    if (this.getLocalHeader() != null) { ...; this.apply(maps); }   // ← tick domain
    this.renderAllNonmillisecondsModifiersToMap(map);
}
```

In the PR both call sites are **commented out**:

```java
// OrnamentationMap.java:282-287
public Map<String, ArrayList<String>> renderGlobalOrnamentationMap(ArrayList<GenericMap> maps) {
    if ((maps == null) || maps.isEmpty())
        return new HashMap<>();
    return new HashMap<>(); // this.apply(maps);
}

// OrnamentationMap.java:315-319
if (this.getLocalHeader() != null) {
    ArrayList<GenericMap> maps = new ArrayList<>();
    maps.add(map);
    //addedNotes = this.apply(maps);
}
```

and re-attached to the millisecond entry point:

```java
// OrnamentationMap.java:1112-1121
public static void renderMillisecondsModifiersToMap(GenericMap map, OrnamentationMap ornamentationMap) {
    if ((ornamentationMap == null) || (map == null)) return;
    ArrayList<GenericMap> maps = new ArrayList<GenericMap>();
    maps.add(map);
    ornamentationMap.apply(maps);            // ← note creation + chordSequence assembly
    ornamentationMap.spaceOrnaments(maps);   // ← frame layout, principal-note carving
    ... // then the attribute→performance rendering loop
}
```

**Consequences for the port:**

- Phase A (`renderOrnamentationToMap`, line 582) now only runs
  `renderAllNonmillisecondsModifiersToMap()` — it folds pre-existing `ornament.dynamics`,
  `ornament.date.offset`, `ornament.duration`, `ornament.noteoff.shift` attributes into
  `velocity`, `date.perf`, `duration.perf`, `date.end.perf`. In the PR's own flow **nothing
  ever writes those tick-domain attributes**, so Phase A is inert for ornaments the PR itself
  generates. It survives only to consume hand-authored/legacy attributes.
- Phase B does everything: note instantiation, repetition expansion, frame math, principal-note
  carving, and the write into `milliseconds.date` / `milliseconds.date.end`.
- Ornaments therefore see **tempo-rendered millisecond durations**, which is what makes `%`
  resolution and the `-1` repetition heuristic possible. This matches the PR body's claim that
  ornaments are "fully measured (in ms) after Tempo-rendering".

### 1.3 Global ornamentation is effectively dead

`renderGlobalOrnamentationToParts()` (`OrnamentationMap.java:256-273`) still collects the affected
parts' scores, but `renderGlobalOrnamentationMap()` returns an empty map without doing anything
(§1.2). Global ornaments still get rendered, but by a *different* route: `Performance.java:552-553`

```java
if (ornamentationMap == null || ornamentationMap.getLocalHeader() == null)
    ornamentationMap = globalOrnamentationMap;
```

so each part falls back to the global map and runs it through Phase B locally. The
`|| getLocalHeader() == null` clause is new and necessary, because line 529 now *always* produces
a non-null object:

```java
// Performance.java:528-534
try {
    ornamentationMap = OrnamentationMap.createOrnamentationMap((OrnamentationMap) mpmPart.getDated().getMap(Mpm.ORNAMENTATION_MAP));
}
catch (Exception e) { String exc = e.getLocalizedMessage(); }   // swallowed
```

`createOrnamentationMap(null)` returns an *empty but non-null* clone
(`OrnamentationMap.java:72-85`). The clone exists because `apply()` accumulates into the instance
field `ornamentEntries` and would otherwise leak state between parts.

> **BUG (state leak).** The clone is only made for the *local* map. When parts fall back to
> `globalOrnamentationMap`, every part shares one instance, so `apply()` appends to the same
> `ornamentEntries` list (`OrnamentationMap.java:659`) and `spaceOrnaments()` re-processes all
> previously-seen parts' ornaments on each subsequent part. With a global ornamentationMap and
> ≥2 parts, output is wrong and cost is quadratic. There is no `ornamentEntries.clear()` anywhere.

### 1.4 MIDI export: negative-date guard

`src/meico/msm/Msm.java`, in `renderMidi`:

```java
1252   track.add(EventMaker.createNoteOn(chan, Math.max(0, date), pitch, velocity));
...
1259       dateEnd = Math.max(0, date) + dur;          // the "no milliseconds.date.end" fallback
...
1261   dateEnd = Math.round(Double.parseDouble(endAtt.getValue()));
1262   if(dateEnd < 0) {
1263       dateEnd = -(date-dateEnd);
1264   }
```

Needed because a negative `frame.offset` (e.g. the arpeggio default `-22`) can push an ornament
note before time zero. The note-on clamp is sound. The note-off repair is not: `-(date - dateEnd)`
is algebraically `dateEnd - date`, i.e. it substitutes the note's *duration* for its *end date*.
For `date = -100, dateEnd = -50` it yields `50`. For any `date ≥ 0` with `dateEnd < 0` it stays
negative. Port this as an explicit `max(0, …)` clamp on both ends and note the divergence.

---

## 2. `TemporalValue.java` (new, 549 lines)

`package meico.mpm.elements`. Author tag: Lars Engeln. A value+unit pair with an optional
relation chain.

### 2.1 Domain model

```java
// TemporalValue.java:16-22
public enum Domain {
    Unknown,
    Relative,
    Milliseconds,
    Ticks,
    //Notelength // 8th, 16th, ..
}
```

Two static lookup maps (`:23-42`):

| Domain | unit string (`domainStrings`) | display name (`domainNameStrings`) |
|---|---|---|
| `Milliseconds` | `ms` | `milliseconds` |
| `Relative` | `%` | `relative` |
| `Ticks` | `ticks` | `ticks` |
| `Unknown` | `?` | `unknown` |

Instance state (`:44-47`): `double value = 0.0`, `Domain domain = Domain.Unknown`,
`TemporalValue relationTo = null`.

Construction is via factories (`:65-73`); the constructor is private.
`create(value, domain)`, `createInRelationTo(relativeTo)` (makes a `Relative` value carrying the
*relatee's* numeric value — odd, but that is what `:69-73` does), and `clone()` (`:75-80`).

### 2.2 Parsing — `fromString` (the critical method)

```java
// TemporalValue.java:481-494
public void fromString(String valueDomain) {
    Pattern pattern = Pattern.compile("^(\\d+)(ms|th|%|ticks|\\?)$");
    Matcher m = pattern.matcher(valueDomain);
    if (m.matches()) {
        setValue(Double.parseDouble(m.group(1)));
        setDomain(fromDomainString(m.group(2)));
        return;
    }
    try {
        setValue(Double.parseDouble(valueDomain));
    } catch (NumberFormatException e) {
        // do nothing, value remains unchanged
    }
}
```

Behaviour table — this is the single most important thing to get right in the port, because the
failure mode is **silent**:

| input | matches regex? | result |
|---|---|---|
| `"360ticks"` | yes | value 360.0, domain ← Ticks |
| `"80%"` | yes | value 80.0, domain ← Relative |
| `"100ms"` | yes | value 100.0, domain ← Milliseconds |
| `"20.5ms"` | **no** (`\d+` rejects the `.`) | `parseDouble` throws → **value and domain unchanged, silently** |
| `"-22ticks"` | **no** (no `-` in regex) | throws → **silently unchanged** |
| `"-22.0"` | no | `parseDouble` succeeds → value −22.0, domain unchanged |
| `"480"` | no | value 480.0, domain unchanged (falls back to whatever was set) |
| `"360.0ticks"` | **no** | throws → **silently unchanged** |
| `""` / garbage | no | throws → silently unchanged |
| `"5th"` | yes | `fromDomainString("th")` → `null` → `setDomain(null)` is a no-op (`:126-127`); value 5.0, domain unchanged |

Two spec-relevant failures fall straight out of this:

1. **Decimals with units do not parse.** The spec regex is
   `^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`; `20.5ms` is the ODD's own example. This implementation
   rejects it.
2. **Negative values with units do not parse.** `frame.offset="-100ms"` is an explicit spec
   example and is silently discarded (leaving 0.0).

Also note `"th"` is still in the alternation although `Notelength` is commented out, so it parses
to a null domain.

### 2.3 Serialization — `toString`

```java
// TemporalValue.java:473-475
public String toString() {
    return Double.toString(value) + getDomainString();
}
```

`create(360, Ticks).toString()` → `"360.0ticks"`, which **`fromString` cannot read back**
(row 8 of the table). The round trip is broken for every value.

In practice this is masked: `OrnamentDef.TemporalSpread.generateXML()` does *not* use
`toString()` — it writes bare `Double.toString(value)` plus a separate `time.unit` attribute
(§3.5). So `TemporalValue.toString()` is unused by the serializer and exists only as a
debug/display helper. Do not port it as the canonical form.

### 2.4 Relative arithmetic

- `isRelative()` ⇔ `domain == Relative` (`:433-435`); also `isMilliseconds()`, `isTicks()`,
  `isUnknown()`.
- `setRelation(rel)` (`:151-155`) refuses relations without an absolute root:
  `if(!relation.hasAbsoluteRoot()) return;` — silently. `hasAbsoluteRoot()` (`:174-180`) walks the
  chain: a non-relative value is its own root; a relative value with no relation has none.
- `getRelativeTo(double value)` (`:187-206`) returns a `Relative` whose value is
  `(lesser * 100) / greater` — i.e. **always ≤ 100 regardless of argument order**, and exactly
  `100` when equal. This is a ratio-of-magnitudes, not a directed percentage; `50` and `200`
  both come back as `50.0`.
- `getRelativeTo(TemporalValue)` (`:212-235`): same-domain → delegates to the double form.
  Mixed relative/absolute → `relative.setValue(absolute.getValue() * (relative.getValue()/100))`,
  and returns the *relative-domain* object now holding an absolute number (the domain tag is
  now a lie). Both-absolute, different domains → `null`.
- `getAbsoluteTo(TemporalValue)` (`:242-269`): both relative → `null`; both absolute → `this`;
  otherwise `absolute.setValue((relative.getValue() * absolute.getValue()) / 100)`.
- `applyRelative(double r)` (`:285-288`): `setValue(getValue() * (r/100))`, mutating and
  returning the new value. `applyRelative(TemporalValue)` (`:294-298`) no-ops unless the argument
  is `Relative`.
- `add` / `subtract` (`:305-340`): the `double` overloads mutate unconditionally; the
  `TemporalValue` overloads **silently no-op on a domain mismatch** (`if(hasSameDomain(temporal))`
  … `return getValue();`). No error, no conversion.
- `isGreater` / `isLess` (`:347-377`): the `TemporalValue` overloads return `false` on domain
  mismatch — so `a.isGreater(b)` and `a.isLess(b)` can both be false for reasons other than
  equality. `getGreater(a,b)` / `getLess(a,b)` (`:385-400`) inherit that: **cross-domain calls
  return `a` and `b` respectively**, i.e. arbitrary.
- `equals(TemporalValue)` (`:425-427`) is `hasSameDomain && hasSameValue` — note it does *not*
  override `Object.equals`, so collections will not use it.

**None of the relation machinery is used by the ornamentation code.** `setRelation`,
`getRelativeTo()`, `getAbsoluteTo()`, `applyRelative`, `add`, `subtract`, `isGreater`, `isLess`,
`getGreater`, `getLess`, `createInRelationTo` have no callers in `OrnamentDef` /
`OrnamentationMap` / `OrnamentData`. The ornamentation path uses only: `create`, `getValue`,
`setValue(double)`, `setValue(String)`, `setDomain`, `getDomain`, `isRelative`. **Port only that
subset**; the rest is speculative API with several sharp edges.

---

## 3. `OrnamentDef.java` (+245/−48)

### 3.1 `TemporalSpread` fields and defaults

```java
// OrnamentDef.java:267-272
public TemporalValue frameStart  = TemporalValue.create(0.0,   TemporalValue.Domain.Ticks);
public TemporalValue frameLength = TemporalValue.create(100.0, TemporalValue.Domain.Relative);  // must be >= 0.0
public double intensity = 1.0;
public NoteOffShift noteOffShift = NoteOffShift.False;
public String alignment = "at start"; // "at start" (default) or "at end"
private String id = null;
```

```java
// OrnamentDef.java:275-279
public enum NoteOffShift { False, True, Monophonic }
```

The Java field defaults match the spec: `frame.offset` default `0.0ticks`, `frameLength` default
`100%`, `intensity` default `1.0`, `noteoff.shift` default `false`, `alignment` default
`at start`. **But the constructor overwrites two of them** — see next.

### 3.2 Parsing from XML — `TemporalSpread(Element xml)`

```java
// OrnamentDef.java:290-351 (abridged, exact for the load-bearing parts)
public TemporalSpread(Element xml) {
    this.xml = xml;

    Attribute domain = Helper.getAttribute("time.unit", xml);
    frameStart.setDomain(TemporalValue.Domain.Ticks);        // ← resets BOTH to Ticks first
    frameLength.setDomain(TemporalValue.Domain.Ticks);       // ← destroys the Relative default

    if (domain != null) {
        switch (domain.getValue()) {
            case "milliseconds": frameStart.setDomain(Milliseconds); frameLength.setDomain(Milliseconds); break;
            case "relative":     frameStart.setDomain(Relative);     frameLength.setDomain(Relative);     break;
            case "ticks": default: // unnecessary because default
        }
    }

    Attribute start = Helper.getAttribute("frame.offset", xml);
    if(start == null) {
        start = Helper.getAttribute("frame.start", xml);     // ← v2 fallback
    }
    if (start != null)
        this.frameStart.setValue(start.getValue());          // ← string path, may override domain

    Attribute length = Helper.getAttribute("frameLength", xml);
    if (length != null)
        this.setFrameLength(Double.parseDouble(length.getValue()));   // ← NO string path, NO unit

    Attribute intensityAtt = Helper.getAttribute("intensity", xml);
    if (intensityAtt != null) this.intensity = Double.parseDouble(intensityAtt.getValue());

    Attribute noteoffShiftAtt = Helper.getAttribute("noteoff.shift", xml);
    if (noteoffShiftAtt != null) switch (noteoffShiftAtt.getValue()) {
        case "true": ... case "false": ... case "monophonic": ...
    }

    Attribute idAtt = Helper.getAttribute("id", xml);
    if (idAtt != null) this.id = idAtt.getValue();

    Attribute alignmentAtt = Helper.getAttribute("alignment", xml);
    if (alignmentAtt != null) this.alignment = alignmentAtt.getValue(); // "at start" or "at end"
}
```

Read this carefully — the unit story is not what the changelog claims:

1. **The unit still comes from `@time.unit`**, the attribute MPM v3 *removed*. Both frame values
   share one domain; per-value units are not modelled.
2. **`frameLength` never goes through `TemporalValue.setValue(String)`.** It is
   `Double.parseDouble` directly. A spec-conformant `frameLength="80%"` throws
   `NumberFormatException`, which propagates out of the `TemporalSpread` constructor → out of
   `OrnamentDef.parseData` → into `createOrnamentDef`'s `catch (Exception e)`
   (`OrnamentDef.java:62-71`), which prints a stack trace and **returns `null`**. The whole
   `ornamentDef` is silently dropped, and every `ornament` referencing it is skipped at
   `OrnamentationMap.java:593-595`. *A spec-valid v3 file loses all its ornaments.*
3. **The `Relative` default for `frameLength` is unreachable from XML.** Line 295 forces `Ticks`
   before `@time.unit` is consulted, so an XML-parsed `temporalSpread` with no `@time.unit` has
   `frameLength` in *ticks*, not `100%`. The spec default (`100%`) only survives on objects built
   programmatically without going through XML.
4. **`frame.start` is still accepted** as a fallback for `frame.offset` (`:315-317`), so v2 input
   keeps working — good, and worth preserving in the port as a lenient read.
5. `frame.offset` values *do* run through `TemporalValue.setValue(String)` → `fromString`, so a
   suffix there can override the domain — but only for non-negative integers (§2.2). The two most
   useful v3 forms, `"-22ticks"` and `"20.5ms"`, silently become 0.0.
6. `setFrameLength` clamps: `this.frameLength.setValue(Math.max(0.0, length))` (`:357-359`).
   Negative `frameLength` becomes 0 — stricter than the v3 schema (which now permits `-?`) and
   matching the old v2.1.4 intent.
7. `alignment` is read from the `temporalSpread` element. **The spec puts `@alignment` on
   `ornamentDef`, not `temporalSpread`** (§9.3).
8. `intensity` is parsed with no validation; the spec requires `minExclusive 0.0`.
   `intensity = 0` makes `Math.pow(0, 0) = 1.0` in the i=0 iteration (§3.3), which puts the
   *first* note at the frame end. Negative intensity yields `Infinity` at i=0.

### 3.3 `TemporalSpread.apply(...)` — the core spacing algorithm

Signature (`OrnamentDef.java:396`):

```java
public KeyValue<Double, Double> apply(ArrayList<ArrayList<Element>> chordSequence,
                                      Double effectiveFrameStart,
                                      Double effectiveFrameLength,
                                      MsmElement lastNote)
```

Returns `KeyValue<spacedStart, spacedLength>`.

**Step 1 — guard** (`:397-398`): `if (chordSequence.size() < 1) return null;`
(The comment says "or just one" but the test is `< 1`, so single-note ornaments *do* proceed.)

**Step 2 — resolve `%` against the principal's millisecond duration** (`:400-417`):

```java
double length = this.frameLength.getValue();
double start  = this.frameStart.getValue();

if(this.frameLength.isRelative() || this.frameStart.isRelative()) {
    double d = -1.0;
    for (ArrayList<Element> chord : chordSequence) {
        for (Element note : chord) {
            d = Double.parseDouble(Helper.getAttributeValue("milliseconds.date.end", note))
              - Double.parseDouble(Helper.getAttributeValue("milliseconds.date", note));
        }
        if(d >= 0.0) break;
    }
    if(this.frameLength.isRelative()) length = (length * 0.01) * d;
    if(this.frameStart.isRelative())  start  = (start  * 0.01) * d;
}
```

So **`%` resolves against `milliseconds.date.end − milliseconds.date` of the *last note of the
first chord*** (the inner loop has no `break`, so `d` is overwritten across the chord). Because
ornament notes are clones of the principal that inherit its `milliseconds.*` attributes
(§5.4), this is *de facto* the principal note's rendered millisecond duration — which agrees
with the spec's intent (§9.7). But it is derived indirectly and breaks if a chord's members have
differing millisecond spans.

**Step 3 — apply the caller's overrides** (`:420-423`):

```java
if (effectiveFrameStart != null)  start  = effectiveFrameStart;
if (effectiveFrameLength != null) length = effectiveFrameLength;
double spacedStart = start;
double spacedLength = length;
```

In the live pipeline `spaceOrnaments()` **always** passes non-null overrides
(`OrnamentationMap.java:778`, `:806`), so Step 2's `%` resolution is *dead* in practice —
`spaceOrnaments` does its own resolution via `resolveFrameValues()` (§4.4). Step 2 only runs via
the 1-arg `apply(chordSequence)` convenience overload, which nothing in the pipeline calls.

**Step 4 — `atEnd` anchoring** (`:431-446`):

```java
if (this.isAtEnd() && effectiveFrameStart == null) {
    double principalDuration = -1.0;
    for (ArrayList<Element> chord : chordSequence)
        for (Element note : chord) {
            Attribute durAtt = Helper.getAttribute("duration", note);
            if (durAtt != null) { principalDuration = Double.parseDouble(durAtt.getValue()); break; }
        }
    if (principalDuration >= 0.0)
        start = principalDuration - length + start;
}
```

Also dead in the live pipeline (guarded by `effectiveFrameStart == null`). And dimensionally
wrong if it did run: `duration` is a **tick** attribute while `length` is in **milliseconds**.
The real `atEnd` handling lives in `spaceOrnaments()` (§4.6).

**Step 5 — the spacing loop** (`:448-488`). This is the formula to port:

```java
double lastDateOffset = spacedStart;
ArrayList<Element> previous = null;
if(lastNote != null) {
    previous = new ArrayList<>();
    previous.add(lastNote.getElement());
    lastDateOffset = lastNote.getAsDouble("ornament.milliseconds.date.offset");
}

for (int i = 0; i < chordSequence.size(); ++i) {
    boolean removedNote = false;
    if(i == 0 && lastNote != null) {
        // if the first chord repeats the pitch the previous ornament ended on, drop it
        for(Element n : chordSequence.get(i)) {
            MsmElement note = new MsmElement(n);
            if(note.get("midi.pitch").equals(lastNote.get("midi.pitch"))) {
                note.removeParent();
                removedNote = true;
                lastDateOffset = lastNote.getAsDouble("ornament.milliseconds.date.offset");
            }
        }
    }

    double dateOffset = (Math.pow(((double) i) / chordSequence.size(), this.intensity) * length) + start;
    double lastDuration = dateOffset - lastDateOffset;
    lastDateOffset = dateOffset;

    if(i == 0) spacedStart = dateOffset;

    previous = this.setOrnamentDateAtts(dateOffset, lastDuration, chordSequence.get(i), previous);
    if(removedNote) { // expand note up to 2nd if 1st note has been removed
        previous = new ArrayList<>();
        previous.add(lastNote.getElement());
        lastDateOffset = lastNote.getAsDouble("ornament.milliseconds.date.offset");
    }
}

double lastDuration = spacedStart + spacedLength - lastDateOffset;
this.setOrnamentDateAtts(lastDateOffset, lastDuration, new ArrayList<Element>(), previous);

return new KeyValue<>(spacedStart, spacedLength);
```

**The onset formula, isolated:**

> For chord index `i` of `n` chords, with resolved `start` and `length`:
>
> ```
> dateOffset(i) = ((i / n) ^ intensity) * length + start
> ```
>
> and the frame nominally ends at `start + length`.

This is **unchanged from master's v2 formula** — the divisor is `n`, not `n − 1`. The normalized
positions are `0, 1/n, 2/n, …, (n−1)/n`; the last chord starts strictly *before* the frame end,
leaving it room to sound. The header comment says so:
`"spacing as if there were n+1 positions, so each note has equal space and the last note still has room to sound until frameEnd"` (`:450-451`).

`intensity = 1.0` ⇒ equidistant. `intensity > 1` ⇒ notes bunched toward the start (accelerando).
`intensity < 1` ⇒ bunched toward the end.

The trailing call (`:490-492`) with an **empty chord** exists purely to close out the last chord's
duration under `Monophonic`: `setOrnamentDateAtts` writes `duration` onto `previous`, so passing
an empty `chord` with `previous` = the final chord sets that chord's duration to
`spacedStart + spacedLength − lastDateOffset`, i.e. it sounds to the frame end.

> **Sharp edge.** `lastDateOffset` is initialised to the *pre-`atEnd`* `spacedStart` (`:448`),
> while `spacedStart` is reassigned inside the loop at `i == 0` (`:479`). With `lastNote == null`
> the i=0 `lastDuration` is discarded anyway (no `previous`), so it is harmless in practice —
> but a faithful port should reproduce the assignment order rather than "clean it up".

> **Sharp edge.** `note.removeParent()` at `:468` detaches the duplicate note from the MSM score
> **but leaves it in `chordSequence`**, so it still receives attributes and still counts toward
> `chordSequence.size()` in the spacing denominator. The note vanishes from output while still
> consuming a time slot.

### 3.4 `setOrnamentDateAtts` — which attributes get written

```java
// OrnamentDef.java:509-546
private ArrayList<Element> setOrnamentDateAtts(double dateOffset, double duration,
                                               ArrayList<Element> chord, ArrayList<Element> previous) {
    String dateAttName, durAttName;
    switch (this.frameStart.getDomain()) {
        case Ticks:
        case Relative: // at this moment values are in ticks
            dateAttName = "ornament.date.offset";        durAttName = "ornament.duration";        break;
        case Milliseconds:
            dateAttName = "ornament.milliseconds.date.offset"; durAttName = "ornament.milliseconds.duration"; break;
        default:
            return null;
    }

    dateAttName = "ornament.milliseconds.date.offset";    // ←←← unconditional override
    durAttName  = "ornament.milliseconds.duration";       // ←←← unconditional override

    for (Element note : chord) {
        Attribute ornamentDateAtt = Helper.getAttribute(dateAttName, note);
        if (ornamentDateAtt != null)
            ornamentDateAtt.setValue(String.valueOf(dateOffset + Double.parseDouble(ornamentDateAtt.getValue())));  // accumulates!
        else
            note.addAttribute(new Attribute(dateAttName, String.valueOf(dateOffset)));

        Attribute durationAtt = Helper.getAttribute("duration", note);
        if(durationAtt == null) continue;
        Attribute ornamentDurAtt = Helper.getAttribute(durAttName, note);
        if (ornamentDurAtt != null) ornamentDurAtt.setValue(Helper.getAttributeValue("duration", note));
        else note.addAttribute(new Attribute(durAttName, Helper.getAttributeValue("duration", note)));
    }

    switch (this.noteOffShift) {
        case False: return null;
        case True:
            for (Element note : chord) note.addAttribute(new Attribute("ornament.noteoff.shift", "true"));
            return null;
        case Monophonic:
            if (previous != null) {
                for (Element prev : previous) {
                    Attribute prevDateOffsetAtt = Helper.getAttribute(dateAttName, prev);
                    if (prevDateOffsetAtt == null) continue;
                    Attribute ornamentDurationAtt = Helper.getAttribute(durAttName, prev);
                    if (ornamentDurationAtt != null) ornamentDurationAtt.setValue(String.valueOf(duration));
                    else prev.addAttribute(new Attribute(durAttName, String.valueOf(duration)));
                }
            }
            return chord;
        default: return null;
    }
}
```

Four things a porter must not miss:

1. **Lines 525-526 make the domain switch dead code.** Everything is written into the
   *milliseconds* attributes regardless of `frameStart.getDomain()`. This is the concrete
   mechanism behind "ornaments are fully measured in ms". The `default: return null` for
   `Unknown` still fires before the override, so an `Unknown` domain silently produces nothing.
2. **`ornament.milliseconds.date.offset` accumulates** when already present (`:532`). This is how
   `spaceOrnaments` layers a second ornament's offsets on top of a first one's.
3. **The duration seed is a tick value in a millisecond attribute.** Lines 537-544 initialise
   `ornament.milliseconds.duration` from the note's `duration` attribute, which in MSM is
   **ticks**. For `NoteOffShift.Monophonic` this is immediately overwritten with a real
   millisecond span (`:562-566`), so it is invisible. For `False` and `True` it is **not**
   overwritten, and `renderMillisecondsModifiersToMap` then computes
   `milliseconds.date.end = milliseconds.date + offset + <tick count>` (§4.8).
   *The arpeggio default uses `NoteOffShift.False` (`:216`), so every MEI-generated arpeggio hits
   this.* This is the most likely source of audible wrongness in the PR.
4. `Monophonic` returns the current chord as the next iteration's `previous`; `False`/`True`
   return `null`, so the tail call at `:492` does nothing for them.

**`noteoff.shift` semantics as implemented** (compare the spec text in §9.6):

| value | what the code does |
|---|---|
| `false` | writes no marker; ornament notes keep `ornament.milliseconds.duration` = principal's tick `duration`; in Phase B that becomes an absolute end date. Spec says they should all end at the principal's note-off. **Not implemented as specified.** |
| `true` | adds `ornament.noteoff.shift="true"`; Phase B then shifts `milliseconds.date.end` by the same offset as the onset, preserving duration (`OrnamentationMap.java:1146-1150`). Matches spec. |
| `monophonic` | each note's duration is set to the *next* note's onset minus its own; the last note runs to the frame end. Matches spec. |

### 3.5 Serialization — `generateXML()`

```java
// OrnamentDef.java:597-646
Element ts = new Element("temporalSpread", Mpm.MPM_NAMESPACE);

if (this.frameStart.getValue() != 0.0)
    ts.addAttribute(new Attribute("frame.start", Double.toString(this.frameStart.getValue())));
if (this.frameLength.getValue() != 0.0)
    ts.addAttribute(new Attribute("frameLength", Double.toString(this.frameLength.getValue())));

switch (this.frameStart.getDomain()) {
    case Ticks:        ts.addAttribute(new Attribute("time.unit", "ticks"));        break;
    case Milliseconds: ts.addAttribute(new Attribute("time.unit", "milliseconds")); break;
    case Relative:     ts.addAttribute(new Attribute("time.unit", "relative"));     break;
}

if (this.intensity != 1.0)  ts.addAttribute(new Attribute("intensity", Double.toString(this.intensity)));

switch (this.noteOffShift) {
    case False: break;                                              // omitted (default)
    case True:       ts.addAttribute(new Attribute("noteoff.shift", "true"));       break;
    case Monophonic: ts.addAttribute(new Attribute("noteoff.shift", "monophonic")); break;
}

if ((this.id != null) && !this.id.isEmpty()) { /* xml:id */ }

if (this.isAtEnd()) ts.addAttribute(new Attribute("alignment", "at end"));
```

**The writer emits MPM v2, not v3:**

- writes `frame.start`, the attribute v3 renamed to `frame.offset` and **deleted outright**
  (not even deprecated — spec commit `71c1980`);
- writes **no unit suffixes** — bare `Double.toString`;
- writes `@time.unit`, which **does not exist on any v3 element**;
- writes `alignment` on `temporalSpread`, where the spec puts it on `ornamentDef`.

So this PR *reads* v3-ish and *writes* v2. Round-tripping a file through it downgrades it.
Note also `Attribute("time.unit","ticks")` is emitted even though the preceding comment says
"not necessary because this is the default value when absent" — the comment was left behind when
the line was added.

Two omission bugs: `frame.start` is omitted when the value is `0.0` and `frameLength` when it is
`0.0`, but the *domain* is still written — so `frameLength="0"` in relative units and a genuinely
absent `frameLength` are indistinguishable on re-read.

### 3.6 `DynamicsGradient`

Parsing (`:721-737`): `transition.from` defaults to `0.0`; **if `transition.to` is absent it is
set equal to `transition.from`** (constant dynamics) — this is a deliberate and spec-sensible
lenience that the ODD does not state.

```java
// OrnamentDef.java:745-757
public void apply(ArrayList<ArrayList<Element>> chordSequence, double scale) {
    if (chordSequence.size() > 1) {
        double constFac = (scale * (this.transitionTo - this.transitionFrom)) / (chordSequence.size() - 1);
        double fromVelocity = this.transitionFrom * scale;
        for (int n = 0; n < chordSequence.size(); ++n) {
            double ornamentDynamics = (constFac * n) + fromVelocity;
            this.setOrnamentDynamicsAtt(ornamentDynamics, chordSequence.get(n));
        }
    } else if (chordSequence.size() > 0) {
        double ornamentDynamics = this.transitionTo * scale;
        this.setOrnamentDynamicsAtt(ornamentDynamics, chordSequence.get(0));
    }
}
```

> **Dynamics formula.** For chord index `n` of `N` (N > 1):
> ```
> ornamentDynamics(n) = scale * transitionFrom + n * scale * (transitionTo − transitionFrom) / (N − 1)
> ```
> Linear, hitting `scale*transitionFrom` at n=0 and `scale*transitionTo` at n=N−1.
> Single chord ⇒ `scale * transitionTo`.

Note the divisor here is `N − 1` — *unlike* the temporal formula's `N`. That asymmetry is
intentional (dynamics interpolates endpoint-to-endpoint; timing leaves room for the last note)
and must be preserved.

`setOrnamentDynamicsAtt` (`:764-774`) **accumulates** onto an existing `ornament.dynamics`.
Phase A then folds it into velocity (`OrnamentationMap.java:1059-1065`):

```java
velocity.setValue(String.valueOf(Double.parseDouble(velocity.getValue())
                               + Double.parseDouble(ornamentDynamics.getValue())));
```

with an explicit no-op if `velocity` is absent ("we have no basic dynamics to add the ornament
dynamics to, so this is mandatory").

**Ordering trap.** `DynamicsGradient.apply` runs *inside* `OrnamentData.apply`
(`OrnamentData.java:132-133`) during **Phase B**, but the code that folds `ornament.dynamics`
into `velocity` runs in **Phase A** (line 582), which already happened. So for ornaments generated
by this PR, `ornament.dynamics` is written after its only consumer has run — **the dynamics
gradient never reaches the MIDI velocity**. Confirm this on a real render before porting the
behaviour; as written, ornament dynamics is inert.

### 3.7 `createDefaultOrnamentDef(name)` — the default table

`OrnamentDef.java:205-260`. Lookup is `name.trim().toLowerCase()`. These are gold as port
fixtures because `MeiOrnamentExpander` depends on them.

| name(s) | dynamicsGradient (from, to) | temporalSpread (offset, length, unit, intensity, noteoff.shift, atEnd) |
|---|---|---|
| `arpeg`, `arpeggio` | −1.0, 1.0 | −22.0, 66.0, Ticks, 1.0, **False** |
| `mordent`, `upper mordent`, `lower mordent` | 1.0, −1.0 | 0, 180.0, Ticks, 0.9, Monophonic |
| `fioritura` | 1.0, 1.0 | 0, 100, **Relative**, 1.0, Monophonic |
| `grace unacc` | 1.0, −1.0 | −90.0, 90.0, Ticks, 1.0, Monophonic |
| `grace acc` | 1.0, −1.0 | 0, 90.0, Ticks, 1.0, Monophonic |
| `grace acc delayed` | 1.0, −1.0 | 0, 90.0, Ticks, 1.0, Monophonic, **atEnd** |
| `grace unacc delayed` | 1.0, −1.0 | 0, 90.0, Ticks, 1.0, Monophonic, **atEnd** |
| `turn delayed`, `upper turn delayed`, `lower turn delayed` | 1.0, −1.0 | 0, 50, **Relative**, 1.0, Monophonic, **atEnd** |
| `tremolo` | 1.0, 0.0 | 0, 100, **Relative**, 1.0, Monophonic |
| *default* | −1.0, 1.0 | 0, 80, **Relative**, 0.9, Monophonic |

Notably **`trill`, `upper turn`, `lower turn`, and `double cadence lower prefix` have no case** and
fall through to *default* — even though the dictionary defines all of them. `grace acc delayed`
and `grace unacc delayed` are byte-identical.

Because these are built programmatically (not parsed from XML), their `frameLength` domains *are*
respected — the §3.2 point-3 bug only affects XML-loaded defs.

---

## 4. `OrnamentationMap.java` (+752/−86) — the full rendering algorithm

### 4.1 Entry points and their current wiring

| method | line | role now |
|---|---|---|
| `renderGlobalOrnamentationToParts` | 256 | collects part scores, delegates → no-op |
| `renderGlobalOrnamentationMap` | 282 | **returns empty map; `apply()` commented out** |
| `renderOrnamentationToMap(GenericMap)` | 310 | `apply()` commented out; runs only `renderAllNonmillisecondsModifiersToMap` |
| `applyNotesToMaps` | 335 | **note instantiation + repetition expansion** |
| `apply` | 550 | orchestrates: `applyNotesToMaps`, then builds `OrnamentEntry` list |
| `spaceOrnaments` | 696 | **frame layout across ornaments + principal-note carving** |
| `renderAllNonmillisecondsModifiersToMap` | 1054 | tick-domain attrs → `.perf` attrs (Phase A) |
| `renderMillisecondsModifiersToMap` | 1112 | **calls `apply` + `spaceOrnaments`, then ms attrs → `milliseconds.*`** (Phase B) |
| `sanitizeOverlaps` | 1155 | same-pitch overlap trimming — **never called** (`:323` commented out) |
| `getOrnamentDataOf` | 174 | **returns `null` unconditionally** (pre-existing in master; not a regression) |

### 4.2 `applyNotesToMaps` — note.order tokenization and note instantiation

`OrnamentationMap.java:335-501`. Runs once per ornament element in map order.

**Principal-note resolution** (`:341-349`):

```java
MsmElement ornament = new MsmElement(this.getElement(i));
String correspondenceId = ornament.get("noteid");
MsmElement principalNote = getElementById(notes, correspondenceId);

if(principalNote == null) {
    if(ornament.has("note.order"))            // in case of an arpeggio, i.e.
        ornament.set("note.order.perf", ornament.get("note.order"));
    continue;
}
ornament.copyValue("date", principalNote);   // ornament date := principal's date
```

- Resolution is **`@noteid` only**. The spec's alternative — "if not providing a `@noteid`, the
  `@note.order` does need to contain an ID reference to an MSM note that is treated as the
  corresponding principal note" — is **not implemented**. There is no scan of `note.order` for a
  non-pool reference.
- `@noteid` is compared **raw** against note ids (`getElementById`, `:509-519`, uses
  `candidate.getId().equals(id)`). The spec expects `noteid="#n96"` with a leading `#`, and
  `Mei2MsmMpmConverter` writes `noteid` **without** `#` for MEI-generated ornaments but the
  `ArticulationMap` helper added in this same PR assumes `"#" + noteid`
  (`ArticulationMap.java:592`). **Hand-authored spec-conformant `noteid="#n96"` will not resolve.**
- The no-principal path just copies `note.order` → `note.order.perf` verbatim and skips note
  generation entirely. This is the **arpeggio** path: the converter deliberately sets an arpeggio's
  `noteid` to the *arpeg element's own id* so that resolution fails and the pre-existing notes of
  the chord are used as-is. The spec's "no principal + `midi.pitch`-only" path — where every
  child `<note>` carries an explicit `@midi.pitch` — is **not implemented**; without a principal
  no notes are created at all.

**Tokenization** (`:353`):

```java
ArrayList<String> noteOrder = new ArrayList<>(Arrays.asList(
        ornament.get("note.order").replaceAll(":\\|:", ":| |:").split(" ")));
```

`:|:` is normalised into `:|` + `|:`. Split is on a **single literal space**, not `\s+`, so
tabs/newlines/double-spaces produce empty tokens. (`OrnamentData` and the other `note.order`
readers use `split("\\s+")` — inconsistent.) Note this call **NPEs if `note.order` is absent**,
since `RichElement.get` returns `null` for a missing attribute and there is no guard.

**Chord/repeat scan** (`:356-408`) — builds `chords`, a list of strings each shaped `"[ id1 id2 ]"`,
and `repeats`, a `Map<repeatStartIndex, repeatEndIndex>` in *chord* indices:

```java
int chordIndex = 0, repeatStart = chordIndex;
ArrayList<String> chords = new ArrayList<>();
StringBuilder chord = new StringBuilder("[");
boolean isCollectingChord = false;

for(int j = 0; j < noteOrder.size();) {
    String order = noteOrder.get(j);
    if(!isCollectingChord) chord = new StringBuilder("[");

    if(order.equals("[")) { isCollectingChord = true; j++; continue; }

    if(order.contains("#")) {                      // an id reference
        String o = order.replaceAll("#", "");
        chord.append(" ").append(o);
        noteOrder.set(j, o);
        j++;
    }
    if(order.equals("]")) { isCollectingChord = false; j++; }

    if(order.contains("|")) {
        switch (order) {
            case "|:": repeatStart = chordIndex; break;
            case ":|": repeats.put(repeatStart, chordIndex); break;
            case "|":  break;
        }
        noteOrder.remove(j);
        continue;
    }

    if(!isCollectingChord) { chord.append(" ]"); chords.add(chord.toString()); chordIndex++; }
}
```

This loop is fragile and its behaviour must be replicated literally, not "understood":

- **A token only becomes a note if it contains `#`.** Bare ids (which the spec's schematron
  demands carry `#`, so this is consistent with the spec, but *inconsistent with*
  `OrnamentData`/`apply()` which strip `#` before this point in other code paths) are skipped:
  `j` is not incremented in the `[`/`]`/`|` branches for them, so **a bare id token causes an
  infinite loop** (no branch matches, `j` never advances, and the final `if` just re-appends).
  Verified by inspection: for `order = "n5"` with `isCollectingChord == false`, none of the four
  `if`s fire except the last, which does not touch `j`. **Infinite loop.**
- `]` handling is broken for the last note of a chord: the `order.contains("#")` branch already
  advanced `j`, so `order` still holds the *id*, not `]`; the `]` token is consumed on the next
  iteration with `isCollectingChord` still true, and `chord` is only closed on the iteration
  *after* that. In practice chords do come out right, but only because of this two-step dance.
- Only **one** repeat group is supported: `repeats` is a `Map` keyed by start index, and the
  expansion below reads only `repeats.keySet().iterator().next()`.

**Repetition expansion** (`:410-445`):

```java
if(!repeats.isEmpty()) {
    ArrayList<String> notesToAdd = new ArrayList<>();
    int rptStart = repeats.keySet().iterator().next();
    int rptEnd   = repeats.get(rptStart);
    int rptNotesAmount = rptEnd - rptStart;

    double maxNotes = chords.size();
    String repetitions = ornament.get("repetitions");
    if(repetitions != null && !repetitions.equals("-1")) {
        maxNotes = (Double.parseDouble(repetitions) + 1.0) * rptNotesAmount;   // play at least once
    }
    else {
        int rptNoteLength = 150;                                                // ms per repeat note
        maxNotes = Math.ceil((principalNote.getAsDouble("milliseconds.date.end")
                            - principalNote.getAsDouble("milliseconds.date")) / rptNoteLength);
    }

    while(maxNotes >= (notesToAdd.size() + chords.size() + rptNotesAmount)) {
        for (int k = rptStart; k < rptEnd; ++k) notesToAdd.add(chords.get(k));
    }
    // land on the principal pitch at the end of a repetition, if the group's first note is a unison
    for(MsmElement child : children) {
        if(child.getId().equals(chords.get(rptStart).replaceAll("\\[|\\]", "").trim())) {
            MsmElement note = new MsmElement(child.getElement());
            if(note.has("intm") && note.get("intm").equals("0.0hs"))
                notesToAdd.add(chords.get(rptStart));   // might add doubles -> need to sanitize
            break;
        }
    }
    for(String n : notesToAdd) { chords.add(rptEnd, n); rptEnd++; }
}
```

> **Repetition count.**
> `repetitions = r ≥ 0` ⇒ target chord count `maxNotes = (r + 1) * groupLen`.
> `repetitions = -1` (or absent) ⇒ `maxNotes = ceil(principalMs / 150)`, with **`rptNoteLength`
> hardcoded to 150 ms** (`:423`).
> The `while` loop appends whole groups while
> `maxNotes >= notesToAdd.size() + chords.size() + groupLen`.

`-1` is a meico extension: the spec types `repetitions` as `integer, minInclusive 0`, default `0`,
with `r` meaning "played `r+1` times". The `(r+1)*groupLen` formula agrees with the spec
(`repetitions="3"` ⇒ played four times).

> **BUG (infinite loop / OOM).** If `repetitions` is absent, `ornament.get("repetitions")` returns
> `null`, the `else` branch runs, and if `principalNote` lacks `milliseconds.date.end` /
> `milliseconds.date` `getAsDouble` returns `null` → NPE on unboxing. Worse: if `rptNotesAmount`
> is `0` (an empty `|: :|` group) the `while` condition never advances and the loop never
> terminates. Neither is guarded.

**Note instantiation** (`:451-493`):

```java
MsmElement lastNote = null;
boolean hasSamePitches = true;
MsmElement firstNote = children.get(0);                   // ← NPE/IOOBE if the ornament has no children
for(MsmElement child : children)
    if(!child.get("midi.pitch").equals(firstNote.get("midi.pitch"))) { hasSamePitches = false; break; }

for (int j = 0; j < noteOrder.size();) {
    String order = noteOrder.get(j);
    if(order.equals("[") || order.equals("]")) { j++; continue; }

    MsmElement note = null;
    for(MsmElement child : children)
        if(child.getId().equals(order)) { note = new MsmElement(child.getElement(), true); break; }   // deep copy

    // sanitize double notes from repetitions
    if(!hasSamePitches && note != null && lastNote != null
       && note.get("midi.pitch").equals(lastNote.get("midi.pitch")))
        note = null;

    if(note == null) { noteOrder.remove(j); continue; }    // unresolvable ref → drop the token
    lastNote = note;

    copyNotePerfInformation(note, principalNote);
    noteOrder.set(j, note.getId());
    map.addElement(note.getElement());
    addedNotes.computeIfAbsent(correspondenceId, k -> new ArrayList<>()).add(note.getId());
    ++j;
}
ornament.set("note.order.perf", String.join(" ", noteOrder));
```

- Each occurrence in the (expanded) order produces a **fresh deep copy** of the pooled child note
  — `new MsmElement(child.getElement(), true)` → `RichElement(element, true)` →
  `Helper.cloneElement(element, true)`.
- Consecutive same-pitch duplicates are dropped, but **only when the pool has more than one
  distinct pitch** (`hasSamePitches` guard) — so a genuine same-pitch tremolo/repeat survives.
- Unresolvable references are silently removed from the order.
- The result is written to a **new attribute `note.order.perf`**, leaving the authored
  `note.order` untouched. Everything downstream reads `note.order.perf`.

### 4.3 `copyNotePerfInformation` — how a generated note inherits the principal

```java
// OrnamentationMap.java:526-541
private static void copyNotePerfInformation(MsmElement note, MsmElement principalNote) {
    note.createNewId();                       // fresh xml:id — several notes come from one pool note
    if(principalNote == null) return;

    for(int i = 0; i < principalNote.getElement().getAttributeCount(); i++) {
        Attribute attr = principalNote.getElement().getAttribute(i);
        if(!( attr.getLocalName().equals("id")
           || attr.getLocalName().equals("intm")
           || attr.getLocalName().equals("midi.pitch")
           || attr.getLocalName().equals("octave")
           || attr.getLocalName().equals("accidentals")
           || attr.getLocalName().equals("pitchname")))
            note.getElement().addAttribute(new Attribute(attr.getLocalName(), attr.getValue()));
    }
}
```

**This is the note-creation contract.** A generated ornament note is:

- the pooled `<note>` deep-copied — keeping its `midi.pitch`, `intm`, `interval.chromatic`,
  `duration`, `date`;
- given a **new `xml:id`** via `MsmElement.createNewId()` → `Helper.addUUID(element, true, true)`;
- **overwritten with every attribute of the principal note except** `id`, `intm`, `midi.pitch`,
  `octave`, `accidentals`, `pitchname`.

So it inherits `date`, `duration`, `milliseconds.date`, `milliseconds.date.end`, `velocity`,
`date.perf`, `duration.perf`, `part`/`channel` routing, articulation markers, and anything else
already rendered — while keeping its own pitch. The `addAttribute` calls *replace* same-named
attributes, so the principal's `duration` and `date` win over the pool note's.

There is **no marker attribute identifying a note as ornament-generated.** Nothing distinguishes a
generated note from an original one in the output MSM except its UUID-shaped id. The only record
is the returned `Map<principalId, List<generatedIds>>`, which `Performance` collects into
`addedOrnamentNotes` (`Performance.java:476`, `:582`) and then **never uses** — both consumers
(`ArticulationMap.copyArticulations`) are commented out (`Performance.java:477`, `:581`).

> **Port note.** If meico-ts wants ornament provenance in the output (highly desirable for
> MPM Toolbox / mpm-desk round-tripping), this is a place to *add* something the reference lacks.
> Flag it as a deliberate divergence rather than silently matching.

**Pitch resolution.** `interval.chromatic` / `interval.diatonic` / `intm` are **never resolved
into `midi.pitch` here**. The pooled notes arrive with `midi.pitch` already computed — by
`Mei2MsmMpmConverter.MeiNote2MsmNote()` on the MEI side, where `Helper.shiftNoteDiatonicly()`
does the diatonic transposition against the MEI pname/oct/accidental context
(`Helper.java:997-1011`) and the semitone distance is written to `intm`. **For a hand-authored MPM
file with `<note interval.chromatic="2"/>` and no `midi.pitch`, nothing computes a pitch.**
`interval.chromatic` is written by the converter (`Mei2MsmMpmConverter.java:3044`) and **read
nowhere in the codebase**. The spec's whole pitch-specification model — `midi.pitch` xor
`interval.chromatic` xor `interval.diatonic` — is therefore unimplemented on the MPM side; only
the MEI expander path produces usable notes.

### 4.4 `apply` — building the `OrnamentEntry` list

`OrnamentationMap.java:550-667`. After `applyNotesToMaps` runs for each map (`:561-563`), it
indexes all `note` **and `rest`** elements by id (`getNotes`, `:674-689` — master indexed only
notes; rests were added so that `space`-based fioritura correspondences resolve), then walks the
map:

- `style` elements switch the active `OrnamentationStyle`, looked up in the local header first,
  then the global header (`:574-581`). **No style ⇒ every subsequent ornament is skipped**
  (`:583-584`), matching the spec's requirement that a `<style>` precede the first reference.
- For each `ornament`: build `OrnamentData` from the XML (`:586`), resolve `name.ref` → `ornamentDef`
  (`:589-595`), skip silently if either is missing.
- Build the `chordSequence` from **`note.order.perf`** (`:600-645`):

```java
Attribute noteOrderAtt = ornamentXml.getAttribute("note.order.perf");
if (noteOrderAtt != null) {
    String no = noteOrderAtt.getValue().trim();
    switch (no) {
        case "ascending pitch":  noteOrderAscending =  1; break;
        case "descending pitch": noteOrderAscending = -1; break;
    }
    od.noteOrder = new ArrayList<>(Arrays.asList(no.replaceAll("#", "").split("\\s+")));
    if (od.noteOrder.isEmpty()) continue;

    noteOrderAscending = 0;          // ←←← immediately clobbers the switch above

    ArrayList<Element> chord = new ArrayList<>();
    boolean isCollectingChord = false;
    for (String ref : od.noteOrder) {
        if(!isCollectingChord) chord = new ArrayList<>();
        if(ref.equals("[")) { isCollectingChord = true; continue; }
        if(ref.equals("]")) { isCollectingChord = false; if(!chord.isEmpty()) chordSequence.add(chord); continue; }
        Element note = notes.get(ref);
        if (note != null) chord.add(note);
        if(!isCollectingChord && !chord.isEmpty()) chordSequence.add(chord);
    }
}
if (chordSequence.isEmpty()) continue;

int finalNoteOrderAscending = noteOrderAscending;
if(finalNoteOrderAscending != 0) {
    chordSequence.sort((n1, n2) -> {
        double pitch1 = Double.parseDouble(Helper.getAttributeValue("midi.pitch", n1.get(0)));
        double pitch2 = Double.parseDouble(Helper.getAttributeValue("midi.pitch", n2.get(0)));
        return ((int) Math.signum(pitch1 - pitch2)) * finalNoteOrderAscending;
    });
}
```

> **BUG.** `noteOrderAscending = 0;` at `:616` unconditionally erases the value the `switch` just
> computed, so `finalNoteOrderAscending` is always `0` and **`"ascending pitch"` / `"descending
> pitch"` never sort anything.** Worse, those keywords then fall through to the tokenizer, which
> splits them into `["ascending","pitch"]`, finds no matching note ids, produces an empty
> `chordSequence`, and the ornament is dropped at `:647-648`. **Both spec keywords are
> non-functional.**

Each surviving ornament becomes `new OrnamentEntry(od, chordSequence)` appended to the instance
list `ornamentEntries` (`:659`). The method's "Phase 2" comment (`:662-665`) describes grouping
that is actually implemented in `spaceOrnaments`, and the method returns `addedNotes` from the
*last* map only (`:562`, overwriting rather than merging).

### 4.5 `OrnamentEntry`

```java
// OrnamentationMap.java:944-990
private static class OrnamentEntry {
    final OrnamentData od;
    final ArrayList<ArrayList<Element>> chordSequence;
    double effectiveStart, effectiveLength, effectiveEnd;
    ...
    private MsmElement getLatestNote() {     // the note with the greatest offset+duration
        double latestEndDate = -Double.MAX_VALUE;
        for(ArrayList<Element> chord : chordSequence)
            for(Element note : chord) {
                double endDate = Double.parseDouble(Helper.getAttributeValue("ornament.milliseconds.date.offset", note))
                               + Double.parseDouble(Helper.getAttributeValue("ornament.milliseconds.duration", note));
                if(endDate > latestEndDate) { latestEndDate = endDate; candidate = note; }
            }
        ...
    }
}
```

`getFirstNote()` (`:955-971`) is **never called** and is wrong anyway — it adds
`ornament.date.offset + ornament.duration` (tick attributes that are never written) and calls the
sum a *start* date. Dead code; do not port.

`getLatestNote()` throws `NumberFormatException` on `null` if any note in the sequence lacks
`ornament.milliseconds.duration` — which is exactly the `NoteOffShift.False` case where notes
without a `duration` attribute get no duration written (`OrnamentDef.java:537-539`).

### 4.6 `spaceOrnaments` — multi-ornament layout

`OrnamentationMap.java:696-901`. **This is the heart of "multiple ornaments are spaced
sequentially".**

**Grouping** (`:711-714`) — by `od.correspondence`, i.e. by principal note id, preserving
insertion order (`LinkedHashMap`):

```java
Map<String, ArrayList<OrnamentEntry>> groups = new LinkedHashMap<>();
for (OrnamentEntry entry : ornamentEntries)
    groups.computeIfAbsent(entry.od.correspondence, k -> new ArrayList<>()).add(entry);
```

(The `apply()` comment at `:665` — *"TODO: not per date, but via principalNote ID"* — is stale;
grouping *is* by principal id here.)

**Principal duration** (`:731-738`):

```java
double principalDuration = getPrincipalDuration(group.get(0).chordSequence);   // fallback: first `duration` attr = TICKS
if(principalNote != null) {
    principalDuration = getNoteDuration(principalNote);                        // ms.date.end − ms.date  = MILLISECONDS
    if(principalNote.has("ornament.duration"))
        principalDuration = principalNote.getAsDouble("ornament.duration");
}
```

with (`:903-913`)

```java
getNoteDuration(n) = getNoteEnd(n) − getNoteDate(n)
getNoteDate(n)     = n.getAsDouble("milliseconds.date")
getNoteEnd(n)      = n.getAsDouble("milliseconds.date.end")
```

> **Domain mixing.** The `principalNote == null` fallback returns the `duration` attribute in
> **ticks**, used interchangeably with the millisecond value. Also, `ornament.duration` is a
> tick-domain attribute (Phase A) being assigned to a millisecond variable.

**Pre-shifting for already-offset principals** (`:743-753`): if the principal already carries an
`ornament.milliseconds.date.offset` (a previous ornament moved it), the entry's date and all its
notes' `milliseconds.date` are rebased onto `principalDate + offset`.

**Splitting front vs end** (`:755-758`): `isAtEnd(od)` (`:1014-1018`) consults
`od.ornamentDef.getTemporalSpread().isAtEnd()`, i.e. `"at end".equals(alignment)`.

**Raw frame resolution** (`:765`, `:923-939`, `:1027-1043`):

```java
private static double[] resolveFrameValues(OrnamentData od, double principalDuration) {
    double start = 0.0, length = 0.0;
    if (od.ornamentDef != null && od.ornamentDef.getTemporalSpread() != null) {
        OrnamentDef.TemporalSpread ts = od.ornamentDef.getTemporalSpread();
        start  = ts.frameStart.getValue();
        length = ts.frameLength.getValue();
        if (ts.frameStart.isRelative())  start  = (start  * 0.01) * principalDuration;
        if (ts.frameLength.isRelative()) length = (length * 0.01) * principalDuration;
    }
    return new double[]{ start, length };
}

private static double getTotalRawLength(ArrayList<OrnamentEntry> group, double duration,
                                        ArrayList<Double> rawLengths, ArrayList<Double> rawStarts) {
    double totalRawLength = 0.0f;
    for (OrnamentEntry entry : group) {
        double[] resolved = resolveFrameValues(entry.od, duration);
        double len = resolved[1], start = resolved[0];
        rawLengths.add(len);
        rawStarts.add(start);
        double lengthUsedWithinPrincipal = len;
        if(start < 0)       lengthUsedWithinPrincipal = Math.max(0.0, len + start);
        else if (start > 0) lengthUsedWithinPrincipal = Math.min(start + len, start + duration);
        totalRawLength += lengthUsedWithinPrincipal;
    }
    return totalRawLength;
}
```

> **`%` resolution, authoritative form.** `frame.offset` and `frameLength` in `Relative` domain are
> multiplied by `principalDuration / 100`, where `principalDuration` is the principal note's
> **rendered millisecond duration** (`milliseconds.date.end − milliseconds.date`). This confirms
> the spec's under-documented intent (§9.7).

The "length used within the principal" clamp is odd: for `start > 0` it returns
`min(start + len, start + duration)` — a value that *includes* `start`, unlike the `start < 0`
branch which returns `len + start`. For the common case `start + len ≤ start + duration` it
yields `start + len`, over-counting by `start`. Probably intended as `min(len, duration − start)`.

**Overflow scaling** (`:767-770`):

```java
double scaleFactor = (totalRawLength > principalDuration && totalRawLength > 0.0)
        ? principalDuration / totalRawLength
        : 1.0;
```

Matches the (non-normative, commented-out) spec sketch: two ornaments wanting 80% and 40% are
scaled to 66.6% and 33.3%, preserving their 2:1 ratio.

**Front ornaments — sequential cursor** (`:772-786`):

```java
double cursor = 0.0;
for (OrnamentEntry entry : frontOrnaments) {
    int idx = group.indexOf(entry);
    double effectiveLength = rawLengths.get(idx) * scaleFactor;
    double effectiveStart  = cursor + rawStarts.get(idx);
    KeyValue<Double, Double> entryResult = entry.od.apply(entry.chordSequence, effectiveStart, effectiveLength, lastNote);
    entry.effectiveStart  = entryResult.getKey() + entry.od.date;
    entry.effectiveLength = entryResult.getValue();
    entry.effectiveEnd    = entry.effectiveStart + entry.effectiveLength;
    cursor = entryResult.getKey() + entryResult.getValue();
    lastNote = entry.getLatestNote();
}
```

> **Sequential spacing rule.** Ornaments on one principal are laid end-to-end:
> `effectiveStart(k) = cursor(k) + rawStart(k)`, `effectiveLength(k) = rawLength(k) * scaleFactor`,
> `cursor(k+1) = effectiveStart(k) + effectiveLength(k)`.
> `effectiveStart` is stored as an **absolute** date (`+ od.date`), while `cursor` stays a
> principal-relative offset.

`lastNote` carries across ornaments so the next `TemporalSpread.apply` can elide a repeated pitch
at the seam (§3.3, step 5).

**End ornaments** (`:788-813`):

```java
double neededSpace = 0.0f;
for (int i = endOrnaments.size() - 1; i >= 0; i--) {          // loop computes neededSpace...
    OrnamentEntry entry = endOrnaments.get(i);
    int idx = group.indexOf(entry);
    neededSpace += rawLengths.get(idx) * scaleFactor;
}
neededSpace = getTotalRawLength(endOrnaments, principalDuration, new ArrayList<>(), new ArrayList<>());
                                                              // ...and is then overwritten, ignoring scaleFactor

cursor = Math.max(cursor, principalDuration - neededSpace);

double endCursor = principalDuration;
for (OrnamentEntry entry : endOrnaments) { /* same body as the front loop */ }
```

> **BUG (dead loop).** The backwards accumulation at `:789-794` is immediately discarded by the
> reassignment at `:796`. The surviving value comes from `getTotalRawLength`, which does **not**
> apply `scaleFactor` and uses the odd within-principal clamp. When ornaments overflow, end
> ornaments are anchored using an unscaled length while being *rendered* with a scaled one.

> **BUG (dead variable).** `endCursor` is set to `principalDuration` at `:801` and never updated
> by the loop, yet it is tested at `:821` (`endCursor < principalDuration`) — always false. The
> guard therefore reduces to `cursor >= 0.0`, which is true in every realistic case, so the
> principal-carving block below always runs.

Despite the comment "apply end ornaments from the end backwards", the loop runs **forwards** and
simply continues the same cursor, starting from `max(frontCursor, principalDuration − neededSpace)`.

**Principal-note carving** (`:821-898`). The principal note is *deleted* and replaced by
"leftover" fragments covering the time not claimed by ornaments:

```java
if (principalNote != null && ((cursor >= 0.0) || (endCursor < principalDuration))) {
    double principalStart = principalNote.getDate();                       // NB: "date", not "milliseconds.date"
    if(principalNote.has("ornament.milliseconds.date.offset"))
        principalStart += principalNote.getAsDouble("ornament.milliseconds.date.offset");
    double principalEnd = principalStart + principalDuration;

    Map<Double, Double> principalLeftovers = new LinkedHashMap<>();
    double lastEnd = Double.MAX_VALUE;
    int ornamentEntryIndex = 0;
    for(OrnamentEntry entry : group) {
        if (ornamentEntryIndex == 0 && principalStart < entry.effectiveStart)
            principalLeftovers.put(principalStart, entry.effectiveStart);
        ornamentEntryIndex++;
        if(entry.effectiveStart <= lastEnd) { lastEnd = entry.effectiveEnd; continue; }
        else principalLeftovers.put(lastEnd, entry.effectiveStart);
        lastEnd = entry.effectiveEnd;
    }
    if(lastEnd < principalEnd) principalLeftovers.put(lastEnd, principalEnd);

    GenericMap map = null;
    for(GenericMap m : maps) if(m.contains(principalNote.getElement())) map = m;
    if(map == null) continue;

    map.removeElement(principalNote.getId());        // ← the principal is REMOVED

    int leftoverIndex = 0;
    for(Map.Entry<Double, Double> leftover : principalLeftovers.entrySet()) {
        double leftoverDuration = leftover.getValue() - leftover.getKey();
        if(leftoverDuration <= 1)                    // ← drop fragments of ≤ 1 ms
            continue;

        // prefer extending an existing ornament note of the same pitch
        MsmElement extendThis = null;
        OrnamentEntry ornamEntry = null;
        for(OrnamentEntry entry : group) {
            ornamEntry = entry;
            ArrayList<Element> lastChord = entry.chordSequence.get(entry.chordSequence.size()-1);
            for(Element element : lastChord) {
                MsmElement note = new MsmElement(element);
                double noteEnd = getNoteDate(note)
                               + note.getAsDouble("ornament.milliseconds.date.offset")
                               + note.getAsDouble("ornament.milliseconds.duration");
                if(note.get("midi.pitch").equals(principalNote.get("midi.pitch")) && noteEnd >= leftover.getKey()) {
                    extendThis = note; break;
                }
            }
            if(extendThis != null) break;
        }
        if(extendThis != null) {
            extendThis.set("ornament.milliseconds.duration",
                String.valueOf(leftover.getValue() - getNoteDate(extendThis)
                             - extendThis.getAsDouble("ornament.milliseconds.date.offset")));
            continue;
        }

        MsmElement note = new MsmElement(principalNote.getClonedElement());
        note.setId(note.getId() + "_split" + leftoverIndex++);
        note.set("milliseconds.date",     leftover.getKey());
        note.set("milliseconds.date.end", leftover.getValue());
        if(ornamEntry != null)
            ornamEntry.chordSequence.add(new ArrayList<>(Arrays.asList(note.getElement())));
        map.addElement(note.getElement());
        addedNotes.computeIfAbsent(correspondenceId, k -> new ArrayList<>()).add(note.getId());
    }
}
```

> **What happens to the principal note.** It is **always removed** from the map and replaced by
> 0..n clones with ids `<originalId>_split0`, `_split1`, … carrying explicit
> `milliseconds.date` / `milliseconds.date.end` for each gap. If an ornament note of the same
> pitch already covers the gap's start, that note's `ornament.milliseconds.duration` is *extended*
> instead and no split note is made. **Fragments of ≤ 1 ms are dropped** (`leftoverDuration <= 1`,
> `:862-864`) — that is the only "too-short leftover" threshold in the code; it is a bare
> comparison, no rounding.

> **BUG (domain mix).** `principalStart` uses `principalNote.getDate()` =
> `MsmElement.getAsDouble("date")`, the **tick** date, then adds a **millisecond** offset and
> compares against `effectiveStart` values that are millisecond-domain
> (`entryResult.getKey() + od.date`, where `od.date` was overwritten to the principal's
> `milliseconds.date` at `:745-746` only in the pre-shift branch). Unless PPQ and tempo conspire,
> the leading-leftover test `principalStart < entry.effectiveStart` and the trailing test
> `lastEnd < principalEnd` compare incommensurable quantities. This is the single most suspicious
> line in the rendering path.

> **BUG.** `lastEnd` starts at `Double.MAX_VALUE`, so the first entry always takes the
> `entry.effectiveStart <= lastEnd` branch; combined with the `ornamentEntryIndex == 0` special
> case this works for one ornament but mis-handles a group whose first entry is `atEnd`.

> **BUG.** `ornamEntry` is left pointing at the *last* entry examined by the search loop
> (it is assigned before the inner test), so a split note is appended to an essentially arbitrary
> entry's `chordSequence` — which then feeds back into `getLatestNote()` and future carving.

### 4.7 Phase A — `renderAllNonmillisecondsModifiersToMap`

`OrnamentationMap.java:1054-1102`. Consumes the tick-domain attributes:

- `ornament.dynamics` → added to `velocity` (`:1059-1065`), only if `velocity` exists.
- `ornament.date.offset` → added to `date.perf` (`:1068-1074`).
- then, in priority order:
  - if `ornament.duration` present → set `duration.perf` := it, and
    `date.end.perf` := `datePerf + ornamentDateOffset + ornamentDuration` (`:1079-1088`);
  - else if `ornament.noteoff.shift` present (only ever written for `"true"`) →
    `date.end.perf += ornamentDateOffset`, duration unchanged (`:1090-1093`);
  - else (`noteoff.shift="false"`) → `duration.perf -= ornamentDateOffset`, end date unchanged
    (`:1094-1097`; note the stray double semicolon).

As established in §1.2, nothing in the PR's own flow writes these attributes, so this method is
inert for PR-generated ornaments.

### 4.8 Phase B — `renderMillisecondsModifiersToMap`

`OrnamentationMap.java:1112-1153`. After `apply()` + `spaceOrnaments()`:

```java
for (KeyValue<Double, Element> e : map.getAllElementsOfType("note")) {
    Element note = e.getValue();
    Attribute millisecondsDateAtt = Helper.getAttribute("milliseconds.date", note);
    if (millisecondsDateAtt == null) continue;
    double millisecondsDate = Double.parseDouble(millisecondsDateAtt.getValue());

    Attribute ornamentMillisecondsDateAtt = Helper.getAttribute("ornament.milliseconds.date.offset", note);
    double ornamentMillisecondsDateOffset = 0.0;
    if (ornamentMillisecondsDateAtt != null) {
        ornamentMillisecondsDateOffset = Double.parseDouble(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String.valueOf(millisecondsDate + ornamentMillisecondsDateOffset));
    }

    Attribute millisecondsDateEndAtt = Helper.getAttribute("milliseconds.date.end", note);
    Attribute ornamentMillisecondsDurationAtt = Helper.getAttribute("ornament.milliseconds.duration", note);
    if (ornamentMillisecondsDurationAtt != null) {
        double ornamentMillisecondsDuration = Double.parseDouble(ornamentMillisecondsDurationAtt.getValue());
        if (millisecondsDateEndAtt != null)
            millisecondsDateEndAtt.setValue(String.valueOf(millisecondsDate + ornamentMillisecondsDateOffset + ornamentMillisecondsDuration));
        else
            note.addAttribute(new Attribute("milliseconds.date.end", String.valueOf(millisecondsDate + ornamentMillisecondsDateOffset + ornamentMillisecondsDuration)));
    } else {
        Attribute ornamentNoteoffShiftAtt = Helper.getAttribute("ornament.noteoff.shift", note);
        if (ornamentNoteoffShiftAtt != null) {
            if (millisecondsDateEndAtt != null)
                millisecondsDateEndAtt.setValue(String.valueOf(Double.parseDouble(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset));
        } // else noteoff.shift="false": milliseconds.date.end remains unaltered
    }
}
```

> **Final timing equations.** For each note that carries ornament attributes, where
> `D0 = milliseconds.date` before this pass:
> ```
> milliseconds.date      = D0 + ornament.milliseconds.date.offset
> milliseconds.date.end  = D0 + ornament.milliseconds.date.offset + ornament.milliseconds.duration     (duration present)
>                        = milliseconds.date.end + ornament.milliseconds.date.offset                   (noteoff.shift="true")
>                        = unchanged                                                                   (noteoff.shift="false")
> ```

Note that `milliseconds.date` is read **before** it is mutated and the pre-mutation value is used
in the end-date formula — correct, but easy to get wrong in a port.

Since `spaceOrnaments` writes `milliseconds.date` / `milliseconds.date.end` directly onto the
split notes (`:890-891`) *and* those notes inherit no ornament attributes (they are clones of the
principal, which by then has none), the split notes pass through this loop untouched. Good.

### 4.9 `sanitizeOverlaps` — present, never called

```java
// OrnamentationMap.java:1155-1177
public static void sanitizeOverlaps(GenericMap map) {
    HashMap<String, MsmElement> latestMidiPitch = new HashMap<String, MsmElement>();
    for (KeyValue<Double, Element> note : map.getAllElementsOfType("note")) {
        MsmElement msmNote = new MsmElement(note.getValue());
        String midiPitch = msmNote.get("midi.pitch");
        if(latestMidiPitch.containsKey(midiPitch)) {
            MsmElement latestNote = latestMidiPitch.get(midiPitch);
            double endsAt = latestNote.getAsDouble("date.perf") + latestNote.getAsDouble("duration.perf");
            if (endsAt > msmNote.getAsDouble("date.perf")) {
                double duration = latestNote.getAsDouble("duration.perf") - (endsAt - msmNote.getAsDouble("date.perf"));
                if (duration <= 0.0) map.removeElement(latestNote.getId());
                else                 latestNote.set("duration.perf", duration);
            }
        }
        latestMidiPitch.put(midiPitch, msmNote);
    }
}
```

Its only call site is commented out (`:323`). It also operates on `date.perf`/`duration.perf`
(tick domain) while the ornament notes it would fix live in the millisecond domain. Do not port
as-is; if meico-ts wants overlap sanitation it needs a millisecond-domain version.

---

## 5. `OrnamentData.java` (+37/−10)

New fields (`:26-31`): `correspondence` (from `@noteid`), `notes` (child note pool),
`repetitions`. Existing: `date`, `scale = 0.0`, `noteOrder`, `style`, `ornamentDef`, `xml`, `xmlId`.

New XML constructor (`:42-72`):

```java
this.date = Double.parseDouble(xml.getAttribute("date").getValue());       // no null check
this.ornamentDefName = xml.getAttribute("name.ref").getValue();            // no null check
Attribute corresp = xml.getAttribute("noteid");  if(corresp != null) this.correspondence = corresp.getValue();
Attribute scale = xml.getAttribute("scale");     if (scale != null)  this.scale = Double.parseDouble(scale.getValue());
Attribute noteOrder = xml.getAttribute("note.order");
if (noteOrder != null) { /* "ascending pitch"/"descending pitch" kept whole, else strip '#' and split \s+ */ }
this.notes = new ArrayList<>();
xml.getChildElements("ornamentNote").forEach(note -> { this.notes.add(note); });     // ←←← wrong element name
Attribute id = xml.getAttribute("id", "http://www.w3.org/XML/1998/namespace");
```

Three notes:

1. **`scale` defaults to `0.0` — and that is spec-correct.** `ornament.xml` overrides
   `att.scale` to `usage="opt"` with `<tei:defaultVal>0.0</tei:defaultVal>`, and the ODD confirms
   it. Since `scale` multiplies the whole dynamics gradient, **an `<ornament>` without `@scale`
   is specified to produce no dynamics effect.** Do not "fix" this to 1.0 in the port.
   *However*, `OrnamentationMap.addOrnament` omits `@scale` when it equals `1.0`
   (`OrnamentationMap.java:110-111`), so writing 1.0 and reading back gives 0.0 — a genuine
   round-trip asymmetry worth diverging on (write `scale` whenever it differs from `0.0`).
2. **`getChildElements("ornamentNote")` never matches.** The spec element is `<note>`; the
   converter creates `<note>` (`Mei2MsmMpmConverter.MeiNote2MsmNote`). `ornamentNote` was a
   pre-release spec name that was reverted. So `od.notes` is **always empty** on the XML path.
   It does not matter operationally, because `applyNotesToMaps` reads children directly via
   `ornament.getChildrenAsMsmElements()` (`OrnamentationMap.java:352`) — but the field is a trap.
3. `repetitions` is declared but **never populated** by the XML constructor; the renderer reads
   the attribute straight off the element instead (`OrnamentationMap.java:417`).

`apply` (`:111-139`) is now a thin delegator returning `KeyValue<spacedStart, spacedLength>`:

```java
public KeyValue<Double, Double> apply(ArrayList<ArrayList<Element>> chordSequence,
                                      Double effectiveFrameStart, Double effectiveFrameLength, MsmElement lastNote) {
    KeyValue<Double, Double> result = null;
    if (this.ornamentDef == null) return result;
    ArrayList<ArrayList<Element>> tempChordSequence = new ArrayList<>(chordSequence);
    if (this.ornamentDef.getDynamicsGradient() != null)
        this.ornamentDef.getDynamicsGradient().apply(tempChordSequence, this.scale);
    if (this.ornamentDef.getTemporalSpread() != null)
        result = this.ornamentDef.getTemporalSpread().apply(tempChordSequence, effectiveFrameStart, effectiveFrameLength, lastNote);
    return result;
}
```

**Order matters: dynamics first, then temporal spread.** Master's TODO about generating/replacing
notes here was removed — note generation moved to `applyNotesToMaps`.

`OrnamentationStyle` itself is **unchanged** in this PR (not in the diff); it is the plain
`GenericStyle` subclass holding `ornamentDef`s.

---

## 6. Infrastructure classes

### 6.1 `RichElement` (new, 335 lines) — **load-bearing**

`meico.xml.RichElement`, an attribute-first wrapper around a XOM `Element`. `MeiElement` and
`MsmElement` extend it. The ornamentation code uses it everywhere; a TS port needs an equivalent,
but the semantics below are what actually matter — not the class shape.

- **Constructing a wrapper mutates the document.** `initId()` (`:50-55`) assigns
  `xml:id="meico_<uuid>"` to any element that lacks one. So merely *reading* an element can change
  the XML. `Mei2MsmMpmConverter.checkIfOrnament()` depends on this side effect.
- `RichElement(element, deepCopy=true)` clones via `Helper.cloneElement(element, true)` — this is
  how ornament notes are instantiated (`OrnamentationMap.java:472`).
- `get(name)` (`:128-133`) returns `null` for absent **or empty** attributes.
  `MeiElement.get` overrides this to prefer `.ges` variants and fall back to a child search;
  `MsmElement` does not override it.
- `getAsDouble` / `getAsInteger` (`:140-157`) return **boxed nulls** when absent — every
  arithmetic use site in `OrnamentationMap` unboxes without a check, so a missing attribute is an
  NPE rather than a default.
- `set(name, double)` (`:183-185`) → `Double.toString(value)`. This is why MSM/MPM output is full
  of `"360.0"` and `"0.0hs"`. **A TS port must reproduce Java's `Double.toString` formatting**
  (always at least one decimal place, scientific notation past 1e7 / below 1e-3) or fixtures will
  not match. `OrnamentationMap.java:435` compares against the literal string `"0.0hs"`.
- `removeParent()` (`:331-334`) detaches from the parent — used to delete an elided ornament note.
- `getClonedElement()` (`:96-98`) is the deep copy used for split notes.
- `appendChild(Element)` (`:215-218`) **force-sets the MEI namespace on the child**, which is wrong
  when called on an MSM/MPM element.
- `getFromChild` (`:289-306`) returns after the first non-ignored child even when the result is
  `null` — only the first child subtree is ever searched.

`MsmElement` (new, 104 lines) adds `createNewId()` (`Helper.addUUID(element, true, true)`),
`getDate()`, `getNoteName()`, `getDuration()`, `getOctave()`, `isSameNote()`,
`getChildrenAsMsmElements()`. `isSameNote` compares `pitchname` + `octave` and NPEs when either is
absent — and `copyNotePerfInformation` deliberately does *not* copy those two attributes, so
ornament notes often lack them.

**Verdict:** `RichElement`/`MsmElement` are incidental refactoring in shape but load-bearing in
semantics (auto-id assignment, `Double.toString` formatting, null-returning getters). meico-ts
does not need the class hierarchy, but it must decide explicitly about auto-id assignment and
number formatting.

### 6.2 `MeiElement` (new, 86 lines)

MEI-namespace stamping plus a `.ges`-preferring `get()`. Only used by the MEI expander branch
(§7). Not needed for the MPM-side port.

### 6.3 `Stopwatch` (new, 67 lines)

`meico.supplementary.Stopwatch` — `System.currentTimeMillis()` deltas printed to stdout, with a
`reportingThreshold`. Purely a development profiling aid. `markTotal()` (no-arg) is buggy: it
calls `mark("")` instead of `markTotal("")`, so it reports the interval, not the total.
**Incidental. Do not port.**

### 6.4 `GenericMap.removeElement(String id)` (new, +20)

```java
// GenericMap.java:620-637
public void removeElement(String id) {
    for (KeyValue<Double, Element> e : this.elements) {
        String elemId = Helper.getAttributeValue("id", e.getValue());
        if (elemId.equals(id)) {                        // NPE-safe only because getAttributeValue returns ""
            for(Element elem : this.getXml().getChildElements())
                if(Helper.getAttributeValue("id", elem).equals(id)) { this.getXml().removeChild(elem); break; }
            this.elements.remove(e);
            return;
        }
    }
}
```

Required by the principal-note carving. Removes from both the parsed list and the XML tree.
(Mutating `this.elements` inside its own for-each is safe only because of the immediate `return`.)

### 6.5 `ArticulationMap` additions (+41) — dead

`getArticulationsByNoteId(noteid)` (`:588-598`) matches `@noteid == "#" + noteid`, and
`copyArticulations(addedNotes, articulationMap)` (`:605-623`) propagates a principal note's
articulations onto its generated ornament notes. **Both call sites in `Performance` are commented
out** (`Performance.java:477`, `:581`). So ornament notes currently inherit articulation only
through `copyNotePerfInformation`'s blanket attribute copy — i.e. whatever the articulation
renderer already stamped on the principal before Phase A. Worth implementing properly in the port;
note the `#`-prefix inconsistency with `applyNotesToMaps`'s raw comparison.

---

## 7. The MEI expansion branch — scope for meico-ts

This is a **separate, self-contained feature** and should be a distinct wave. It converts MEI
ornament markup into MPM ornaments *before* MSM/MPM conversion; the MPM renderer above does not
depend on it (it only consumes the MPM it produces).

### 7.1 Pipeline hook and opt-out

It is a **pre-pass over the whole MEI document**, not part of the converter:

```java
// Mei.java:421-425
public synchronized KeyValue<List<Msm>, List<Mpm>> exportMsmMpm(int ppq, boolean dontUseChannel10,
        boolean ignoreExpansions, boolean cleanup, boolean ignoreOrnaments) {
    if(!ignoreOrnaments)
        return this.expandOrnaments().exportMsmMpm(ppq, dontUseChannel10, ignoreExpansions, cleanup, true);
    return (new Mei2MsmMpmConverter(ppq, dontUseChannel10, ignoreExpansions, cleanup)).convert(this);
}

// Mei.java:249-257
public Mei expandOrnaments() {
    if(areOrnamentsExpanded) return this;
    areOrnamentsExpanded = true;
    return (new MeiOrnamentExpander()).expandOrnaments(this);
}
```

- Flag: **`ignoreOrnaments`, default `false`** (expansion ON). All four legacy `exportMsmMpm`
  overloads pass `false`.
- CLI: **`-eo`, `--ignore-ornaments`** (README). The `meico.app`/`Main` class is not in this repo,
  so the actual parsing lives in the separate meicoApp project.
- Ordering: runs **before** `resolveCopyofsAndSameas()`, `removeRendElements()`,
  `resolveExpansions()`, and before the `orig = document.copy()` snapshot used by `cleanup` — so
  the injected `<supplied>` elements and generated ids **survive cleanup** in the in-memory `Mei`.
- It **mutates the caller's `Mei` object** (the javadoc's "original stays untouched" refers only
  to the file on disk). `areOrnamentsExpanded` is the sole re-entrancy guard.

Consumption inside the converter, `Mei2MsmMpmConverter.java:550-554`:

```java
case "supplied":
    if(this.checkIfOrnament(e)) { this.processOrnament(e); continue; }
    break;
```

with the handshake being (`:2886-2889`):

```java
return element.getName().equals("supplied") && element.getId().startsWith("meico")
    && element.get("reason").startsWith("generated by meico");
```

### 7.2 What is expanded

| MEI | route | MPM ornamentDef name |
|---|---|---|
| `turn`, `trill`, `mordent`, `ornam` | `MeiOrnamentExpander.expandOrnamentsElement()` (dict lookup) | dict key, e.g. `"upper mordent"`, `"trill"` |
| `graceGrp`, `note[@grace]`, `chord[@grace]` | cached, expanded at next `measure` | `"grace acc"` / `"grace unacc"` (+ `" delayed"`) |
| grace whose principal is a `space` | `expandGrace()` | `"fioritura"` |
| `bTrem`, `fTrem` | `Mei2MsmMpmConverter.processTrem()` — **no MEI expansion** | `"tremolo"` |
| `arpeg` | pre-existing `processArpeg()` — **no MEI expansion** | `"arpeggio"` |

Name derivation: `form + " " + elementName` (so `<mordent form="upper">` → `"upper mordent"`);
for `<ornam>`, the child `<symbol>/@glyph.name` has the literal prefix `"ornamentPrecomp"`
stripped, is split on `(?=[A-Z])`, joined with spaces and lowercased.

### 7.3 `ornaments.dict` format

A line-based dictionary: `%` starts a comment, `#` lines are names (consecutive `#` lines are
aliases for the same entry), and the first following plain line is the **alteration list** —
whitespace-separated **diatonic step offsets** relative to the principal, plus the literal repeat
tokens `|:`, `:|`, `:|:`. Shipped entries:

```
trill                        →  |: 0 1 :|
upper turn                   →  1 0 -1 0
lower turn                   →  -1 0 1 0
upper mordent                →  0 1 0
lower mordent                →  0 -1 0
trill with mordent           →  |: 0 1 :| 0 -1 0
double cadence lower prefix  →  -1 0 |: 1 0 :|
   (alias: ornamentPrecompDoubleCadenceLowerPrefix)
```

Diatonic shifting is `Helper.shiftNoteDiatonicly(note, steps)` (`Helper.java:997-1011`) over
`[c,d,e,f,g,a,b]` with floor-division octave carry. The resulting semitone distance is written as
`@intm="<double>hs"` and, in MSM, as `interval.chromatic`. Every generated note gets a hardcoded
`dur="32"`.

### 7.4 Ornament construction

`<supplied>` wrappers with `<graceGrp>` children are converted to MPM `<ornament>` elements
carrying `date` (overridden to the principal's), `name.ref`, `noteid` (principal id, **without**
`#`), `note.order` (`#id` tokens plus `|:`/`:|`/`[`/`]`/`|`), `repetitions`, and `<note>` children
with `xml:id`, `date`, `midi.pitch`, `duration`, `intm`, `interval.chromatic`.
`repetitions="-1"` is emitted whenever a repeat barline is present ("guess at render time").
Defs land in a global style named **`"MEI export"`**, created on demand, with a style switch at
date `0.0`; def parameters come from `OrnamentDef.createDefaultOrnamentDef` (§3.6).
`[` / `]` chord brackets are produced **only** by `processTrem`.

### 7.5 Notable defects in this branch (relevant if ported)

- `Helper.getHalfstepsBetween(p1, p2)` is `Math.abs(getHalfstepsFromC(p2) − getHalfstepsFromC(p1))`
  (`Helper.java:1037-1039`) — the javadoc even says "always positive". Call sites need a *signed*
  interval, so e.g. principal `e4` with lower neighbour `d4` yields `intm="2.0hs"` instead of
  `-2.0hs`, and `b4`→`c5` yields `23.0hs` instead of `1.0hs`. **Drop the `abs` in the port.**
- Bare `<mordent/>` / `<turn/>` (no `@form`) have no dict key → NPE (no null check at
  `MeiOrnamentExpander.java:470-482`).
- SMuFL prefix stripping handles only `"ornamentPrecomp"`, not `"ornament"` → `ornamentTrill` NPEs.
- `createOrnamentLookUp` re-`put`s a fresh list per alteration line, so multi-line alteration
  blocks are impossible and a stray whitespace line wipes an entry.
- Ornament child `<note>` elements are created in **no namespace** inside an MPM-namespaced
  parent → they serialize as `<note xmlns="">`.
- `@prev`/`@next` are compared without stripping `#`, so combined ornaments are silently dropped.
- Grace-note principal detection does not descend into `beam`/`chord` (acknowledged TODO).

Full detail is available but out of scope for the MPM renderer port.

---

## 8. Spec fidelity audit

Legend: **✗** = violates/does not implement the spec; **~** = partial; **+** = beyond spec;
**✓** = conformant.

| # | Spec requirement (v3, `mpm-develop` @ `1de00bb`) | Implementation | |
|---|---|---|---|
| 1 | `frame.offset` — suffix **mandatory**, regex `^-?[0-9]+(\.[0-9]+)?(ms\|%\|ticks)$` | `TemporalValue.fromString` regex is `^(\d+)(ms\|th\|%\|ticks\|\?)$`: no sign, no decimals, extra `th`/`?` | ✗ |
| 2 | `frame.offset` default `0.0ticks` | field default `create(0.0, Ticks)`; but the XML ctor resets the domain from `@time.unit` | ~ |
| 3 | `frame.start` **deleted** in v3 (not deprecated) | still read as a fallback (`OrnamentDef.java:315-317`) — good lenience | + |
| 4 | `frameLength` — suffix mandatory on `temporalSpread`, default `100%` | parsed with bare `Double.parseDouble`; **a suffixed value throws and destroys the whole `ornamentDef`**; XML default is ticks, not `100%` | ✗ |
| 5 | `frameLength` may be negative in v3 (`^-?`) | clamped to `≥ 0` by `setFrameLength` | + (matches v2.1.4 intent) |
| 6 | `@time.unit` **removed** from v3; no element carries it | it is the primary unit mechanism, both read and written | ✗ |
| 7 | `alignment` lives on **`ornamentDef`**, values `"at start"` / `"at end"` | read from and written to `temporalSpread`; values match exactly (with the space) | ✗ (host element) / ✓ (values) |
| 8 | `intensity` — `double`, `minExclusive 0.0`, default `1.0` | default `1.0` ✓; **no validation**, `0` and negatives accepted and produce degenerate spacing | ~ |
| 9 | `noteoff.shift` ∈ {`true`,`false`,`monophonic`}, default `false` | all three parsed; `true`/`monophonic` implemented as specified; **`false` is not** (ornament notes get a tick `duration` as an ms end-offset instead of ending at the principal's note-off) | ~ |
| 10 | `scale` on `ornament` — optional, **default `0.0`** | `0.0` ✓ — but `addOrnament` omits `scale` when it is `1.0`, so 1.0 round-trips to 0.0 | ~ |
| 11 | `repetitions` — `integer`, `minInclusive 0`, default `0`, meaning `n+1` playbacks | `(r+1)*groupLen` ✓; **`-1` sentinel** ("fill the principal, 150 ms per note") is an extension the schema forbids | + |
| 12 | `note.order`: every id token must start with `#`; tokens `[ ] \| \|: :\| :\|:` whitespace-separated | `:\|:` normalised ✓; `[ ]` ✓; `\|` dropped ✓; **splits on a single space, not `\s+`**; **a token without `#` causes an infinite loop** | ~ / ✗ |
| 13 | `note.order` = `"ascending pitch"` / `"descending pitch"` sorts notes at `@date` by pitch | parsed, then **`noteOrderAscending = 0` erases it**; the keywords fall through the tokenizer and the ornament is dropped | ✗ |
| 14 | Principal note = `@noteid`, **or** an id in `note.order` that is not a child `<note>` | only `@noteid`; the fallback is unimplemented | ✗ |
| 15 | `@noteid` expected with a leading `#` (`@noteid[starts-with(., '#')]`) | compared raw, without stripping `#` | ✗ |
| 16 | No principal ⇒ all `<note>`s need explicit `@midi.pitch` | no-principal path generates **no notes at all** | ✗ |
| 17 | Child element is `<note>`; pitch via `midi.pitch` xor `interval.chromatic` xor `interval.diatonic` | `OrnamentData` looks for `<ornamentNote>` (a reverted pre-release name) — always empty; **no interval→pitch resolution anywhere on the MPM side**; `interval.chromatic` is written but never read | ✗ |
| 18 | `%` is relative to the principal note's duration (established only by `figures/modelling_ornaments.png`) | `resolveFrameValues` multiplies by the principal's **millisecond** duration | ✓ |
| 19 | Frame spans `[date + frame.offset, date + frame.offset + frameLength]` | `dateOffset(i) = ((i/n)^intensity)*length + start`, frame end `start+length` | ✓ |
| 20 | Ornamentation runs **twice**: symbolic modifiers before Tempo, ms modifiers after (ODD rendering steps 10 and 15) | both hooks exist, but **all** values are forced into the ms attributes; the symbolic pass is inert | ~ |
| 21 | dynamicsGradient is micro-dynamics, additive on macro dynamics, range `[-1,1]` | additive accumulation ✓, no range validation; **and the fold-into-velocity pass runs in Phase A, before the gradient is computed in Phase B — so it never reaches velocity** | ✗ |
| 22 | "Multiple ornaments … are spaced sequentially" | implemented with a cursor + proportional shrink (matching the non-normative sketch) | ✓ + |
| 23 | `transition.to` absent ⇒ (spec silent) | defaults to `transition.from` (constant dynamics) — sensible | + |
| 24 | `<ornament>` elements must be in ascending `@date` order | not validated (inherited `GenericMap` ordering) | ~ |

**The headline:** items 4, 6, and 1 together mean **this implementation cannot read a
spec-conformant MPM v3 file.** It reads MPM v2 with an optional `frame.offset` alias. Item 13 and
items 14–17 mean substantial parts of the v3 ornamentation model (pitch by interval, principal
resolution via `note.order`, pitch-ordered ornaments) are not implemented at all.

---

## 9. Bug catalogue (MPM-side only)

Ordered by how much they should influence the port. "New" = introduced by this PR.

**Blocking / correctness**

1. **`frameLength` with a unit suffix destroys the `ornamentDef`** (`OrnamentDef.java:321-323`) —
   `NumberFormatException` → `createOrnamentDef` returns `null` → all referencing ornaments are
   skipped. New. *Port: parse through the unit-aware parser.*
2. **Bare (non-`#`) tokens in `note.order` cause an infinite loop**
   (`OrnamentationMap.java:362-408`) — no branch advances `j`. New.
3. **`"ascending pitch"` / `"descending pitch"` are dead** — `noteOrderAscending = 0` at
   `OrnamentationMap.java:616` erases the parse result, and the keyword then fails tokenization,
   dropping the ornament. New.
4. **Dynamics gradient never reaches velocity** — written in Phase B, consumed in Phase A
   (§3.6). New (a consequence of the phase relocation).
5. **`noteoff.shift="false"` writes a tick duration into a millisecond attribute**
   (`OrnamentDef.java:537-544` + `OrnamentationMap.java:1139-1144`). Affects every arpeggio
   (the only default using `False`). New.
6. **Tick/millisecond mixing in principal-note carving** — `principalNote.getDate()` reads the
   tick `date` and is compared against millisecond `effectiveStart` values
   (`OrnamentationMap.java:822-847`). New.
7. **`getPrincipalDuration` fallback returns ticks** where callers expect milliseconds
   (`OrnamentationMap.java:997-1006`, used at `:732`). New.
8. **Global ornamentationMap state leaks across parts** — `ornamentEntries` is never cleared and
   the global map is not cloned (§1.3). New.
9. **`repetitions` absent + `-1` path**: NPE if the principal lacks `milliseconds.*`; **infinite
   loop** if the repeat group is empty (`OrnamentationMap.java:417-431`). New.
10. **`TemporalValue` round-trip is broken** — `toString()` emits `"360.0ticks"`, which
    `fromString` cannot parse (§2.2–2.3). New. (Masked only because `generateXML` bypasses it.)

**Likely wrong**

11. `endCursor` is never updated, making the carving guard `endCursor < principalDuration` always
    false (`OrnamentationMap.java:801`, `:821`). New.
12. The backwards `neededSpace` loop is immediately overwritten, dropping `scaleFactor` from end-
    ornament anchoring (`OrnamentationMap.java:788-796`). New.
13. `ornamEntry` in the leftover loop points at an arbitrary entry
    (`OrnamentationMap.java:866-882`). New.
14. `getTotalRawLength`'s `start > 0` clamp returns `min(start+len, start+duration)`, including
    `start` in a length (`OrnamentationMap.java:934-935`). New.
15. `note.removeParent()` detaches an elided note but leaves it in `chordSequence`, so it still
    consumes a spacing slot (`OrnamentDef.java:466-472`). New.
16. `lastEnd` initialised to `Double.MAX_VALUE` mis-handles a group whose first entry is `atEnd`
    (`OrnamentationMap.java:828-845`). New.
17. MIDI note-off repair `dateEnd = -(date-dateEnd)` substitutes a duration for an end date
    (`Msm.java:1262-1264`). New.
18. `getOrnamentDataOf(int)` builds an `OrnamentData` and unconditionally `return null`
    (`OrnamentationMap.java:174-238`). **Pre-existing in master** — not a regression, but it means
    the public accessor has never worked.
19. `addOrnament` omits `scale` when `== 1.0`, which reads back as `0.0` (§5).
    Pre-existing.

**Fragile / dead**

20. `apply()` returns `addedNotes` from the last map only, overwriting earlier maps
    (`OrnamentationMap.java:561-563`).
21. `applyNotesToMaps` NPEs when an ornament has no `note.order` (`:353`) or no children (`:453`).
22. Exception swallowed with an unused local in `Performance.java:531-533`.
23. `sanitizeOverlaps` never called and operates on the wrong domain (§4.9).
24. `OrnamentEntry.getFirstNote()` dead and incorrect (§4.5).
25. `TemporalValue.getGreater`/`getLess` return arbitrary operands across domains (§2.4).
26. `Stopwatch.markTotal()` (no-arg) reports the interval, not the total.
27. `OrnamentData.notes` always empty (`ornamentNote` vs `note`) (§5).
28. `generateXML` omits `frame.start`/`frameLength` at value `0.0` while still writing the unit,
    making "zero" and "absent" indistinguishable (§3.5).
29. `ArticulationMap.copyArticulations` is dead code; its `#`-prefix convention contradicts
    `applyNotesToMaps`'s raw comparison (§6.5).

---

## 10. Test vectors — there are none

**The PR ships zero tests.** No test sources exist anywhere in the repository
(`git diff --name-only cdb330a 3deb141 | grep -i test` is empty; `build.xml:8` hardcodes
`skip.tests=true`; there is no `src/test`, no JUnit dependency in `externals/`).

So the "gold test vectors" the brief hoped for do not exist. What *can* serve as reference data:

1. **`OrnamentDef.createDefaultOrnamentDef` (§3.6)** — a ten-row table of exact
   `(transitionFrom, transitionTo, frameStart, frameLength, domain, intensity, noteOffShift, atEnd)`
   tuples. These are the highest-value fixtures available: they are the parameters every
   MEI-derived ornament actually renders with, and they are pure data.
2. **`src/resources/ornaments.dict` (§7.3)** — seven ornament shapes with exact diatonic
   alteration sequences and repeat-group placement.
3. **The MPM spec repo's sample encoding** (in `mpm-develop`, *not* in meico):
   `sample encodings/Max Reger - Moment Musical (MPM Toolbox Tutorial)/Reger - Moment Musical
   op 13 no 4.mpm` — the only ornamentation data in either repo. Verified content:

   ```xml
   51:  <temporalSpread frame.offset="-22.0" frameLength="44.0"/>
   173: <ornament date="4860.0" name.ref="arpeggio" scale="0.0" note.order="#n96 #n97 #n98"/>
   213: <temporalSpread frame.offset="0.0" frameLength="300.0" time.unit="milliseconds"/>
   272: <ornament date="4860.0" name.ref="arpeggio" scale="0.0" note.order="#n98 #n97 #n96" xml:id="..."/>
   ```

   This is a **hybrid**: it uses the v3 attribute name `frame.offset` but **suffix-less values**
   and the **removed `@time.unit`** — i.e. it would fail strict v3 schematron validation, and it
   is exactly the shape Lars' parser expects. Strong evidence that a lenient read path
   (suffix-less + `@time.unit` fallback) is a practical necessity, not just a courtesy.
   Note also `scale="0.0"` written explicitly, and `note.order` with `#`-prefixed ids and no
   `@noteid` — i.e. this file exercises precisely the principal-resolution path Lars does **not**
   implement (audit item 14), so it renders no ornament notes under his code. It covers
   `arpeggio` only.
4. **The spec's own worked example** (`ornament.xml` exemplum): a half-tone trill with
   `repetitions="3"` documented as "played four times" — good for validating the
   `(r+1)*groupLen` rule.
5. **Differential testing.** The practical route is to *build* Lars' branch and drive it
   end-to-end: MEI in → MSM/MPM out → expressive MSM out. Note that `Msm.exportExpressiveMidi`
   gained a `writeExpressiveMsm` flag in this very PR (`Msm.java:878-892`) which dumps
   `<name>-expressive.msm` — **that is the intended debugging hook and the natural fixture-capture
   mechanism** for meico-ts parity testing. This is the recommendation for task ORN-7.

Caveat for ORN-7: because of bugs 1–9 above, captured fixtures will encode the reference's
*defects*. Any fixture set must be reviewed against this report's audit table before being
adopted as expected output, and divergences recorded deliberately rather than matched blindly.

---

## 11. Port recommendations

1. **Do not port `TemporalValue` as-is.** Implement a unit-aware value with the *spec's* regex
   (`^-?[0-9]+(\.[0-9]+)?(ms|%|ticks)$`), a strict parse that reports errors, and a lenient mode
   that accepts suffix-less values (falling back to `ticks`, or to a legacy `@time.unit` when
   present) — because both the ODD's own examples and the repo's only sample encoding are
   suffix-less. Port only `create/getValue/setValue/getDomain/isRelative`; drop the relation
   chain, the comparison helpers, and `toString` as canonical form.
2. **Model the frame domain per value, not per element.** The Java code's single shared domain is
   a v2 artifact; the v3 grammar allows `frame.offset="22.0ms" frameLength="90%"` on one
   `temporalSpread` (the ODD example at line 745). Resolve `ms` values in the millisecond stage
   and `ticks`/`%` values in the symbolic stage as the ODD's rendering order specifies — or, if
   meico-ts follows Lars in doing everything in milliseconds, record that as an explicit,
   documented divergence.
3. **Read `alignment` from both `ornamentDef` (spec) and `temporalSpread` (Lars).** Write it to
   `ornamentDef`.
4. **Write v3, read v1/v2/v3.** Emit `frame.offset` with unit suffixes and no `@time.unit`;
   accept `frame.start` and `@time.unit` on input.
5. **Keep `scale` defaulting to `0.0`** (spec-correct), but always serialize it, so a 1.0 does not
   silently become 0.0.
6. **Implement the two spec paths this PR skips**: principal resolution via a non-pool
   `note.order` reference, and the no-principal/`midi.pitch`-only path. Also implement
   `interval.chromatic` / `interval.diatonic` → pitch resolution on the MPM side (Lars only does
   it on the MEI side), including deciding what "diatonic" resolves against — the Java code uses
   the MEI pname/oct context, so meico-ts will need the MSM key signature or an explicit scale.
7. **Add an ornament-provenance marker** on generated notes. The reference has none, which makes
   round-tripping and debugging hard; this is a low-cost, high-value divergence.
8. **Fix the phase ordering for dynamics** so the gradient actually reaches velocity.
9. **Preserve these formulas exactly** (they are the reference's real contribution):
   - onset: `dateOffset(i) = ((i / n) ^ intensity) * length + start`, frame end `start + length`;
   - dynamics: `dyn(n) = scale*from + n * scale*(to − from)/(N − 1)`, single chord ⇒ `scale*to`;
   - multi-ornament: `effectiveStart(k) = cursor(k) + rawStart(k)`,
     `effectiveLength(k) = rawLength(k) * scaleFactor`,
     `scaleFactor = min(1, principalDuration / totalRawLength)`,
     `cursor(k+1) = effectiveStart(k) + effectiveLength(k)`;
   - `%` resolves against the principal's rendered duration;
   - repetitions: `(r+1) * groupLen`, or `ceil(principalMs / 150)` for the `-1` sentinel;
   - leftover fragments of `≤ 1 ms` are dropped.
10. **Reproduce Java's `Double.toString` formatting** in any output intended to match reference
    fixtures, or normalize numerically in the comparison harness instead.
