# Expression Attribute Survey (W0)

This is the evidence base for the exaggeration design in `DESIGN.md`. It was produced on
**2026-08-09** by parallel code readers, one per MPM expression family, each of which read the
renderer rather than the specification: every "neutral" claim below is justified by the value at
which the *renderer* becomes the identity, and every domain claim names the line that does (or,
far more often, does not) enforce it. Nothing here is inferred from the MPM spec or from
convention alone. Its job is to fill `DESIGN.md` §6 (the registry) and to settle §3 (which
dimensions exist, and which attributes are excluded and why).

**Reading it.** Each family section opens with an index table — one row per attribute, cells kept
short — followed by a per-attribute detail block carrying the full argument and every citation,
then the walker notes (how to reach the attribute from a `Performance`) and the hazards. The
hazards are the most valuable part: they are the traps a naive `attribute *= s` applier falls into.

**Citation convention.** All paths are relative to the repo root
`/Users/nielspfeffer/Projects/meico-ts-exag`. Where a family's reader cited a bare class name
(`TempoMap.ts:373`) the file is the obvious one in `src/mpm/elements/maps/`. Line numbers are as of
2026-08-09.

**Scope note.** Two attributes appear in more than one family because two readers reached them from
different directions (`dynamicsGradient@transition.*` and `ornament@scale` are surveyed both under
*dynamics* as adjacent and under *ornamentation* as native). Both readings are kept; they agree on
the neutral and disagree only on emphasis.

---

## 1. Tempo

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `tempo@bpm` | double **or** style-name string | ℝ>0; enforced **nowhere** | none absolute — pair or map geometric mean | `@transition.to` | **log around μ** |
| `tempo@transition.to` | double **or** style-name string | ℝ>0; not validated; degenerate values deleted at parse | `transition.to == bpm` is the exact identity; point neutral `√(bpm·to)` | `@bpm` | **log around μ**, pairwise |
| `tempo@meanTempoAt` | double (proportion) | open (0,1); out-of-range *reinterpreted*, not clamped | `0.5` (exponent 1.0) | shape param of the bpm/to pair | **logit around 0.5** |
| `tempo@beatLength` | double (fraction of whole note) | ℝ>0; required by map parser; never clamped | "unchanged" — it is a unit declaration | — | **NOT exaggerable** (context only) |
| `tempo@date` | double (ticks) | ≥0; map sort key | none — timeline coordinate | next entry's date | **NOT exaggerable** |
| `tempoDef@value` | double (bpm) | ℝ>0; strict parse, malformed def dropped | same as `@bpm` | shared by every reference | **log**, but shared lever |
| *(derived)* `TempoData.exponent` | double | (0,∞) | `1.0` | cache of `@meanTempoAt` | **DO NOT TOUCH** |
| `tempo@date.end` | double (ticks) | transient MEI working attribute | none | — | **NOT exaggerable** (ignore) |
| `performance@pulsesPerQuarter` | int | >0, default 720 | n/a (resolution decl.) | — | **NOT exaggerable** (context) |

### Per-attribute detail

#### `tempo@bpm` (element `<tempo>` in `<tempoMap>`)

*Data field:* `TempoData.bpm (number|null)` + `TempoData.bpmString (string|null)`.
*Paired with:* `tempo@transition.to`.

**Domain.** Strictly positive reals. It only ever appears as a DIVISOR:
`15000*(date-start)/(bpm*beatLength*ppq)` at `TempoMap.ts:373`, and `1/bpm` inside the Simpson sums
at `TempoMap.ts:402,404,407`. `bpm=0` ⇒ ±Infinity ms, `bpm<0` ⇒ negative elapsed time, NaN poisons
every downstream `milliseconds.date`. ENFORCED NOWHERE: `TempoStyle.getNumericBpmValueStatic` only
substitutes `100.0` for a non-numeric string (`TempoStyle.ts:52-57`); `TempoData`'s own ctor does a
raw `parseFloat` (`TempoData.ts:48`); no clamp in parser or renderer.

**Neutral.** No absolute "no-effect" value exists — bpm is a *level*, not a deviation. Two
renderer-justified neutral-point strategies:

- **LOCAL/pair neutral** = geometric mean `sqrt(bpm*transition.to)` of its own transition pair,
  justified because the renderer's own identity test for "this transition does nothing" is
  `transition.to === bpm` (`TempoData.isConstantTempo`, `TempoData.ts:97-99`; collapse at
  `TempoMap.ts:137-139`), i.e. only the RATIO `bpm:transition.to` carries the gesture; and because
  elapsed time is the integral of `1/tempo` (`TempoMap.ts:392-408`), a quantity in which equal
  log-distances above and below the geometric mean produce mirrored time-warps.
- **GLOBAL neutral** = geometric mean of all `bpm`/`transition.to` values in the map, since the
  map's absolute level is a performance-tempo choice and only log-differences are the expressive
  content.

NOTE: `100.0` (`TempoMap.ts:214`, `TempoStyle.ts:57`) is the MISSING-DATA fallback, not a neutral:
with an empty tempoMap the renderer uses `600*date/ppq` (`TempoMap.ts:366`), which is exactly
100 bpm at beatLength 0.25 (`15000/(100*0.25)=600`). A defensible default anchor, never an identity.

**Exaggerability.** Multiplicative / log space: `x' = mu*(x/mu)^s`. Positivity-closed for any `s`,
fixed point at `mu`, composes (`s1*s2`). Hazards: (1) a named bpm (`'Allegretto'`) must be resolved
through the tempoStyle before scaling, and writing the scaled number back destroys the
style-relative wording that serialization prefers (`TempoMap.ts:63-64` checks `bpmString` first; doc
at `TempoData.ts:9-14`). (2) MEI-converted documents can carry literal placeholder strings `'+'`,
`'-'`, `'?'` in bpm (`Mei2MsmMpmConverter.ts:3630-3633,3653`; the patch-up loop at `2497-2512`
usually replaces them, but the analogous dynamics placeholders demonstrably survive into fixture
MPM), and those resolve to `100.0` with only a console error — a scale factor applied to them is
silently meaningless. (3) Cross-instruction centering must first normalize to quarter-note bpm
(`bpm*beatLength*4`); raw bpm values of instructions with different `beatLength` are not
commensurable.

**Evidence.** parse: `TempoMap.ts:118-119` (required, null ⇒ whole instruction skipped),
`TempoMap.ts:131-132` (style resolution); raw path `TempoData.ts:46-54`. resolve:
`TempoStyle.ts:44-58`. consume: `TempoMap.ts:215` (constant), `TempoMap.ts:222` (transition
interpolation), `TempoMap.ts:373` (constant ms), `TempoMap.ts:402` (Simpson endpoint `1/bpm`).
default: `TempoMap.ts:214`. serialize: `TempoMap.ts:62-68, 83`.

#### `tempo@transition.to` (element `<tempo>`)

*Data field:* `TempoData.transitionTo (number|null)` + `TempoData.transitionToString (string|null)`.
*Paired with:* `tempo@bpm`.

**Domain.** Same as bpm: strictly positive reals; same divisor role via `getTempoAtStatic` feeding
`1/tempo` (`TempoMap.ts:222` → `402-407`). Optional — absence means a constant tempo. Not validated
or clamped anywhere. A value equal to `bpm`, or any value combined with `meanTempoAt<=0` or `>=1`,
is deleted at parse time (`TempoMap.ts:137-139, 144-151`).

**Neutral.** `transition.to == bpm` is the EXACT identity, proven by the renderer:
`TempoData.isConstantTempo()` returns true when `transitionTo === bpm` (`TempoData.ts:97-99`);
`getTempoDataOf` then nulls both string and number (`TempoMap.ts:137-139`); `computeDiffTiming`
dispatches to `computeMillisecondsForConstantTempo` instead of the Simpson integrator
(`TempoMap.ts:360-362`); and `getTempoAtStatic` returns bpm unchanged for every date
(`TempoMap.ts:215`). So the pair's no-effect configuration is the ratio `transition.to/bpm = 1`, and
the pair's neutral POINT is their geometric mean `mu = sqrt(bpm*transition.to)`, which is invariant
under the log-scaling and therefore makes `s=1` an identity and `s` composition exact.

**Exaggerability.** Exaggerate the PAIR, not the attribute: `mu = sqrt(bpm*to)`;
`bpm' = mu*(bpm/mu)^s`; `to' = mu*(to/mu)^s`. `s=1` identity, `s=0` collapses the pair to a constant
tempo at `mu` (which the parser then normalizes away entirely), `s>1` steepens the
accelerando/ritardando while keeping the mean tempo of the span fixed in log space. Hazards: the
collapse test is exact float equality (`TempoMap.ts:137`) — format both sides of the pair through
the same number→string path so a scaled pair does not accidentally serialize to identical strings
(silent gesture loss) or to two values differing in the last ULP (a "transition" with no audible
slope that still forces the expensive Simpson path).

**Evidence.** parse: `TempoMap.ts:133-136`; raw path `TempoData.ts:56-64`. collapse/normalize:
`TempoMap.ts:137-139` (`== bpm`), `144-148` (`meanTempoAt<=0` promotes `transition.to` to `bpm`),
`149-151` (`meanTempoAt>=1` drops it). consume: `TempoData.ts:97-99`, `TempoMap.ts:216` (exact
endDate hit), `TempoMap.ts:222`, `TempoMap.ts:360-362`. serialize: `TempoMap.ts:69-72, 85`.

#### `tempo@meanTempoAt` (element `<tempo>`)

*Data field:* `TempoData.meanTempoAt (number|null)`; derives `TempoData.exponent`.
*Paired with:* only meaningful together with `tempo@bpm` + `tempo@transition.to` (shape parameter of
that pair).

**Domain.** Musically meaningful only on the OPEN interval (0,1). The parser accepts any double and
does not clamp — it REINTERPRETS out-of-range values: `<=0` makes `transition.to` the constant tempo
and deletes the transition (`TempoMap.ts:144-148`); `>=1` keeps bpm and deletes the transition
(`TempoMap.ts:149-151`). Absent, with a real transition present, defaults to 0.5 with exponent 1.0
(`TempoMap.ts:155-158`). The raw `TempoData` ctor applies NONE of this (`TempoData.ts:66-67`), and
the lazy fill-in inside `getTempoAtStatic` calls `computeExponent` directly (`TempoMap.ts:218-220`),
where `meanTempoAt=1` yields `ln(0.5)/ln(1) = -Infinity` and `meanTempoAt<0` yields NaN.

**Neutral.** `0.5`, justified by the renderer being the identity there: `computeExponent(0.5) =
ln(0.5)/ln(0.5) = 1.0` (`TempoMap.ts:177-179`), and `getTempoAtStatic` then evaluates
`Math.pow(result, 1.0) === result` (`TempoMap.ts:221`), so the normalized position passes through
unchanged and the tempo curve degenerates to the straight line `result*(to-bpm)+bpm`
(`TempoMap.ts:222`). The code states this twice more: the no-attribute default is written as the
literal pair `{meanTempoAt 0.5, exponent 1.0}` (`TempoMap.ts:155-157`), and the MEI converter stamps
0.5 on every transition it creates (`Mei2MsmMpmConverter.ts:3660`).

**Exaggerability.** Logit around 0.5: `x' = 1/(1+((1-x)/x)^s)`. Bijective on (0,1), fixed point 0.5,
domain-closed without a clamp, composes. Musically: `exponent = ln(0.5)/ln(x)`, so `x<0.5` ⇒
`exponent>1` ⇒ the tempo change is back-loaded (the ritardando "happens late"), `x>0.5` ⇒
`exponent<1` ⇒ front-loaded. Exaggeration pushes the curve toward its extremes. Hazards: (1) the
value MUST be kept strictly inside (0,1) by an epsilon — hitting 0 or 1 is not a limit but a
semantic cliff that turns the instruction into a constant tempo at the OTHER endpoint
(`TempoMap.ts:144-151`). (2) The attribute is only ever read inside the `transition.to !== null`
branch (`TempoMap.ts:141`), so on a constant tempo it is dead XML: exaggerating it there produces a
document diff with zero audible effect and breaks a byte-identity-at-`s=1` invariant if applied
unconditionally. (3) It is scope-free — a shape parameter, unaffected by the local/global
neutral-point choice that bpm needs.

**Evidence.** parse: `TempoMap.ts:141-143`; raw path `TempoData.ts:66-67`. reinterpretation:
`TempoMap.ts:144-151`. default: `TempoMap.ts:155-158`; `Mei2MsmMpmConverter.ts:3660`. consume:
`TempoMap.ts:153` and `177-179` (exponent), `TempoMap.ts:218-221` (lazy fill + `Math.pow`).
serialize: `TempoMap.ts:73-74, 87`.

#### `tempo@beatLength` (element `<tempo>`)

*Data field:* `TempoData.beatLength` (class default 0.25). *Type:* double (fraction of a whole note:
0.25 = quarter, 0.5 = half, 0.125 = eighth).

**Domain.** Strictly positive reals. REQUIRED by the map parser: a `<tempo>` without it makes
`getTempoDataOf` return null, i.e. the whole instruction is skipped as if it did not exist
(`TempoMap.ts:120-121`). The raw `TempoData` ctor instead does
`parseFloat(getAttributeValue('beatLength')!)` and yields NaN silently when absent
(`TempoData.ts:44`). Never validated, never clamped; 0 gives Infinity ms.

**Neutral.** `0.25` (quarter note) is the conventional value — the class default (`TempoData.ts:34`),
what MIDI import always emits because the MIDI set-tempo event is defined per quarter and the beat
unit is unrecoverable (`Midi.ts:466-468, 483`), and the fallback of non-expressive MSM→MIDI export
(`Msm.ts:1176-1180`). But the correct neutral for an exaggeration engine is "unchanged", because
this attribute is a UNIT DECLARATION, not an expressive quantity: it enters the renderer only as a
plain multiplicative divisor beside bpm — `bpm*beatLength*ppq` (`TempoMap.ts:373`),
`N*beatLength*ppq` (`TempoMap.ts:401`), `mpq = 60000000/(bpm*beatlength*4)` (`EventMaker.ts:620`).
Scaling it by `k` is arithmetically indistinguishable from scaling bpm by `1/k`.

**Exaggerability.** NOT EXAGGERABLE. Any scaling is a redundant re-encoding of a bpm change that
additionally misreports the notated beat unit. Register it as read-only/pass-through. It is still
needed as CONTEXT: any cross-instruction neutral point (a global geometric mean over bpm values)
must first normalize each instruction to quarter-note bpm, `bpm*beatLength*4` — otherwise a 6/8
instruction at beatLength 0.125 and a 4/4 one at 0.25 are averaged as if commensurable.

**Evidence.** parse: `TempoMap.ts:120-121, 125` (required); `TempoData.ts:44` (raw, NaN-prone);
default `TempoData.ts:34`. consume: `TempoMap.ts:373` (constant ms), `TempoMap.ts:401` (Simpson
`resultConst`), `EventMaker.ts:619-621` (MIDI mpq). conventions: `Midi.ts:466-468,483`;
`Msm.ts:1166-1183`. produced from MEI `mm.unit`/`mm.dots`: `Mei2MsmMpmConverter.ts:3601-3613`.
serialize: `TempoMap.ts:75, 86, 91`.

#### `tempo@date` (element `<tempo>`; also on the `<style>` switches interleaved in the same map)

*Data field:* `TempoData.startDate`; `TempoData.endDate` is NOT an attribute — it is derived from
the next `<tempo>` entry, or `Number.MAX_VALUE` for the last one.

**Domain.** ≥ 0 reals. Used as the map's sort key: `GenericMap` parses it at insert time and skips
any child without it (`GenericMap.ts:144-147`); a non-numeric value becomes a NaN key with no error.
Not otherwise validated.

**Neutral.** None — it is the timeline coordinate, not a deviation from anything. Its tempo-family
roles beyond ordering are two: `(endDate - startDate)` normalizes the position inside a transition
(`TempoMap.ts:217`), and the Simpson sub-interval count is `N = 2*floor((date-startDate)/(ppq/4))`
(`TempoMap.ts:397`), so moving a date also changes the numerical-integration grid.

**Exaggerability.** NOT EXAGGERABLE inside this family. Moving instruction dates is a different
operation (agogic re-placement) and would silently reshape every transition span and the integration
grid. If some future transform does move dates: the sorted key array in `GenericMap` is a parallel
index, so an in-place attribute edit must be followed by `GenericMap.sort()`
(`GenericMap.ts:177-191`), and the last instruction's implicit `endDate = Number.MAX_VALUE`
(`TempoMap.ts:167`) means a final transition integrates over an effectively infinite span.

**Evidence.** parse/index: `GenericMap.ts:144-155, 374-384`. startDate: `TempoMap.ts:122`; endDate
derivation: `TempoMap.ts:166-175`. consume: `TempoMap.ts:217` (position), `297-299` and `321-322`
(which tempo times which map entry), `373` and `397-401` (ms formulas). serialize:
`TempoMap.ts:62, 82`.

#### `tempoDef@value` (element `<tempoDef>` inside `<tempoStyles>/<styleDef>`)

*Data field:* `TempoDef.value` (private, via `getValue()`/`setValue()`).

**Domain.** Strictly positive reals — it becomes `TempoData.bpm` or `TempoData.transitionTo`
verbatim and inherits their divisor role. Parsing is STRICT here, unlike the instruction attributes:
`parseJavaDouble` throws on a malformed value (`TempoDef.ts:41-48`), `createTempoDef` catches and
returns null (`TempoDef.ts:61-72`), and `GenericStyle.parseDefs` then skips that def entirely
(`GenericStyle.ts:58-63`), so a broken def silently degrades every reference to it to the `100.0`
fallback.

**Neutral.** Same as `tempo@bpm` — a level with no intrinsic no-effect value; neutral is a chosen
geometric-mean center over the level population (per-pair or per-map). The `100.0` in
`TempoStyle.getNumericBpmValueStatic` (`TempoStyle.ts:57`) is again the unresolvable-name fallback,
not a neutral. `TempoDef.getDefaultTempo`'s descriptor table (`TempoDef.ts:95-115`: grave 42, largo
50, lento 51, adagio 79, larghetto 69, adagietto 66, andante 101, andantino 80, maestoso 88,
moderato 106, allegretto 110, animato 121, allegro 147, assai 145, vivace 164, presto 189,
prestissimo 206, else 100) supplies initial values during MEI conversion only; once written they are
ordinary value attributes with no special status.

**Exaggerability.** Exaggerable in exactly the same log space as bpm, but it is a SHARED lever: one
def is referenced by every `<tempo>` naming it, through `bpm` and through `transition.to` alike.
DOUBLE-APPLICATION HAZARD — resolving names to numbers at the instructions AND scaling the def
values applies `s` twice to every named tempo. Pick one strategy: rewrite defs only (moves all
references coherently, cannot single out one instruction, preserves the names) or
resolve-and-write-numbers at the instructions (per-instruction control, loses the style-relative
wording). Also note `setValue()` mutates the live XML attribute of the shared def object
(`TempoDef.ts:78-81`), so the change propagates to every map in that styleDef's scope, global or
part-local.

**Evidence.** parse: `TempoDef.ts:41-48` (strict), indexing `GenericStyle.ts:52-63`,
`TempoStyle.ts:35-38`. consume: `TempoStyle.ts:49-58` called from `TempoMap.ts:132` and
`TempoMap.ts:136`. mutate: `TempoDef.ts:74-81`. defaults table: `TempoDef.ts:95-115`, used at
`TempoDef.ts:83-85` and `Mei2MsmMpmConverter.ts:3644-3648`.

#### *(derived, NOT serialized)* `TempoData.exponent`

*Paired with:* `tempo@meanTempoAt` (cache of it).

**Domain.** (0, +∞) in practice: `exponent = ln(0.5)/ln(meanTempoAt)` (`TempoMap.ts:177-179`), so
`meanTempoAt` in (0,1) maps to exponent in (0, +∞); `meanTempoAt=1` gives `-Infinity` and
`meanTempoAt<0` gives NaN, which is why the (0,1) clamp on `meanTempoAt` matters.

**Neutral.** `1.0` — `Math.pow(result, 1.0) === result` at `TempoMap.ts:221` makes the transition a
straight line. This is the same identity that pins `meanTempoAt`'s neutral at 0.5; the field exists
only as its cache.

**Exaggerability.** DO NOT TOUCH. It has no XML representation and is recomputed from `meanTempoAt`;
exaggerate `meanTempoAt` instead. It is also a MUTATION TRAP: `getTempoAtStatic` lazily writes it
into the `TempoData` it was passed (`TempoMap.ts:218-220`, documented as deliberate at
`TempoMap.ts:209-212`), so a `TempoData` whose `meanTempoAt` you edit after any render/query pass
keeps a stale exponent and will render the OLD curve. Rebuild the `TempoData` (or edit the XML and
re-read via `getTempoDataOf`) after changing `meanTempoAt`.

**Evidence.** declare: `TempoData.ts:37`; clone `TempoData.ts:93`. compute: `TempoMap.ts:177-179`,
set at `TempoMap.ts:153` and `156-157`. lazy mutation + use: `TempoMap.ts:218-221`.

#### `tempo@date.end` (transient, MEI-conversion working attribute; not valid MPM)

*Data field:* `TempoData.endDate` is populated from MEI timing data on the write path
(`Mei2MsmMpmConverter.ts:2440-2441`), then stamped as an attribute.

**Domain.** ≥ `tempo@date`. Never read by the renderer; the renderer derives `endDate` from the NEXT
`<tempo>` instead (`TempoMap.ts:166-175`).

**Neutral.** None. It is span bookkeeping, removed before the document is finished:
`mpmPostprocessingSingle` strips `date.end` (together with `endid` and `tstamp2`) and, if no later
instruction already starts at or before that date, synthesizes a follow-up
`<tempo bpm="<transition.to>">` at it so the transition has an endpoint.

**Exaggerability.** NOT EXAGGERABLE — ignore it. If an input document still carries
`date.end`/`endid`/`tstamp2` on `<tempo>`, it is unfinished converter output rather than well-formed
MPM; the exaggeration engine should either reject it or leave those attributes untouched, since
scaling `bpm`/`transition.to` before the synthetic endpoint instruction is generated would produce
an endpoint inconsistent with the scaled pair.

**Evidence.** write: `Mei2MsmMpmConverter.ts:2515-2521`. strip + synthesize endpoint:
`Mei2MsmMpmConverter.ts:4536-4562` (tempo case at `4550-4552`). renderer's own span source:
`TempoMap.ts:166-175`.

#### `performance@pulsesPerQuarter` — OUT OF FAMILY, listed because it divides every tempo formula

*Data field:* `Performance.pulsesPerQuarter` (default 720), via `getPPQ()`/`getPulsesPerQuarter()`.

**Domain.** Positive integer. Defaults to 720, and parsing is NOT read-only: a `<performance>`
without the attribute gets one added during parse (`Performance.ts:196-200`).

**Neutral.** Not applicable — a resolution declaration. It appears in every tempo formula as a plain
divisor: `600*date/ppq` (`TempoMap.ts:366`), `bpm*beatLength*ppq` (`TempoMap.ts:373`), `(ppq/4)` as
the Simpson sub-interval size (`TempoMap.ts:397`), `N*beatLength*ppq` (`TempoMap.ts:401`).

**Exaggerability.** NOT EXAGGERABLE. Register it only as the context value the tempo consumers need;
changing it rescales the whole timeline (and `Performance.perform` already rescales the MSM to it at
`Performance.ts:434`).

**Evidence.** declare/parse: `Performance.ts:134, 196-200`; accessors `Performance.ts:298-303`.
consume: `TempoMap.ts:366, 373, 397, 401`; passed in at `Performance.ts:533` and `246`.

### Walker notes — tempo

Reaching tempo data from a `Performance` (all paths verified in the repo):

**Maps.** Entry: `mpm.getPerformance(i | name)` (`src/mpm/Mpm.ts:325-338`) → `Performance`. Global
map: `performance.getGlobal()` (`src/mpm/elements/Performance.ts:289`) → `Global.getDated()`
(`src/mpm/elements/Global.ts:80`) → `dated.getMap(TEMPO_MAP)` (`src/mpm/elements/Dated.ts:123`). The
constant is `TEMPO_MAP = 'tempoMap'` (`src/mpm/names.ts:34`), re-exported as `Mpm.TEMPO_MAP`
(`src/mpm/Mpm.ts:81`). Cast the result to `TempoMap` (`src/mpm/elements/maps/TempoMap.ts:27`). Part
maps: `performance.getAllParts()` (`Performance.ts:225`) → `part.getDated()`
(`src/mpm/elements/Part.ts:137`) → same `getMap(TEMPO_MAP)`.

Render-time resolution (the authority on which map governs a part):
`Performance.resolveGlobalMaps` (`Performance.ts:443-461`; tempo at `:447`) then
`Performance.resolvePartMaps` (`Performance.ts:599-628`; tempo at `:604` — part map, else the global
one). An exaggeration walker that wants to match rendering must apply exactly this
per-part-with-global-fallback rule, and must not scale a global map twice when several parts fall
back to it.

**Entries.** `tempoMap.getAllElements()` (`src/mpm/elements/maps/GenericMap.ts:237`) → readonly
`KeyValue<number, Element>[]`; or `getElement(i)` (`GenericMap.ts:260`) with `size()`
(`GenericMap.ts:520`). Entries mix `<tempo>` and `<style>`; `getAllElementsOfType('tempo')`
(`GenericMap.ts:240`) yields only instructions. Parsed views: `tempoMap.getTempoDataOf(i)`
(`TempoMap.ts:113`) — style-resolved AND normalized (lossy, see hazards); `new TempoData(element)`
(`src/mpm/elements/maps/data/TempoData.ts:39`) — raw and unresolved. For mutation, prefer editing the
`Element`'s attributes directly (`element.getAttribute('bpm')!.setValue(...)`).

**Styles / defs.** Style in scope for entry `i` = nearest preceding `<style name.ref=...>`:
`GenericMap.findStyleNameAt` (`GenericMap.ts:493-496`, protected) or by date `getStyleNameAt(date)`
(`GenericMap.ts:498-504`) / `getStyleAt(date, TEMPO_STYLE)` (`GenericMap.ts:516-518`). Lookup order
local header → global header: `GenericMap.getStyle` (`GenericMap.ts:506-514`). `TEMPO_STYLE =
'tempoStyles'` (`src/mpm/names.ts:25`), re-exported as `Mpm.TEMPO_STYLE`. Headers:
`performance.getGlobal()!.getHeader()` (`Global.ts:77`), `part.getHeader()` (`Part.ts:134`). All defs
of a header: `header.getAllStyleDefs(TEMPO_STYLE)` (`src/mpm/elements/Header.ts:153`) →
`Map<string, GenericStyle>`; cast each to `TempoStyle`
(`src/mpm/elements/styles/TempoStyle.ts:10`); single lookup `header.getStyleDef(TEMPO_STYLE, name)`
(`Header.ts:157`). Within a style: `style.getDef(name)`
(`src/mpm/elements/styles/GenericStyle.ts:101`) → `TempoDef`; value via `TempoDef.getValue()` /
`setValue()` (`src/mpm/elements/styles/defs/TempoDef.ts:74-81`; `setValue` writes back into the live
XML attribute). Name resolution as the renderer does it:
`TempoStyle.getNumericBpmValueStatic(str, style)` (`TempoStyle.ts:49-58`).

**Consumers to re-check after any edit.** `TempoMap.renderTempoToMap(map, ppq)`
(`TempoMap.ts:246`) — writes `milliseconds.date` / `milliseconds.date.end`; static no-map fallback at
`TempoMap.ts:334` and its duplicate `Performance.renderTempoToMap` (`Performance.ts:820`). Driven
from `Performance.perform` (`Performance.ts:404`) via `renderGlobalTiming`
(`Performance.ts:530-536`) and `renderPartTiming` (`Performance.ts:725`). Math:
`TempoMap.getTempoAt(date)` (`TempoMap.ts:181`) / private `getTempoAtStatic` (`TempoMap.ts:213`);
`computeDiffTiming` dispatch (`TempoMap.ts:358-363`) into `computeMillisecondsForNoTempo` (`365`),
`computeMillisecondsForConstantTempo` (`368`), `computeMillisecondsForTempoTransition` (`392`,
Simpson). PPQ context: `performance.getPPQ()` (`Performance.ts:301`). MIDI leaf consumers (for
sanity-checking a scaled tempo): `EventMaker.createTempo` (`src/midi/EventMaker.ts:619-631`),
`Msm.makeInitialTempo` (`src/msm/Msm.ts:1157-1183`) and `makeMillisecondTickTempo`
(`src/msm/Msm.ts:1186-1194`).

### Hazards — tempo

- **LOSSY READ PATH.** `TempoMap.getTempoDataOf` normalizes degenerate transitions away —
  `transition.to` nulled when it equals `bpm` (`TempoMap.ts:137-139`) or when `meanTempoAt >= 1`
  (`149-151`), and `bpm` REPLACED by `transition.to` when `meanTempoAt <= 0` (`144-148`). A
  `TempoData` read back from the map is therefore not a faithful mirror of the XML, and writing it
  back (`TempoMap.addTempo`) would drop attributes. Exaggeration must read and write the XML
  attributes directly, or use `new TempoData(xml)` which applies none of these.
- **TWO PARSE PATHS WITH DIFFERENT SEMANTICS.** `new TempoData(xml)` (`TempoData.ts:39-71`) does raw
  `parseFloat`, never consults a `TempoStyle` (a named bpm lands in `bpmString` and leaves `bpm`
  null), applies no normalization, and NaNs silently on a missing `date`/`beatLength` because of the
  `!` assertions (`TempoData.ts:43-44`). `TempoMap.getTempoDataOf` (`TempoMap.ts:113-164`) resolves
  names through the style AND normalizes. Know which one you hold.
- **STRING-VALUED LEVELS.** `bpm` and `transition.to` may hold a tempoDef name (`'Allegretto'`) or an
  MEI-converter placeholder (`'+'`, `'-'`, `'?'`; `Mei2MsmMpmConverter.ts:2294-2297, 3630-3633,
  3653`). Unresolvable values fall back to `100.0` with only a `console.error`
  (`TempoStyle.ts:52-57`), so a wrongly-applied scale factor can be absorbed invisibly. Detect and
  either resolve-then-write-numeric or skip.
- **SERIALIZATION PREFERS THE STRING.** `TempoMap.addTempo` writes `bpmString`/`transitionToString`
  if present and only falls back to the numeric fields (`TempoMap.ts:63-64, 69-72`). Setting
  `TempoData.bpm` to a scaled number while `bpmString` is still `'Allegretto'` has NO effect on the
  output XML.
- **`meanTempoAt` BOUNDARIES ARE SEMANTIC CLIFFS, NOT CLAMPS.** Exactly 0 and exactly 1 do not
  saturate, they change WHICH endpoint becomes the constant tempo (`TempoMap.ts:144-151`). Keep any
  exaggerated value strictly inside (0,1) with an epsilon; the logit transform does this naturally
  but a clamp-after-rounding must not land on the boundary.
- **EXACT FLOAT EQUALITY is used twice.** `td.transitionTo === td.bpm` decides constant-vs-transition
  (`TempoMap.ts:137`) and `date === tempoData.endDate` short-circuits to `transition.to`
  (`TempoMap.ts:216`). Serialize both members of a scaled pair through the same number→string path so
  the collapse behaviour is predictable.
- **LAST-INSTRUCTION SPAN IS INFINITE.** `getEndDate` returns `Number.MAX_VALUE` for the final
  `<tempo>` (`TempoMap.ts:167`). A transition on the last instruction integrates over an effectively
  unbounded span, so its rendered tempo stays ~`bpm` forever; exaggerating that pair changes almost
  nothing audible. Also, MEI-derived documents rely on `mpmPostprocessingSingle` synthesizing the
  closing instruction (`Mei2MsmMpmConverter.ts:4536-4562`) — if you exaggerate before that runs, the
  synthesized endpoint will carry the unscaled `transition.to` string.
- **DATE/KEY MIRRORING.** `GenericMap` keeps a sorted `(date, element)` index parallel to the XML
  (`GenericMap.ts:144-155`). Editing a `date` attribute in place requires `GenericMap.sort()`
  (`GenericMap.ts:177-191`) to re-key; adding elements must go through `addElement`/`insertElement`.
- **BYTE-IDENTITY AT `s=1`.** TypeScript's `String(number)` is not Java's `Double.toString`, so any
  unconditional write-back reformats values (`'108.0'` → `'108'`) and breaks the campaign's P1
  invariant. Skip the write when the transformed value equals the parsed value (compare the produced
  string, not just the number).
- **SHARED / SHADOWED STYLE DEFS.** `GenericMap.getStyle` looks in the part-local header first, then
  the global header (`GenericMap.ts:506-514`), so a part-local `tempoStyle` of the same name shadows
  the global one. A pass over "all tempoDefs" must walk both headers, must not visit the same def
  twice (it is reachable from every map in scope), and must not be combined with per-instruction
  scaling (double application).
- **TEMPO IS THE PIVOT OF THE PIPELINE.** `renderTempoToMap` writes `milliseconds.date` /
  `milliseconds.date.end` onto the MSM maps (`TempoMap.ts:300, 325`) and every later pass
  (asynchrony, imprecision, the millisecond half of articulation) reads them
  (`Performance.ts:539-547, 725-735`). Exaggerating tempo therefore interacts multiplicatively with
  every millisecond-domain attribute of other families: an asynchrony offset stays fixed in ms and
  becomes relatively larger as the tempo is exaggerated slower.
- **TEMPO INSTRUCTION vs STYLE SWITCH.** A tempoMap's entries are a mix of `<tempo>` and `<style>`
  elements sharing one date-ordered list (see `resolveEntryIndex`, `GenericMap.ts:469-473`, and
  `findStyleNameAt`, `493-496`). Iterate with `getAllElementsOfType('tempo')` or filter on
  `getLocalName()`; indices from `getAllElements()` are NOT tempo indices.
- **MISSING `beatLength` SILENTLY DELETES THE INSTRUCTION.** `getTempoDataOf` returns null when the
  attribute is absent (`TempoMap.ts:120-121`) and `renderTempoToMap` simply `continue`s
  (`TempoMap.ts:278`). Such an instruction never affects rendering — do not "exaggerate" it into
  apparent life, and do not assume every `<tempo>` in the XML is a live instruction.

---

## 2. Dynamics

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `dynamics@volume` | double / def name / MEI placeholder | unbounded ℝ at parse; 0–127 only downstream | `100.0` absolute; pair geomean for contrast | `@transition.to` | **HIGH** (primary lever) |
| `dynamics@transition.to` | double / def name / MEI placeholder | as `@volume`; presence switches on the transition branch | pair geomean; `to == volume` = no transition | `@volume` | **HIGH** (carries the hairpin) |
| `dynamics@curvature` | double | [0,1] inclusive, clamped on map read+write only | `0.0` (proved linear) | `@protraction` | **MEDIUM**, range-safe |
| `dynamics@protraction` | double | [-1,1] inclusive, clamped on map read+write only | `0.0` (branch + limit) | `@curvature` | **MEDIUM**, range-safe |
| `dynamicsDef@value` | double (Java grammar) | unbounded ℝ; malformed ⇒ def dropped | `100.0`, or the def-set geomean | — | **HIGH** — correct lever for names |
| `dynamics@subNoteDynamics` | boolean | {true,false} | `false` | — | **EXCLUDED** (mode switch, must be read) |
| `dynamics@date` | double (ticks) | ℝ≥0, unchecked; sort key | n/a | — | **EXCLUDED** (R5) |
| `style@date` | double (ticks) | ℝ≥0, unchecked | n/a | — | **EXCLUDED** |
| `dynamicsGradient@transition.from` *(adjacent)* | double | conv. [-1,1], unenforced | `0.0` | `@transition.to` | **MEDIUM**, linear-0 |
| `dynamicsGradient@transition.to` *(adjacent)* | double | conv. [-1,1], unenforced | `0.0` (defaults to `from`) | `@transition.from` | **MEDIUM**, linear-0 |
| `ornament@scale` *(adjacent)* | double | unbounded ℝ, unchecked | **ambiguous** — parsed default 0.0, API default 1.0 | the gradient pair | **LOW/CAREFUL** |
| `channelVolumeMap/volume@value` | double | render output, not MPM input | `100.0` | — | **EXCLUDED** (R1) |

### Per-attribute detail

#### `dynamics@volume` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.volume (number|null)` + `DynamicsData.volumeString (string|null)`.
*Paired with:* `dynamics@transition.to` (same element).

**Domain.** Unbounded ℝ as parsed — NOTHING enforces a range on the parse path
(`src/mpm/elements/maps/DynamicsMap.ts:162-165` hands the raw string to
`DynamicsStyle.getNumericValueStatic`, which range-checks nothing:
`src/mpm/elements/styles/DynamicsStyle.ts:49-56`). The musical domain is MIDI velocity 0..127,
enforced only downstream and only on one of the two output paths: MIDI export runs
`Msm.fitVelocities(0,127)` (`src/msm/Msm.ts:1084`, body `1613-1648`), a document-wide
piecewise-linear COMPRESSION (not a clip) at `src/msm/Msm.ts:1696-1749`, followed by a hard clamp in
`EventMaker.createNoteOn` (`src/midi/EventMaker.ts:468`). The data path does NOT clamp: `readNote`
casts to the branded `Midi7Bit` without checking (`src/api/pipeline.ts:250`).

**Neutral.** Two different neutrals, both renderer-justified.

- **(a) ABSOLUTE neutral = `100.0`**: literally the velocity the pipeline writes wherever dynamics
  say nothing — no dynamicsMap at all (`src/mpm/elements/maps/DynamicsMap.ts:288` and
  `src/mpm/elements/Performance.ts:686`), notes before the first instruction (`DynamicsMap.ts:252`),
  notes inside a `subNoteDynamics` span (`DynamicsMap.ts:231`), missing `@velocity` at MIDI export
  (`src/msm/Msm.ts:1318`), symbolic export (`Msm.ts:1347`), the data path
  (`src/api/pipeline.ts:250`) and the unresolvable-name fallback (`DynamicsStyle.ts:55`).
- **(b) CONTRAST neutral = geometric mean of the `(volume, transition.to)` pair**, because the
  renderer interpolates strictly between exactly those two numbers — `getDynamicsAt` returns
  `volume` for a constant and `volume + smoothstep(t)·(transitionTo − volume)` otherwise
  (`src/mpm/elements/maps/data/DynamicsData.ts:140-146`) — so the pair is the only structure the
  renderer knows.

CAUTION: with the pair-geomean neutral a constant instruction (`transitionTo === volume`,
`isConstantDynamics` at `DynamicsData.ts:108-110`; forced equal when `transition.to` is absent at
`DynamicsMap.ts:176-181`) is a FIXED POINT — `s` has no effect on it. A map of constants (the common
MEI-export case) is untouched unless the map/style-wide neutral (a) or `dynamicsDef@value` is used
instead.

**Exaggerability.** HIGH — this is the primary dynamics lever. Deviation from the pair geomean
scaled in log space widens/narrows the crescendo without moving its mean level; deviation from
`100.0` in log space widens the whole loudness relief of the piece. Hazards: (1) value may be a
NAME, in which case the numeric lever is `dynamicsDef@value` and rewriting the attribute as a number
severs the style linkage; (2) the MEI converter duplicates a transition's `transition.to` into the
following constant `<dynamics volume>` (`src/mei/Mei2MsmMpmConverter.ts:4536-4558`) so per-element
transforms open a discontinuity; (3) R6 range safety must be provided by the transform — the data
path never clamps and `fitVelocities` can miss out-of-range values (see hazards).

**Evidence.** parse (map path, style-resolved): `src/mpm/elements/maps/DynamicsMap.ts:162-165`; parse
(standalone ctor, no style, no clamp): `src/mpm/elements/maps/data/DynamicsData.ts:52-60`;
resolution: `src/mpm/elements/styles/DynamicsStyle.ts:49-56`; consumption: `DynamicsData.ts:140-146`
called from `DynamicsMap.ts:256-258`; serialization: `DynamicsMap.ts:48` and `65-70`.

#### `dynamics@transition.to` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.transitionTo (number|null)` + `DynamicsData.transitionToString
(string|null)`. *Paired with:* `dynamics@volume`; also, de facto, the `@volume` of the MEI-generated
end-marker `<dynamics>` that copies this value (`src/mei/Mei2MsmMpmConverter.ts:4542-4550`).

**Domain.** Identical to `@volume`: unbounded ℝ at parse, MIDI 0..127 only enforced downstream
(`fitVelocities` `src/msm/Msm.ts:1084`+`1613-1648`, `createNoteOn` clamp
`src/midi/EventMaker.ts:468`, nothing on the data path `src/api/pipeline.ts:250`). Its PRESENCE is
structurally load-bearing: it is the sole switch into the transition branch, and
curvature/protraction are read only there (`src/mpm/elements/maps/DynamicsMap.ts:166-175`).

**Neutral.** Same pair geometric mean as `@volume`: the renderer's only use of this number is as the
far endpoint of the smoothstep in `getDynamicsAt`
(`src/mpm/elements/maps/data/DynamicsData.ts:145`) and as the value returned for every date at or
past `endDate` (`DynamicsData.ts:142`). `transitionTo === volume` is precisely the renderer's
definition of "no transition" (`isConstantDynamics`, `DynamicsData.ts:108-110`), which is exactly
the fixed point of a pairwise-geomean transform — the neutral and the renderer's own no-effect
condition coincide.

**Exaggerability.** HIGH, and it is the half that actually carries the crescendo/diminuendo contrast.
Same three hazards as `@volume`. Additional: if this is the LAST instruction of the map, `endDate` is
`Number.MAX_VALUE` (`DynamicsMap.ts:187-193`) so the transition never completes and exaggerating
this endpoint is barely audible.

**Evidence.** parse: `src/mpm/elements/maps/DynamicsMap.ts:166-169` (and
`src/mpm/elements/maps/data/DynamicsData.ts:62-70` for the standalone ctor); absent-branch
defaulting: `DynamicsMap.ts:176-181`; consumption: `DynamicsData.ts:142,145,148-158`; serialization:
`DynamicsMap.ts:49` and `71-74`.

#### `dynamics@curvature` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.curvature (number|null)`. *Paired with:* `dynamics@protraction` (jointly
determine the two inner control points; neither is read without `transition.to`).

**Domain.** [0.0, 1.0] inclusive. ENFORCED on the way in by `clampCurvature` at
`src/mpm/elements/maps/DynamicsMap.ts:172` (impl `100-110`, logs and corrects) and on the way out at
`DynamicsMap.ts:51` and `78`. NOT enforced by the standalone `DynamicsData` xml constructor
(`src/mpm/elements/maps/data/DynamicsData.ts:72-73`, bare `parseFloat`) and NOT by a direct
`Attribute.setValue` on the document. NaN escapes the clamp entirely (both comparisons are false for
NaN) — `parseFloat`, not `parseJavaDouble`, is used here.

**Neutral.** `0.0` — and this is provable, not conventional. With curvature = 0 and protraction = 0,
`innerControlPointsXPositions` returns `[0.0, 1.0]`
(`src/mpm/elements/maps/data/bezier.ts:31-33`). Substituting x1=0, x2=1 into the x-polynomial used
by `tForDate`/`bezierPoint` gives u = 3·0 − 3·1 + 1 = −2, v = −6·0 + 3·1 = 3, w = 3·0 = 0, i.e.
x(t) = (3t² − 2t³)·(endDate − startDate) (`bezier.ts:66-68,101`) — which is the SAME cubic as the
value polynomial (3 − 2t)·t² (`bezier.ts:102` and `DynamicsData.ts:145`). The two cancel and the
rendered volume is exactly LINEAR in date. Verified numerically against the built code (span
0..100000, 40→100: date 25000 → 55.000250 vs linear 55.0; date 50000 → 70.000000; residual is the
±1-tick tolerance of the binary search at `bezier.ts:70-77`). The house test states the same
identity: `tests/mpm/elements/DynamicsMap.test.ts:558-577`. Corroborating: the renderer itself writes
0.0 whenever there is no curve to shape (`DynamicsMap.ts:179`), the lazy default is 0.0
(`DynamicsData.ts:120-125`), and the MEI converter emits 0.0/0.0 for every hairpin
(`src/mei/Mei2MsmMpmConverter.ts:2337-2340`).

**Exaggerability.** MEDIUM, and RANGE-SAFE. It reparameterizes time only: for any t ∈ [0,1] the value
stays inside [volume, transition.to] (`DynamicsData.ts:145`), so scaling it can never push a velocity
out of MIDI range. Musically "how sudden the crescendo is" — 0 linear, 1 maximally S-shaped (holds
the start level, then climbs steeply; see `tests/mpm/elements/DynamicsMap.test.ts:300-324`). Scale
space: boundary-power (lower), T(x) = ln(1 − x), neutral at the lower bound 0, which keeps [0,1)
closed without a clamp; x = 1.0 is admissible (clamp is inclusive) and must be defined as a fixed
point (T → −∞). HAZARD: completely inert on constant instructions — never read
(`DynamicsMap.ts:166-175`) and force-zeroed (`DynamicsMap.ts:179`), so transforming it there is a
pure byte change with zero audible effect.

**Evidence.** parse+clamp: `src/mpm/elements/maps/DynamicsMap.ts:170-172`, `clampCurvature` `100-110`;
unclamped ctor: `src/mpm/elements/maps/data/DynamicsData.ts:72-73`; consumption:
`DynamicsData.ts:120-125,132-138` → `src/mpm/elements/maps/data/bezier.ts:27-47,57-78`;
serialization+clamp: `DynamicsMap.ts:50-51,77-80`.

#### `dynamics@protraction` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.protraction (number|null)`. *Paired with:* `dynamics@curvature`.

**Domain.** [-1.0, 1.0] inclusive. ENFORCED by `clampProtraction` on the way in
(`src/mpm/elements/maps/DynamicsMap.ts:175`, impl `113-125`) and on the way out
(`DynamicsMap.ts:54` and `82`). NOT enforced by the standalone `DynamicsData` ctor
(`src/mpm/elements/maps/data/DynamicsData.ts:75-76`) nor by a direct attribute rewrite. NaN passes
the clamp untouched.

**Neutral.** `0.0` — justified by the renderer, not by convention.
`innerControlPointsXPositions` branches on `protraction === 0.0` and returns the symmetric pair
`[curvature, 1 − curvature]` (`src/mpm/elements/maps/data/bezier.ts:31-33`); that is exactly the
continuous limit of the general formula as p → 0 (x1 = curvature + (1 − curvature)·p → curvature;
x2 = 1 − curvature + curvature·p → 1 − curvature, `bezier.ts:35-46`), so 0 is a genuine no-effect
point and the branch is not merely a guard against the division by protraction (documented at
`bezier.ts:22-25`). The sign selects which control point is dragged: p > 0 pulls x1 right (rise
delayed), p < 0 pulls x2 left (rise early). Verified against the built code, span 0..100, 40→100,
curvature 0: p=+0.5 → 56.395 at mid-date, p=0 → 70.0, p=−0.5 → 83.605. Corroborating: force-zeroed
for constant instructions (`DynamicsMap.ts:180`), lazy default 0.0 (`DynamicsData.ts:121-122`), MEI
converter writes 0.0 (`Mei2MsmMpmConverter.ts:2339`).

**Exaggerability.** MEDIUM, RANGE-SAFE for the same reason as curvature (pure time
reparameterization; value stays within the endpoint interval). Bounded symmetric domain with an
INTERIOR neutral ⇒ the natural unbounded map is T(x) = atanh(x) (equivalently the logit of
(x+1)/2), which gives domain closure on (−1,1) with no clamp; ±1 are admissible boundary fixed
points. Musically "does the swell arrive late or early". Same inertness hazard on constant
instructions as curvature.

**Evidence.** parse+clamp: `src/mpm/elements/maps/DynamicsMap.ts:173-175`, `clampProtraction`
`113-125`; unclamped ctor: `src/mpm/elements/maps/data/DynamicsData.ts:75-76`; consumption:
`src/mpm/elements/maps/data/bezier.ts:27-47` via `DynamicsData.ts:120-125`; serialization+clamp:
`DynamicsMap.ts:52-55,81-84`.

#### `dynamicsDef@value` (`header/dynamicsStyles/styleDef/dynamicsDef`)

*Data field:* `DynamicsDef.value` (private; `getValue()`/`setValue()`). *Type:* double (Java
`Double.parseDouble` grammar, so NaN/±Infinity are legal literals). *Paired with:* none
structurally, but it is the numeric proxy for every name-valued `dynamics@volume` / `@transition.to`
that references it.

**Domain.** Unbounded ℝ; nothing range-checks it. Parsed with `parseJavaDouble`, so a MALFORMED
literal throws → `createDynamicsDef` returns null → the style silently skips that def
(`src/mpm/elements/styles/defs/DynamicsDef.ts:36-41` and `55-66`; skip logic
`GenericStyle.parseDefs` `src/mpm/elements/styles/GenericStyle.ts:57-63`). Musically it is a MIDI
velocity, clamped only downstream exactly as `@volume` is.

**Neutral.** `100.0` by the same renderer argument as `@volume` — a def's value becomes
`DynamicsData.volume` verbatim (`src/mpm/elements/styles/DynamicsStyle.ts:50-51` →
`src/mpm/elements/maps/DynamicsMap.ts:165`), and `100.0` is the velocity a note carries when no
dynamics apply (`DynamicsMap.ts:288`, `src/msm/Msm.ts:1318`). ALTERNATIVE, better-behaved neutral for
contrast work: the geometric mean of the style's own def set (`GenericStyle.getAllDefs`,
`src/mpm/elements/styles/GenericStyle.ts:98-100`), because the built-in ladder is centred well below
100 — pppp 5, ppp 12, pp 36, p 48, mp 64, mf 83, f 97, ff 111, fff 120, ffff 125, sf/sfz 127,
unknown 74 (`src/mpm/elements/styles/defs/DynamicsDef.ts:86-126`). Exaggerating a typical MEI-export
style around 100.0 therefore pushes nearly everything DOWN; around the def-set geomean it does not.

**Exaggerability.** HIGH — and it is the CORRECT lever whenever volumes are name-valued, which is the
MEI-export norm. Scaling def values moves a transition's endpoint and the MEI end-marker duplicate
together (both reference the same name), so it cannot open the boundary discontinuity that
per-element transforms can. It also exaggerates the contrast BETWEEN successive constant
instructions (p vs f), which the pairwise-geomean transform on `@volume` cannot reach at all.
Write-through mutation is supported: `setValue` updates both the field and the attribute
(`DynamicsDef.ts:72-75`). Caveat: a def may be shared by several parts/performances — the blast
radius is the whole styleDef.

**Evidence.** parse: `src/mpm/elements/styles/defs/DynamicsDef.ts:34-42`; indexing:
`src/mpm/elements/styles/DynamicsStyle.ts:35-38`; consumption: `DynamicsStyle.ts:49-56` called at
`src/mpm/elements/maps/DynamicsMap.ts:165,169`; defaults table: `DynamicsDef.ts:86-126`; mutation:
`DynamicsDef.ts:68-75`.

#### `dynamics@subNoteDynamics` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.subNoteDynamics` (boolean, default false). *Type:* boolean (string
`'true'` compared literally; anything else is false).

**Domain.** {true, false}. Not numeric — listed because it silently changes which numeric quantity
the dynamics values become, and therefore which range regime applies to the exaggerated result.

**Neutral.** `false` = the ordinary velocity path. When true (and the instruction is not the last
one) every note in the span is pinned to velocity 100.0 and the shape is emitted as a channel-volume
(CC 7) curve instead (`src/mpm/elements/maps/DynamicsMap.ts:222-234` and `264-278`).

**Exaggerability.** EXCLUDED — a mode switch, not a magnitude. But it must be READ by the engine: for
a `subNoteDynamics` span, exaggerating `@volume`/`@transition.to` moves CC 7 values, which are NOT
covered by `fitVelocities` (it scans only score notes, `src/msm/Msm.ts:1626-1636`) and are
hard-CLIPPED at 0..127 by `createControlChange` (`src/midi/EventMaker.ts:536`) — a different, harsher
range regime than for ordinary notes. Also note the same factor multiplies the number of emitted CC
events (see hazards).

**Evidence.** parse: `src/mpm/elements/maps/DynamicsMap.ts:182-183` (and
`src/mpm/elements/maps/data/DynamicsData.ts:78-80`); consumption: `DynamicsMap.ts:223-233, 264-278`;
serialization: `DynamicsMap.ts:56,85`.

#### `dynamics@date` (`dynamicsMap/dynamics`)

*Data field:* `DynamicsData.startDate` (number, default 0.0); the companion `endDate` is COMPUTED,
not an attribute.

**Domain.** ℝ≥0 by convention; unchecked. Doubles as the map's sort key (`insertElement`,
`src/mpm/elements/maps/DynamicsMap.ts:59,88`).

**Neutral.** n/a — a position, not a deviation. `endDate` comes from the next `<dynamics>` entry or
`Number.MAX_VALUE` if there is none (`DynamicsMap.ts:187-193`).

**Exaggerability.** EXCLUDED by campaign requirement R5 (symbolic invariance): moving it changes
where instructions apply and would break the map ordering invariant. It is however an INPUT to the
engine — the `(startDate, endDate)` span decides which notes a transformed span reaches, and boundary
notes belong to the LATER instruction (`>= dd.endDate` breaks, `DynamicsMap.ts:255`).

**Evidence.** parse: `src/mpm/elements/maps/data/DynamicsData.ts:50` and
`src/mpm/elements/maps/DynamicsMap.ts:155`; consumption: `DynamicsData.ts:132-138,141-145`;
serialization: `DynamicsMap.ts:47,64`.

#### `style@date` (`dynamicsMap/style` — the style switch entry)

*Data field:* none (raw `KeyValue` key in `GenericMap.elements`).

**Domain.** ℝ≥0, unchecked.

**Neutral.** n/a — a position. The style in scope for an instruction is the nearest PRECEDING
`<style>` switch (`src/mpm/elements/maps/GenericMap.ts:493-497`, used at
`src/mpm/elements/maps/DynamicsMap.ts:160-161`).

**Exaggerability.** EXCLUDED (date). Relevant only because it determines WHICH `dynamicsStyle`
resolves a given name-valued `@volume` — an engine that rewrites `dynamicsDef` values must respect
that a map can switch styles mid-piece.

**Evidence.** creation: `src/mpm/elements/maps/GenericMap.ts:438-445`; resolution:
`GenericMap.ts:493-517`; use: `DynamicsMap.ts:160-161`.

#### `dynamicsGradient@transition.from` (`ornamentDef/dynamicsGradient`) — ADJACENT

Velocity-domain, but owned by the `ornamentDynamics` dimension. *Data field:*
`DynamicsGradient.transitionFrom` (number, field default 0.0). *Paired with:*
`dynamicsGradient@transition.to` (absent `transition.to` defaults to `transition.from`,
`src/mpm/elements/styles/defs/DynamicsGradient.ts:24-26` — a flat gradient).

**Domain.** MPM convention [-1, 1]; NOTHING enforces it — bare `parseFloat`, no clamp anywhere
(`src/mpm/elements/styles/defs/DynamicsGradient.ts:21-23`). The realised velocity delta is
`transitionFrom · ornament@scale`, added to whatever velocity the dynamicsMap produced.

**Neutral.** `0.0` — the field default (`DynamicsGradient.ts:13`), the value `generateXML` treats as
"omit the attribute" (`DynamicsGradient.ts:84-85`), and arithmetically a no-op: `apply()` writes
`constFac·n + transitionFrom·scale` into `ornament.dynamics` (`DynamicsGradient.ts:39-45`), which is
later ADDED to velocity (`src/mpm/elements/maps/OrnamentationMap.ts:333-339`) — 0 adds nothing.

**Exaggerability.** MEDIUM, linear-around-0 per `DESIGN.md` §1/O1. Because the effect is ADDITIVE on
velocity, a signed-offset (linear) space is right, not log. Domain closure to [-1,1] needs an
explicit clamp or `atanh` if the spec bound is honoured. Note the gain quirk under `ornament@scale`
below.

**Evidence.** parse: `src/mpm/elements/styles/defs/DynamicsGradient.ts:19-29`; consumption:
`DynamicsGradient.ts:38-50` invoked at `src/mpm/elements/maps/data/OrnamentData.ts:95-96`, folded
into velocity at `src/mpm/elements/maps/OrnamentationMap.ts:333-339`; serialization:
`DynamicsGradient.ts:82-92`.

#### `dynamicsGradient@transition.to` (`ornamentDef/dynamicsGradient`) — ADJACENT

*Data field:* `DynamicsGradient.transitionTo` (number, field default 0.0; defaults to
`transitionFrom` when the attribute is absent). *Paired with:*
`dynamicsGradient@transition.from`.

**Domain.** Convention [-1, 1]; unenforced (bare `parseFloat`,
`src/mpm/elements/styles/defs/DynamicsGradient.ts:24-26`).

**Neutral.** `0.0` for the same reason as `transition.from` (additive contribution of 0). NOTE the
asymmetry the renderer imposes: a chord sequence of length 1 receives `transitionTo · scale`, i.e.
the END of the ramp, not the start (`DynamicsGradient.ts:47-49`), so for single-chord ornaments only
this endpoint matters. Serialization omits it when it equals `transition.from`
(`DynamicsGradient.ts:86-87`), so an exaggeration that separates the two endpoints changes the
element's attribute set, not just its values.

**Exaggerability.** MEDIUM, linear-around-0, same treatment as `transition.from`.

**Evidence.** parse: `src/mpm/elements/styles/defs/DynamicsGradient.ts:24-26`; consumption:
`DynamicsGradient.ts:38-50`; serialization: `DynamicsGradient.ts:86-87`.

#### `ornament@scale` (`ornamentationMap/ornament`) — ADJACENT: the gain on the `dynamicsGradient`

*Data field:* `OrnamentData.scale` (number, field default 0.0). *Paired with:*
`dynamicsGradient@transition.from` / `@transition.to` (it multiplies both).

**Domain.** Unbounded ℝ; unchecked (bare `parseFloat`,
`src/mpm/elements/maps/OrnamentationMap.ts:122-123` and `251-252`,
`src/mpm/elements/maps/data/OrnamentData.ts:38-39`).

**Neutral.** AMBIGUOUS AND DANGEROUS — the two halves of the codebase disagree. As a multiplicative
gain its no-effect value is 1.0, and `addOrnament`'s default parameter is 1.0 with the attribute
written only when it differs (`OrnamentationMap.ts:54,61`). But the PARSED default when the attribute
is absent is 0.0 (`OrnamentData.ts:28`), which makes the gradient contribute exactly nothing (every
term in `DynamicsGradient.apply` is multiplied by scale,
`src/mpm/elements/styles/defs/DynamicsGradient.ts:41-48`). So an ornament written by `addOrnament`
with the default scale renders with NO dynamics gradient at all.

**Exaggerability.** LOW/CAREFUL — `DESIGN.md` O1 already flags the absent≙0 quirk. Treat as a linear
gain ≥ 0 and NEVER materialise the attribute on an ornament that lacks it (writing `scale="1"` where
it was absent would turn a silent gradient audible — a semantic change, not an exaggeration).

**Evidence.** parse: `src/mpm/elements/maps/data/OrnamentData.ts:28,38-39` and
`src/mpm/elements/maps/OrnamentationMap.ts:122-123,251-252`; consumption: `OrnamentData.ts:95-96`;
serialization: `OrnamentationMap.ts:54,61,86`.

#### `channelVolumeMap/volume@value` — MSM RENDER OUTPUT, not an MPM input

Listed so nobody adds it to the registry. *Data field:* none — generated `Element`s.

**Domain.** Whatever the dynamics curve produced; unbounded on the data path
(`readControlChangePoint` casts to `Midi7Bit` unchecked, `src/api/pipeline.ts:255-261`),
hard-clipped to 0..127 at MIDI export (`src/midi/EventMaker.ts:536`). NOT covered by
`fitVelocities`, which scans only score notes (`src/msm/Msm.ts:1626-1636`).

**Neutral.** `100.0` — the reset entry the renderer emits at the start of every non-sub-note span,
carrying `mandatory="true"` so the export cannot thin it away
(`src/mpm/elements/maps/DynamicsMap.ts:236-245`), and the default emitted when there is no
channelVolumeMap at all (`src/msm/Msm.ts:1383-1387,1404-1407`). Third independent confirmation that
100.0 is this codebase's "no dynamics" level.

**Exaggerability.** EXCLUDED — produced by rendering (R1: the transform is MPM text in, MPM text
out). It is only the OBSERVABLE of exaggerating `@volume`/`@transition.to` on a `subNoteDynamics`
span.

**Evidence.** generation: `src/mpm/elements/maps/DynamicsMap.ts:236-245` and `264-278`; MIDI
consumption: `src/msm/Msm.ts:1372-1408`; data consumption: `src/api/pipeline.ts:282-298`.

### Walker notes — dynamics

**Instructions (dynamicsMap).** `Mpm.getPerformance(i|name)` / `Mpm.getAllPerformances()`
(`src/mpm/Mpm.ts:325-345`) → GLOBAL: `performance.getGlobal()`
(`src/mpm/elements/Performance.ts:289`) → `Global.getDated()` (`src/mpm/elements/Global.ts:80`) →
`Dated.getMap(DYNAMICS_MAP) as DynamicsMap` (`src/mpm/elements/Dated.ts:123`; `DYNAMICS_MAP =
'dynamicsMap'`, `src/mpm/names.ts:31`). PER PART: `performance.getAllParts()`
(`Performance.ts:225`) → `Part.getDated()` (`src/mpm/elements/Part.ts:137`) → the same `getMap`. The
renderer's precedence is part-map-else-global-map, per map type (`Performance.ts:606`) — so a walker
must visit both and must NOT assume a part inherits the global map when it defines its own.
`Dated.getAllMaps()` (`Dated.ts:126`) enumerates without knowing type names.

**Entries inside a map.** `DynamicsMap extends GenericMap`. `size()`
(`src/mpm/elements/maps/GenericMap.ts:520`); `getAllElements()` → readonly `KeyValue<date,
Element>[]` (`GenericMap.ts:237`); `getAllElementsOfType('dynamics')` (`GenericMap.ts:240`) is the
one to use — it filters out the `<style>` switch entries that also live in the map; `getElement(i)`
(`GenericMap.ts:260`). For the RESOLVED view (style applied, curvature/protraction clamped, `endDate`
filled, constants normalised) use `DynamicsMap.getDynamicsDataOf(index)`
(`src/mpm/elements/maps/DynamicsMap.ts:150-185`) or `getDynamicsDataAt(date)` (`DynamicsMap.ts:127-133`)
— but treat both as READ-ONLY SNAPSHOTS: they do not write through to the document, and
`addDynamicsFromData` (`DynamicsMap.ts:62-89`) appends a new element rather than updating one. To
MUTATE, take the `Element` from `getAllElementsOfType('dynamics')[i].getValue()`, get the
`Attribute` via `attribute(name, element)` (`src/xml/tree.ts`) and call `Attribute.setValue`
(`src/xml/XomTypes.ts:288`). The element is the single source of truth (`AbstractXmlSubtree`
contract).

**Styles (dynamicsDef values).** `Global.getHeader()` (`src/mpm/elements/Global.ts:77`) or
`Part.getHeader()` (`src/mpm/elements/Part.ts:134`) → `Header.getAllStyleDefs(DYNAMICS_STYLE)` →
`Map<name, GenericStyle>` (`src/mpm/elements/Header.ts:153`) or `Header.getStyleDef(type, name)`
(`Header.ts:157`); `DYNAMICS_STYLE = 'dynamicsStyles'` (`src/mpm/names.ts:23`). Cast to
`DynamicsStyle`, then `getAllDefs()` → `ReadonlyMap<string, DynamicsDef>`
(`src/mpm/elements/styles/GenericStyle.ts:98-100`) or `getDef(name)` (`GenericStyle.ts:101-103`).
`DynamicsDef.getValue()`/`setValue()` (`src/mpm/elements/styles/defs/DynamicsDef.ts:68-75`) —
`setValue` is the ONLY write-through setter in this family (it updates both the field and the `value`
attribute). Do not mutate the defs `Map` directly (`GenericStyle` doc, lines 12-14 of that file).

**Style scope**, if you need to know which def a given instruction resolves against:
`GenericMap.findStyleNameAt(index)` walks backwards to the nearest preceding `<style>` switch
(`src/mpm/elements/maps/GenericMap.ts:493-497`) and `GenericMap.getStyle(styleType, styleName)`
resolves it against the LOCAL header first, then the GLOBAL header (`GenericMap.ts:506-514`).
`DynamicsMap.getDynamicsDataOf` does exactly this at `src/mpm/elements/maps/DynamicsMap.ts:160-161`,
and `DynamicsStyle.getNumericValueStatic(string, style|null)`
(`src/mpm/elements/styles/DynamicsStyle.ts:49-56`) is the reusable resolver — call it to decide
whether a `@volume` string is a name, a number, or an unresolvable placeholder.

**Adjacent (ornamentDynamics dimension, if the engine covers it here).**
`OrnamentDef.getDynamicsGradient()` (`src/mpm/elements/styles/defs/OrnamentDef.ts:102-103`) reached
from the `ornamentStyles` styleDef the same way as `dynamicsStyles`; `DynamicsGradient` exposes plain
public fields `transitionFrom`/`transitionTo`
(`src/mpm/elements/styles/defs/DynamicsGradient.ts:13-14`) and is deliberately NOT an
`AbstractXmlSubtree` — its `getXml()` MATERIALISES and caches an element as a side effect
(`DynamicsGradient.ts:72-75`), so never call it on a gradient you only want to read. `ornament@scale`
is read from the ornamentationMap entries (`src/mpm/elements/maps/OrnamentationMap.ts:122-123, 251-252`).

### Hazards — dynamics

- **RANGE ASYMMETRY BETWEEN OUTPUT PATHS** (this is campaign requirement R6's whole reason): MIDI
  export runs `fitVelocities(0,127)` (`src/msm/Msm.ts:1084`) which is a document-wide,
  piecewise-linear COMPRESSION with a 0.66 rolloff (`src/msm/Msm.ts:1696-1749`) — once ANY note is
  out of range every note near the ends is remapped, so an exaggerated document does not merely get
  clipped, it gets globally re-scaled. The data path (`performMsmToData`, `src/api/pipeline.ts:470`
  → `readNote` `232-253`) applies NO clamp and `Midi7Bit` is a branded cast, not a check. The
  transform must guarantee the range itself.
- **`fitVelocities` CANNOT BE TRUSTED AS A SAFETY NET**: its scan is
  `if (value < lowest) … else if (value > highest) …` (`src/msm/Msm.ts:1633-1634`), so a run of
  descending values never updates `highest` — an over-127 velocity can escape detection entirely.
  Documented as verbatim-Java behaviour, not a bug to fix.
- **SUB-NOTE SPANS GET A THIRD, HARSHER REGIME**: sub-note curve values live in the channelVolumeMap,
  which `fitVelocities` never scans (`src/msm/Msm.ts:1626-1636`); they are hard-CLIPPED at 0..127 by
  `createControlChange` (`src/midi/EventMaker.ts:536`) and left unclamped on the data path
  (`src/api/pipeline.ts:260`). The same `s` therefore behaves differently depending on
  `@subNoteDynamics`.
- **MEI-EXPORT END-MARKER DUPLICATION**: for every transition, the converter appends a following
  constant `<dynamics>` whose `@volume` is a COPY of the transition's `@transition.to`
  (`src/mei/Mei2MsmMpmConverter.ts:4536-4558`; visible in
  `tests/integration/fixtures/reference/dynamics.mpm` as `transition.to="ff"` followed by
  `<dynamics date="5040.0" volume="ff"/>`). A per-element pair-geomean transform moves the
  transition's endpoint but leaves the duplicate constant where it was, opening an audible jump at
  the span boundary. Either couple the duplicate or transform `dynamicsDef@value` instead.
- **NAME-VALUED VOLUMES ARE THE NORM, NOT THE EXCEPTION**: `@volume`/`@transition.to` may hold a def
  name (`"f"`) or an MEI placeholder (`"?"`, `"+"`, `"-"` — the fixture contains `volume="-"`).
  Resolution order is style def → `parseFloat` → 100.0 with an error log
  (`src/mpm/elements/styles/DynamicsStyle.ts:49-56`), so an unresolvable placeholder silently renders
  as 100. Rewriting a name as a number severs the style linkage and changes the document's meaning;
  the correct lever is `dynamicsDef@value`.
- **CURVE PARAMETERS ARE INERT ON CONSTANT INSTRUCTIONS**: curvature/protraction are read only inside
  the transition branch (`src/mpm/elements/maps/DynamicsMap.ts:166-175`) and are force-set to 0.0
  when `transition.to` is absent — even when the element spells them out (`DynamicsMap.ts:179-180`;
  test `tests/mpm/elements/DynamicsMap.test.ts:273-282`). Transforming them there is a pure byte
  change with zero rendering effect and should be reported as 'absent', not 'transformed'.
- **CLAMPS ARE ON THE MAP API, NOT ON THE DOCUMENT**: curvature/protraction are clamped on read
  (`DynamicsMap.ts:172,175`) and on the `addDynamics`/`addDynamicsFromData` write paths
  (`:51,54,78,82`), but a direct `Attribute.setValue` bypasses both, and the standalone
  `new DynamicsData(xml)` constructor never clamps
  (`src/mpm/elements/maps/data/DynamicsData.ts:72-76`). An out-of-range value written by the engine
  survives serialization and is corrected only silently, at render.
- **NaN IS SILENT AND CATASTROPHIC FOR CURVE PARAMETERS**: they are parsed with `parseFloat` (not
  `parseJavaDouble`) and `clampCurvature`/`clampProtraction` pass NaN through, since every NaN
  comparison is false. A NaN x1/x2 makes `tForDate`'s loop condition `Math.abs(diffX) >= 1.0` false
  on the first test (`src/mpm/elements/maps/data/bezier.ts:70-77`), so t stays 0.5 and the ENTIRE span
  renders at the exact midpoint level with no warning. Verified: volume 40 → `transition.to` 100 with
  curvature NaN renders 70.0 at every interior date.
- **`DynamicsData` IS NOT A VALUE OBJECT AND NOT A VIEW**: `computeInnerControlPointsXPositions`
  writes null curvature/protraction to 0.0 IN PLACE (`DynamicsData.ts:120-125`), and
  `addDynamicsFromData` writes the clamped values back into the caller's object
  (`DynamicsMap.ts:77-84`). It is also a SNAPSHOT: there is no write-through setter for
  `volume`/`transition.to`, and `addDynamicsFromData` APPENDS a new `<dynamics>` rather than updating
  one. A document transform must edit the element's `Attribute` objects directly
  (`attribute('volume', e).setValue(...)`, `Attribute.setValue` at `src/xml/XomTypes.ts:288`).
- **`s=1` BYTE-IDENTITY REQUIRES SKIPPING THE WRITE**: every value is serialized with
  `String(number)` (`DynamicsMap.ts:47-59,64-88`;
  `src/mpm/elements/styles/defs/DynamicsDef.ts:74`), so re-writing an unchanged value turns `"48.0"`
  into `"48"` and `0.1+0.2` into `0.30000000000000004`. Do not write back an equal value; leave the
  attribute untouched.
- **VELOCITY IS A SHARED BUS** — a dynamics-only clamp cannot guarantee the final range. After
  `DynamicsMap` writes `@velocity`, metricalAccentuation ADDS `accentuation·scale`
  (`src/mpm/elements/maps/MetricalAccentuationMap.ts:168`), articulation sets/multiplies/offsets it
  (`src/mpm/elements/maps/data/ArticulationData.ts:233-246`,
  `src/mpm/elements/styles/defs/ArticulationDef.ts:391-399`), ornamentation ADDS `ornament.dynamics`
  (`src/mpm/elements/maps/OrnamentationMap.ts:333-339`) and imprecision-dynamics offsets it
  (`src/mpm/elements/maps/ImprecisionMap.ts:427-433`). Pass order is fixed in
  `src/mpm/elements/Performance.ts:668-718`.
- **SUB-NOTE CC COUNT SCALES WITH THE EXAGGERATED SPAN**: `getSubNoteDynamicsSegment(2.0)` subdivides
  until consecutive volume steps are ≤ 2.0 (`DynamicsMap.ts:268` →
  `src/mpm/elements/maps/data/bezier.ts:122-136`). Measured: a 40→100 span yields 47 samples, a
  10→130 span yields 91. Widening spans inflates MIDI file size and CC traffic (the export thins by
  `CONTROL_CHANGE_DENSITY`, `src/msm/Msm.ts:1391-1402`, but not the MSM).
- **EDGE CASES THAT MAKE EXAGGERATION INAUDIBLE**: the LAST instruction of a map never renders as a
  sub-note curve (`dynamicsIndex < this.size() - 1`, `DynamicsMap.ts:223`); an unterminated transition
  gets `endDate = Number.MAX_VALUE` (`DynamicsMap.ts:187-193`) so its `transition.to` is never
  reached; notes before the first instruction are hardcoded to 100.0 (`DynamicsMap.ts:252`) and are
  unreachable by any factor.
- **A MALFORMED `dynamicsDef@value` SILENTLY REMOVES THE DEF** (`parseJavaDouble` throws →
  `createDynamicsDef` returns null → `parseDefs` skips it:
  `src/mpm/elements/styles/defs/DynamicsDef.ts:36-41,55-66` and
  `src/mpm/elements/styles/GenericStyle.ts:57-63`), after which every instruction naming it falls back
  to 100.0. Also: duplicate def names — LAST one wins (`GenericStyle.ts:56-63`). Never write
  NaN/Infinity: both are legal Java double literals and would parse back without error.

---

## 3. Rubato

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `rubato@intensity` | double (exponent) | (0,∞); enforced on the **def** path only | `1.0` | — | **log-around-1**, primary knob |
| `rubato@lateStart` | double (proportion) | [0,1) and `< earlyEnd`; clamped on map + def paths | `0.0` (lower bound) | `@earlyEnd` | **boundary-power (lower)**, joint |
| `rubato@earlyEnd` | double (proportion) | (0,1] and `> lateStart`; clamped on map + def paths | `1.0` (upper bound) | `@lateStart` | **boundary-power (upper)**, joint |
| `rubato@frameLength` | double (ticks) | must be >0; enforced **nowhere** on either parse path | **none exists** | — | **RECOMMEND EXCLUDE** |
| `rubato@date` | double (ticks) | any double; required | none (position) | next entry | **EXCLUDE** |
| `rubato@loop` | boolean | literal `'true'` only; never inherited | n/a | — | **NOT exaggerable** (must be read) |
| `rubatoDef@intensity` | double | (0,∞); **enforced** here | `1.0` | element `@intensity` | **log-around-1**, must be covered |
| `rubatoDef@lateStart` | double | [0,1), `< earlyEnd`; enforced | `0.0` | `rubatoDef@earlyEnd` | **boundary-power (lower)** |
| `rubatoDef@earlyEnd` | double | (0,1], `> lateStart`; enforced | `1.0` | `rubatoDef@lateStart` | **boundary-power (upper)** |
| `rubatoDef@frameLength` | double (ticks) | required; unclamped at parse | **none** | — | **RECOMMEND EXCLUDE** |

### Per-attribute detail

#### `rubato@intensity` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.intensity (number | null)`.

**Domain.** Mathematically (0, +∞). Enforced ONLY on the def path:
`RubatoDef.ensureIntensityBoundaries` maps 0 → 0.01 and negatives → |x|
(`src/mpm/elements/styles/defs/RubatoDef.ts:194-204`), applied at parse (`:49-55`) and in
`setIntensity` (`:141`). NOT enforced anywhere on the `<rubato>`-element path:
`RubatoMap.getRubatoDataOf` reads it with a bare `parseFloat` and applies no clamp
(`src/mpm/elements/maps/RubatoMap.ts:126-128`); the `RubatoData` XML constructor likewise
(`src/mpm/elements/maps/data/RubatoData.ts:57-58`). So 0, negative and NaN reach the renderer
unchecked.

**Neutral.** `1.0`. Proof from the renderer, not from the spec: `computeRubatoTransformation`
computes `d = (pow(localDate/frameLength, intensity) * (earlyEnd - lateStart) + lateStart) *
frameLength` and returns `date + d - localDate` (`RubatoMap.ts:166-173`). With intensity=1 AND
lateStart=0, earlyEnd=1 this is `d = (localDate/frameLength)*1*frameLength = localDate`, so the
return value is exactly `date` — the identity, for every frameLength. Note the qualification:
intensity=1 alone is NOT the identity when the window is trimmed; it degenerates to the affine map
`d = (x*(ee-ls)+ls)*FL` (see `RubatoMap.ts:158-159` and the test at
`tests/mpm/elements/RubatoMap.test.ts:355-376`, where intensity=1 with ls=0.1/ee=0.9 still shifts
date 0 to 72). Independently corroborated by the default path: `getRubatoDataOf` builds
`new RubatoData()` (`RubatoMap.ts:105`) whose field initializer is `intensity = 1.0`
(`RubatoData.ts:33`) and only overwrites it if the attribute or a def supplies a value — so
"attribute absent, no def" renders as intensity=1, i.e. the MPM default IS the identity.

**Exaggerability.** Highly meaningful and the primary rubato knob. Correct scale space is
log-around-1 (T(x)=ln x, x' = x^s), which `DESIGN.md:24` already names. Justification from the math:
the curve family x^i is a group under exponent multiplication, (x^i)^s = x^(i·s), so log-space
scaling composes exactly (P2), fixes the neutral (P4), and never leaves (0, ∞) (P3 domain closure
without a clamp). intensity>1 = the frame rushes at the start and drags at the end (test `:283-302`:
intensity 2 pulls the midpoint of a 720-tick frame from 360 to 180); intensity<1 = the mirror image
(test `:304-319`).

HAZARDS: (a) do NOT use linear deviation scaling `x' = 1 + s*(x-1)` — it is asymmetric between rush
and drag (0.5 and 2.0 are reciprocal exponents, not equidistant on a line) and for s>2 it drives
intensity below 0, which the `<rubato>`-element path does not correct; `pow(0, negative) = Infinity`,
so the note at localDate=0 gets an Infinity `date.perf`. (b) intensity=0 collapses the whole frame to
a single instant (`pow(x,0)=1` ⇒ `d = earlyEnd*frameLength`, constant) — reachable only through the
element path, never through a def. (c) exaggerating the element attribute and the referenced
`rubatoDef` attribute both would double-apply; see hazards.

**Evidence.** parse: `src/mpm/elements/maps/RubatoMap.ts:126-128` (element, then def fallback);
`src/mpm/elements/maps/data/RubatoData.ts:57-58`. consumption: `RubatoMap.ts:169`
(`Math.pow(localDate / rd.frameLength!, rd.intensity!)`), whole formula `:166-173`. default:
`RubatoData.ts:33`. serialization: `RubatoMap.ts:61-62` (from `RubatoData`) and `:79` (from scalars).
identity test: `tests/mpm/elements/RubatoMap.test.ts:265-281`.

#### `rubato@lateStart` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.lateStart (number | null)`. *Paired with:* `rubato@earlyEnd` — jointly
constrained (0 ≤ lateStart < earlyEnd ≤ 1); they are NOT independent, see hazards.

**Domain.** [0, 1), and strictly below `earlyEnd`. Enforced on the map path in `getRubatoDataOf`:
floored at 0 (`src/mpm/elements/maps/RubatoMap.ts:136`) and, if `lateStart >= earlyEnd`, the PAIR is
reset to (0.0, 1.0) (`:138-141`). Enforced on the def path by `ensureLateStartEarlyEndBoundaries`
(`src/mpm/elements/styles/defs/RubatoDef.ts:211-230`, same three tests in the same order, the third
overriding the first two) and by `setLateStart` (`:149-161`), which silently REFUSES a value ≥
`earlyEnd`. NOT enforced by the `RubatoData` XML constructor
(`src/mpm/elements/maps/data/RubatoData.ts:60-61` is a bare `parseFloat`).

**Neutral.** `0.0` — the lower bound of its own domain. From the renderer: `lateStart` enters as
`... * (earlyEnd - lateStart) + lateStart) * frameLength` (`RubatoMap.ts:169-171`). It is the
additive offset of the warped frame: at localDate=0 the output offset is exactly
`lateStart*frameLength`, so any lateStart>0 delays the frame's first attack by that many ticks. Only
lateStart=0 leaves `d = pow(x,i)*earlyEnd*frameLength` with no constant term, which combined with
intensity=1/earlyEnd=1 gives d=localDate (identity). Also the class default (`RubatoData.ts:34`) that
applies when the attribute is absent and no def supplies one.

**Exaggerability.** Meaningful; it controls how much the frame's onset is pushed late. Neutral sits ON
the boundary of the domain, so log-around-1 is wrong; use the boundary-power (lower) map
T(x) = ln(1-x) on [0,1), i.e. `x' = 1 - (1-x)^s`, which is what `DESIGN.md:28` already prescribes.
That gives T(0)=0, is monotone, and keeps x' in [0,1) for all s>0 without a clamp.

MAJOR HAZARD: domain closure holds for `lateStart` alone but NOT for the `(lateStart, earlyEnd)`
pair. Applying the two boundary transforms independently crosses them at very modest s — e.g.
ls=0.4, ee=0.6 at s=2 gives ls'=0.64 > ee'=0.36 — and `RubatoMap.ts:138-141` then silently resets the
pair to (0.0, 1.0). That is a cliff, not a graded effect: the exaggeration jumps discontinuously to
*no window effect at all*, the exact opposite of what was asked. The pair must be transformed jointly
(e.g. treat head trim a=lateStart and tail trim b=1-earlyEnd as a composition with a+b<1) or
hard-clamped with a minimum gap before it is written back.

**Evidence.** parse: `src/mpm/elements/maps/RubatoMap.ts:129-131`;
`src/mpm/elements/maps/data/RubatoData.ts:60-61`. consumption: `RubatoMap.ts:169-171`. clamps:
`RubatoMap.ts:136,138-141`; `src/mpm/elements/styles/defs/RubatoDef.ts:211-230`. default:
`RubatoData.ts:34`. serialization: `RubatoMap.ts:63-64, :80`. behaviour test:
`tests/mpm/elements/RubatoMap.test.ts:355-376` (ls=0.1 delays date 0 to 72).

#### `rubato@earlyEnd` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.earlyEnd (number | null)`. *Paired with:* `rubato@lateStart` — jointly
constrained (0 ≤ lateStart < earlyEnd ≤ 1).

**Domain.** (0, 1], and strictly above `lateStart`. Enforced on the map path in `getRubatoDataOf`:
capped at 1 (`src/mpm/elements/maps/RubatoMap.ts:137`) and the crossed-pair reset to (0.0, 1.0)
(`:138-141`) — note there is no explicit floor at 0; a negative `earlyEnd` is caught only because it
necessarily trips `lateStart >= earlyEnd`. Def path: `ensureLateStartEarlyEndBoundaries`
(`src/mpm/elements/styles/defs/RubatoDef.ts:211-230`) and `setEarlyEnd` (`:167-179`), which silently
refuses a value ≤ `lateStart`. NOT enforced by the `RubatoData` XML constructor
(`src/mpm/elements/maps/data/RubatoData.ts:63-64`).

**Neutral.** `1.0` — the UPPER bound of its own domain. From the renderer: as localDate sweeps
[0, frameLength), d sweeps [lateStart·frameLength, earlyEnd·frameLength) (`RubatoMap.ts:169-171`), so
`(earlyEnd - lateStart)` is the compression factor of the frame's content and earlyEnd<1 pulls the
frame's last attack earlier by `(1-earlyEnd)*frameLength` ticks. Only earlyEnd=1 (with lateStart=0)
leaves the span uncompressed and yields d=localDate at intensity=1. Also the class default
(`RubatoData.ts:35`) used when the attribute is absent with no def.

**Exaggerability.** Meaningful; controls how much the frame's tail is pulled early. Neutral is at the
domain's UPPER boundary, so the correct map is boundary-power (upper) T(x) = ln x on (0,1], i.e.
`x' = x^s` (`DESIGN.md:27`). T(1)=0, monotone, closed on (0,1]. Same pairing hazard as `lateStart`:
the two boundary transforms applied independently cross for modest s and the crossing is silently
repaired to (0,1), erasing the effect entirely.

Additional structural note: 0 ≤ lateStart < earlyEnd ≤ 1 is exactly the monotonicity guarantee of the
warped timeline — within a frame `d' = intensity*x^(intensity-1)*(earlyEnd-lateStart) > 0`, and
across frames the output range [n·FL + ls·FL, n·FL + ee·FL) never overlaps the next frame's because
ee ≤ 1 and ls ≥ 0. Pushing the window outside [0,1] would let notes reorder. The clamps are therefore
load-bearing musical correctness, not defensive noise; the exaggeration engine must respect them
itself rather than lean on the renderer's repair.

**Evidence.** parse: `src/mpm/elements/maps/RubatoMap.ts:132-134`;
`src/mpm/elements/maps/data/RubatoData.ts:63-64`. consumption: `RubatoMap.ts:169-171`. clamps:
`RubatoMap.ts:137,138-141`; `src/mpm/elements/styles/defs/RubatoDef.ts:220-223,167-179`. default:
`RubatoData.ts:35`. serialization: `RubatoMap.ts:65, :81`. combined test:
`tests/mpm/elements/RubatoMap.test.ts:513-526`.

#### `rubato@frameLength` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.frameLength (number | null)`. *Type:* double (ticks, in the performance's
PPQ after `Performance.cloneForRender`'s `convertPPQ`).

**Domain.** Must be > 0: it is both the modulus of `(date - startDate) % frameLength` and a divisor
in `localDate / frameLength` (`src/mpm/elements/maps/RubatoMap.ts:167,169`). 0 yields NaN dates,
negative yields a negative modulus and pow of a negative base. ENFORCED NOWHERE ON EITHER PARSE PATH
— `RubatoMap.ts:120-121` is a bare `parseFloat`, `RubatoDef.parseDataInternal` only requires the
attribute to exist and parses it without clamping (`src/mpm/elements/styles/defs/RubatoDef.ts:37-39,
:75`). The only guard anywhere is `RubatoDef.setFrameLength`'s `Math.max(frameLength, 0.0)` (`:133`),
which still permits exactly 0. Absence is the one hard reject in the family: `getRubatoDataOf`
returns null when neither the element nor a def supplies it (`RubatoMap.ts:120-123`), so the whole
instruction is skipped.

**Neutral.** NONE EXISTS — and this is provable rather than a judgement call. In
`computeRubatoTransformation` the identity is reached by intensity=1, lateStart=0, earlyEnd=1 for
EVERY frameLength: `d = (pow(localDate/FL, 1) * 1 + 0) * FL = localDate`, FL cancels exactly
(`RubatoMap.ts:169-172`). No value of frameLength makes the transform the identity on its own, and no
value is a fixed point of any scaling of it. frameLength is a timescale/period parameter, not a
magnitude of deviation from a neutral performance, so the T(neutral)=0 framework of
`DESIGN.md:14-19` has nothing to anchor on.

**Exaggerability.** RECOMMEND EXCLUDE (consistent with `DESIGN.md:109`, which lists only
intensity/lateStart/earlyEnd for the rubato dimension). It is tempting because peak displacement is
linear in frameLength — for intensity=2, ls=0, ee=1 the offset is `FL*(x^2 - x)`, minimised at −FL/4
— so scaling it up does enlarge the absolute timing deviation in ticks. But: (1) no fixed point, so
P4 is undefined and s=1 is the only identity by fiat rather than by construction; (2) it
simultaneously halves/doubles the *rate* of the push-pull, conflating two musical dimensions in one
number; (3) decisively, with loop=false frameLength doubles as the SPAN CUTOFF —
`renderRubatoToMap` breaks out when `mapEntry.getKey() >= rd.startDate + rd.frameLength`
(`RubatoMap.ts:201`) and the same test gates the deferred end-date pass (`:229`) — so scaling it
changes WHICH notes are warped, a non-local edit to the note set rather than to the expression. If a
consumer really wants it, offer it as a separate explicit "timescale" knob with the loop=false case
documented, never folded into the `rubato` exaggeration factor.

**Evidence.** parse + hard reject: `src/mpm/elements/maps/RubatoMap.ts:120-123`;
`src/mpm/elements/maps/data/RubatoData.ts:54-55`. consumption (modulus, divisor, multiplier):
`RubatoMap.ts:167,169-171`. consumption (span cutoff when loop=false): `RubatoMap.ts:201` and `:229`.
def side: `src/mpm/elements/styles/defs/RubatoDef.ts:37-39,75,129-135`. serialization:
`RubatoMap.ts:59-60, :78`. loop=false span test: `tests/mpm/elements/RubatoMap.test.ts:407-424`.

#### `rubato@date` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.startDate` (number, default 0.0); the paired `RubatoData.endDate` is
DERIVED, not an attribute.

**Domain.** Any double; required — `GenericMap.parseData` skips any child without a `date`
(`src/mpm/elements/maps/GenericMap.ts:144-145`) and `addElement` refuses one (`:374-377`). Read with
`parseFloat`, no bounds anywhere. Implicit invariant: entries are kept date-sorted
(`GenericMap.parseData:148-157`, `insertElement:396`, `sort:187-203`).

**Neutral.** NONE — a position on the timeline, not a deviation. It enters the math only as the
frame's phase origin: `localDate = (date - rd.startDate) % rd.frameLength` (`RubatoMap.ts:167`), and
as the span boundaries (`:198` skip-before, `:201`/`:229`/`:231` cutoffs). Shifting it does not scale
any deviation, it relocates the whole effect.

**Exaggerability.** EXCLUDE unconditionally (`DESIGN.md:118` already excludes dates). Two independent
reasons beyond the missing neutral: it would move where the expression happens rather than how much
of it there is; and it is the sort key of the map — `RubatoData.endDate` is derived from the NEXT
rubato's date (`RubatoMap.getEndDate:145-150`, MAX_VALUE for the last one), so perturbing one date
silently re-partitions the spans of its neighbours and can reorder entries (`GenericMap.sort:187-203`
deliberately uses a stable insertion sort so equal-date instructions keep their precedence).

**Evidence.** parse: `src/mpm/elements/maps/GenericMap.ts:144-147` (map key);
`src/mpm/elements/maps/RubatoMap.ts:106` (`rd.startDate = this.elements[i].getKey()`);
`src/mpm/elements/maps/data/RubatoData.ts:43`. derived endDate: `RubatoMap.ts:107,145-150`.
consumption: `RubatoMap.ts:167,198,201,229,231`. serialization: `RubatoMap.ts:56, :73`.

#### `rubato@loop` (element `<rubato>` inside `<rubatoMap>`)

*Data field:* `RubatoData.loop` (boolean, default false). *Type:* boolean (parsed as the literal
string comparison `value === 'true'`; anything else is false).

**Domain.** {true, false}. Parsed by exact string equality with `'true'` —
`src/mpm/elements/maps/RubatoMap.ts:125` and `src/mpm/elements/maps/data/RubatoData.ts:67` — so
`'TRUE'`/`'1'` both silently mean false. Note it is NEVER inherited from a `rubatoDef`
(`getRubatoDataOf` has no def fallback for it, unlike the other four), and `RubatoDef` carries no
`loop` attribute at all.

**Neutral.** Not applicable — not a magnitude. Listed here only because it is load-bearing for the
others: with loop=false the effect is confined to the single frame [startDate, startDate+frameLength)
and everything past it is left unwarped (`RubatoMap.ts:201, :229`); with loop=true the warp repeats
to `endDate`.

**Exaggerability.** NOT EXAGGERABLE — an enum, excluded by `DESIGN.md:118`. Must nonetheless be READ
by the engine, because it decides whether frameLength is a pure shape parameter (loop=true) or also a
span boundary (loop=false); any decision to touch frameLength depends on it.

**Evidence.** parse: `src/mpm/elements/maps/RubatoMap.ts:124-125`;
`src/mpm/elements/maps/data/RubatoData.ts:66-67`, default at `:37`. consumption:
`RubatoMap.ts:201, :229`. serialization: `RubatoMap.ts:66, :76, :82`. tests:
`tests/mpm/elements/RubatoMap.test.ts:407-439`.

#### `rubatoDef@intensity` (element `<rubatoDef>` inside a `<styleDef>` of type `'rubatoStyles'`)

*Data field:* `RubatoDef.intensity` (private number, default 1.0). *Paired with:* `rubato@intensity`
— the def value is the INHERITED value used whenever the `<rubato>` element omits its own.

**Domain.** (0, +∞), and unlike the element path this IS enforced: `ensureIntensityBoundaries` turns
0 into 0.01 and inverts negatives (`src/mpm/elements/styles/defs/RubatoDef.ts:194-204`), invoked from
the parser (`:49-55`) and from `setIntensity` (`:141`). Parsed with `parseJavaDouble`, which THROWS on
a malformed literal and makes `createRubatoDef` return null so the style drops the def entirely
(`:46-55, :123-126`).

**Neutral.** `1.0` — identical justification to `rubato@intensity`, and it is literally the field
initializer (`RubatoDef.ts:26`) that the parser writes into the element when the attribute is absent
(`:42-44`). The value flows to the renderer through `getRubatoDataOf`'s def fallback
(`src/mpm/elements/maps/RubatoMap.ts:128`) and then into the same `Math.pow` at `RubatoMap.ts:169`.

**Exaggerability.** Same as `rubato@intensity`: log-around-1, `x' = x^s`. MUST be covered — a
document that expresses its rubato through `rubatoDef`s and bare `<rubato name.ref=... loop=.../>`
elements has NO intensity attribute on the elements at all, so an engine that only walks rubatoMap
entries is a total no-op on it. Conversely, a def referenced by N rubato elements must be scaled
ONCE, not N times (see hazards). Prefer writing the attribute directly or via `setIntensity`
(`:140-143`) — the setter re-applies the boundary rules, which is harmless for a positive-preserving
transform.

**Evidence.** fields/defaults: `src/mpm/elements/styles/defs/RubatoDef.ts:26`. parse + default
injection + clamp: `:41-56, :76`. getter/setter: `:137-143`. inheritance into the render path:
`src/mpm/elements/maps/RubatoMap.ts:115-118, :128`. consumption: `RubatoMap.ts:169`.

#### `rubatoDef@lateStart` (element `<rubatoDef>` inside a `<styleDef>` of type `'rubatoStyles'`)

*Data field:* `RubatoDef.lateStart` (private number, default 0.0). *Paired with:*
`rubatoDef@earlyEnd` (jointly clamped by `ensureLateStartEarlyEndBoundaries`); also the inherited
source for `rubato@lateStart`.

**Domain.** [0, 1) and `< earlyEnd`, enforced at parse by `ensureLateStartEarlyEndBoundaries`
(`src/mpm/elements/styles/defs/RubatoDef.ts:68-73` calling `:211-230`) and by `setLateStart`
(`:149-161`), which SILENTLY RETURNS without writing anything when `lateStart >= earlyEnd`.
`setLateStartAndEarlyEnd` (`:185-191`) is the only way to move both past each other. Values are
parsed with `parseJavaDouble` (`:69`), so a malformed literal kills the whole def.

**Neutral.** `0.0` — same renderer argument as `rubato@lateStart` (it is the additive offset term in
`src/mpm/elements/maps/RubatoMap.ts:169-171`), and it is the field initializer (`RubatoDef.ts:27`)
that the parser writes into the element when the attribute is missing (`:58-62`). Reaches the
renderer via `getRubatoDataOf`'s def fallback (`RubatoMap.ts:131`).

**Exaggerability.** boundary-power (lower), `x' = 1 - (1-x)^s` (`DESIGN.md:28`). Same joint-crossing
hazard as the element attribute, aggravated on this path: writing through `setLateStart` alone can
partially apply an exaggeration (one bound moves, the other is silently refused), leaving the def in a
state neither the caller nor the document intended. Use `setLateStartAndEarlyEnd`, or write both
attributes directly, and clamp the pair yourself first — `setLateStartAndEarlyEnd` re-runs
`ensureLateStartEarlyEndBoundaries`, whose crossed-pair branch resets to (0.0, 1.0), the same
effect-erasing cliff.

**Evidence.** fields/defaults: `src/mpm/elements/styles/defs/RubatoDef.ts:27`. parse + default
injection + joint clamp: `:58-62, :68-73, :77, :211-230`. setters: `:149-161` (refusal branch at
`:150-153`), `:185-191`. inheritance: `src/mpm/elements/maps/RubatoMap.ts:131`. consumption:
`RubatoMap.ts:169-171`. clamp tests: `tests/mpm/elements/styles/defs/RubatoDef.test.ts:139-183,
:218-239, :261-294`.

#### `rubatoDef@earlyEnd` (element `<rubatoDef>` inside a `<styleDef>` of type `'rubatoStyles'`)

*Data field:* `RubatoDef.earlyEnd` (private number, default 1.0). *Paired with:*
`rubatoDef@lateStart` (jointly clamped); also the inherited source for `rubato@earlyEnd`.

**Domain.** (0, 1] and `> lateStart`, enforced at parse by `ensureLateStartEarlyEndBoundaries`
(`src/mpm/elements/styles/defs/RubatoDef.ts:63-73` calling `:211-230`) and by `setEarlyEnd`
(`:167-179`), which silently returns without writing when `earlyEnd <= lateStart` and caps > 1 at 1.
Parsed with `parseJavaDouble` (`:70`).

**Neutral.** `1.0` — the upper bound, same renderer argument as `rubato@earlyEnd`
(`(earlyEnd - lateStart)` is the frame's compression factor in
`src/mpm/elements/maps/RubatoMap.ts:169-171`). It is the field initializer (`RubatoDef.ts:28`) the
parser writes into the element when the attribute is absent (`:63-67`), and it reaches the renderer
through `getRubatoDataOf`'s def fallback (`RubatoMap.ts:134`).

**Exaggerability.** boundary-power (upper), `x' = x^s` (`DESIGN.md:27`). Same joint-crossing hazard
and the same partial-application trap through `setEarlyEnd`'s silent refusal branch. Note
`setLateStartAndEarlyEnd` writes `earlyEnd` BEFORE `lateStart` (`:187-190`), so an observer of the
XML mid-call sees a transient crossed state — irrelevant for a synchronous engine, but do not build
an incremental/diffing writer on top of it.

**Evidence.** fields/defaults: `src/mpm/elements/styles/defs/RubatoDef.ts:28`. parse + default
injection + joint clamp: `:63-73, :78, :211-230`. setters: `:167-179` (refusal at `:168-171`),
`:185-191`. inheritance: `src/mpm/elements/maps/RubatoMap.ts:134`. consumption:
`RubatoMap.ts:169-171`.

#### `rubatoDef@frameLength` (element `<rubatoDef>` inside a `<styleDef>` of type `'rubatoStyles'`)

*Data field:* `RubatoDef.frameLength` (private number, default 0.0 — but the default is unreachable,
see domain).

**Domain.** Must be > 0 for the renderer. REQUIRED: a missing frameLength throws in
`parseDataInternal` and `createRubatoDef` converts that to null, so the def is dropped from the style
(`src/mpm/elements/styles/defs/RubatoDef.ts:37-39, :123-126`, and `RubatoStyle.parseData` at
`src/mpm/elements/styles/RubatoStyle.ts:37`). The parser applies NO clamp (`:75`) — a negative or
zero frameLength in a def parses fine and reaches the renderer. Only `setFrameLength` guards, and only
to ≥ 0 (`:132-135`), which still allows 0.

**Neutral.** NONE — identical reasoning to `rubato@frameLength`: it cancels out of the identity case
entirely (`src/mpm/elements/maps/RubatoMap.ts:169-172`), so it has no fixed point under any scaling.
The declared field default 0.0 (`RubatoDef.ts:25`) is NOT a neutral value; it is a placeholder that
can never survive parsing (the attribute is mandatory) and would produce NaN if it did.

**Exaggerability.** RECOMMEND EXCLUDE, same as `rubato@frameLength` — no fixed point, conflates
displacement magnitude with wobble rate, and under loop=false on the referencing `<rubato>` it changes
which notes are affected. Note the asymmetry the engine must handle: `loop` lives on the `<rubato>`
element and is never inherited from the def, so ONE def's frameLength can act as a pure period for one
referencing instruction and as a span cutoff for another.

**Evidence.** field/default: `src/mpm/elements/styles/defs/RubatoDef.ts:25`. required-at-parse:
`:37-39, :123-126`. unclamped parse: `:75`. setter clamp: `:132-135`. inheritance:
`src/mpm/elements/maps/RubatoMap.ts:122`. consumption: `RubatoMap.ts:167,169-171,201,229`. style
wiring: `src/mpm/elements/styles/RubatoStyle.ts:35-38`.

### Walker notes — rubato

Two disjoint physical homes for this family — rubatoMap ENTRIES and rubatoStyles DEFS — and both must
be walked, because per-attribute inheritance means either can be the only place a value physically
lives.

**A) Map entries (`<rubato>` elements).** Constants: `RUBATO_MAP = 'rubatoMap'`
(`src/mpm/names.ts:35`); also re-exported as `Mpm.RUBATO_MAP` (`src/mpm/Mpm.ts:82`). Global:
`Mpm.getPerformance(i|name)` (`src/mpm/Mpm.ts:325-345`) → `Performance.getGlobal()`
(`src/mpm/elements/Performance.ts:289`) → `Global.getDated()` (`src/mpm/elements/Global.ts:80`) →
`Dated.getMap(RUBATO_MAP)` (`src/mpm/elements/Dated.ts:123`) cast to `RubatoMap`. This is exactly what
`Performance.resolveGlobalMaps` does (`Performance.ts:446`). Per part: `Performance.getAllParts()`
(`Performance.ts:225`) → `Part.getDated()` (`src/mpm/elements/Part.ts:137`) → the same
`Dated.getMap(RUBATO_MAP)`. Mirror of `Performance.resolvePartMaps` (`Performance.ts:603`).

Entries: `RubatoMap.size()` / `getElement(i)` (inherited,
`src/mpm/elements/maps/GenericMap.ts:520` and `:260`), or the raw `KeyValue` array
`GenericMap.elements` (`:77`). SKIP `<style>` switch elements — they are in the same list
(`GenericMap.parseData:141-156`) and `resolveEntryIndex` returns -1 for them
(`GenericMap.ts:469-473`, used at `RubatoMap.ts:102`).

READ vs WRITE: `RubatoMap.getRubatoDataOf(i)` (`src/mpm/elements/maps/RubatoMap.ts:101-143`) is the
right way to see the EFFECTIVE, def-resolved, clamped values — use it to decide and to report. But it
is a detached snapshot: mutating the returned `RubatoData` changes nothing. To write, edit the
`Element` (`rd.xml`, assigned at `RubatoMap.ts:108`, or `map.getElement(i)`) with
`Element.getAttribute('intensity')!.setValue(...)`. Do NOT round-trip through `addRubato(RubatoData)`
(`:53-70`) — it builds a NEW element and inserts it, duplicating the instruction, and it
unconditionally writes a `loop` attribute even where none existed.

**B) Defs (`<rubatoDef>` elements).** Constant: `RUBATO_STYLE = 'rubatoStyles'`
(`src/mpm/names.ts:26`; `Mpm.RUBATO_STYLE` at `src/mpm/Mpm.ts:73`). Note the plural — the style TYPE
key is `'rubatoStyles'` while the map key is `'rubatoMap'`. Global header:
`Performance.getGlobal()!.getHeader()` (`src/mpm/elements/Global.ts:77`). Part header:
`Part.getHeader()` (`src/mpm/elements/Part.ts:134`). Then `Header.getAllStyleDefs(RUBATO_STYLE)` →
`Map<string, GenericStyle> | undefined` (`src/mpm/elements/Header.ts:153`), or
`Header.getStyleDef(type, name)` for one (`:157`). Each value is a `RubatoStyle`
(`src/mpm/elements/styles/RubatoStyle.ts:10`); enumerate its defs with `GenericStyle.getAllDefs()`
(`src/mpm/elements/styles/GenericStyle.ts:98`) or `getDef(name)` (`:101`), yielding `RubatoDef`.

`RubatoDef` accessors: `getFrameLength`/`setFrameLength` `:129`/`:132`,
`getIntensity`/`setIntensity` `:137`/`:140`, `getLateStart`/`setLateStart` `:145`/`:149`,
`getEarlyEnd`/`setEarlyEnd` `:163`/`:167`, `setLateStartAndEarlyEnd` `:185` (all in
`src/mpm/elements/styles/defs/RubatoDef.ts`). Every setter writes straight back into the live XML
attribute, so no separate serialization step is needed.

**C) Scope resolution the engine must reproduce (or deliberately not).** Which style a given
`<rubato>` uses: the nearest preceding `<style name.ref=...>` switch in the SAME map
(`GenericMap.findStyleSwitchAt` / `findStyleNameAt`,
`src/mpm/elements/maps/GenericMap.ts:480-496`; called at `RubatoMap.ts:111`). The scan starts AT the
index, so a switch at the same date is in scope. Which header that style is found in:
`GenericMap.getStyle` prefers the map's LOCAL header and falls back to the GLOBAL one
(`GenericMap.ts:506-514`). A part-local `rubatoStyles` def shadows a global one of the same name.
Per-attribute inheritance: each of frameLength/intensity/lateStart/earlyEnd is taken from the element
IF PRESENT, otherwise from the def, independently of the others (`RubatoMap.ts:120-134`). `loop` is
never inherited (`:124-125`). If neither supplies intensity/lateStart/earlyEnd, the `RubatoData` field
defaults 1.0/0.0/1.0 apply (`RubatoData.ts:33-35`, via `new RubatoData()` at `RubatoMap.ts:105`).

**D) Simplest safe traversal for an exaggerator:** visit every `rubatoStyles` def exactly once per
document, and every `<rubato>` element exactly once, scaling only the attributes PHYSICALLY PRESENT on
each site. That gives each physical value exactly one transform and needs no inheritance resolution —
but the report should still use `getRubatoDataOf` to state effective before/after values.

### Hazards — rubato

- **OBJECT ALIASING, GLOBAL MAP**: `Performance.resolvePartMaps` falls back to the GLOBAL `RubatoMap`
  object for any part lacking its own (`src/mpm/elements/Performance.ts:603`). Walking global + every
  part and mutating what you find would scale the global map once per part. Deduplicate by `Element`
  identity, or walk global maps and part-owned maps separately.
- **DEF ALIASING**: N different `<rubato>` elements can share one `rubatoDef` via `name.ref`
  (`src/mpm/elements/maps/RubatoMap.ts:115-118`). Scale each def once; never once per referencing
  instruction.
- **THE PAIRED-BOUNDS CLIFF (worst trap in this family)**: `lateStart` and `earlyEnd` are jointly
  constrained (0 ≤ ls < ee ≤ 1), but `DESIGN.md`'s boundary-power maps treat them independently.
  ls=0.4, ee=0.6 at s=2 gives ls'=0.64 > ee'=0.36; `RubatoMap.getRubatoDataOf:138-141` then silently
  resets the pair to (0.0, 1.0) — the exaggeration jumps discontinuously to NO window effect at all.
  `RubatoDef.ensureLateStartEarlyEndBoundaries:224-228` does the same, and its three tests run in
  order with the third OVERRIDING the first two, so a crossed pair collapses to the full frame rather
  than to the individually clamped values. Transform the pair jointly and clamp with a minimum gap
  before writing.
- **SILENT PARTIAL WRITE ON THE DEF PATH**: `RubatoDef.setLateStart` returns without writing when
  `lateStart >= earlyEnd` (`src/mpm/elements/styles/defs/RubatoDef.ts:150-153`) and `setEarlyEnd`
  likewise when `earlyEnd <= lateStart` (`:168-171`). An engine that calls them in sequence can move
  one bound and have the other refused, producing a state it never intended and never hears about
  (the only signal is a `console.error`). Use `setLateStartAndEarlyEnd` (`:185-191`) or write the
  attributes directly.
- **INTENSITY IS UNGUARDED ON THE ELEMENT PATH**: `ensureIntensityBoundaries`
  (`RubatoDef.ts:194-204`) only ever runs for `rubatoDef`. `RubatoMap.getRubatoDataOf:127` and
  `RubatoData`'s constructor (`data/RubatoData.ts:58`) read `<rubato intensity>` with a bare
  `parseFloat` and apply NO correction. intensity=0 collapses the entire frame onto one instant
  (`pow(x,0)=1`); intensity<0 makes `pow(0, negative) = Infinity`, so the note at localDate=0 gets an
  Infinity `date.perf`. The exaggeration engine must enforce intensity > 0 itself — do not assume the
  renderer will.
- **PARSER LENIENCY SPLIT**: the def path uses `parseJavaDouble`, which throws on a malformed literal
  and makes `createRubatoDef` return null so the whole def is dropped (`RubatoDef.ts:46-55,
  :123-126`; `PARITY.md` "Fixed bugs" P1). The `<rubato>`-element path uses plain `parseFloat`
  (`RubatoMap.ts:121,127,130,133`; `RubatoData.ts:55,58,61,64`), where `'abc'` becomes NaN and
  `'12abc'` becomes 12. NaN propagates through `computeRubatoTransformation` into `date.perf` with no
  warning. Validate before scaling, and never write a NaN back.
- **PARSING A DEF MUTATES THE DOCUMENT**: `RubatoDef.parseDataInternal` ADDS
  intensity/lateStart/earlyEnd attributes with their defaults when they are absent, and rewrites
  clamped values in place (`src/mpm/elements/styles/defs/RubatoDef.ts:41-73`, documented in the class
  comment `:13-17`). So merely parse→serialize changes a def's attribute SET. This breaks
  `DESIGN.md`'s P1 ("s = 1 ⇒ the document is byte-identical") for any document with a `rubatoDef` that
  omits an optional attribute — the divergence is the parser's, not the exaggerator's, and needs an
  explicit decision (accept, or diff against the parsed-unmodified baseline rather than against the
  input text).
- **DEFAULTS ARE ASYMMETRIC BETWEEN THE TWO `RubatoData` CONSTRUCTION PATHS**: the field initializers
  give intensity/lateStart/earlyEnd = 1.0/0.0/1.0 (`data/RubatoData.ts:33-35`), but the XML
  constructor OVERWRITES them with null when the attribute is absent (`:54-64`, rationale at `:48-53`)
  so that def inheritance can be detected. `getRubatoDataOf` uses the no-arg constructor
  (`RubatoMap.ts:105`) and therefore DOES see the defaults. Reading effective values through
  `new RubatoData(xml)` instead of `getRubatoDataOf` gives nulls where the renderer sees 1.0/0.0/1.0.
- **frameLength DOUBLES AS A SPAN BOUNDARY when loop=false** (`RubatoMap.ts:201` and `:229`) — scaling
  it changes which notes are warped, not just how. And `loop` lives only on the `<rubato>` element and
  is never inherited from the def, so one shared def's frameLength can be a pure period for one
  referencing instruction and a cutoff for another.
- **frameLength IS NEVER CLAMPED AT PARSE** on either path (`RubatoMap.ts:120-121`;
  `RubatoDef.ts:75`). Only `RubatoDef.setFrameLength` guards, and only to ≥ 0 (`:133`), which still
  permits exactly 0 — a guaranteed NaN in `% frameLength` and `localDate / frameLength`.
- **RENDER-PATH BIT-EXACTNESS**: the comment at `RubatoMap.ts:161-165` states that the evaluation
  order in `computeRubatoTransformation` is load-bearing (`Math.pow` must not become `**`, and
  `date + d - localDate` must not be regrouped) because every performed onset depends on the exact
  bits. If the exaggeration engine ever grows its own preview of the warp, it must copy that
  expression verbatim, not re-derive it.
- **REORDERING SAFETY**: 0 ≤ lateStart < earlyEnd ≤ 1 plus intensity > 0 is exactly what makes the
  warp monotone within a frame (`d/dx = intensity*x^(intensity-1)*(ee-ls) > 0`) and non-overlapping
  across frames. Any exaggeration that leaves those ranges lets notes swap order. Also note
  `GenericMap.sort` (`src/mpm/elements/maps/GenericMap.ts:187-203`) deliberately uses a stable
  insertion sort so simultaneous instructions keep their precedence — do not perturb dates.
- **MAP ENTRIES ARE NOT ALL `<rubato>`**: a rubatoMap also holds `<style>` switches, which carry a
  numeric `date` and sit in the same elements array (`GenericMap.parseData:141-156`). Filter on
  `getLocalName() === 'rubato'` (as `resolveEntryIndex` does, `GenericMap.ts:469-473`) before touching
  attributes.
- **`addRubato(RubatoData)` BUILDS A NEW ELEMENT** (`RubatoMap.ts:53-70`) rather than updating the
  existing one, and unconditionally emits a `loop` attribute (`:66`) even for a source element that
  had none. It is not a write-back API; do not use it to apply exaggeration.

---

## 4. Articulation

Every attribute below exists twice — on `<articulationDef>` (named articulation) and on the inline
`<articulation>` element — and the two do **not** compose the same way (hazard #2).

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `@relativeDuration` | double | (0,∞) musically; enforced nowhere | `1.0` (exact-equality guard + arithmetic) | — | **log-around-1** — the canonical case |
| `@absoluteDurationChange` | double (ticks) | unbounded; renderer halves negatives | `0.0` (guard skips branch) | — | **linear-0**, but P5 fails (saturates) |
| `@absoluteDuration` | double, nullable (ticks) | (0,∞); enforced nowhere | **none — neutral is ABSENT** | — | **RECOMMEND EXCLUDE** |
| `@absoluteDurationChangeMs` | double (ms) | unbounded; only pass-two commit guard | `0.0` | — | **linear-0** — best-behaved of the family |
| `@absoluteDurationMs` | double, nullable (ms) | (0,∞); unenforced | **none — ABSENT** | — | **RECOMMEND EXCLUDE** |
| `@absoluteDelay` | double (ticks) | unbounded, unenforced | `0.0` | — | **linear-0**, clean |
| `@absoluteDelayMs` | double (ms) | unbounded; pass-two guard only | `0.0` | — | **linear-0**, sharp hazard (#5) |
| `@absoluteVelocityChange` | double | signed velocity; bounded only globally | `0.0` | affine with `@relativeVelocity` | **linear-0** — the accent lever |
| `@relativeVelocity` | double | (0,∞); unenforced | `1.0` | affine with `@absoluteVelocityChange` | **log-around-1** |
| `@absoluteVelocity` | double, nullable | [0,127] musically; unenforced | **none — ABSENT** | — | **RECOMMEND EXCLUDE** |
| `@detuneCents` | double | unbounded; **no consumer** | `0.0` | `@detuneHz` (same quantity) | linear-0 but INERT; charter call |
| `@detuneHz` | double | unbounded; **no consumer** | `0.0` | `@detuneCents` | **EXCLUDE** (register-dependent) |
| `articulation@date`, `style@date` | double | ticks; required, else dropped | none (position) | — | **NOT exaggerable** (deny list) |

### Per-attribute detail

#### `articulationDef@relativeDuration` / `articulation@relativeDuration`

*Data field:* `ArticulationDef.relativeDuration`; `ArticulationData.relativeDuration`. *Paired with:*
none (no transition partner). But it is in a three-way precedence relation with `absoluteDuration` and
`absoluteDurationChange` on the same element — see hazard #2.

**Domain.** Dimensionless ratio. Musically (0, +∞). NOT enforced anywhere: the def path parses with
`parseJavaDouble` (accepts NaN/±Infinity, `src/supplementary/parseJavaDouble.ts:21,29`), the map path
with bare `parseFloat`, and the renderer only multiplies. A negative or zero ratio is accepted and
silently produces a zero/negative `duration.perf`.

**Neutral.** `1.0` — neutral by BOTH guard and arithmetic. The renderer's branch is an exact-equality
guard `if (this.relativeDuration !== 1.0)` (`ArticulationDef.ts:358`, `ArticulationData.ts:189`), so
at 1.0 `duration.perf` is not written at all; and even if it were, `x*1` is the identity. Corroborated
three more ways: the field default is 1.0 (`ArticulationDef.ts:23`, `ArticulationData.ts:42`),
`resetAttribute` restores 1.0 (`ArticulationDef.ts:130-132`), and the serializer OMITS the attribute
when it equals 1.0 (`ArticulationMap.ts:71-72`) — i.e. "neutral" and "absent" are the same document
state.

**Exaggerability.** THE canonical log-around-1 case for this family (matches `DESIGN.md:24`).
`x' = x^s`: keeps (0,+∞) closed (P3), fixes 1.0 exactly (P4), composes (P2), monotone in s (P5).
meico's own defaults sit on both sides of 1 and are exactly what one wants to exaggerate: legato 1.0,
nonlegato 0.95, tenuto 0.9, marcato/portato/legatostop/sfz 0.8 (`ArticulationDef.ts:265-321`).
HAZARDS: (a) the guard is exact float equality — writing 0.9999999999999999 turns a documented no-op
into a real write and breaks P1 byte identity; skip the write when the transformed value equals the
original. (b) On an inline `<articulation>` that ALSO carries `absoluteDurationChange`, exaggerating
this is a total no-op — see hazard #2. (c) If a def sets `absoluteDurationMs`, this attribute's effect
on `duration.perf` is discarded at ms time — see hazard #6.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:55-58,65`;
`src/mpm/elements/maps/ArticulationMap.ts:131-134,138`;
`src/mpm/elements/maps/data/ArticulationData.ts:79-81`. consumption: `ArticulationDef.ts:358-359`;
`ArticulationData.ts:189-192`. neutral corroboration: `ArticulationDef.ts:23,130-132`;
`ArticulationData.ts:42`; `ArticulationMap.ts:71-72`. defaults corpus:
`ArticulationDef.ts:265,268,273,277,287,294,321`.

#### `articulationDef@absoluteDurationChange` / `articulation@absoluteDurationChange`

*Data field:* `ArticulationDef.absoluteDurationChange`; `ArticulationData.absoluteDurationChange`.
*Paired with:* none. In precedence conflict with `relativeDuration`/`absoluteDuration` on the same
element — hazard #2.

**Domain.** Signed offset in MIDI ticks at the performance's PPQ (`Performance.getPPQ()`,
`src/mpm/elements/Performance.ts:301-303`) — it is added to `duration.perf`, which is seeded from the
symbolic MSM `duration` (`Performance.ts:361-363`). Unbounded and unenforced at parse. The RENDERER,
however, imposes a soft floor: the whole branch is skipped unless the pre-existing duration is > 0,
and a negative change that would zero the note is halved repeatedly until the result is positive
(`ArticulationDef.ts:360-368`, `ArticulationData.ts:212-220`).

**Neutral.** `0.0` — `if (this.absoluteDurationChange !== 0.0)` (`ArticulationDef.ts:360`,
`ArticulationData.ts:212`) skips the branch entirely, so `duration.perf` is untouched: exact identity.
Arithmetically `x+0` is also the identity, so the guard and the arithmetic agree. Field default 0.0
(`ArticulationDef.ts:20`, `ArticulationData.ts:39`); `resetAttribute` restores 0.0
(`ArticulationDef.ts:121-123`); the serializer omits it at 0.0 (`ArticulationMap.ts:69-70`).

**Exaggerability.** linear-0 (signed tick offset) — a legitimate candidate, and the only tick-domain
duration attribute with a true fixed point. BUT P5 (monotone in s) FAILS in the rendered output for
negative values: the halving loop makes the applied delta saturate. Worked example from
`ArticulationDef.ts:363-366` with duration d: change = -4d yields durNew = 0.5d (reduce reaches 8);
change = -8d ALSO yields 0.5d (reduce reaches 16). Doubling the exaggeration changes nothing audible.
So exaggeration of negative values is a plateau function of |change|/duration, and the plateau
boundary is note-dependent — the engine cannot predict it from the document. Positive values are
exactly linear and safe. Second trap: notes with `duration.perf <= 0` skip the branch outright (and,
in `ArticulationData` only, also skip the `modified` bookkeeping — `ArticulationData.ts:208-211`), so
the attribute is a no-op there at every s.

**Evidence.** parse: `ArticulationDef.ts:61`; `ArticulationMap.ts:137`; `ArticulationData.ts:67-69`
(all under `src/mpm/elements/`). consumption:
`src/mpm/elements/styles/defs/ArticulationDef.ts:360-368`;
`src/mpm/elements/maps/data/ArticulationData.ts:212-220` (with the DELIBERATE DIVERGENCE #1
commentary at `193-211`). neutral corroboration: `ArticulationDef.ts:20,121-123`;
`ArticulationData.ts:39`; `ArticulationMap.ts:69-70`. default corpus: `ArticulationDef.ts:317`
(standardarticulation = -70.0).

#### `articulationDef@absoluteDuration` / `articulation@absoluteDuration`

*Data field:* `ArticulationDef.absoluteDuration (number|null)`;
`ArticulationData.absoluteDuration (number|null)`. *Paired with:* none. Lowest precedence of the three
tick-duration attributes — hazard #2.

**Domain.** MIDI ticks at the performance's PPQ; musically (0, +∞). Enforced NOWHERE — neither parse
(`ArticulationDef.ts:55-60` / `ArticulationMap.ts:131-136`) nor render guards it; the value is
assigned verbatim into `duration.perf` (`ArticulationDef.ts:357`, `ArticulationData.ts:186`). A zero
or negative literal survives all the way into the `milliseconds.date.end` computation
(`Performance.ts:834-840`).

**Neutral.** NO NUMERIC NEUTRAL EXISTS. The neutral state is the attribute's ABSENCE: the field
default is `null`, not 0 (`ArticulationDef.ts:19`, `ArticulationData.ts:38`), and the guard is
`if (this.absoluteDuration !== null)` (`ArticulationDef.ts:357`, `ArticulationData.ts:185`). The class
doc states this explicitly: *"The absolute\* fields that default to null mean 'leave the note's own
value alone', which is why they are number|null rather than 0: an absolute duration of 0 is a
meaningful (if extreme) instruction"* (`ArticulationDef.ts:14-16`). `resetAttribute` sets it back to
null, not to a number (`ArticulationDef.ts:118-120`). The effective neutral is the note's own
pre-articulation `duration.perf` — data, not document.

**Exaggerability.** RECOMMEND EXCLUDE. It is a REPLACEMENT, not a deviation: there is no value of the
attribute that leaves the note unchanged, so no T with T(neutral)=0 can be built from the document
alone. Scaling the literal (`x' = x^s` around 1 tick, or `x*s`) is scaling an absolute length with an
arbitrary anchor — P4 has no meaning and s→0 gives silence. The refactor log already records the
underlying obstacle: "an articulation ratio is not derivable except through the millisecond fields"
(`refactor/log.md:5235,5393`; `refactor/ARCHITECTURE.md:1656`). If a consumer insists, the only
defensible reading is to exaggerate it jointly with the renderer's per-note duration, which needs the
MSM, not the MPM.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:60`;
`src/mpm/elements/maps/ArticulationMap.ts:136`;
`src/mpm/elements/maps/data/ArticulationData.ts:63-65`. consumption: `ArticulationDef.ts:357`;
`ArticulationData.ts:185-188`. null-neutral rationale: `ArticulationDef.ts:14-16,19,118-120`;
`ArticulationData.ts:38`. serializer: `ArticulationMap.ts:67-68`. default corpus:
`ArticulationDef.ts:283,298` (pizzicato/snap = 1.0 tick).

#### `articulationDef@absoluteDurationChangeMs` / `articulation@absoluteDurationChangeMs`

*Data field:* `ArticulationDef.absoluteDurationChangeMs`;
`ArticulationData.absoluteDurationChangeMs`. *Paired with:* none, but it accumulates onto the same
`endNew` candidate as `absoluteDurationMs` within pass two (`ArticulationMap.ts:323-335`), and shares
the commit guard with `absoluteDelayMs`.

**Domain.** Signed offset in MILLISECONDS. Unbounded, unenforced at parse and at park time. The only
constraint is the commit guard in pass two: the accumulated result is written back only if
`dateNew < endNew` (`ArticulationMap.ts:336-339`) — an all-or-nothing gate, not a clamp.

**Neutral.** `0.0` — `if (this.absoluteDurationChangeMs !== 0.0)` (`ArticulationDef.ts:370`,
`ArticulationData.ts:222`). At 0.0 the marker attribute `articulation.absoluteDurationChangeMs` is
never parked on the note, so pass two's lookup returns null and `endNew` is left alone
(`ArticulationMap.ts:328-335`). Addition of 0 would also be the identity, so guard and arithmetic
agree. Field default 0.0 (`ArticulationDef.ts:22`, `ArticulationData.ts:41`); `resetAttribute`
restores 0.0 (`ArticulationDef.ts:127-129`).

**Exaggerability.** BEST-BEHAVED duration attribute of the family for exaggeration: linear-0, a pure
signed ms offset with a genuine fixed point, and it is where meico's own expressive defaults live
(-400 breath, +250 legatissimo). P1-P5 all hold at the attribute level. HAZARD: at the render level
the commit guard (`ArticulationMap.ts:336-339`) is a CLIFF, not a clamp — if an exaggerated negative
value makes `dateNew >= endNew`, the entire millisecond block is discarded, INCLUDING any
`absoluteDelayMs` on the same note. Over-exaggeration therefore yields a LESS articulated performance,
not a more extreme one (P5 fails at the output level). An engine should either clamp against a
configured minimum note length or report the risk.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:63-64`;
`src/mpm/elements/maps/ArticulationMap.ts:140-141`;
`src/mpm/elements/maps/data/ArticulationData.ts:75-77`. park (pass one): `ArticulationDef.ts:370-376`;
`ArticulationData.ts:222-230`. consume (pass two): `src/mpm/elements/maps/ArticulationMap.ts:328-335`,
commit guard `336-339`. two-pass rationale: `ArticulationMap.ts:10-28`; `ArticulationData.ts:7-21`;
`Performance.ts:710-711` and `766-767`. default corpus: `ArticulationDef.ts:257` (breath/cesura
-400.0), `261` (legatissimo +250.0).

#### `articulationDef@absoluteDurationMs` / `articulation@absoluteDurationMs`

*Data field:* `ArticulationDef.absoluteDurationMs (number|null)`;
`ArticulationData.absoluteDurationMs (number|null)`. *Paired with:* none, but it pre-empts
`absoluteDuration`/`relativeDuration`/`absoluteDurationChange` on the same element, and combines
additively with `absoluteDurationChangeMs` in pass two.

**Domain.** Absolute duration in MILLISECONDS; musically (0, +∞). Unenforced at parse and at park
time. Values ≤ 0 are accepted and make `endNew <= dateNew`, which the pass-two guard then rejects
wholesale (`ArticulationMap.ts:325,336-339`).

**Neutral.** NO NUMERIC NEUTRAL. Neutral = attribute ABSENT (field default null:
`ArticulationDef.ts:21`, `ArticulationData.ts:40`; guard `!== null` at `ArticulationDef.ts:352` and
`ArticulationData.ts:179`; `resetAttribute` restores null at `ArticulationDef.ts:124-126`). Being
non-null does two things no numeric value can undo: it SHORT-CIRCUITS the entire tick-domain duration
branch (`ArticulationDef.ts:352-356`, `ArticulationData.ts:179-184` —
`absoluteDuration`/`relativeDuration`/`absoluteDurationChange` are all skipped), and at ms time it
REPLACES the end date outright with `endNew = dateNew + value` (`ArticulationMap.ts:323-327`),
discarding the note's rendered duration. The effective neutral is the note's own rendered ms duration.

**Exaggerability.** RECOMMEND EXCLUDE, same category error as `absoluteDuration` — a replacement with
no no-op value. Additionally it is the attribute meico uses for staccato/spiccato/staccatissimo
(140-160 ms), so it is exactly what a naive "more staccato" exaggeration would reach for, and exactly
where scaling misbehaves: scaling 160 ms by s=0.5 gives 80 ms regardless of tempo or note value, and
by s>~2 makes the articulation longer than the note. If a consumer must exaggerate "staccato-ness",
the correct lever is `absoluteDurationChangeMs` (linear-0) or `relativeDuration` (log-1), not this.
Note also that a def carrying this makes an inline `relativeDuration` on the same note inaudible —
hazard #6.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:62`;
`src/mpm/elements/maps/ArticulationMap.ts:139`;
`src/mpm/elements/maps/data/ArticulationData.ts:71-73`. short-circuit: `ArticulationDef.ts:352-356`
(documented `337-340`); `ArticulationData.ts:179-184` (documented `145-149`). consume:
`ArticulationMap.ts:323-327`, guard `336-339`. default corpus: `ArticulationDef.ts:303` (spiccato
140.0), `308` (staccato 160.0), `313` (staccatissimo 140.0).

#### `articulationDef@absoluteDelay` / `articulation@absoluteDelay`

*Data field:* `ArticulationDef.absoluteDelay`; `ArticulationData.absoluteDelay`. *Paired with:* none.

**Domain.** Signed offset in MIDI ticks at the performance's PPQ, added to `date.perf`. Unbounded and
unenforced — nothing prevents `date.perf` going negative, and nothing prevents a delay exceeding the
gap to the next note.

**Neutral.** `0.0` — `if (this.absoluteDelay !== 0.0)` (`ArticulationDef.ts:381`,
`ArticulationData.ts:163`). At 0.0 `date.perf` is not written AND the method's `dateChanged` return
stays false, so `ArticulationMap` does not even re-sort the map (`ArticulationMap.ts:265,283-288`):
the identity is observable at two levels. Addition of 0 is arithmetically the identity too. Field
default 0.0 (`ArticulationDef.ts:24`, `ArticulationData.ts:43`); `resetAttribute` restores 0.0
(`ArticulationDef.ts:133-135`).

**Exaggerability.** linear-0, clean: it is a pure translation of the onset — `duration.perf` is NOT
touched, so the note keeps its length and simply moves (contrast `absoluteDelayMs`, which does not
move the end). P1-P5 all hold. HAZARDS: (a) a large exaggerated delay makes `ArticulationMap` call
`map.sort()` (`ArticulationMap.ts:288`), whose insertion sort is stable and deliberately near-linear
on almost-sorted input (`GenericMap.ts:184-190`); reordering notes changes which of several
simultaneous instructions wins in every later pass. (b) `date.perf` can be driven negative with no
clamp anywhere on the path to `milliseconds.date` (`Performance.ts:832-833`). (c) Because the note's
end is date-relative in the tick domain (`end = date.perf + duration.perf`,
`Performance.ts:834-840`), delaying here really does move both edges — which is musically what you
want, and is the reason to prefer this over `absoluteDelayMs` when exaggerating.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:66`;
`src/mpm/elements/maps/ArticulationMap.ts:146`;
`src/mpm/elements/maps/data/ArticulationData.ts:83-84`. consumption: `ArticulationDef.ts:381-384`;
`ArticulationData.ts:163-167`. re-sort consequence:
`src/mpm/elements/maps/ArticulationMap.ts:265,283-288` and
`src/mpm/elements/maps/GenericMap.ts:184-200`. neutral corroboration:
`ArticulationDef.ts:24,133-135`; `ArticulationData.ts:43`.

#### `articulationDef@absoluteDelayMs` / `articulation@absoluteDelayMs`

*Data field:* `ArticulationDef.absoluteDelayMs`; `ArticulationData.absoluteDelayMs`. *Paired with:*
none formally, but it shares the single pass-two commit guard with `absoluteDurationMs` and
`absoluteDurationChangeMs` — all three succeed or all three are discarded together.

**Domain.** Signed offset in MILLISECONDS, added to `milliseconds.date`. Unbounded, unenforced.
Subject only to the pass-two commit guard (`ArticulationMap.ts:336-339`).

**Neutral.** `0.0` — `if (this.absoluteDelayMs !== 0.0)` (`ArticulationDef.ts:385`,
`ArticulationData.ts:168`). At 0.0 the `articulation.absoluteDelayMs` marker is never parked, so pass
two's lookup returns null and `dateNew` stays equal to `date` (`ArticulationMap.ts:314-322`). Field
default 0.0 (`ArticulationDef.ts:25`, `ArticulationData.ts:44`); `resetAttribute` restores 0.0
(`ArticulationDef.ts:136-138`).

**Exaggerability.** linear-0 — structurally the same quantity as `asynchrony@milliseconds.offset`,
which `DESIGN.md:26` already classifies as linear-0. HAZARD, and it is the sharp one in this family:
the delay moves `milliseconds.date` but NOT `milliseconds.date.end` unless one of the two ms duration
attributes is present on the same note (`ArticulationMap.ts:314-335`, where `endNew` is only
recomputed inside the `absoluteDurationMs` / `absoluteDurationChangeMs` branches). So an isolated
positive delay SHORTENS the sounding note, and a delay exaggerated past the note's remaining length
makes `dateNew >= endNew`, at which point the commit guard discards the delay entirely and the note
snaps back to its unexaggerated position. Non-monotone in s with a discontinuity. Any engine
exaggerating this must either pair it with `absoluteDurationChangeMs` of the same magnitude or report
the cliff.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:67`;
`src/mpm/elements/maps/ArticulationMap.ts:145`;
`src/mpm/elements/maps/data/ArticulationData.ts:86-88`. park: `ArticulationDef.ts:385-388`;
`ArticulationData.ts:168-173`. consume: `src/mpm/elements/maps/ArticulationMap.ts:314-322`, commit
guard `336-339`. pipeline position: `src/mpm/elements/Performance.ts:765-767` (after asynchrony).

#### `articulationDef@absoluteVelocityChange` / `articulation@absoluteVelocityChange`

*Data field:* `ArticulationDef.absoluteVelocityChange`; `ArticulationData.absoluteVelocityChange`.
*Paired with:* none formally; affinely composed with `relativeVelocity` (and `absoluteVelocity`) on
the same element.

**Domain.** Signed MIDI-velocity offset. Musically the result should land in [0,127]. Enforced NOWHERE
locally — not at parse, not at render. The only bound in the whole system is
`Msm.fitVelocities(0,127)`, called once from the expressive branch of `renderMidi`
(`src/msm/Msm.ts:1084`, implementation `1613-1648`), and it is a DOCUMENT-WIDE compression, not a
per-note clamp.

**Neutral.** `0.0` — `if (this.absoluteVelocityChange !== 0.0)` (`ArticulationDef.ts:396`,
`ArticulationData.ts:243`); at 0.0 the velocity attribute is not rewritten, and `x+0` is the identity
anyway. Field default 0.0 (`ArticulationDef.ts:27`, `ArticulationData.ts:46`); `resetAttribute`
restores 0.0 (`ArticulationDef.ts:145-147`).

**Exaggerability.** linear-0, and the single most idiomatic articulation-accent lever: every
accent-type default in meico is expressed through it (±25, +12, ±5 at `ArticulationDef.ts:252-322`).
P1-P5 hold at the attribute level. HAZARDS: (a) clamping is NOT local — exceeding 127 does not
saturate one note, it triggers `fitVelocities`' partwise compression over the entire document
(`Msm.ts:1640-1648`), so exaggerating one accent past the ceiling quietly rescales every other note's
dynamics. An engine must clamp into [0,127] itself (as an option with a documented default, per
`DESIGN.md:41-43`) rather than let this happen. (b) It is applied LAST, after `relativeVelocity`
multiplies (`ArticulationDef.ts:393-399`, `ArticulationData.ts:235-248`), so on an element carrying
both, `velocity = (v * relativeVelocity) + absoluteVelocityChange` — the two are not separable and
exaggerating both independently double-counts.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:70`;
`src/mpm/elements/maps/ArticulationMap.ts:142`;
`src/mpm/elements/maps/data/ArticulationData.ts:94-96`. consumption: `ArticulationDef.ts:396-399`;
`ArticulationData.ts:243-248`. clamping (non-local): `src/msm/Msm.ts:1084,1613-1648`. velocity source:
`src/mpm/elements/Performance.ts:679-690`. default corpus: `ArticulationDef.ts:252` (accent +25),
`258` (breath -5), `274` (marcato +25), `299` (snap +25), `304` (spiccato +25), `309` (staccato -5),
`314` (staccatissimo +5), `322` (tenuto +12).

#### `articulationDef@relativeVelocity` / `articulation@relativeVelocity`

*Data field:* `ArticulationDef.relativeVelocity`; `ArticulationData.relativeVelocity`. *Paired with:*
none formally; multiplicatively composed with `absoluteVelocity` and before
`absoluteVelocityChange`.

**Domain.** Dimensionless ratio; musically (0, +∞). Unbounded and unenforced at parse and render — a
negative ratio yields a negative velocity, bounded only later and non-locally by `fitVelocities`
(`Msm.ts:1084,1613-1648`).

**Neutral.** `1.0` — exact-equality guard `if (this.relativeVelocity !== 1.0)`
(`ArticulationDef.ts:394`, `ArticulationData.ts:239`) skips the write, and multiplication by 1 is
arithmetically the identity, so guard and arithmetic agree. Field default 1.0
(`ArticulationDef.ts:28`, `ArticulationData.ts:47`); `resetAttribute` restores 1.0
(`ArticulationDef.ts:142-144`).

**Exaggerability.** log-around-1 (`x' = x^s`), the velocity twin of `relativeDuration`: fixes 1.0
(P4), keeps (0,+∞) closed (P3), composes (P2). Only one meico default uses it (legatostop 0.7,
`ArticulationDef.ts:269`), so in practice it appears mostly in hand-written or generated MPM.
HAZARDS: (a) same exact-float guard as `relativeDuration` — do not write a value that rounds to
something != 1.0 when it should stay neutral. (b) affine composition with `absoluteVelocityChange`
(see that row) — `velocity = (v*r)+c`, so exaggerating r and c independently is not the same as
exaggerating the resulting velocity. (c) exceeding 127 has the non-local `fitVelocities` consequence
described in the `absoluteVelocityChange` row.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:69`;
`src/mpm/elements/maps/ArticulationMap.ts:144`;
`src/mpm/elements/maps/data/ArticulationData.ts:98-100`. consumption: `ArticulationDef.ts:394-395`;
`ArticulationData.ts:239-242`. neutral corroboration: `ArticulationDef.ts:28,142-144`;
`ArticulationData.ts:47`. default corpus: `ArticulationDef.ts:269` (legatostop 0.7).

#### `articulationDef@absoluteVelocity` / `articulation@absoluteVelocity`

*Data field:* `ArticulationDef.absoluteVelocity (number|null)`;
`ArticulationData.absoluteVelocity (number|null)`. *Paired with:* none. Lowest precedence of the three
velocity attributes (applied first, then multiplied, then offset).

**Domain.** MIDI velocity; musically [0,127]. Enforced nowhere at parse or render
(`ArticulationDef.ts:68`, `ArticulationMap.ts:143` both take the raw double). Only the document-wide
`fitVelocities(0,127)` at MIDI export bounds it, and only by compressing everything
(`Msm.ts:1084,1613-1648`).

**Neutral.** NO NUMERIC NEUTRAL. Neutral = attribute ABSENT: the field default is `null`
(`ArticulationDef.ts:26`, `ArticulationData.ts:45`) and the guard is
`if (this.absoluteVelocity !== null)` (`ArticulationDef.ts:393`, `ArticulationData.ts:235`), so ANY
real value overwrites whatever the dynamicsMap produced for that note. `resetAttribute` restores null,
not a number (`ArticulationDef.ts:139-141`). The class doc gives the reason directly
(`ArticulationDef.ts:14-16`). The effective neutral is the note's dynamics-derived velocity — set by
`DynamicsMap.renderDynamicsToMap` or, absent a dynamicsMap, the literal fallback 100.0
(`Performance.ts:679-690`).

**Exaggerability.** RECOMMEND EXCLUDE — a replacement, not a deviation, so no T with T(neutral)=0 is
derivable from the document. Worse than the duration case in one respect: the only meico default that
uses it is sforzato = 127.0 (`ArticulationDef.ts:293`), already AT the musical ceiling, so any s>1
under a naive log-around-some-anchor transform pushes it out of range and triggers the document-wide
`fitVelocities` compression, i.e. exaggerating one sforzato quietly attenuates the whole piece. If a
consumer wants louder sforzati, the lever is `absoluteVelocityChange`, not this.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:68`;
`src/mpm/elements/maps/ArticulationMap.ts:143`;
`src/mpm/elements/maps/data/ArticulationData.ts:90-92`. consumption: `ArticulationDef.ts:393`;
`ArticulationData.ts:235-238`. null-neutral rationale: `ArticulationDef.ts:14-16,26,139-141`.
velocity fallback: `src/mpm/elements/Performance.ts:682-688`. default corpus:
`ArticulationDef.ts:293` (sf/sfz/fz/sforzato = 127.0).

#### `articulationDef@detuneCents` / `articulation@detuneCents`

*Data field:* `ArticulationDef.detuneCents`; `ArticulationData.detuneCents`. *Paired with:*
conceptually the same quantity as `detuneHz` in a different unit, but the codebase performs NO
conversion between them and applies both independently — see hazard #9.

**Domain.** Signed pitch deviation in cents (100 cents = one semitone). Unbounded, unenforced at parse
and render. There is no pitch-bend range to bound it against, because nothing in this codebase
consumes it.

**Neutral.** `0.0` — `if (this.detuneCents !== 0.0)` (`ArticulationDef.ts:402`,
`ArticulationData.ts:251`). At 0.0 the `detuneCents` attribute is NOT EVEN WRITTEN onto the note, so
the output document is byte-identical to the un-articulated one. Field default 0.0
(`ArticulationDef.ts:29`, `ArticulationData.ts:48`); `resetAttribute` restores 0.0
(`ArticulationDef.ts:148-150`). Guard tests pin the no-write behaviour:
`tests/mpm/elements/ArticulationMap.test.ts:664-671`.

**Exaggerability.** linear-0 in principle (a signed deviation with a real fixed point at 0, and cents
is a perceptually linear pitch unit, so scaling is musically meaningful). TWO reasons to hesitate.
(1) INERT: the value is only written onto the MSM note element; no consumer exists anywhere under
`src/midi` or `src/msm`, so exaggerating it changes the augmented-MSM output and never the rendered
MIDI. Any report must say "transformed but not audible in this renderer". (2) `DESIGN.md:118-120`
excludes "pitch and interval attributes (change the notes)". Detune is arguably a deviation rather
than a note change, so this is a judgement call for the charter, but it should be an explicit
decision, not an oversight. If included, it belongs in its own dimension (e.g. `intonation`), not in
`articulation`'s duration/velocity bundle.

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:71`;
`src/mpm/elements/maps/ArticulationMap.ts:147`;
`src/mpm/elements/maps/data/ArticulationData.ts:102-103`. consumption (write-only):
`ArticulationDef.ts:402-403`; `ArticulationData.ts:251-254`. NO downstream reader — grep for
`detuneCents`/`detuneHz` across `src` returns only `ArticulationDef.ts`, `ArticulationData.ts`,
`ArticulationMap.ts:147-148` and (unrelated) `ImprecisionMap.ts`. Guard tests:
`tests/mpm/elements/ArticulationMap.test.ts:640-671`.

#### `articulationDef@detuneHz` / `articulation@detuneHz`

*Data field:* `ArticulationDef.detuneHz`; `ArticulationData.detuneHz`. *Paired with:* `detuneCents`
(same physical quantity, different unit; applied independently and additively onto the note, with no
reconciliation).

**Domain.** Signed pitch deviation in Hertz. Unbounded, unenforced. No consumer, hence no bound.

**Neutral.** `0.0` — `if (this.detuneHz !== 0.0)` (`ArticulationDef.ts:404`,
`ArticulationData.ts:255`); at 0.0 no attribute is written onto the note. Field default 0.0
(`ArticulationDef.ts:30`, `ArticulationData.ts:49`); `resetAttribute` restores 0.0
(`ArticulationDef.ts:151-153`).

**Exaggerability.** linear-0 mechanically, but musically the WEAKEST case in the family and I would
exclude it even if `detuneCents` is included. Hertz is not a perceptually linear pitch unit: a fixed
Hz offset is a large interval low in the register and a negligible one high up, so scaling it linearly
exaggerates low notes far more than high ones — the transform is monotone in s but its musical effect
is register-dependent, which violates the spirit of "scale the deviation". Correct handling would
convert to cents against the note's pitch and scale there, but no such conversion exists anywhere in
the codebase and the note's pitch is MSM data, not MPM. Plus the same inertness as `detuneCents` (no
consumer) and the same pitch-attribute exclusion question (`DESIGN.md:118-120`).

**Evidence.** parse: `src/mpm/elements/styles/defs/ArticulationDef.ts:72`;
`src/mpm/elements/maps/ArticulationMap.ts:148`;
`src/mpm/elements/maps/data/ArticulationData.ts:105-106`. consumption (write-only):
`ArticulationDef.ts:404`; `ArticulationData.ts:255-258`. no downstream reader (same grep as
`detuneCents`). Guard tests: `tests/mpm/elements/ArticulationMap.test.ts:652-659`.

#### `articulation@date`, and `style@date` on the articulationMap's style switches

*Data field:* `ArticulationData.date` (and `GenericMap`'s `KeyValue` key). *Paired with:* none.

**Domain.** Position in MIDI ticks at the performance's PPQ; conventionally ≥ 0, not enforced. Parsed
with bare `parseFloat` on three paths (`ArticulationData.ts:55`, `ArticulationMap.ts:114` via the map
key, `GenericMap.ts:147`). An element with no `date` is silently dropped from the map
(`GenericMap.ts:144-145`).

**Neutral.** None — and that is the point. `date` is a POSITION, not a deviation from a neutral
performance, so no neutral point exists and the exaggeration formula is undefined for it. Structurally
it is the map's sort key (`GenericMap.ts:147-156`, re-derived in `sort()` at `GenericMap.ts:186-189`),
so writing it does not scale an effect, it moves an instruction.

**Exaggerability.** NOT EXAGGERABLE. Listed here only so that a registry generated by sweeping "every
numeric attribute of the element" does not pick it up — it is the one numeric attribute on
`<articulation>` that must be on the deny list, alongside the string attributes `name.ref`, `noteid`,
`defaultArticulation`, `name` and `xml:id`. Note also that `absoluteDelay` can CHANGE the effective
date at render time (via `date.perf` and the subsequent `map.sort()`), which is the sanctioned way to
move an articulation in time; editing `@date` directly is not.

**Evidence.** `src/mpm/elements/maps/data/ArticulationData.ts:55`;
`src/mpm/elements/maps/ArticulationMap.ts:50-51,61,83-84,114`;
`src/mpm/elements/maps/GenericMap.ts:144-156,186-189,374-376`. exclusion rule: `DESIGN.md:118-120`
("enums, dates").

### Walker notes — articulation

Articulation data lives in TWO places that must both be walked: the `<articulationMap>` instances in
the dated environment (inline modifiers) and the `<articulationDef>` children of `<styleDef>` elements
in the header environment (named articulations). Neither shadows the other at the value level — the
def is applied first and the inline modifiers on top (`ArticulationData.ts:159`, documented at
`ArticulationData.ts:143-146` and `ArticulationMap.ts:96-103`).

**Maps (inline `<articulation>` elements).** Constant: `ARTICULATION_MAP = 'articulationMap'`,
`src/mpm/names.ts:29`.

- Global: `performance.getGlobal()` (`Performance.ts:289`) → `Global.getDated()` (`Global.ts:80`) →
  `Dated.getMap(ARTICULATION_MAP)` (`Dated.ts:123`) as `ArticulationMap`. Reference walk:
  `Performance.ts:443-460`.
- Per part: `performance.getAllParts()` (`Performance.ts:225`) → `Part.getDated()` (`Part.ts:137`) →
  `Dated.getMap(ARTICULATION_MAP)`. Reference walk: `Performance.ts:599-614`.
- Shadowing at RENDER time is whole-map, not per-attribute: a part's own articulationMap replaces the
  global one entirely for that part (`Performance.ts:613-614`), and a global map does not reach parts
  that declare their own (`getAllMsmPartsAffectedByGlobalMap`, `Performance.ts:785-806`). An
  exaggeration walker should nevertheless visit BOTH the global map and every part map, since both can
  carry values that some part will use.
- Inside a map: `ArticulationMap extends GenericMap`. Enumerate with
  `map.getAllElementsOfType('articulation')` (`GenericMap.ts:240`) or `map.getAllElements()`
  (`GenericMap.ts:237`), which return readonly `KeyValue<number, Element>`; `getValue()` is the live
  `<articulation>` element — edit its attributes there. The typed reader
  `ArticulationMap.getArticulationDataOf(index)` (`ArticulationMap.ts:108-151`) is READ-ONLY for this
  purpose (hazard #12). Style switches inside the map are `<style>` elements with `name.ref` (+
  optional `defaultArticulation`), reachable via `getAllElementsOfType('style')` (used at
  `ArticulationMap.ts:231`) — they carry no numeric attributes except `@date`.

**Styles (`<articulationDef>` elements).** Constant: `ARTICULATION_STYLE = 'articulationStyles'`,
`src/mpm/names.ts:21`.

- Global: `performance.getGlobal()` → `Global.getHeader()` (`Global.ts:77`) →
  `Header.getAllStyleDefs(ARTICULATION_STYLE)` (`Header.ts:153-155`) returning
  `Map<string, GenericStyle> | undefined`; or `Header.getStyleDef(ARTICULATION_STYLE, name)`
  (`Header.ts:157-161`). Cast each to `ArticulationStyle`
  (`src/mpm/elements/styles/ArticulationStyle.ts:10`).
- Per part: `Part.getHeader()` (`Part.ts:134`) → same two `Header` methods. Part-local styles are
  consulted before global ones by `GenericMap.getStyle` (`GenericMap.ts:506-514`), so a part header
  can shadow a global styleDef of the same name — visit both.
- Inside a style: `ArticulationStyle.getAllDefs()` → `ReadonlyMap<string, ArticulationDef>`
  (`GenericStyle.ts`, `getAllDefs`, ~line 96) or `getDef(name)`. Defs are indexed by `@name`,
  last-wins on duplicates (`GenericStyle.parseDefs` doc, `GenericStyle.ts:50-63`).
- Writing: `ArticulationDef` has write-through setters for all twelve — `setAbsoluteDuration` /
  `setAbsoluteDurationChange` / `setAbsoluteDurationMs` / `setAbsoluteDurationChangeMs` /
  `setRelativeDuration` / `setAbsoluteDelay` / `setAbsoluteDelayMs` / `setAbsoluteVelocity` /
  `setRelativeVelocity` / `setAbsoluteVelocityChange` / `setDetuneCents` / `setDetuneHz`
  (`ArticulationDef.ts:160-240`); each does
  `this.getXml().addAttribute(new Attribute(name, String(v)))`, and `addAttribute` replaces
  same-named attributes (`XomTypes.ts:492-500`). `resetAttribute(name)` removes the attribute and
  restores the field default (`ArticulationDef.ts:113-155`) — but read hazard #8 before using it.
  `def.getXml()` gives the raw element if you prefer to edit attributes directly.
- Read-only meico defaults: `ArticulationDef.createDefaultArticulationDef(name)`
  (`ArticulationDef.ts:246-326`) is the built-in articulation vocabulary (accent, staccato, tenuto,
  …). It is a FACTORY, not part of any document — exaggerating a document never touches it, but it is
  the best available corpus of realistic per-attribute magnitudes for calibrating and testing the
  transforms.

**Render order** (needed to reason about neutrality end to end): articulation runs TWICE. Pass one,
tick domain, in `renderPartSymbolic` after metrical accentuation and before rubato:
`Performance.ts:710-711` → `ArticulationMap.renderArticulationToMap_noMillisecondModifiers`
(`ArticulationMap.ts:187-289`). Pass two, millisecond domain, in `renderPartMilliseconds` after
asynchrony and before ornamentation's ms modifiers: `Performance.ts:766-767` →
`ArticulationMap.renderArticulationToMap_millisecondModifiers` (`ArticulationMap.ts:309-341`). The
attributes the passes write into — `date.perf`, `duration.perf`, `date.end.perf` — are seeded at
`Performance.ts:355-368` and crossed into milliseconds at `Performance.ts:820-845`. There is no
articulation entry point in the global-map render path: global articulation reaches notes only through
the per-part fallback (`Performance.ts:613-614`).

### Hazards — articulation

- **#1 THREE ATTRIBUTES HAVE NO NUMERIC NEUTRAL AT ALL.** `absoluteDuration`, `absoluteDurationMs`
  and `absoluteVelocity` default to `null`, not 0, and their guards test `!== null`
  (`ArticulationDef.ts:19,21,26,352,357,393`; `ArticulationData.ts:38,40,45,179,185,235`). The class
  doc states the intent verbatim: *"The absolute\* fields that default to null mean 'leave the note's
  own value alone', which is why they are number|null rather than 0: an absolute duration of 0 is a
  meaningful (if extreme) instruction"* (`ArticulationDef.ts:14-16`). Their neutral is the NOTE's own
  pre-articulation value, which lives in the MSM, not the MPM. A registry that records neutral=0 or
  neutral=1 for these will produce musically wrong output at every s ≠ 1. The refactor log
  independently records the same obstacle from the parity side: "an articulation ratio is not
  derivable except through the millisecond fields" (`refactor/log.md:5235,5393`;
  `refactor/ARCHITECTURE.md:1656`).
- **#2 THE SAME ATTRIBUTE NAME COMPOSES DIFFERENTLY ON `<articulationDef>` THAN ON
  `<articulation>`.** In `ArticulationDef.articulateNote` the three tick-duration attributes COMPOSE —
  each step re-reads `duration.perf` from what the previous step wrote (`ArticulationDef.ts:357-368`,
  documented at `332-336`). In `ArticulationData.articulateNote` the original duration is read ONCE,
  up front (`ArticulationData.ts:178`), and every branch computes from THAT value, so the three do NOT
  compose: the last non-neutral one simply overwrites, giving precedence `absoluteDurationChange >
  relativeDuration > absoluteDuration` (`ArticulationData.ts:185-220`, documented at `143-149`).
  Consequence for the engine: on an inline `<articulation>` carrying both `relativeDuration` and a
  non-zero `absoluteDurationChange`, exaggerating `relativeDuration` has ZERO effect on the rendered
  output — the change branch overwrites it. On an `<articulationDef>` carrying the same two, both
  matter and they compound. The registry must key composition semantics on the ELEMENT, not the
  attribute name. Velocity has no such asymmetry: it re-reads the attribute each step in both
  implementations (`ArticulationDef.ts:393-399`, `ArticulationData.ts:235-248`), so
  absolute → ×relative → +change everywhere.
- **#3 `absoluteDurationChange` SATURATES, so exaggerating it is not monotone.** The halving loop
  `for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0) durNew = dur + change / reduce`
  (`ArticulationDef.ts:363-366`, `ArticulationData.ts:214-216`) repeatedly halves a negative change
  until the resulting duration is positive. With note duration d: change = -4d and change = -8d BOTH
  render as 0.5d. So beyond roughly |change| = d the attribute's rendered effect is a plateau that
  depends on the note, not on the value, and property P5 (monotone in s) fails at the output level.
  Also the entire branch is gated on the pre-existing duration being > 0, and in `ArticulationData`
  the `modified` bookkeeping now sits inside that gate too (`ArticulationData.ts:208-220`) — a
  deliberate divergence from Java, documented at `ArticulationData.ts:193-211` and
  `refactor/ARCHITECTURE.md:1150`.
- **#4 THE MILLISECOND COMMIT GUARD IS A CLIFF, NOT A CLAMP, AND IT IS SHARED.** Pass two computes
  `dateNew` and `endNew` from all three ms attributes and then commits ONLY if `dateNew < endNew`
  (`ArticulationMap.ts:336-339`). If an exaggerated `absoluteDurationChangeMs` or `absoluteDelayMs`
  inverts the note, ALL THREE modifiers are discarded together — the note reverts to its unexaggerated
  date AND end. So over-exaggeration produces a LESS articulated performance rather than a saturated
  one, discontinuously. An engine must clamp against a configured minimum note length itself and
  report it (`DESIGN.md:41-43` already requires clamps to be reported options).
- **#5 `absoluteDelayMs` MOVES THE ONSET BUT NOT THE END.** Pass two only recomputes `endNew` inside
  the `absoluteDurationMs` / `absoluteDurationChangeMs` branches (`ArticulationMap.ts:314-335`). A
  note carrying only `absoluteDelayMs` therefore gets a later start and the SAME end, i.e. it is
  shortened by the delay — and a delay exaggerated past the note's remaining length trips guard #4 and
  is dropped entirely. The tick-domain `absoluteDelay` does not have this problem (it shifts
  `date.perf` while `duration.perf` is untouched, so both edges move: `ArticulationDef.ts:381-384`,
  `ArticulationData.ts:163-167`, end derived at `Performance.ts:834-840`). Prefer `absoluteDelay` when
  a choice exists.
- **#6 A DEF'S `absoluteDurationMs` SILENTLY VOIDS AN INLINE `relativeDuration`.** The def's
  short-circuit only suppresses the DEF's own tick branch (`ArticulationDef.ts:352-356`); the inline
  `ArticulationData` still runs its tick branch (its own `absoluteDurationMs` is null) and writes
  `duration.perf` (`ArticulationData.ts:185-220`). But at ms time the parked
  `articulation.absoluteDurationMs` sets `endNew = dateNew + value` outright
  (`ArticulationMap.ts:323-327`), discarding `duration.perf`. Net effect: on any note whose def is
  staccato/spiccato/staccatissimo (`ArticulationDef.ts:303,308,313`), exaggerating an inline
  `relativeDuration` is inaudible. This is a cross-element interaction the registry cannot express
  per-attribute; it needs a note in the applier.
- **#7 VELOCITY CLAMPING IS GLOBAL, NOT LOCAL.** Nothing bounds velocity at parse or render. The only
  bound is `Msm.fitVelocities(0,127)`, called once from the expressive branch of `renderMidi`
  (`Msm.ts:1084`, implementation `1613-1648`), and it applies a PARTWISE COMPRESSION over every note
  in the document once any single value breaks the range (`Msm.ts:1640-1648`). So pushing one
  exaggerated accent above 127 quietly rescales every other note's dynamics in the piece. The
  exaggeration engine must clamp into [0,127] itself rather than let this fire.
- **#8 NEUTRAL == ABSENT ON THE WRITE PATH, AND THE ROUND TRIP LOSES NINE OF THE TWELVE.**
  `ArticulationMap.addArticulationFromData` serializes only `absoluteDuration`,
  `absoluteDurationChange` and `relativeDuration`, each suppressed at its neutral value
  (`ArticulationMap.ts:67-72`) — the other nine modifiers are DROPPED. Never round-trip through
  `ArticulationData` → `addArticulationFromData`; mutate the live element's attributes instead (the
  XML is the single source of truth per `AbstractXmlSubtree`, and `GenericStyle.ts`'s class doc
  restates it). Related: `ArticulationDef.resetAttribute` is the canonical "write neutral = remove
  attribute" operation (`ArticulationDef.ts:113-155`), but it has two documented quirks
  (`ArticulationDef.ts:104-112`) — it is a no-op on the FIELD if the attribute is absent from the XML,
  and a name that is present but is not one of the twelve (e.g. `name`, `xml:id`) gets REMOVED from
  the element with no field to reset. Do not use it as a generic "reset to neutral" primitive.
- **#9 `detuneCents` AND `detuneHz` ARE WRITE-ONLY IN THIS CODEBASE.** Both are written onto the MSM
  note (`ArticulationDef.ts:402-404`, `ArticulationData.ts:251-258`) and NOTHING reads them back — a
  grep across `src` finds no consumer in `src/midi` or `src/msm`. Exaggerating them changes the
  augmented MSM and never the rendered MIDI. They are also two units for one quantity with no
  conversion anywhere, applied independently; and `DESIGN.md:118-120` excludes "pitch and interval
  attributes". Whether they belong in scope is a charter decision that should be made explicitly.
- **#10 EXACT-FLOAT NEUTRAL GUARDS THREATEN P1 (byte identity at s=1).** `relativeDuration` and
  `relativeVelocity` are gated on `!== 1.0`, and the five offset attributes on `!== 0.0`
  (`ArticulationDef.ts:358,360,370,381,385,394,396,402,404`; the mirror set in `ArticulationData.ts`).
  A transform that returns 0.9999999999999999 instead of 1.0 flips a documented no-op into a real
  write. Separately, every write goes through `String(v)` (setters at `ArticulationDef.ts:160-240`;
  attribute writes at `ArticulationData.ts:164,190,217,240,245`), which is JS number formatting: 25.0
  serializes as `'25'` and -14.0 as `'-14'` (pinned at
  `tests/mpm/elements/styles/defs/ArticulationDef.test.ts:178`). So even a value-preserving rewrite
  changes bytes. The applier must skip the write entirely when the transformed value equals the parsed
  one.
- **#11 PARSE LENIENCY DIFFERS BETWEEN THE TWO READ PATHS, AND ONE OF THEM YIELDS NaN.** The def path
  uses `parseJavaDouble` (`ArticulationDef.ts:55-58`), which throws on a malformed literal so the
  factory skips the whole def — and which legitimately ACCEPTS `'NaN'`, `'Infinity'`, `'-Infinity'`
  (`parseJavaDouble.ts:20-21`). The map path uses bare `parseFloat` (`ArticulationMap.ts:131-134`),
  which turns `'abc'` into NaN and `'12abc'` into 12 with no error; `PARITY.md`'s P1 entry names this
  as still open. So an `<articulation relativeDuration="abc">` gives NaN, `NaN !== 1.0` passes the
  guard, and `duration.perf` becomes NaN. Any exaggeration engine reading values back must guard for
  NaN/Infinity before transforming, or it will propagate them.
- **#12 `getArticulationDataOf` RETURNS A DETACHED SNAPSHOT.**
  `ArticulationMap.getArticulationDataOf` (`ArticulationMap.ts:108-151`) copies the twelve numbers
  into a fresh `ArticulationData`; `ad.xml` points at the live element (line 113) but assigning
  `ad.relativeDuration` does NOT write through to the XML. Only `ArticulationDef` has write-through
  setters (`ArticulationDef.ts:160-240`). An applier must edit the `<articulation>` element's
  attributes directly (e.g. via `map.getAllElementsOfType('articulation')`, `GenericMap.ts:240`).
  `ArticulationData` also has a second, independent parse path — its own XML constructor
  (`ArticulationData.ts:51-110`) — which reads the same twelve names but with `parseFloat`; it is not
  the path the renderer uses.
- **#13 MS MODIFIERS DO NOT ACCUMULATE ACROSS ARTICULATIONS.** The `articulation.*Ms` markers are
  parked with `note.addAttribute`, and XomTypes' `addAttribute` REPLACES an existing attribute of the
  same name (`XomTypes.ts:492-500`). Since the def runs before the inline data
  (`ArticulationData.ts:159`, then `168-173`/`179-183`/`222-230`), an inline ms value wins wholesale
  over the def's, and with several `<articulation>` elements targeting one note
  (`ArticulationMap.ts:262-267`) the last one applied wins. Do not model ms modifiers as summing.
- **#14 THIS FAMILY IS A FIXTURE BLIND SPOT — DO NOT TRUST THE INTEGRATION CORPUS TO CATCH
  REGRESSIONS.** `PARITY.md:411-434` records that every `<articulation>` in
  `tests/integration/fixtures` carries only `name.ref` and `noteid`, so ALL TWELVE numeric modifiers
  were silently unread by `getArticulationDataOf` for the entire certification programme and the
  reference corpus still agreed. Guard tests for this family must build their XML rather than reach
  for a fixture (`tests/mpm/elements/ArticulationMap.test.ts:284-317,437-502,640-671`;
  `tests/mpm/elements/styles/defs/ArticulationDef.test.ts:60-230,560-600`). An exaggeration engine
  tested against the fixtures alone will look correct while doing nothing.

---

## 5. Metrical accentuation

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `accentuationPattern@scale` | double | any ℝ, signed; enforced nowhere; **mandatory** | `0.0` (proved at the render site) | — | **THE site — linear-0 gain** |
| `accentuation@value` | double | any ℝ; `parseJavaDouble`, malformed ⇒ def dropped | `0.0` (homogeneity) | `@transition.from`, `@transition.to` | equivalent to `@scale` ⇒ **exclude by default** |
| `accentuation@transition.from` | double | any ℝ; defaults to `@value` | `0.0` | the triple | triple-atomic only |
| `accentuation@transition.to` | double | any ℝ; defaults to `@transition.from` | `0.0` | the triple | triple-atomic only |
| `accentuationPatternDef@length` | double | positive beat count; parser **adds** `length="4"` if absent | **none** | — | **EXCLUDE** |
| `accentuation@beat` | double | 1-based in [1, length+1); unenforced | **none** (position) | — | **EXCLUDE** |
| `accentuationPattern@date` | double | ticks ≥0; required | none | — | **EXCLUDE** (R5) |
| `style@date` | double | ticks | none | — | **EXCLUDE** |
| `accentuationPattern@loop` | boolean | literal `'true'`; absent ⇒ **false** | n/a | — | **EXCLUDE**, but read it |
| `accentuationPattern@stickToMeasures` | boolean | literal `'true'`; absent ⇒ **true** | n/a | — | **EXCLUDE**, but read it |

### Per-attribute detail

#### `accentuationPattern@scale` (child of `metricalAccentuationMap`)

*Data field:* `MetricalAccentuationData.scale`.

**Domain.** Any Java double, signed and unbounded. NOTHING enforces a range — not the parser, not the
renderer. Read with plain `parseFloat` (not `parseJavaDouble`), so `"1.5abc"` silently yields 1.5 and
`"abc"` yields NaN, which then propagates into every velocity in the span via
`velocity + accentuation*NaN`. Negative values are legal and invert the metrical emphasis (downbeats
get quieter). Semantically it is a dimensionless gain on a MIDI-velocity offset; the effective musical
ceiling is imposed only downstream, by `fitVelocities(0,127)` and the 0..127 clamp in `EventMaker`.

**Neutral.** `0.0` — exactly, and provably from the renderer. The only consumption is
`velocityAtt.setValue(String(velocity + accentuation * md.scale))` at
`MetricalAccentuationMap.ts:168`. With scale = 0 the added term is `accentuation * 0 = 0` for every
note and every beat, so the pass is the identity on velocity regardless of the pattern. NOT 1.0: 1.0
is merely the data class's field initializer (`MetricalAccentuationData.ts:29`) and the value the
fixtures happen to carry; the format has no default at all, because a missing `@scale` makes
`getMetricalAccentuationDataOf` return null (`MetricalAccentuationMap.ts:67-68`) and the instruction
is dropped entirely rather than defaulted. This is a LINEAR-around-0 gain in `DESIGN.md` §1 terms
(T(x)=x), so exaggeration is plain `x' = s·x`.

**Exaggerability.** THE canonical exaggeration site for this family, and the one `DESIGN.md` §3
already names (`accentuation` dimension = `metricalAccentuation@scale`, linear-0 gain). `x' = s·scale`.
All five design properties hold trivially: P1 (s = 1 ⇒ unchanged), P3 (domain is all of ℝ, closed
under scaling), P4 (0 is a fixed point), P5 (|x'| strictly increasing in s for x≠0), P2 (s₁·s₂
composition is associativity of multiplication). It is per-instruction, so it is the SAFE site —
unlike the def's value/transition.\* triple, which is shared.

Hazards: (a) never delete the attribute to express neutrality — absent `@scale` skips the instruction,
and while that is also velocity-neutral it is a different document and loses the instruction; write
`"0"` instead if a hard mute is wanted; (b) do NOT also scale the def's value/transition.\* for the
same dimension — the renderer's accentuation is homogeneous of degree 1 in those, so doing both
applies s²; (c) large s pushes velocities outside 0..127, which triggers `Msm.fitVelocities` — a
GLOBAL, cross-part compression, not a local clamp, so one exaggerated part silently rescales the whole
piece (`DESIGN.md` R6 clamp option belongs here); (d) s<0 is mathematically fine (it flips the accent
contour) but is a musical inversion, not an exaggeration — the sampling range should be s≥0.

**Evidence.** parse: `src/mpm/elements/maps/MetricalAccentuationMap.ts:67-69` (null-return when
absent, `parseFloat` when present); write: same file `:46` (`addAccentuationPattern`); consumption:
same file `:166-168`; alternate parse path:
`src/mpm/elements/maps/data/MetricalAccentuationData.ts:29,39`; neutrality pinned by test:
`tests/mpm/elements/MetricalAccentuationMap.test.ts:383-390` ("scale=0 neutralizes accentuation");
downstream clamp: `src/msm/Msm.ts:1084,1613-1648` and `src/midi/EventMaker.ts:441,468`.

#### `accentuation@value` (child of `accentuationPatternDef`)

*Data field:* `AccentuationPatternDef.accentuations[i].getKey()[1]` (index 1 of the
`[beat, value, transition.from, transition.to]` tuple). *Paired with:* `accentuation@transition.from`
and `accentuation@transition.to` — the three must be scaled together (they are one homogeneous
triple); scaling `@value` alone reshapes the ramp rather than amplifying it.

**Domain.** Any Java double, signed and unbounded; parsed with `parseJavaDouble`, so a malformed
literal throws and the FACTORY swallows it, discarding the whole def
(`createAccentuationPatternDef` returns null and the style skips the pattern). Unit is a raw
MIDI-velocity offset — it is added to velocity after multiplication by `@scale`, so realistic
magnitudes are single- or double-digit (fixtures use 20/-10/10/-10 and 15/-5/8/-5). No bound is
enforced anywhere in this class; the only bounding is the downstream velocity clamp.

**Neutral.** `0.0`. Justified structurally, not by convention: `getAccentuationAt` is positively
homogeneous of degree 1 in the triple (value, transition.from, transition.to) with the beat positions
held fixed — the before-first branch returns the literal 0.0 (`AccentuationPatternDef.ts:262`), the
past-end branch returns `transition.to` (`:263-264`), the on-anchor branch returns `value` (`:270`),
and the interior branch is `(β−b₀)·(t_to−t_from)/(segEnd−b₀) + t_from` (`:277-281`), which is linear
and homogeneous in those three. Therefore an all-zero triple makes `getAccentuationAt` return 0 at
every beat, and `MetricalAccentuationMap.ts:168` adds `0 * scale = 0`. Note the missing-attribute
default is also 0.0: the tuple is seeded `[beat, 0.0, 0.0, 0.0]` and index 1 is only overwritten when
`@value` is present (`:50,53-54`).

**Exaggerability.** Mathematically exaggerable in the SAME linear-around-0 space as `@scale`, and by
the homogeneity argument above, scaling the whole triple by s is EXACTLY equivalent to scaling
`@scale` by s. That equivalence is the reason to exclude it from the `accentuation` dimension by
default: the def is shared (one `accentuationPatternDef` is referenced by name from arbitrarily many
`accentuationPattern` instructions, in any part, resolved local-header-then-global), so editing it is
a global edit with s² risk if `@scale` is edited too. Include it only as a deliberately separate,
opt-in "reshape this pattern" knob, and then scale value/transition.from/transition.to together. Extra
trap: when `@transition.from` is ABSENT it defaults to `@value`, so scaling `@value` alone still
yields a consistent (s·v, s·v, s·v) on reparse — but as soon as `@transition.from` is present with a
different number, scaling only `@value` distorts the ramp shape instead of amplifying it.

**Evidence.** parse: `src/mpm/elements/styles/defs/AccentuationPatternDef.ts:50,53-54` (and the
API-side twin at `:151-153, :121`); default-0 seeding: same file `:50,149`; consumption: same file
`:261-282` (esp. `:270` on-anchor, `:277-281` interpolation); scaled into velocity at
`src/mpm/elements/maps/MetricalAccentuationMap.ts:167-168`; malformed-value skip path:
`AccentuationPatternDef.ts:41-45,102-105` and `PARITY.md:172` (P1).

#### `accentuation@transition.from` (child of `accentuationPatternDef`)

*Data field:* `AccentuationPatternDef.accentuations[i].getKey()[2]`. *Paired with:*
`accentuation@value` and `accentuation@transition.to` (one homogeneous triple).

**Domain.** Any Java double, signed and unbounded; `parseJavaDouble`, malformed ⇒ whole def
discarded. Same unit as `@value` (velocity offset). Unenforced elsewhere. DEFAULTS TO `@value` when
absent (`AccentuationPatternDef.ts:56-59`), which is what makes a transition-less accentuation flat.

**Neutral.** `0.0`, by the same homogeneity argument as `@value` — it is the ramp's start value and
appears as the additive term `+ accentuation[2]` in the interpolation
(`AccentuationPatternDef.ts:280`) and as the segment slope's minuend (`:278`). With
value = transition.from = transition.to = 0 the pattern contributes 0 at every beat. The tuple is
likewise seeded to 0.0 (`:50`).

**Exaggerability.** Same linear-0 space; only meaningful as part of the triple. Scaling it alone
changes the ramp DIRECTION and magnitude independently of the anchor value, which is a reshape, not an
exaggeration. If the engine touches def internals at all, it must scale the triple atomically and must
NOT materialize the attribute when it was absent (materializing it breaks `DESIGN.md` P1
byte-identity for s=1 and, worse, freezes a default that would otherwise track a later edit of
`@value`).

**Evidence.** parse + default-to-value: `src/mpm/elements/styles/defs/AccentuationPatternDef.ts:56-59`
(API twin `:155-158`, writer `:122`); consumption: same file `:278,280` (interpolation start value and
slope term); scaled into velocity at `src/mpm/elements/maps/MetricalAccentuationMap.ts:167-168`.

#### `accentuation@transition.to` (child of `accentuationPatternDef`)

*Data field:* `AccentuationPatternDef.accentuations[i].getKey()[3]`. *Paired with:*
`accentuation@value` and `accentuation@transition.from` (one homogeneous triple).

**Domain.** Any Java double, signed and unbounded; `parseJavaDouble`, malformed ⇒ whole def
discarded. Velocity-offset unit. DEFAULTS TO `@transition.from` when absent
(`AccentuationPatternDef.ts:61-64`) — i.e. transitively to `@value` — so an accentuation with neither
transition attribute is flat at `@value`.

**Neutral.** `0.0`, same homogeneity argument. It is the ramp's target: it appears as
`accentuation[3]` in the slope numerator (`AccentuationPatternDef.ts:278`) and is returned verbatim by
the past-end branch for the LAST accentuation (`:263-264`). Zeroing the triple zeroes
`getAccentuationAt` everywhere, hence zero added velocity at `MetricalAccentuationMap.ts:168`.

**Exaggerability.** Same linear-0 space, same triple-atomicity requirement. Special sensitivity worth
flagging: the LAST accentuation's `@transition.to` is the only one that is also returned
unscaled-by-interpolation for every beat at or past `length + 1.0` (`:263-264`), and its segment runs
to the pattern end rather than to a successor (the deliberate asymmetry of the `:272` guard, fixed
from upstream in meico@1d662105). So exaggerating this attribute has an outsized, non-local effect on
any note that lands past the pattern's nominal end — which happens routinely with the tick-valued
`@beat`/`@length` documents described in the hazards.

**Evidence.** parse + default-to-transition.from:
`src/mpm/elements/styles/defs/AccentuationPatternDef.ts:61-64` (API twin `:160-163`, writer `:123`);
consumption: same file `:263-264` (past-end return), `:278` (slope); the segment-end guard that
decides WHICH end the ramp runs to: same file `:272` with the rationale at `:228-259` and
`PARITY.md:281-333`.

#### `accentuationPatternDef@length`

*Data field:* `AccentuationPatternDef.length` (private, default 4.0).

**Domain.** Nominally a positive beat count; the class default is 4.0 and the fixtures carry 2880.0
(tick-valued, see hazards). Parsed with `parseJavaDouble` ⇒ malformed discards the def. NOTHING
enforces positivity: length ≤ 0 makes `patternLengthTicks` ≤ 0 at
`MetricalAccentuationMap.ts:134`/`:154`, and the `stickToMeasures=false` beat formula then does
`x % 0` ⇒ NaN (`:165`), poisoning velocity. The parser is not read-only about it: a MISSING `@length`
is ADDED to the element as `length="4"` (`AccentuationPatternDef.ts:36-40`).

**Neutral.** NONE — this attribute has no neutral point and must be EXCLUDED. It is a duration/period,
not a deviation: it sets the loop period (`patternLengthTicks = length * 4·ppq / tsDenominator`,
`MetricalAccentuationMap.ts:134,154`), the non-loop cutoff (`startDate + patternLengthTicks`, `:159`),
the non-`stickToMeasures` modulus (`:165`), and the pattern's end boundary `length + 1.0` in
`getAccentuationAt` (`:263,267`). `DESIGN.md` §1 requires a monotone bijection T with T(neutral)=0;
there is no value of length at which the pattern "does nothing", so no such T exists. Scaling it moves
WHEN accents land, which also violates the spirit of R5.

**Exaggerability.** EXCLUDE, with the rationale above recorded in the registry. If a future "metric
density" knob ever wants it, note that it is doubly load-bearing (loop period AND ramp-segment end for
the last anchor) and that changing it silently changes the note SET each instruction covers when
loop=false — an audible structural edit, not a contrast edit.

**Evidence.** declaration + default: `src/mpm/elements/styles/defs/AccentuationPatternDef.ts:26`;
parse-time mutation of the document: same file `:36-40`; parse: `:45`; accessors: `:288-295`;
consumption: `src/mpm/elements/maps/MetricalAccentuationMap.ts:134,154,159,165` and
`AccentuationPatternDef.ts:263,267`.

#### `accentuation@beat` (child of `accentuationPatternDef`)

*Data field:* `AccentuationPatternDef.accentuations[i].getKey()[0]`.

**Domain.** Documented as a ONE-based beat position in [1.0, length+1.0)
(`AccentuationPatternDef.ts:15-19`), matching the renderer, which feeds `1.0 + (…)/ticksPerBeat`.
Parsed with `parseJavaDouble`; an `<accentuation>` element WITHOUT `@beat` is silently skipped
(`:48-49`, and `addAccentuationFromXml` returns -1 at `:147-148`). Nothing enforces the 1-based range,
the upper bound, or uniqueness: the list is insertion-sorted by beat with equal beats keeping
insertion order (`:175-184`), and real fixtures put raw TICK values here (0.0/720.0/1440.0/2160.0).

**Neutral.** NONE — a position has no neutral point, so it is EXCLUDED for the same reason as
`@length` and as dates. Every consumption is a comparison or a difference against the renderer's beat
argument (`AccentuationPatternDef.ts:262,270,271,272,278,279`), i.e. it determines WHERE the contour
has its anchors, never HOW STRONG they are.

**Exaggerability.** EXCLUDE. Additional mechanical reason beyond "positions have no neutral": changing
a beat can reorder the accentuations, and the class keeps the XML child order in sync with the sorted
list by detach-and-reinsert (`:192-199`) — so a naive in-place attribute edit desynchronises the def
from its own XML and silently changes serialization order for equal beats.

**Evidence.** parse: `src/mpm/elements/styles/defs/AccentuationPatternDef.ts:48-50` (API twin
`:147-149`, writer `:120`); 1-based semantics documented at `:15-19,229-235`; sort keyed on it:
`:175-184`; consumption: `:262,270,271,272,278-279`; the renderer's beat argument:
`src/mpm/elements/maps/MetricalAccentuationMap.ts:162-165,167`.

#### `accentuationPattern@date` (child of `metricalAccentuationMap`)

*Data field:* `MetricalAccentuationData.startDate` (and, derived, `endDate`).

**Domain.** Symbolic MSM ticks, ≥ 0 by convention; `parseFloat` in `GenericMap` (no Java-strict
check), required — an element without `@date` is not registered in the map at all
(`GenericMap.ts:144-145`) and `addElement` refuses it (`:374-377`). Unbounded above; `endDate` is the
next `accentuationPattern`'s date or `Number.MAX_VALUE` (`MetricalAccentuationMap.ts:92-98`).

**Neutral.** NONE — excluded by `DESIGN.md` R5 (symbolic invariance: the transform never touches
symbolic dates). It is a timeline position with no no-effect value.

**Exaggerability.** EXCLUDE (R5). Also mechanically dangerous: the date is CACHED as the `KeyValue`
key in `GenericMap.elements`, so an in-place XML edit is invisible until `GenericMap.sort()` re-reads
it (`GenericMap.ts:187-200`); and because `startDate` is subtracted in both beat formulas and doubles
as the non-loop cutoff origin, moving it re-phases the whole accent pattern.

**Evidence.** map registration + key caching: `src/mpm/elements/maps/GenericMap.ts:144-155,374-381`;
write: `src/mpm/elements/maps/MetricalAccentuationMap.ts:44`; read into data: same file `:70-71,92-98`;
consumption in the render loop: same file `:137,158-159,164-165`; alternate parse:
`src/mpm/elements/maps/data/MetricalAccentuationData.ts:37`.

#### `style@date` (the `<style>` switch inside `metricalAccentuationMap`)

*Data field:* none — read straight off the XML.

**Domain.** Symbolic MSM ticks; same `GenericMap` rules as `accentuationPattern@date`, except that
style switches are inserted with `firstAtDate=true` so a switch takes effect for instructions sharing
its date (`GenericMap.ts:434-443` `addStyleSwitch`, `:396-405` the `firstAtDate` branch). A `<style>`
element without `name.ref` is refused (`GenericMap.ts:146,378-381`).

**Neutral.** NONE — a position, excluded exactly as `accentuationPattern@date`. Listed only for
completeness: it is the one other numeric attribute physically inside a `metricalAccentuationMap`, and
an exaggeration walker that iterates map children indiscriminately will encounter it.

**Exaggerability.** EXCLUDE (position; `DESIGN.md` R5 and the "dates" exclusion in §3).

**Evidence.** insertion: `src/mpm/elements/maps/GenericMap.ts:434-443`; scope resolution used by this
family: same file `:480-496` (`findStyleSwitchAt`/`findStyleNameAt`) via
`src/mpm/elements/maps/MetricalAccentuationMap.ts:79`.

#### `accentuationPattern@loop`

*Data field:* `MetricalAccentuationData.loop` (field default false).

**Domain.** Strictly the literal `'true'` vs anything-else: both parse sites test
`getValue() === 'true'`, so `'TRUE'`, `'1'` and `'yes'` all read as false. ABSENT means the field
keeps its initializer, which is FALSE (`MetricalAccentuationMap.ts:75-76` only assigns when the
attribute exists; `MetricalAccentuationData.ts:30` supplies the default).

**Neutral.** n/a — not numeric, not exaggerable. Reported because it decides the SPAN over which every
numeric attribute above acts: with loop=false the render loop breaks at
`mapEntry.getKey() >= md.startDate + patternLengthTicks` (`MetricalAccentuationMap.ts:157-161`), i.e.
the pattern applies once; with loop=true it runs to `endDate`. Any per-attribute effect estimate the
engine reports must be conditioned on it.

**Exaggerability.** EXCLUDE (enum/boolean, per `DESIGN.md` §3's explicit enum exclusion). Preserve
verbatim — flipping it is a structural edit, not an amplification.

**Evidence.** parse: `src/mpm/elements/maps/MetricalAccentuationMap.ts:75-76` (alternate path
`src/mpm/elements/maps/data/MetricalAccentuationData.ts:41-42`); write:
`MetricalAccentuationMap.ts:47`; consumption: same file `:157-161`.

#### `accentuationPattern@stickToMeasures`

*Data field:* `MetricalAccentuationData.stickToMeasures` (field default TRUE).

**Domain.** Same `'true'`-literal-only comparison. ABSENT means TRUE — note the asymmetry with
`@loop`: the field initializer is true (`MetricalAccentuationData.ts:31`) and
`MetricalAccentuationMap.ts:77-78` only overwrites it when the attribute is present.

**Neutral.** n/a — not numeric, not exaggerable. Reported because it selects WHICH beat number the
numeric pattern is evaluated at, and therefore how the exaggerated contour is heard: true ⇒
`beat = 1.0 + ((date − tsDate) % tickLengthOfOneMeasure) / ticksPerBeat` (re-aligns at every barline);
false ⇒ the modulus is `patternLengthTicks` instead, letting the pattern float free of the metre
(`MetricalAccentuationMap.ts:162-165`).

**Exaggerability.** EXCLUDE (boolean). Preserve verbatim. Relevant to the report though: with
`stickToMeasures=true` the beat argument is bounded by the TIME SIGNATURE's numerator, not by the
pattern's `@length`, so anchors beyond the measure length are never reached and exaggerating their
values is a documented no-op.

**Evidence.** parse: `src/mpm/elements/maps/MetricalAccentuationMap.ts:77-78` (alternate path
`src/mpm/elements/maps/data/MetricalAccentuationData.ts:44-46`); write:
`MetricalAccentuationMap.ts:48-49`; consumption: same file `:162-165`; formulas pinned by
`tests/mpm/elements/MetricalAccentuationMap.test.ts:229-260,321-360`.

### Walker notes — metrical accentuation

**Reaching the maps** (the `accentuationPattern@scale` site — per-instruction, the safe one). Global:
`Mpm.getAllPerformances()` (`src/mpm/Mpm.ts:345`) → `Performance.getGlobal()`
(`src/mpm/elements/Performance.ts:289`) → `Global.getDated()` (`src/mpm/elements/Global.ts:80`) →
`Dated.getMap(METRICAL_ACCENTUATION_MAP)` (`src/mpm/elements/Dated.ts:123`; the constant is
`'metricalAccentuationMap'`, `src/mpm/names.ts:33` / `Mpm.METRICAL_ACCENTUATION_MAP` at
`src/mpm/Mpm.ts:80`), cast to `MetricalAccentuationMap`. Per part: `Performance.getAllParts()`
(`Performance.ts:225`) → `Part.getDated()` (`src/mpm/elements/Part.ts:137`) → same `Dated.getMap`. A
part WITHOUT its own map inherits the global one at render time (`Performance.ts:608-610`; global side
resolved at `Performance.ts:455-457`), so a walker that only visits parts will miss global
instructions and one that visits both must not double-count the inherited map. Class:
`src/mpm/elements/maps/MetricalAccentuationMap.ts:20`, registered as the factory for
`'metricalAccentuationMap'` at `:184-186`.

**Iterating instructions.** Prefer the raw XML children over `getMetricalAccentuationDataOf(i)`
(`MetricalAccentuationMap.ts:59-90`): that accessor returns NULL unless `name.ref` AND `scale` AND a
resolvable style are all present, so it silently hides exactly the instructions a transform still
wants to rewrite. For a pure document transform, walk `GenericMap.getAllElements()` / `.elements`
(`KeyValue<number, Element>`) and filter on `getLocalName() === 'accentuationPattern'` — which is what
`resolveEntryIndex` does internally (`src/mpm/elements/maps/GenericMap.ts:469-473`). Use
`getMetricalAccentuationDataOf` only to REPORT what would actually render.

**Reaching the defs** (the `accentuation@value` / `transition.from` / `transition.to` triple and
`@length` — shared, the dangerous one). `Global.getHeader()` (`Global.ts:77`) or `Part.getHeader()`
(`Part.ts:134`) → `Header.getAllStyleDefs(METRICAL_ACCENTUATION_STYLE)`
(`src/mpm/elements/Header.ts:153`; constant `'metricalAccentuationStyles'`, `names.ts:24`) or
`Header.getStyleDef(type, name)` (`Header.ts:157`) → `MetricalAccentuationStyle`
(`src/mpm/elements/styles/MetricalAccentuationStyle.ts:10`; it parses its `accentuationPatternDef`
children at `:43-45`) → `GenericStyle.getAllDefs()` (`src/mpm/elements/styles/GenericStyle.ts:98`) or
`getDef(name)` (`:101`) → `AccentuationPatternDef`
(`src/mpm/elements/styles/defs/AccentuationPatternDef.ts:25`). Per def: `getAllAccentuations()`
(`:214-216`, LIVE list of `KeyValue<number[], Element>`), `getAccentuationAttributes(i)` (`:218-221`,
the `[beat, value, transition.from, transition.to]` tuple), `getAccentuationXml(i)` (`:223-226`),
`getLength()`/`setLength()` (`:288-295`), `size()` (`:284`), `getName()`
(`src/mpm/elements/styles/defs/AbstractDef.ts:32`), `getXml()` (`src/xml/AbstractXmlSubtree.ts:39`).

**Style shadowing — matters for de-duplication.** At render time the style name on the `<style>`
switch (`findStyleNameAt`, `GenericMap.ts:493-496`) is resolved LOCAL header first, then GLOBAL
(`GenericMap.getStyle`, `:506-514`). So a part-local styleDef of the same name shadows the global one,
and a def-level walker must key on (header identity, styleDef name, def name) — not on def name alone
— or it will scale the wrong pattern, or the same shared pattern twice.

**Render entry point** (for verifying any transform end-to-end): `Performance.renderPartSymbolic`
calls `mpm.metricalAccentuation.renderMetricalAccentuationToMap(score, timeSignatureMap, ppq)` at
`Performance.ts:704-709` — after the dynamics pass (which is what puts `@velocity` on the notes at
all; the fallback writes a flat 100.0 at `Performance.ts:683-688`) and BEFORE rubato, because rubato
moves the symbolic dates the beat formulas read. The static convenience overload is
`MetricalAccentuationMap.ts:173-181`.

### Hazards — metrical accentuation

- **`@scale` is MANDATORY, not defaulted.** `getMetricalAccentuationDataOf` returns null when the
  attribute is missing (`MetricalAccentuationMap.ts:67-68`) and the render loop `continue`s past the
  whole instruction (`:132-133`). The 1.0 in `MetricalAccentuationData.ts:29` is a field initializer
  that the renderer never reaches (it builds an empty `MetricalAccentuationData` at
  `MetricalAccentuationMap.ts:63` and fills every field by hand). Never express neutrality by deleting
  `@scale`; write `"0"`.
- **DOUBLE-COUNTING.** `getAccentuationAt` is positively homogeneous of degree 1 in (value,
  transition.from, transition.to) — see `AccentuationPatternDef.ts:262` (literal 0.0), `:263-264`,
  `:270`, `:277-281` — so scaling the def triple by s is EXACTLY equivalent to scaling
  `accentuationPattern@scale` by s. An engine that maps the `accentuation` dimension onto both sites
  applies s². Pick one; `DESIGN.md` §3 already picks `@scale`.
- **DEFS ARE SHARED, INSTRUCTIONS ARE NOT.** One `accentuationPatternDef` is addressed by name from
  any number of `accentuationPattern` instructions, in any part, with local-header-shadows-global
  resolution (`GenericMap.ts:506-514`, `GenericStyle.ts:101`). Editing `@scale` is a local edit;
  editing the def is a global one. This is the main argument for excluding the def triple from the
  default dimension.
- **CACHED-VS-XML DUALITY inside `AccentuationPatternDef`.** `getAccentuationAt` reads the cached
  `number[]` tuples (`AccentuationPatternDef.ts:262,264,269,270,272,278-280`), NEVER the XML; and
  `length` is the private field (`:26`), only kept in sync by `setLength` (`:292-295`). So editing an
  `<accentuation>` element's attributes in place changes what gets SERIALIZED but not what a render
  from the same in-memory object produces — and mutating the tuple returned by `getAllAccentuations()`
  (`:214`, explicitly "the live list, not a copy") does the exact opposite. There is no setter for
  value/transition.\*; the only XML-consistent path is `removeAccentuation` + `addAccentuation`
  (`:207-211, :112-135`), which re-sorts and re-inserts children. Contrast with the map side:
  `@scale`/`@loop`/`@stickToMeasures` are re-read from XML on every `getMetricalAccentuationDataOf`
  call (`:67-78`), so in-place edits there ARE picked up. A text-in/text-out transform (`DESIGN.md`
  R1) is safe; anything that renders the mutated object is not.
- **PARSING MUTATES THE DOCUMENT.** A missing `accentuationPatternDef@length` is ADDED to the element
  as `length="4"` (`AccentuationPatternDef.ts:36-40`, `new Attribute('length', String(this.length))`).
  So parse → serialize is already NOT byte-identical for such a def, before any exaggeration.
  `DESIGN.md` P1 ("the document is byte-identical at s=1") must be tested against a document that
  omits `@length`, or the claim has to be qualified.
- **NO JAVA-DOUBLE FORMATTER EXISTS.** Every write in this family goes through `String(x)`
  (`MetricalAccentuationMap.ts:44-49,168`; `AccentuationPatternDef.ts:38,95,120-123,294`). JS prints
  4.0 as `"4"` where Java prints `"4.0"`, and prints shortest-round-trip 17-digit forms (0.1+0.2 →
  `"0.30000000000000004"`). `src/supplementary/parseJavaDouble.ts` covers only the READ direction.
  Consequence: s=1 must be implemented as "do not touch the attribute", never as "rewrite with factor
  1"; and every s≠1 rewrite changes the attribute's byte shape even where the value is musically
  identical.
- **ASYMMETRIC PARSE STRICTNESS.** The map reads `@scale` with plain `parseFloat`
  (`MetricalAccentuationMap.ts:69`), so `"1.5abc"` → 1.5 and `"abc"` → NaN, and NaN then propagates
  into every velocity in the span via `:168`. The def reads its attributes with `parseJavaDouble`
  (`AccentuationPatternDef.ts:45,50,54,58,63`), so a malformed literal throws, the factory catches
  (`:102-105`) and the DEF IS DISCARDED — after which `getMetricalAccentuationDataOf` still returns a
  non-null `md` with `accentuationPatternDef === null` (`:86-88`) and the renderer dereferences it
  with a non-null assertion at `:134`, throwing a `TypeError`. So (a) always emit Java-parsable
  literals, and (b) never rewrite `name.ref` to a name the style cannot resolve.
- **DOWNSTREAM VELOCITY HANDLING IS NON-LOCAL.** `Msm.fitVelocities(0,127)`
  (`src/msm/Msm.ts:1084, 1613-1648`) compresses velocities ACROSS ALL PARTS when any single note
  leaves the range — one over-exaggerated part silently rescales the whole piece — and its scan has a
  Java-faithful quirk (`if (value < lowest) ... else if (value > highest)`, `:1632-1634`) so a
  descending run never updates `highest`. `EventMaker` clamps to 0..127 at
  `src/midi/EventMaker.ts:441,468` and `Msm.ts:1318` rounds. `DESIGN.md` R6's data-path clamp option
  belongs on this dimension, and the report must name the notes it clamped.
- **`@scale = 0` IS VELOCITY-NEUTRAL BUT NOT WRITE-NEUTRAL** in the rendered MSM:
  `MetricalAccentuationMap.ts:168` unconditionally does
  `velocityAtt.setValue(String(velocity + accentuation*0))`, so `velocity="100.0"` is rewritten as
  `"100"`. Neutral-in-effect is not the same as no-write here.
- **REAL DOCUMENTS PUT TICKS IN `@beat` AND `@length`.**
  `tests/integration/fixtures/all-maps-reference/metrical_accentuation.mpm` has `length="2880.0"` with
  beats 0.0/720.0/1440.0/2160.0, while the renderer feeds `getAccentuationAt` a ONE-BASED beat in
  [1, numerator+1) (`MetricalAccentuationMap.ts:162-165`). Such a document renders a nearly flat ramp
  — `PARITY.md:319` records velocities of 100 + k/720 — so `@value` is effectively inert and
  exaggerating it is audibly a no-op even though the arithmetic is well-defined. The report should
  detect this (max |`getAccentuationAt(beat)`| over the beats actually reachable) rather than assume
  the pattern is on the renderer's scale.
- **THE SEGMENT-END ASYMMETRY IS LOAD-BEARING AND RECENTLY FIXED.**
  `AccentuationPatternDef.ts:272` (`i < this.accentuations.length - 1`) makes every non-last anchor
  ramp to its successor's beat while the LAST anchor's segment keeps `length + 1.0` as its end
  (`:267`). This mirrors meico@1d662105; the pre-fix behaviour moved fixture bytes
  (`PARITY.md:281-333`). It means the last accentuation's `@transition.to` has a wider reach than the
  others, and that any exaggeration report keyed to "which anchors matter" must model that asymmetry,
  not assume uniform segments.
- **EMPTY DEFS THROW.** `getAccentuationAt` indexes `accentuations[0]` unguarded
  (`AccentuationPatternDef.ts:262`), and `createAccentuationPatternDef(name, length)` produces exactly
  such an empty def (`:92-97`). Also: an `<accentuation>` element without `@beat` is silently skipped
  at parse (`:48-49`) and `addAccentuationFromXml` returns -1 (`:147-148`). If the engine ever
  synthesizes defs it must add accentuations; if it filters them it must not leave a referenced def
  empty.
- **DATE EDITS NEED `GenericMap.sort()`.** `accentuationPattern@date` is cached as the `KeyValue` key
  (`GenericMap.ts:144-155`); an in-place XML edit is invisible until `sort()` re-reads it
  (`:187-200`). Since the date also defines `endDate` (the next `accentuationPattern`'s date,
  `MetricalAccentuationMap.ts:92-98`) and the non-loop cutoff origin (`:159`), moving dates changes
  which notes each pattern covers. Dates are excluded by `DESIGN.md` R5 anyway — this is why.
- **TWO PARSE PATHS DISAGREE, AND THE RENDERER USES THE LESS OBVIOUS ONE.**
  `new MetricalAccentuationData(xml)` (`MetricalAccentuationData.ts:33-50`) is never used by the
  render path; it uses `parseFloat` plus non-null assertions, so a missing `@scale` yields NaN there
  where the map's path (`MetricalAccentuationMap.ts:67-68`) drops the instruction. Do not read the
  data class's field defaults (scale=1.0, loop=false, stickToMeasures=true, `:29-31`) as the format's
  defaults: only loop=false and stickToMeasures=true are real, and only because
  `MetricalAccentuationMap.ts:75-78` assigns nothing when the attributes are absent.
- **ORDERING DEPENDENCE.** The pass runs after dynamics (which is what creates `@velocity` at all —
  with no dynamicsMap anywhere every note gets a flat 100.0, `Performance.ts:679-690`) and before
  rubato (`Performance.ts:704-713`). So the perceptual size of an accentuation exaggeration is
  relative to whatever velocity dynamics established; a fixed absolute `@scale` means something
  different against volume=40 than against volume=110. If the engine exaggerates the dynamics
  dimension in the same pass, the two interact and the composition property P2 holds per-dimension but
  not for the audible result.

---

## 6. Ornamentation (main)

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `temporalSpread@frame.start` | double | unbounded ℝ, negative idiomatic; unenforced | `0.0` (only with `frameLength`=0) | `@frameLength` | **YES — as half of a pair** |
| `temporalSpread@frameLength` | double | [0,∞); `Math.max(0,·)` in the setter | `0.0` | `@frame.start` | **the width knob — most meaningful** |
| `temporalSpread@intensity` | double | exponent, safe (0,∞); unenforced | `1.0` | — | **log space only** (`x^k`) |
| `dynamicsGradient@transition.from` | double | unbounded ℝ (velocity units); unenforced | `0.0` | `@transition.to` | **YES**, as a pair |
| `dynamicsGradient@transition.to` | double | as `from`; unenforced | `0.0`; **defaults to `from`** | `@transition.from` | **YES**, as a pair |
| `ornament@scale` | double | unbounded ℝ; unenforced | **`0.0`** (counter-intuitive) | — | linear, but 0×k=0 on real corpora |
| `ornament@date` | double | [0,∞) ticks; must merely exist | n/a (structural anchor) | — | **DO NOT SCALE** |
| `temporalSpread@time.unit` | enum | `'ticks'` \| `'milliseconds'` | `'ticks'` | the two frame numerics | **not exaggerable** — but branch on it |
| `temporalSpread@noteoff.shift` | enum | `false`\|`true`\|`monophonic` | `'false'` | — | **not exaggerable** — modulates everything |

### Per-attribute detail

#### `temporalSpread@frame.start` (child of `ornamentDef`)

*Data field:* `TemporalSpread.frameStart` (public plain field). *Paired with:*
`temporalSpread@frameLength` — geometric pair defining the frame [start, start+length]; also gated by
`temporalSpread@time.unit` for units.

**Domain.** Unbounded real, negative is normal and idiomatic (pre-beat lead-in). Ticks or milliseconds
depending on the sibling `time.unit`. NOWHERE enforced — bare `parseFloat` with no validation at parse
(`TemporalSpread.ts:51`), no clamp at use (`TemporalSpread.ts:97-99`). NaN propagates straight into
`date.perf`.

**Neutral.** `0.0`. Justified by the renderer, not by the default: the offset written for chord i is
`Math.pow(i/(n-1), intensity) * frameLength + frameStart` (`TemporalSpread.ts:97-99`) and the last
chord gets `frameStart + frameLength` (`TemporalSpread.ts:103-107`). With frameStart=0 AND
frameLength=0 every chord's `ornament.date.offset` is 0, and the fold-in pass then computes
`datePerf + 0` (`OrnamentationMap.ts:345-347`) — the identity. Note frameStart=0 alone is NOT the
identity unless frameLength is also 0; on its own frameStart is the rigid translation of the whole
frame. Class field default is also 0.0 (`TemporalSpread.ts:35`) and `generateXML` omits the attribute
at 0.0 (`TemporalSpread.ts:190-191`), so parse/serialize agree on the neutral.

**Exaggerability.** Highly meaningful, but ONLY as half of a pair. The frame spans
[frameStart, frameStart+frameLength]; the built-in arpeggio is (-22, 44) (`OrnamentDef.ts:138`), i.e.
exactly centred on the notated onset. Scale `frame.start` and `frameLength` by the SAME factor k to
widen the arpeggio symmetrically around its beat; scaling `frameLength` alone drags the centroid late.
Hazard: a lone note is placed at `frameStart+frameLength` (`TemporalSpread.ts:103-107`), so
exaggeration amplifies a +22-tick displacement on single notes that were never meant to be spread.
Hazard: with `noteoff.shift` absent, the whole offset is absorbed by `duration.perf`
(`OrnamentationMap.ts:373-377`), so aggressive k can drive a short note's duration negative — nothing
clamps it.

**Evidence.** parse `src/mpm/elements/styles/defs/TemporalSpread.ts:50-51`; field default `:35`;
consumption `:97-99` and `:103-107`; write-out of marker `:133-137`; serialization (omitted at 0)
`:190-191`; tick fold-in `src/mpm/elements/maps/OrnamentationMap.ts:341-379`; ms fold-in
`src/mpm/elements/Performance.ts:880-916` (live copy) and
`src/mpm/elements/maps/OrnamentationMap.ts:424-460` (dead parity copy); fixture
`tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

#### `temporalSpread@frameLength` (child of `ornamentDef`)

*Data field:* `TemporalSpread.frameLength` (PRIVATE — reach via `getFrameLength()`/`setFrameLength()`).
*Paired with:* `temporalSpread@frame.start`.

**Domain.** [0, +∞). Ticks or milliseconds per the sibling `time.unit`. ENFORCED in the setter:
`Math.max(0.0, length)` (`TemporalSpread.ts:72-74`), and the parse path routes through that setter
(`TemporalSpread.ts:53`), so a negative literal in the XML silently becomes 0. The field is private
specifically to force this (`TemporalSpread.ts:36, :71` comment). No upper bound anywhere.

**Neutral.** `0.0`. At frameLength=0 the placement expression
`Math.pow(i/(n-1), intensity) * frameLength + frameStart` (`TemporalSpread.ts:98`) collapses to
`frameStart` for every chord — the spread vanishes and only the rigid `frameStart` translation
survives; combined with frameStart=0 it is the full identity on `date.perf`
(`OrnamentationMap.ts:345-347`). Also the class field default (`TemporalSpread.ts:36`) and omitted from
serialization at 0.0 (`TemporalSpread.ts:192-193`).

**Exaggerability.** The single most musically meaningful knob in the family: it IS the width of the
arpeggio/roll. Deviation from 0 is the effect size, so plain multiplication `frameLength *= k` is
well-defined and monotone. Two hazards. (1) One-sided clamp: `Math.max(0.0, …)`
(`TemporalSpread.ts:72-74`) means a negative exaggerated value collapses the spread to a point instead
of reversing it — you cannot invert an arpeggio by negating frameLength, you must invert `note.order`.
(2) Cross-domain scale: in ticks the value is PPQ-relative (44 ticks at PPQ 720 is tiny), in
milliseconds it is absolute; the same k reads very differently, so branch on `time.unit` before
choosing k.

**Evidence.** parse `src/mpm/elements/styles/defs/TemporalSpread.ts:52-53`; clamp in `setFrameLength`
`:71-74`; getter `:75-77`; field default `:36`; consumption `:97-99` and `:103-107`; serialization
(omitted at 0) `:192-193`; convenience setter `src/mpm/elements/styles/defs/OrnamentDef.ts:86-100`
(line 88 `ts.setFrameLength(frameLength)`); default arpeggio value 44.0 at `OrnamentDef.ts:138`;
fixture `tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

#### `temporalSpread@intensity` (child of `ornamentDef`)

*Data field:* `TemporalSpread.intensity` (public plain field).

**Domain.** Mathematically an exponent applied to a base in [0,1]. Safe range is (0, +∞); the code
assumes nothing. NOWHERE enforced — bare `parseFloat` at parse (`TemporalSpread.ts:54-55`), used raw
as the exponent (`TemporalSpread.ts:98`), no clamp in the setter path either (it is a public plain
field, `TemporalSpread.ts:38`).

**Neutral.** `1.0`. `Math.pow(i/(n-1), 1) === i/(n-1)`, so chord i lands at exactly i/(n-1) of the
frame — perfectly even spacing (`TemporalSpread.ts:98`). It is neutral in the shaping sense, not the
no-effect sense: the spread still happens, intensity only bends its spacing. The class default is 1.0
(`TemporalSpread.ts:38`) and `generateXML` omits the attribute when it equals 1.0
(`TemporalSpread.ts:196`), confirming 1.0 is the round-trip identity. The in-code doc states the
semantics: ">1 crowds the start, <1 crowds the end" (`TemporalSpread.ts:85-86`).

**Exaggerability.** Meaningful but NOT linearly scalable — it is an exponent, so deviation from neutral
is multiplicative, not additive. Exaggerate in log space: `intensity' = intensity ** k` (or
`exp(k * ln intensity)`), which maps the neutral 1.0 to itself and pushes 2.0 → 4.0 rather than the
nonsensical `1 + k*(2-1)`. Hard hazards at the domain edges, all unguarded: intensity = 0 gives
`Math.pow(0, 0) === 1` in JS, so EVERY chord including the first jumps to `frameStart+frameLength`
(the whole ornament piles onto its own end); intensity < 0 gives `Math.pow(0, -x) === Infinity`,
producing Infinity/NaN offsets that flow into `date.perf` and then into the MIDI. Clamp the exaggerated
value to a small positive epsilon.

**Evidence.** parse `src/mpm/elements/styles/defs/TemporalSpread.ts:54-55`; field default `:38`;
consumption (the exponent) `:98`; semantics doc `:84-87`; serialization (omitted at 1.0) `:196`;
default arpeggio passes 1.0 at `src/mpm/elements/styles/defs/OrnamentDef.ts:138`; non-neutral fixture
value `intensity="2.0"` in `tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

#### `dynamicsGradient@transition.from` (child of `ornamentDef`)

*Data field:* `DynamicsGradient.transitionFrom` (public plain field). *Paired with:*
`dynamicsGradient@transition.to` — the two are the endpoints of one linear ramp and must be
exaggerated as a unit.

**Domain.** Unbounded real, in MIDI-velocity units (it is ADDED to velocity, not multiplied). Negative
is idiomatic — the built-in arpeggio starts at -1.0 (`OrnamentDef.ts:137`). NOWHERE enforced: bare
`parseFloat` at parse (`DynamicsGradient.ts:23`), no clamp at use (`DynamicsGradient.ts:41-44`), and
the downstream velocity write does not clamp to 0..127 either (`OrnamentationMap.ts:337-339`).

**Neutral.** `0.0`. The gradient writes `ornament.dynamics` per chord as `constFac * n + fromVelocity`
with `constFac = scale*(to-from)/(n-1)` and `fromVelocity = from*scale`
(`DynamicsGradient.ts:40-44`); with from = to = 0 every chord gets 0, and the fold-in pass computes
`velocity + 0` (`OrnamentationMap.ts:334-339`) — the identity on velocity. Class field default is 0.0
(`DynamicsGradient.ts:13`) and `generateXML` omits the attribute at 0.0 (`DynamicsGradient.ts:84-85`),
so parse and serialize agree.

**Exaggerability.** Meaningful, but the musically correct decomposition is NOT per-endpoint. The
gradient carries two independent quantities: the mean offset (from+to)/2 (does the whole ornament get
louder or softer?) and the span (to-from) (how steep is the swell?). The arpeggio default is mean 0 /
span 2 (`OrnamentDef.ts:137`). Scaling from and to independently around 0 scales both quantities by
the same k, which is usually what you want. If you want to exaggerate only the swell, hold the mean
and scale the span. Hazard: velocity is never clamped downstream (`OrnamentationMap.ts:337-339`), so a
large k can push velocity negative or past 127 before the MIDI writer sees it. Hazard: the whole
gradient is multiplied by `ornament@scale`, which defaults to 0 — see that entry; exaggerating
`transition.from` on an ornament whose `@scale` is absent changes nothing at all.

**Evidence.** parse `src/mpm/elements/styles/defs/DynamicsGradient.ts:22-23`; field default `:13`;
consumption `:38-49` (constFac line `40-41`, fromVelocity line `42`, ramp line `44`, single-chord
branch line `47-49`); marker write `:52-61`; serialization (omitted at 0) `:82-85`; velocity fold-in
`src/mpm/elements/maps/OrnamentationMap.ts:333-339`; default arpeggio -1.0 at
`src/mpm/elements/styles/defs/OrnamentDef.ts:137`; end-to-end numbers in
`tests/mpm/elements/OrnamentationMap.test.ts:656-680`.

#### `dynamicsGradient@transition.to` (child of `ornamentDef`)

*Data field:* `DynamicsGradient.transitionTo` (public plain field). *Paired with:*
`dynamicsGradient@transition.from`.

**Domain.** Same as `transition.from`: unbounded real in velocity units, nothing enforced anywhere
(parse `DynamicsGradient.ts:26`, use `:41` and `:48`).

**Neutral.** `0.0` in the absolute sense (from = to = 0 makes every `ornament.dynamics` 0 and the
velocity fold-in an identity — `DynamicsGradient.ts:40-44` with `OrnamentationMap.ts:337-339`). But
its DEFAULT-WHEN-ABSENT is `transition.from`, not 0:
`if (att2 === null) this.transitionTo = this.transitionFrom` (`DynamicsGradient.ts:24-26`), i.e. an
absent `transition.to` means a FLAT offset at `transition.from`, not a ramp down to zero. Serialization
mirrors this — the attribute is omitted whenever it equals `transition.from`
(`DynamicsGradient.ts:86-87`). So the neutral-point strategy must be stated relative to the pair:
(from, to) = (0, 0) is the no-effect point; to == from is the no-ramp point.

**Exaggerability.** Same treatment as `transition.from` — scale both endpoints about 0 by the same k.
The trap is exclusively about materialisation: on a def written as
`<dynamicsGradient transition.from="5"/>` the object holds `transitionTo = 5` (inherited), and if the
exaggeration engine scales only the parsed `transition.to` attribute it does not exist to scale, so a
flat +5 offset becomes a ramp the composer never wrote. Either scale the object fields and regenerate
the element, or materialise `transition.to` before touching it. Also note the single-chord branch uses
`transitionTo * scale` — the END of the ramp, not the start (`DynamicsGradient.ts:47-49`) — so a
one-note ornament is governed entirely by this attribute.

**Evidence.** parse and from-fallback `src/mpm/elements/styles/defs/DynamicsGradient.ts:24-26`; field
default `:13`; consumption `:41` (constFac numerator) and `:48` (single-chord branch); serialization
(omitted when equal to from) `:86-87`; default arpeggio +1.0 at
`src/mpm/elements/styles/defs/OrnamentDef.ts:137`; convenience setter `OrnamentDef.ts:117-122`;
fixture `transition.to="1.0"`/`"0.5"` in
`tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

#### `ornament@scale` (entry of `ornamentationMap`)

*Data field:* `OrnamentData.scale`.

**Domain.** Unbounded real. NOWHERE enforced — bare `parseFloat` on all three read paths
(`OrnamentationMap.ts:252, :123`, `OrnamentData.ts:39`) and used raw as a multiplier
(`DynamicsGradient.ts:41-42, :48`).

**Neutral.** `0.0` — and this is the counter-intuitive one, so it is worth being explicit. `@scale`
multiplies ONLY the dynamics gradient: `OrnamentData.apply` passes it to `DynamicsGradient.apply`
(`OrnamentData.ts:95-96`) but calls `TemporalSpread.apply` with no scale argument at all
(`OrnamentData.ts:98-99`, `TemporalSpread.ts:92`). Inside the gradient it multiplies both endpoints
(`DynamicsGradient.ts:41-42`), so scale = 0 zeroes every `ornament.dynamics` and the velocity fold-in
becomes `velocity + 0` — the no-effect value is 0.0, and 1.0 merely means "the def as written". 0.0 is
ALSO the implicit default: `OrnamentationMap.apply` builds a fresh `OrnamentData` whose `scale` field
is 0.0 (`OrnamentData.ts:27-28`) and overwrites it only when the attribute exists
(`OrnamentationMap.ts:251-252`). The test suite pins both facts
(`tests/mpm/elements/OrnamentationMap.test.ts:556-563` and `:649-653`). Do not pick 1.0 as neutral: an
absent `@scale` would then be read as a -1 deviation and exaggeration would invert the gradient.

**Exaggerability.** Cleanly and linearly exaggerable — `scale *= k` scales the ornament's velocity ramp
exactly, since deviation-from-neutral is the value itself. It is the right knob for "make this
individual arpeggio's swell bigger" without editing the shared def. Two hard traps. (1) It does NOT
touch timing at all (`OrnamentData.ts:98-99`); exaggerating `@scale` never widens an arpeggio, only
its dynamics. (2) Multiplying 0 by anything is 0, and 0 is the overwhelmingly common in-the-wild value
(absent attribute; every MEI-derived arpeggio, `Mei2MsmMpmConverter.ts:2156`) — so on a typical
document exaggerating `@scale` is a no-op. Making those respond requires SEEDING a non-zero scale,
which is an editorial decision outside the scaling model.

**Evidence.** render-path parse `src/mpm/elements/maps/OrnamentationMap.ts:251-252`; accessor-path
parse `:122-123`; data-ctor parse `src/mpm/elements/maps/data/OrnamentData.ts:38-39`; field default
0.0 `:27-28`; consumption `src/mpm/elements/maps/data/OrnamentData.ts:95-96` →
`src/mpm/elements/styles/defs/DynamicsGradient.ts:41-42` and `:48`; NOT passed to the spread
`OrnamentData.ts:98-99`; write-out `if (scale !== 1.0)` `src/mpm/elements/maps/OrnamentationMap.ts:61`;
MEI export forces 0.0 `src/mei/Mei2MsmMpmConverter.ts:2156`; tests
`tests/mpm/elements/OrnamentationMap.test.ts:143-156, :386-392, :556-563, :649-653, :656-670`.

#### `ornament@date` (entry of `ornamentationMap`)

*Data field:* `OrnamentData.date`.

**Domain.** [0, +∞) in MIDI ticks (PPQ-relative). NOWHERE enforced numerically; `GenericMap` only
requires the attribute to EXIST — a child without `@date` is skipped from the index entirely
(`GenericMap.ts:120, :144-146`) — and parses it with bare `parseFloat` (`GenericMap.ts:147`).

**Neutral.** Not applicable — this is a structural anchor, not an expressive deviation. There is no
value at which it "has no effect": it is both the sort key of the map (`GenericMap.ts:147-155`) and the
query point that selects which notes the ornament grabs (`map.getAllElementsAt(od.date)`,
`OrnamentationMap.ts:284`). Any change repoints the ornament at different notes or at none.

**Exaggerability.** DO NOT SCALE. Exaggerating `@date` would desynchronise the ornament from the chord
it ornaments — the date must match a note's date exactly for the no-`note.order` branch to find
anything (`OrnamentationMap.ts:283-291`), and a shifted date silently yields zero target notes and a
silently dropped ornament (the `continue` at `OrnamentationMap.ts:291`). Listed here only because the
survey asked for every numeric attribute; it belongs on an exclusion list. If a map is ever re-dated,
`GenericMap.sort()` (`GenericMap.ts:189-190`) must be called to resync the keys with the attributes.

**Evidence.** written `src/mpm/elements/maps/OrnamentationMap.ts:59` and `:74`; read into the index
`src/mpm/elements/maps/GenericMap.ts:144-155`; read back
`src/mpm/elements/maps/OrnamentationMap.ts:114` and `:249`; consumed as the note-selection query
`src/mpm/elements/maps/OrnamentationMap.ts:284`; re-sync path `GenericMap.ts:177-190`.

#### `temporalSpread@time.unit` (child of `ornamentDef`)

*Data field:* `TemporalSpread.frameDomain`. *Type:* enum (`'ticks'` | `'milliseconds'`).

**Domain.** Two values. Parser is LENIENT in one direction only: the field starts at
`FrameDomain.Ticks` and flips to `Milliseconds` solely on an exact string match of `'milliseconds'`
(`TemporalSpread.ts:47-49`) — any other value, including a typo or `'ms'`, silently means ticks.

**Neutral.** `'ticks'` (`FrameDomain.Ticks`) — the field default (`TemporalSpread.ts:37`) and the value
at which `generateXML` omits the attribute (`TemporalSpread.ts:194-195`). Not a scalable quantity;
included because it is the UNIT of the two numeric frame attributes and therefore load-bearing for any
exaggeration factor applied to them.

**Exaggerability.** Not exaggerable — it is a domain selector, and switching it would reinterpret
`frame.start`/`frameLength` in a completely different magnitude scale. Its practical importance to the
engine: it decides which marker attribute names the spread writes
(`'ornament.date.offset'`/`'ornament.duration'` vs
`'ornament.milliseconds.date.offset'`/`'ornament.milliseconds.duration'`, `TemporalSpread.ts:120-132`)
and therefore WHICH RENDER PASS consumes the exaggerated value — the tick pair is folded in before the
tempo map (`OrnamentationMap.ts:330-383`) and the millisecond pair after it
(`Performance.ts:877-917`). A tick-domain spread is tempo-relative and a millisecond-domain one is
absolute, so the same exaggeration factor produces musically different results; branch on this value
when choosing k.

**Evidence.** parse `src/mpm/elements/styles/defs/TemporalSpread.ts:47-49`; enum
`src/mpm/elements/styles/defs/TemporalSpread.ts:5-9`; field default `:37`; consumption (attribute-name
switch) `:120-132`; serialization (omitted for ticks) `:194-195`; tick consumer
`src/mpm/elements/maps/OrnamentationMap.ts:330-383`; ms consumer
`src/mpm/elements/Performance.ts:877-917`; fixture uses both domains
`tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

#### `temporalSpread@noteoff.shift` (child of `ornamentDef`)

*Data field:* `TemporalSpread.noteOffShift`. *Type:* enum (`'false'` | `'true'` | `'monophonic'`).

**Domain.** Three values. Parser leniency identical in shape to `time.unit`: the field starts at
`NoteOffShift.False` and only exact `'true'`/`'monophonic'` change it (`TemporalSpread.ts:56-66`);
anything else means false.

**Neutral.** `'false'` (`NoteOffShift.False`) — the field default (`TemporalSpread.ts:39`) and the
value at which `generateXML` writes nothing (`TemporalSpread.ts:197-200`). Non-numeric; included
because it decides WHICH numeric attribute absorbs the exaggerated date offset, so it changes what a
given k does audibly.

**Exaggerability.** Not exaggerable, but it modulates the effect of every scaled frame value.
`false`: the note end stays put and `duration.perf` absorbs the entire offset
(`OrnamentationMap.ts:373-377`) — a large k shortens notes, and can drive `duration.perf` negative
with nothing to stop it. `true`: the marker attribute `'ornament.noteoff.shift'` is written (only ever
with value `"true"`, `TemporalSpread.ts:143-144`), `date.end.perf` moves with the onset and the
duration is preserved (`OrnamentationMap.ts:365-371`, `Performance.ts:906-914`) — the safe mode for
aggressive exaggeration. `monophonic`: each chord additionally gets an ABSOLUTE `ornament.duration`
equal to the gap to the next chord (`TemporalSpread.ts:146-165`), which then overrides
`duration.perf` and `date.end.perf` outright (`OrnamentationMap.ts:352-362`) — here widening the frame
lengthens the notes rather than shortening them, the opposite sign of the `false` case. Note the
marker's mere presence is the boolean; there is no "false" marker
(`OrnamentationMap.ts:367, :451`).

**Evidence.** parse `src/mpm/elements/styles/defs/TemporalSpread.ts:56-66`; enum `:10-18`; field
default `:39`; consumption (three-way switch, incl. the monophonic absolute-duration write)
`:139-168`; serialization `:197-200`; downstream tick branch
`src/mpm/elements/maps/OrnamentationMap.ts:352-378`; downstream ms branch
`src/mpm/elements/Performance.ts:894-915`; default arpeggio uses `NoteOffShift.False`
`src/mpm/elements/styles/defs/OrnamentDef.ts:138`; fixture uses `noteoff.shift="true"`
`tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`.

### Walker notes — ornamentation

Two disjoint reach paths — the DEFS (which carry every numeric except `@scale` and `@date`) live in
the header, the MAP ENTRIES (which carry `@scale` and `@date`) live in `dated`. Both exist globally and
per part, and both must be walked.

**Defs (temporalSpread + dynamicsGradient numerics).**

- global: `Performance.getGlobal()` (`src/mpm/elements/Performance.ts:289`) → `Global.getHeader()`
  (`src/mpm/elements/Global.ts:77`) → `Header.getAllStyleDefs(ORNAMENTATION_STYLE)`
  (`src/mpm/elements/Header.ts:153`, returns `Map<string, GenericStyle> | undefined`) or
  `Header.getStyleDef(type, name)` (`Header.ts:157`). The type key is the literal string
  `'ornamentationStyles'` — `ORNAMENTATION_STYLE` in `src/mpm/names.ts:22`, re-exported as
  `Mpm.ORNAMENTATION_STYLE`.
- per part: `Performance.getAllParts()` (`Performance.ts:225`) or
  `getPart(number|name|channel,port)` (`Performance.ts:235-238`) → `Part.getHeader()`
  (`src/mpm/elements/Part.ts:134`) → same `Header` API. Part defs shadow global ones at lookup time
  (see the local-then-global fallback in `OrnamentationMap.apply`, `OrnamentationMap.ts:224-233`).
- then: cast the `GenericStyle` to `OrnamentationStyle`
  (`src/mpm/elements/styles/OrnamentationStyle.ts:10`) → `getAllDefs()`
  (`src/mpm/elements/styles/GenericStyle.ts:98`, a live `ReadonlyMap<string, OrnamentDef>`, NOT a
  copy) or `getDef(name)` (`GenericStyle.ts:101`, returns `OrnamentDef | undefined`) →
  `OrnamentDef.getTemporalSpread()` (`src/mpm/elements/styles/defs/OrnamentDef.ts:66`, nullable) and
  `OrnamentDef.getDynamicsGradient()` (`OrnamentDef.ts:102`, nullable). Both may be null: a def with
  no transformers is legal and is exactly what `createDefaultOrnamentDef` returns for any name other
  than arpeg/arpeggio (`OrnamentDef.ts:131-141`).
- write-back: prefer
  `OrnamentDef.setTemporalSpreadValues(frameStart, frameLength, frameDomain, intensity, noteOffShift)`
  (`OrnamentDef.ts:86-100`) and `setDynamicsGradientValues(transitionFrom, transitionTo)`
  (`OrnamentDef.ts:117-122`) — they rebuild the transformer AND replace the child element, avoiding
  the field/XML divergence described in the hazards. Mutating `TemporalSpread.frameStart` /
  `.intensity` or `DynamicsGradient.transitionFrom` / `.transitionTo` directly updates only the
  object; you must then call `generateXML()` and re-attach, or edit the `Attribute` on `getXml()`
  instead. `frameLength` is private — use `getFrameLength()` / `setFrameLength()`
  (`TemporalSpread.ts:72-77`).

**Map entries (`@scale`, `@date`).**

- global: `Performance.getGlobal()` → `Global.getDated()` (`src/mpm/elements/Global.ts:80`) →
  `Dated.getMap(ORNAMENTATION_MAP)` (`src/mpm/elements/Dated.ts:123`). Key is `'ornamentationMap'`
  (`src/mpm/names.ts:30`, `Mpm.ORNAMENTATION_MAP`). `Dated.getAllMaps()` (`Dated.ts:126`) enumerates.
- per part: `Part.getDated()` (`src/mpm/elements/Part.ts:137`) → same `getMap`.
- cast to `OrnamentationMap` (`src/mpm/elements/maps/OrnamentationMap.ts:35`). Enumerate exactly as
  the renderer does: `for (let i = 0; i < map.size(); ++i) { const e = map.getElement(i); … }` (the
  pattern at `OrnamentationMap.ts:218-220`), filtering `e.getLocalName() === 'ornament'` and skipping
  `'style'` entries (`OrnamentationMap.ts:223-237`). Read/write `@scale` through the element:
  `attribute('scale', map.getElement(i))` (`src/mpm/xml/tree.ts` helper, used at
  `OrnamentationMap.ts:251`). `getOrnamentDataOf(i)` (`OrnamentationMap.ts:101-127`) returns a
  DETACHED snapshot (`OrnamentData`) and returns null unless both the style and the def resolve —
  read-only convenience, not a write path, and not safe for enumeration.
- creation helpers, if the engine ever synthesises entries:
  `addOrnament(date, nameRef, scale, noteOrder, id)` (`OrnamentationMap.ts:51`) and
  `addOrnamentFromData(data)` (`OrnamentationMap.ts:77`) — but see the `@scale` round-trip hazard
  before using either.

**Render order** (what the exaggerated values feed): `Performance.perform` clones the Msm and
snapshots the maps (`Performance.ts:444-458` global, `:611-612` per part with global fallback), so ALL
exaggeration must be applied to the MPM before `perform` is called. Global ornamentation is
distributed to every part first (`Performance.ts:483, :506-520`), then per part
`renderOrnamentationToMap(score)` runs pass 1 (apply) plus pass 2 (tick-domain fold-in) at
`Performance.ts:715` / `OrnamentationMap.ts:166-172`, and the millisecond fold-in runs after the tempo
map at `Performance.ts:768` → `Performance.ts:877`.

### Hazards — ornamentation

- **CONFIRMED: there is NO `frame.end`.** The only frame attributes that exist anywhere in the family
  are `frame.start` and `frameLength` — parsed at `TemporalSpread.ts:50-53`, serialized at
  `TemporalSpread.ts:190-193`, and those are the only two in the reference fixture
  (`tests/integration/fixtures/all-maps-reference/ornamentation.mpm:2`). Note the asymmetric spelling:
  dotted `frame.start` but camelCase `frameLength` (no dot), the same camel spelling `RubatoData`
  uses. Getting this wrong means the attribute is silently ignored, since the parser only reads names
  it knows.
- **`ornament@scale` round-trip asymmetry — the single biggest trap in this family.** The writer omits
  `@scale` when it equals 1.0 (`if (scale !== 1.0)`, `OrnamentationMap.ts:61`) but the reader's default
  is 0.0 (`OrnamentData.ts:27-28`, applied at `OrnamentationMap.ts:251-252`). So
  `addOrnament(date, name, 1.0)` serializes without `@scale` and re-reads as scale 0, silently killing
  the `dynamicsGradient`. The suite pins this deliberately
  (`tests/mpm/elements/OrnamentationMap.test.ts:556-563`: "should leave scale at its 0.0 default when
  the attribute is absent"). An exaggeration pass that rewrites `@scale` must write the `Attribute`
  explicitly on the existing element — never round-trip through `addOrnament`/`addOrnamentFromData`,
  or it can erase the very effect it meant to scale.
- **Every MEI-derived arpeggio ships with `scale = 0.0`**, hard-coded at
  `src/mei/Mei2MsmMpmConverter.ts:2156`, and 0.0 !== 1.0 so it is actually serialized as `scale="0"`.
  Combined with the built-in arpeggio def's `dynamicsGradient(-1, +1)` (`OrnamentDef.ts:137`) this
  means the dynamics ramp of a typical MEI-imported arpeggio is dead on arrival. Since exaggeration
  multiplies deviation-from-0, k · 0 = 0: the engine will appear to do nothing on such documents.
  Making them respond requires seeding a non-zero `@scale`, which is an editorial choice, not a scaling
  operation — surface it as such rather than smuggling it into the multiplier.
- **`transition.to` defaults to `transition.from`, NOT to 0** (`DynamicsGradient.ts:24-26`), and is
  omitted from serialization whenever the two are equal (`DynamicsGradient.ts:86-87`). A def written
  `<dynamicsGradient transition.from="5"/>` therefore means a FLAT +5 velocity offset. If the engine
  scales attributes rather than object fields, `transition.to` is not present to scale and a flat
  offset silently becomes a ramp. Scale the object fields and regenerate, or materialise
  `transition.to` first.
- **`frameLength` is clamped one-sidedly**: `Math.max(0.0, length)` in `setFrameLength`
  (`TemporalSpread.ts:71-74`), and the parse path goes through the setter (`TemporalSpread.ts:53`). A
  negative exaggerated value does not reverse the arpeggio — it collapses the spread to a single point
  at `frameStart`. Reversal is expressed through `note.order`, not through a negative length.
- **`intensity` is an exponent and must not be scaled linearly.** Neutral is 1.0
  (`Math.pow(x, 1) === x`, `TemporalSpread.ts:98`); the correct exaggeration is multiplicative, e.g.
  `intensity ** k`. Nothing clamps it at parse (`TemporalSpread.ts:54-55`) or use (`:98`), and both
  edges are catastrophic: intensity = 0 gives `Math.pow(0, 0) === 1` in JS so every chord including
  the first collapses onto `frameStart+frameLength`, and intensity < 0 gives
  `Math.pow(0, -x) === Infinity`, injecting Infinity/NaN into `ornament.date.offset` and thence into
  `date.perf` and the MIDI. Clamp the result to a positive epsilon.
- **`frame.start` and `frameLength` are a geometric pair, not two independent knobs.** The frame is
  [frameStart, frameStart+frameLength]; the built-in arpeggio (-22, 44) (`OrnamentDef.ts:138`) is
  centred on the notated onset. Apply the same factor to both to widen symmetrically — scaling
  `frameLength` alone moves the ornament's centre of gravity later.
- **Single-element edge cases invert the intuition about neutrality.** With one chord,
  `TemporalSpread.apply` skips the loop entirely and places it at `frameStart + frameLength`
  (`TemporalSpread.ts:92-107`), and `DynamicsGradient.apply` uses `transitionTo * scale` — the END of
  the ramp, not the start (`DynamicsGradient.ts:47-49`, doc at `:33`). A lone note under the default
  arpeggio is therefore displaced +22 ticks and given the top-of-ramp velocity; exaggeration amplifies
  that artifact rather than a real spread.
- **Both transformers ADD to whatever `ornament.*` marker a note already carries**
  (`TemporalSpread.ts:134-137`, `DynamicsGradient.ts:54-60`), so overlapping ornaments stack on the
  same note. Exaggerating each def multiplies the stacked result; do not assume per-ornament
  independence when validating output.
- **Mutation surface is inconsistent and neither class is an `AbstractXmlSubtree`** (deliberate —
  `TemporalSpread.ts:28-33`, `DynamicsGradient.ts:8-11`, RULE C1a). `frameStart`, `intensity`,
  `frameDomain`, `noteOffShift`, `transitionFrom`, `transitionTo` are public plain fields with NO
  write-through to the cached XML element; `frameLength` is private behind `setFrameLength`. Setting a
  field and re-serializing requires calling `generateXML()` (which rebuilds and re-caches,
  `TemporalSpread.ts:188-205` / `DynamicsGradient.ts:82-92`) or going through
  `OrnamentDef.setTemporalSpreadValues` / `setDynamicsGradientValues` (`OrnamentDef.ts:86-100,
  :117-122`), which delete and re-append the child element. Conversely, editing the parsed element's
  `Attribute` objects in place leaves the object fields stale. Pick one lane per attribute and stay in
  it.
- **`getXml()` on either transformer is NOT a pure read** — for a programmatically built transformer
  it GENERATES and caches the element as a side effect (`TemporalSpread.ts:174-182`,
  `DynamicsGradient.ts:67-75`), while `toXml()` deliberately returns `''` in that state. A
  survey/inspection pass that calls `getXml()` to "just look" will materialise elements.
- **No numeric read in this family validates anything**: bare `parseFloat` at `TemporalSpread.ts:51,
  :53, :55`, `DynamicsGradient.ts:23, :26`, `OrnamentationMap.ts:123, :252`, `OrnamentData.ts:35,
  :39`. Malformed input yields NaN which flows unchecked into `date.perf`, `duration.perf` and
  velocity. The velocity fold-in in particular never clamps to 0..127
  (`OrnamentationMap.ts:337-339`), so aggressive dynamics exaggeration can go out of MIDI range before
  the writer sees it.
- **The `ornament.*` attributes on MSM notes** (`ornament.date.offset`, `ornament.duration`,
  `ornament.milliseconds.date.offset`, `ornament.milliseconds.duration`, `ornament.dynamics`,
  `ornament.noteoff.shift`) are the renderer's intermediate markers, not MPM inputs — do not put them
  in the registry as exaggerable attributes. They are written by `TemporalSpread.setOrnamentDateAtts`
  (`TemporalSpread.ts:115-168`) and `DynamicsGradient.setOrnamentDynamicsAtt`
  (`DynamicsGradient.ts:52-62`) and folded into real performance attributes afterwards. Exaggeration
  belongs on the MPM def/map attributes, before `Performance.perform` runs.
- **`OrnamentationMap.renderMillisecondsModifiersToMap` (`OrnamentationMap.ts:419-461`) is DEAD in the
  pipeline** and no test reaches it; `Performance.perform` calls its own character-identical private
  copy (`Performance.ts:877-917`, invoked at `Performance.ts:768`). Both bodies are marked FROZEN
  parity code (`OrnamentationMap.ts:29-31, :402-417`). Any behavioural verification of
  millisecond-domain exaggeration must go through `Performance.perform`, and neither body may be
  edited.
- **An ornament that appears before the first `<style>` entry in the map is skipped outright** —
  `if (style === null || …) continue` (`OrnamentationMap.ts:237`) — as is one whose `name.ref` does not
  resolve to a def in the style then in scope (`OrnamentationMap.ts:243-247`). Exaggerating a def's
  attributes changes nothing for such entries. Likewise `getOrnamentDataOf` returns null unless style
  AND def both resolve (`OrnamentationMap.ts:106-113`), so it is not a safe enumeration primitive —
  walk `size()`/`getElement(i)` instead.
- **`OrnamentDef` parses children with LAST-ONE-WINS semantics**: several `<temporalSpread>` or
  `<dynamicsGradient>` children all parse into the same single-valued field, only the last surviving
  (`OrnamentDef.ts:22-37`). The setters correspondingly loop to remove every existing child, which is
  not defensive padding (`OrnamentDef.ts:75-83, :106-114`). Hand-written MPM really can carry
  duplicates; an exaggeration pass that edits attributes in place on the FIRST matching child may be
  editing the one the parser discarded.
- **Child order is load-bearing on the serialization side**: `createDefaultOrnamentDef` sets the
  gradient BEFORE the spread specifically to fix the output order `dynamicsGradient` then
  `temporalSpread` (`OrnamentDef.ts:126-139`). Rebuilding a def via the setters reorders children.

---

## 7. Asynchrony + imprecision

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `asynchrony@date` | double | ticks ≥0; unenforced; missing ⇒ dropped | none (position) | next entry's date | **EXCLUDE** |
| `asynchrony@milliseconds.offset` | double | signed ms, unbounded; unenforced | `0.0`, linear | — | **PRIME lever** — exactly linear |
| `imprecisionMap.tuning@detuneUnit` | string enum | free string, no validation | n/a | every tuning numeric | **EXCLUDE**, carry through |
| `distribution.*@date` | double | ticks ≥0; missing ⇒ dropped | none | next map entry | **EXCLUDE** |
| `distribution.*@seed` | int | any int; `parseInt` truncates | none (selects realisation) | `RenderOptions.seed` | **EXCLUDE** (and see defect) |
| `distribution.*@milliseconds.timingBasis` | double | ms, must be >0; fallback only for ABSENT | **none** (grain, not magnitude) | the width attrs (timing domain) | **EXCLUDE** — but couples (hazard) |
| `distribution.uniform@limit.lower` / `@limit.upper` | double | domain units; ordering unenforced | `0.0`, linear | each other | **YES**, exact under joint scaling |
| `distribution.gaussian@deviation.standard` | double | ℝ, sign irrelevant | `0.0`, linear | the two limits | **YES**, joint triple only |
| `distribution.gaussian@limit.lower` / `@limit.upper` | double | REJECTION bounds, unvalidated | `0.0` as part of the triple | `@deviation.standard` | joint triple only |
| `distribution.triangular@limit.lower` / `@limit.upper` / `@mode` / `@clip.lower` / `@clip.upper` | double | domain units; unvalidated; clips de-facto required | `0.0`, linear | all five together | **YES**, exact (homogeneous deg. 1) |
| `distribution.correlated.brownianNoise@stepWidth.max` | double | ≥0 per step | `0.0` (increment), full neutral needs limits=0 | `@limit.lower/.upper` | **YES**, joint |
| `…brownianNoise@limit.lower` / `@limit.upper` | double | reflecting walls, unvalidated | `0.0` | `@stepWidth.max` | **YES**, joint |
| `…compensatingTriangle@degreeOfCorrelation` | double | dimensionless, must be >0 | `1.0` (SHAPE parameter) | — | **EXCLUDE** from magnitude |
| `…compensatingTriangle@limit.*` / `@clip.*` | double | domain units | `0.0`, linear | each other | **YES**, joint, `doc` fixed |
| `distribution.list/measurement@value` | double | verbatim values, no limits apply | `0.0`, linear | sibling measurements | **YES** — trivially exact, ideal fixture |

### Per-attribute detail

#### `asynchronyMap/asynchrony@date`

*Data field:* `KeyValue` key of `GenericMap.elements` (no data class). *Paired with:* implicitly the
following `<asynchrony>`'s `@date` (segment end).

**Domain.** Symbolic ticks in the performance's PPQ; ≥ 0 by convention. Enforced NOWHERE — parsed with
bare `parseFloat`. An `<asynchrony>` with no `@date` is silently dropped from the parsed map (but
stays in the XML).

**Neutral.** No neutral — this is a timeline position, not a magnitude. EXCLUDE from exaggeration
(`DESIGN.md` §3 "Explicitly excluded … dates"). Changing it would violate R5 (symbolic invariance).

**Exaggerability.** Not exaggerable. Only role in this family: it delimits the span an offset is in
force for (the next entry's date ends it), so scaling it would re-segment the piece.

**Evidence.** parse: `src/mpm/elements/maps/GenericMap.ts:143-146` (date attribute → `KeyValue` key;
children without it are skipped); write: `src/mpm/elements/maps/AsynchronyMap.ts:35`; consumption as
segment boundary: `src/mpm/elements/maps/AsynchronyMap.ts:70-73,78,93`.

#### `asynchronyMap/asynchrony@milliseconds.offset`

*Data field:* none — no data class; read straight off the `Attribute`. *Paired with:* none
(single-attribute instruction; no transition partner, no def indirection).

**Domain.** Signed real, milliseconds; unbounded in both directions. Enforced NOWHERE at parse time
(plain `parseFloat`; a missing attribute yields `getAttributeValue()=''` → NaN, which then NaN-poisons
every `milliseconds.date` in the segment). The renderer imposes two one-sided clamps at apply time
only: shifted start floored at 0, shifted end floored at start+1 ms.

**Neutral.** `0.0`, linear scale space (T(x)=x). Justified twice by the renderer: (a) `getAsynchronyAt`
returns literal 0.0 when no `<asynchrony>` is in force, i.e. "no instruction" ≡ offset 0
(`AsynchronyMap.ts:42,44`); (b) the only consumption sites are the additions
`parseFloat(att.getValue()) + offset` (`AsynchronyMap.ts:81`) and
`parseFloat(att.getValue()) + offset` (`AsynchronyMap.ts:96`), which are the identity on both
`milliseconds.date` and `milliseconds.date.end` exactly at offset = 0.

**Exaggerability.** PRIME exaggerable attribute of this family. `x' = s·x`, exact: the rendered shift
is exactly linear in the attribute value (`AsynchronyMap.ts:81`), so P1/P2/P4/P5 hold in the document
and (modulo the clamps below) in the render. Realistic authored values are ±5…±60 ms; s ∈ [0,3] is
musically meaningful, above roughly ±150 ms the part stops reading as "ahead of/behind the beat" and
becomes an audible echo. HAZARD (render-side asymmetry, not document-side): negative offsets saturate
at t=0 for notes near the start (`AsynchronyMap.ts:81`) and short notes get their duration crushed to
the 1 ms floor (`:97`), so |Δ| growth is monotone in the document but can saturate in the render.

**Evidence.** parse/read: `src/mpm/elements/maps/AsynchronyMap.ts:45` (`getAsynchronyAt`), `:74`
(renderer); write: `:36`; consumption: `:78-84` (start shift, floored at 0 on `:81`) and `:91-100`
(end shift, floored at `startDateMs+1` on `:97`); call sites:
`src/mpm/elements/Performance.ts:544,750,756,760,765`.

#### `imprecisionMap.tuning@detuneUnit` (map element attribute, not a dated entry)

*Data field:* none (`ImprecisionMap.getDetuneUnit`). *Type:* string enum (`'cents' | 'Hz'`; the setter
normalises `'Hertz'`→`'Hz'`, any other spelling stored verbatim). *Paired with:* every numeric
attribute of an `imprecisionMap.tuning`.

**Domain.** Free string; no validation. Enforced NOWHERE.

**Neutral.** Not numeric → no neutral, EXCLUDE. Listed because it is the only thing that gives the
tuning-domain numbers (`limit.*`, `clip.*`, `mode`, `deviation.standard`, `stepWidth.max`,
`measurement@value`) a unit, and because the renderer never reads it: the offsets are added to
`tuning.offset` unconverted whatever the unit says.

**Exaggerability.** Not exaggerable. But an exaggeration engine MUST carry it through untouched and use
it for any unit-aware clamp option (e.g. "never exceed ±50 cents"), since the number alone is
ambiguous.

**Evidence.** `src/mpm/elements/maps/ImprecisionMap.ts:89-97` (`setDetuneUnit`/`getDetuneUnit` — the
only two references in the whole tree; grep for `'detuneUnit'` over `src` returns nothing else);
tuning-domain apply path that ignores it: `:435-445`.

#### `distribution.{uniform|gaussian|triangular|correlated.brownianNoise|correlated.compensatingTriangle|list}@date`

*Data field:* `DistributionData.startDate` / `.endDate`. *Paired with:* the following map entry's
`@date` (implicit `endDate`).

**Domain.** Symbolic ticks ≥ 0; enforced NOWHERE (`parseFloat`). Missing `@date` ⇒ the distribution is
dropped from the parsed map (`GenericMap.ts:145`) although it stays in the serialized XML.

**Neutral.** No neutral — timeline position. EXCLUDE (same rationale as `asynchrony@date`).

**Exaggerability.** Not exaggerable. Note the extra role at `ImprecisionMap.ts:509-513`:
`getHandoverValue` reads the *next* distribution's `milliseconds.date` attribute (not `@date`) off its
own element — an attribute the MPM does not normally carry, so the handover usually returns null and
the sequence restarts.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:56-57` (`startDate`); segment
start test: `src/mpm/elements/maps/ImprecisionMap.ts:386`; segment end derived from the NEXT map entry
of any kind: `:212`; also read as milliseconds anchor for correlated handover: `:509-513`.

#### `distribution.*@seed`

*Data field:* `DistributionData.seed`. *Type:* int (`parseInt`). *Paired with:* `RenderOptions.seed`
(`src/mpm/RenderOptions.ts:22`, `deriveSeed` `:68-74`) — the fallback used only where `@seed` is
absent.

**Domain.** Any 32-bit-ish integer; Mulberry32 state. Enforced NOWHERE — `parseInt` truncates
(`'42.9'`→42) and accepts prefixes (`'0x10'`→16). seed=0 is accepted by `setSeed` (the `|| 1` guard
exists only on the field initializer, `RandomNumberProvider.ts:52`).

**Neutral.** No neutral point: the seed selects *which* realisation is drawn, not how large it is.
EXCLUDE from exaggeration — scaling it does not scale any deviation, it re-rolls the performance.
Absent seed ⇒ `Math.random()` seeding ⇒ nondeterministic render (charter-exempt from byte comparison).

**Exaggerability.** Not exaggerable, and actively dangerous to touch: it is the only thing that makes a
render reproducible. CRITICAL: on the two correlated distributions a present `@seed` currently renders
NaN (see hazards) — do not build exaggeration fixtures on seeded
brownianNoise/compensatingTriangle.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:62-63`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:109,125,145,163,187`; consumption: `:352`
(`if (dd.seed !== null) random.setSeed(dd.seed)`, MPM seed wins over `options.seed` at `:353-354`) →
`src/supplementary/RandomNumberProvider.ts:186-190`.

#### `distribution.*@milliseconds.timingBasis`

Parsed for all six types; written by the brownianNoise, compensatingTriangle and list writers.
*Data field:* `DistributionData.millisecondsTimingBasis`. *Paired with:* `limit.lower`/`limit.upper`
(uniform, gaussian, brownianNoise), `clip.lower`/`clip.upper` (triangular kinds),
`measurement@value` (list) — via the timing-domain derivation.

**Domain.** Milliseconds, must be > 0. Enforced only PARTIALLY and only for the absent case: the
fallback at `ImprecisionMap.ts:378-379` substitutes 100.0 when the field is null *or* the
timing-domain derivation produced ≤ 0. A value that is PRESENT and 0 skips the fallback entirely →
index = msDate/0 → NaN or Infinity → `OutOfRangeError` from
`RandomNumberProvider.requireUsableIndex` (verified: throws "RandomNumberProvider.getValue: NaN is not
a usable index"). A PRESENT negative value also skips the fallback and silently degenerates the
distribution to a constant offset (index clamped to 0 by `getValue`'s `Math.max(0,index)`, so every
note gets `series[0]` — verified: all four probe notes shifted by the identical 4.0441 ms). Upper
bound: msDate/basis must stay ≤ `MAX_INDEX = 1e7`.

**Neutral.** NO neutral exists. This is a sampling *rate/grain* parameter
(`index = millisecondsDate / basis`), not a deviation from a neutral performance: raising it makes
neighbouring notes draw from nearby indices (smoother, more correlated imprecision), lowering it
decorrelates them. 100.0 is a fallback default, NOT a neutral. EXCLUDE from the magnitude dimension. If
a separate "grain" knob is ever wanted, the only defensible space is log around the document's own
value (identity at s=1) with a hard positivity guard — there is no principled fixed centre.

**Exaggerability.** Not exaggerable as a magnitude. CRITICAL COUPLING for everything that is: in the
TIMING domain only, an ABSENT `milliseconds.timingBasis` is derived from the very attributes
exaggeration scales — `upper−lower` for uniform/gaussian/brownianNoise (`:363`),
`clip.upper−clip.lower` for the two triangular kinds (`:367`), `max−min` of the list (`:370-371`).
Scaling those therefore also rescales the sampling grid and re-indexes the entire random sequence, so
the rendered offsets are NOT s× the originals (verified: ±20 → ±40 gives 4.04→8.09 at index 0, then
1.05→−11.1, i.e. non-proportional). The derived value is written to the `DistributionData` object
only, never back to the XML (`:363`), so the fix is for the exaggeration applier to materialise the
derived basis as an explicit attribute before scaling — or to document the grain change.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:84-86`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:162,186,193`; fallback/derivation: `:356-380`; consumption as
index divisor: `:400` (timing), `:420` (toneduration), `:430` (dynamics), `:441` (tuning), `:460`
(deferred note-end pass), `:513` (correlated handover); index guard:
`src/supplementary/RandomNumberProvider.ts:27,251-256,272-284`.

#### `distribution.uniform@limit.lower`

*Data field:* `DistributionData.lowerLimit`. *Paired with:* `distribution.uniform@limit.upper` (must
scale by the same s).

**Domain.** Real, in domain units (ms for timing/toneduration, MIDI velocity units for dynamics,
`detuneUnit` units for tuning). Expected ≤ `limit.upper`; ordering enforced NOWHERE (a reversed pair
just yields a descending-parameterised but still valid uniform). Missing ⇒ null passed into the
factory and coerced to 0 in the arithmetic.

**Neutral.** `0.0`, linear scale space. The renderer's uniform draw is `d = r·(upper−lower) + lower`
(`RandomNumberProvider.ts:310`); at lower = upper = 0 every draw is 0 and `addOffsetsToAttributes`
adds 0 (`ImprecisionMap.ts:640-643`), i.e. the exact identity. Neutral is per-endpoint 0, not "the
pair's midpoint": the drawn quantity IS a deviation from the notated performance, so a biased pair such
as [5,25] encodes 15 ms systematic lateness plus ±10 ms jitter and exaggeration should scale both
parts.

**Exaggerability.** Fully exaggerable, `x' = s·x`, and EXACT: scaling `limit.lower` and `limit.upper`
jointly by s scales every drawn value by exactly s for the same PRNG draws (verified: difference
`u1(i) − s·u2(i) = 0` for all i). Requires s ≥ 0 (s < 0 inverts the pair; s = 0 is well-defined and
legitimately means "remove all imprecision", unlike log-space dimensions). Only escape hatch: the
timing-domain grid derivation (see `milliseconds.timingBasis`).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:65-66`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:107`; factory: `:297-300` →
`src/supplementary/RandomNumberProvider.ts:91-99`; draw: `:310`; application of the drawn offset:
`src/mpm/elements/maps/ImprecisionMap.ts:634-646`.

#### `distribution.uniform@limit.upper`

*Data field:* `DistributionData.upperLimit`. *Paired with:* `distribution.uniform@limit.lower`.

**Domain.** As `limit.lower`; expected ≥ it, unenforced.

**Neutral.** `0.0`, linear — same citation: `d = r·(upper−lower)+lower`,
`RandomNumberProvider.ts:310`.

**Exaggerability.** Fully exaggerable, `x' = s·x`, exact (see `limit.lower`). Domain closure holds for
s ≥ 0.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:68-69`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:108`; factory `:297-300`; draw
`src/supplementary/RandomNumberProvider.ts:310`; timing-basis derivation that also consumes it:
`src/mpm/elements/maps/ImprecisionMap.ts:363`.

#### `distribution.gaussian@deviation.standard`

*Data field:* `DistributionData.standardDeviation`. *Paired with:*
`distribution.gaussian@limit.lower` and `@limit.upper` (all three scale together).

**Domain.** Real; semantically ≥ 0 but the sign is irrelevant (the normal deviate is symmetric) and
negatives are accepted silently. Enforced NOWHERE.

**Neutral.** `0.0`, linear scale space. The draw is `d = nextGaussianRandom() · standardDeviation`
(`RandomNumberProvider.ts:315`), so std = 0 gives exactly 0 — verified even in the pathological case
where the limits exclude 0 (the do/while then exhausts its 10000-attempt safety break at `:316` and
still returns 0).

**Exaggerability.** Fully exaggerable, `x' = s·x` — but ONLY jointly with `limit.lower`/`limit.upper`.
Verified: scaling all three by s reproduces s× the base sequence exactly (differences 0); scaling
`deviation.standard` alone changes the truncation ratio, changes how many draws the rejection loop
consumes, and desynchronises the whole sequence (probe: base [2.84, −12.49, −1.03, …] vs
std-only-scaled [7.09, −2.59, 4.90, …] — not 2.5× anything). Musically: 3–15 ms (timing), 2–8 velocity
units (dynamics) are typical; s ∈ [0,3].

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:80-82`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:122`; factory: `:303-307` →
`src/supplementary/RandomNumberProvider.ts:101-111`; draw + rejection loop: `:312-319`.

#### `distribution.gaussian@limit.lower`

*Data field:* `DistributionData.lowerLimit`. *Paired with:*
`distribution.gaussian@deviation.standard`, `@limit.upper`.

**Domain.** Real, domain units. These are REJECTION bounds, not a support parameterisation:
`withinLimits(d) = d ≤ upper && d ≥ lower` (`RandomNumberProvider.ts:341-343`) gates the resample loop.
No ordering or width validation anywhere; a degenerate pair makes the loop run its full 10000 attempts
and then return an out-of-limits value (`:316`).

**Neutral.** `0.0`, linear — but only as part of the triple. (0,0) with `deviation.standard` > 0 is NOT
neutral: it makes every draw fail `withinLimits`, burns 20000 `nextRandom` calls per value, and
returns garbage. The neutral configuration of a gaussian distribution is
`deviation.standard = limit.lower = limit.upper = 0`.

**Exaggerability.** Exaggerable only in lockstep with `deviation.standard` and `limit.upper` (exact
under joint scaling, verified). Never scale independently.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:65-66`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:123`; factory `:303-307`; rejection:
`src/supplementary/RandomNumberProvider.ts:313-318,341-343`; timing-basis derivation:
`src/mpm/elements/maps/ImprecisionMap.ts:363`.

#### `distribution.gaussian@limit.upper`

*Data field:* `DistributionData.upperLimit`. *Paired with:*
`distribution.gaussian@deviation.standard`, `@limit.lower`.

**Domain.** As `@limit.lower` — rejection bound, unvalidated.

**Neutral.** `0.0`, linear, only as part of the (`deviation.standard`, `limit.lower`, `limit.upper`)
triple; same reasoning and citations as `@limit.lower`.

**Exaggerability.** As `@limit.lower`: joint scaling only.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:68-69`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:124`; rejection:
`src/supplementary/RandomNumberProvider.ts:341-343` used at `:317`.

#### `distribution.triangular@limit.lower`

*Data field:* `DistributionData.lowerLimit`. *Paired with:* `distribution.triangular@limit.upper`,
`@mode`, `@clip.lower`, `@clip.upper`.

**Domain.** Real, domain units; base of the triangle. lower === upper short-circuits to
`return upperLimit` (`RandomNumberProvider.ts:346`). No ordering enforcement anywhere.

**Neutral.** `0.0`, linear. With `limit.lower = limit.upper = mode = 0`, `triangularDistribution`
returns `upperLimit = 0` (`RandomNumberProvider.ts:346`) and `clip(0)` with both clips 0 returns 0
(`:335-339`) — exact identity.

**Exaggerability.** Fully exaggerable, `x' = s·x`, EXACT under joint scaling of all five triangular
attributes (`limit.lower`, `limit.upper`, `mode`, `clip.lower`, `clip.upper`):
`triangularDistribution` is positively homogeneous of degree 1 — `scale = s·scale`, `ca = s·ca`,
`F = ca/scale` unchanged (so the same branch is taken for the same draw), and both branches carry a
single sqrt of an s²-scaled product (`RandomNumberProvider.ts:347-352`); `clip` is homogeneous too
when the clips scale (`:335-339`). Verified: `t3(i) − s·t4(i) ≤ 4e-15`. Requires s ≥ 0.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:65-66`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:140`; factory: `:310-316` →
`src/supplementary/RandomNumberProvider.ts:113-127`; draw: `:321`
(`clip ∘ triangularDistribution`), `:345-353`.

#### `distribution.triangular@limit.upper`

*Data field:* `DistributionData.upperLimit`. *Paired with:* `@limit.lower`, `@mode`, `@clip.lower`,
`@clip.upper`.

**Domain.** Real, domain units; unvalidated relative to `limit.lower` and `mode`.

**Neutral.** `0.0`, linear — same identity argument (`RandomNumberProvider.ts:346` + clip `:335-339`).

**Exaggerability.** As `@limit.lower` — exact under joint scaling of the five.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:68-69`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:141`; draw: `src/supplementary/RandomNumberProvider.ts:345-353`.

#### `distribution.triangular@mode`

*Data field:* `DistributionData.mode`. *Paired with:* `@limit.lower`, `@limit.upper`, `@clip.lower`,
`@clip.upper`.

**Domain.** Real, domain units; SHOULD lie in [`limit.lower`, `limit.upper`] but this is enforced
NOWHERE. Outside it the maths does not blow up, it just degenerates: mode > upper ⇒ F = ca/scale > 1 ⇒
the first branch is always taken; mode < lower ⇒ F < 0 ⇒ the second branch is always taken. No NaN
either way.

**Neutral.** `0.0`, linear — the peak of the triangle, in the same signed offset space as the limits.
Neutral 0 is what makes an unbiased jitter; a non-zero mode is a systematic bias worth exaggerating
along with everything else.

**Exaggerability.** Fully exaggerable, `x' = s·x`, exact only when scaled together with the limits and
clips (the homogeneity argument needs `ca` and `scale` to scale by the same factor; scaling mode alone
changes F, hence the branch, hence the whole sequence).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:77-78`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:142`; factory: `:310-316` →
`src/supplementary/RandomNumberProvider.ts:113-127`; use: `:321` → `:345-352`
(`ca = mode − lowerLimit`, `F = ca/scale`, `upperLimit − sqrt((1−rand)·scale·(upperLimit − mode))`).

#### `distribution.triangular@clip.lower`

*Data field:* `DistributionData.lowerClip`. *Paired with:* `@clip.upper` (+ the limits and mode).

**Domain.** Real, domain units; the hard floor applied after sampling. Expected ≤ `clip.upper`;
enforced NOWHERE — a reversed pair makes `clip()` binary-valued ({clip.upper, clip.lower} only), since
`d > highCut` is tested first (`RandomNumberProvider.ts:336-338`). DE FACTO REQUIRED: if the attribute
is absent, `DistributionData` leaves `lowerClip = null`, `ImprecisionMap` passes it through a non-null
assertion (`:314`), and `clip()` compares against null (coerced to 0) and RETURNS null — every offset
becomes null and the whole distribution silently renders as no-op (verified end-to-end: dates stayed
0/500/1000/1500).

**Neutral.** `0.0`, linear — with all five triangular attributes at 0 the clip is the identity on the
already-zero draw (`RandomNumberProvider.ts:335-339`).

**Exaggerability.** Fully exaggerable, `x' = s·x`, and MUST be scaled with the limits and mode —
otherwise the clip stops tracking the widened triangle and the distribution piles up on the (unscaled)
clip walls, which is a shape change, not an exaggeration. In the timing domain the clips are also what
an absent `milliseconds.timingBasis` is derived from (`ImprecisionMap.ts:367`).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:71-72`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:143`; factory: `:310-316` →
`src/supplementary/RandomNumberProvider.ts:113-127` (`lowCut`); apply: `:321` → `:335-339`.

#### `distribution.triangular@clip.upper`

*Data field:* `DistributionData.upperClip`. *Paired with:* `@clip.lower` (+ the limits and mode).

**Domain.** As `@clip.lower`; hard ceiling, tested first inside `clip()`. Same
absent-⇒-null-⇒-silent-no-op trap.

**Neutral.** `0.0`, linear (`RandomNumberProvider.ts:335-339`).

**Exaggerability.** As `@clip.lower` — joint scaling with the other four.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:74-75`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:144`; apply: `src/supplementary/RandomNumberProvider.ts:336`;
timing-basis derivation: `src/mpm/elements/maps/ImprecisionMap.ts:367`.

#### `distribution.correlated.brownianNoise@stepWidth.max`

*Data field:* `DistributionData.maxStepWidth`. *Paired with:*
`distribution.correlated.brownianNoise@limit.lower`, `@limit.upper`.

**Domain.** Real ≥ 0, domain units per step; the half-width of the uniform increment
(`(rand − 0.5) · 2 · maxStepWidth`). Enforced NOWHERE; a negative value is merely a mirrored increment.

**Neutral.** `0.0` for the *increment*, linear scale space — at 0 the walk never moves and the series
is frozen at its initial value (`RandomNumberProvider.ts:369-381`). NOTE the subtlety: 0 does NOT mean
"no imprecision", it means "a constant offset for the whole span", because the initial value comes from
the factory draw `rand·(upper−lower)+lower` (`:141-143`) or from the handover
(`ImprecisionMap.ts:319-326`). The distribution's true neutral configuration is
`stepWidth.max = limit.lower = limit.upper = 0`, which forces `firstValue = 0` and every step to 0.

**Exaggerability.** Fully exaggerable, `x' = s·x`, EXACT under joint scaling with
`limit.lower`/`limit.upper`: `firstValue`, every increment, the rejection test and `setInitialValue`'s
clamp are all homogeneous of degree 1 (verified: `b1(i) − s·b2(i) = 0` for all i). Scaling
`stepWidth.max` alone raises the rejection rate at the walls and desynchronises the draw sequence.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:92-93`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:159`; factory: `:320-324` →
`src/supplementary/RandomNumberProvider.ts:129-146`; walk: `:369-381` (rejection-resampled until
`withinLimits`, with a 10000-attempt clamp escape at `:375-378`).

#### `distribution.correlated.brownianNoise@limit.lower`

*Data field:* `DistributionData.lowerLimit`. *Paired with:*
`distribution.correlated.brownianNoise@stepWidth.max`, `@limit.upper`.

**Domain.** Real, domain units; a reflecting/rejection wall for the random walk (`withinLimits` gates
the resample loop) and a hard clamp for the handover value (`setInitialValue`,
`RandomNumberProvider.ts:228-232`). Unvalidated.

**Neutral.** `0.0`, linear (with `stepWidth.max` and `limit.upper` at 0 the whole walk is identically
0; `RandomNumberProvider.ts:141-143,369-381`).

**Exaggerability.** Exaggerable only jointly with `stepWidth.max` and `limit.upper` (exact then).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:65-66`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:160`; factory: `:320-324` →
`src/supplementary/RandomNumberProvider.ts:129-146`; walls: `:341-343` used at `:379`; handover clamp:
`:228-232`; timing-basis derivation: `src/mpm/elements/maps/ImprecisionMap.ts:363`.

#### `distribution.correlated.brownianNoise@limit.upper`

*Data field:* `DistributionData.upperLimit`. *Paired with:* `@stepWidth.max`, `@limit.lower`.

**Domain.** As `@limit.lower`.

**Neutral.** `0.0`, linear; same citations.

**Exaggerability.** Exaggerable jointly with `stepWidth.max` and `limit.lower` (exact).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:68-69`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:161`; factory scale for the initial draw:
`src/supplementary/RandomNumberProvider.ts:141-143`; walls `:341-343`.

#### `distribution.correlated.compensatingTriangle@degreeOfCorrelation`

*Data field:* `DistributionData.degreeOfCorrelation`. *Paired with:* none for scaling; it is the one
attribute here that stays fixed while the value-space attributes scale.

**Domain.** DIMENSIONLESS, must be > 0. `newLower = prev − (prev − lower)/doc`,
`newUpper = prev + (upper − prev)/doc` (`RandomNumberProvider.ts:357-360`). doc = 0 divides by zero and
yields NaN for every value after the first (verified: [0, NaN, NaN]); doc < 0 inverts the interval and
the series pins to a clip bound (verified: doc = −2 → [0, 15, 15, 15]); doc → ∞ freezes the walk
(verified: doc = 1000 → steps of ~0.007). Enforced ASYMMETRICALLY: the writer clamps to
`Math.max(x, 0.0)` — which still admits exactly the NaN-producing 0 — while the parser applies no
clamp at all.

**Neutral.** `1.0`, and it is a SHAPE parameter, not a magnitude. Justification from the renderer: at
doc = 1 the two expressions collapse to `newLower = lowerLimit` and `newUpper = upperLimit` exactly
(`RandomNumberProvider.ts:358-360`), i.e. the compensating triangle degenerates into a plain triangular
draw over the full limit range with its mode at the previous value — no correlation narrowing at all.
Below 1 the step range over-expands past the limits and is then clamped (`:363-366`), pushing values
onto the walls; above 1 the range contracts around the previous value.

**Exaggerability.** EXCLUDE from the imprecision magnitude dimension: raising or lowering it does not
scale any deviation, it changes the temporal smoothness of the noise (and the whole series remains
exactly homogeneous in the limits/clips with doc held fixed — verified: `cs(i) − s·cb(i) ≤ 3e-15`). If
a separate "correlation" knob is ever exposed, the space is log-around-1 (`doc' = doc^s`) on (0, ∞),
with a hard guard rejecting doc ≤ 0 — the transform must never be allowed to land on 0.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:88-90` (no clamp); write with the
`Math.max(x,0)` clamp: `src/mpm/elements/maps/ImprecisionMap.ts:179-181`; factory: `:330-336` →
`src/supplementary/RandomNumberProvider.ts:148-169`; step: `:355-367`.

#### `distribution.correlated.compensatingTriangle@limit.lower`

*Data field:* `DistributionData.lowerLimit`. *Paired with:* `@limit.upper`, `@clip.lower`,
`@clip.upper`.

**Domain.** Real, domain units; the outer range the compensation interpolates against and a hard clamp
on the result (`RandomNumberProvider.ts:363-364`). Unvalidated.

**Neutral.** `0.0`, linear — with limits and clips all 0 the triangular step degenerates
(upper === lower ⇒ return upperLimit = 0, `:346`) and `clip(0) = 0`.

**Exaggerability.** Fully exaggerable, `x' = s·x`, exact when `limit.lower`, `limit.upper`,
`clip.lower`, `clip.upper` (and the handover seed value) scale together and `degreeOfCorrelation` stays
fixed (verified to 3e-15).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:65-66`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:182`; factory: `:330-336` →
`src/supplementary/RandomNumberProvider.ts:148-169`; use: `:357-366`; handover clamp via clip:
`:233-235`.

#### `distribution.correlated.compensatingTriangle@limit.upper`

*Data field:* `DistributionData.upperLimit`. *Paired with:* `@limit.lower`, `@clip.lower`,
`@clip.upper`.

**Domain.** As `@limit.lower`.

**Neutral.** `0.0`, linear; same citations (`RandomNumberProvider.ts:346,357-366`).

**Exaggerability.** As `@limit.lower` — joint scaling, exact.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:68-69`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:183`; use: `src/supplementary/RandomNumberProvider.ts:359,365`.

#### `distribution.correlated.compensatingTriangle@clip.lower`

*Data field:* `DistributionData.lowerClip`. *Paired with:* `@clip.upper`, `@limit.lower`,
`@limit.upper`.

**Domain.** Real, domain units; hard floor applied after the compensation clamp, and the range the
FIRST value is drawn from in the factory (`rand·(highCut − lowCut) + lowCut`,
`RandomNumberProvider.ts:164-166`). Same absent-⇒-null trap as the triangular clips: without the
attribute every value is null and the distribution silently renders as a no-op (verified).

**Neutral.** `0.0`, linear (`RandomNumberProvider.ts:335-339`).

**Exaggerability.** Fully exaggerable, `x' = s·x`, jointly with the limits and `clip.upper` (exact).
Note it is doubly load-bearing here: it sets both the clip and the starting point of the correlated
series.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:71-72`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:184`; factory initial draw:
`src/supplementary/RandomNumberProvider.ts:164-166`; apply: `:327` → `:335-339`; timing-basis
derivation: `src/mpm/elements/maps/ImprecisionMap.ts:367`.

#### `distribution.correlated.compensatingTriangle@clip.upper`

*Data field:* `DistributionData.upperClip`. *Paired with:* `@clip.lower`, `@limit.lower`,
`@limit.upper`.

**Domain.** As `@clip.lower`; also the upper end of the factory's initial draw range.

**Neutral.** `0.0`, linear (`RandomNumberProvider.ts:335-339,164-166`).

**Exaggerability.** As `@clip.lower` — joint scaling, exact.

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:74-75`; write:
`src/mpm/elements/maps/ImprecisionMap.ts:185`; apply: `src/supplementary/RandomNumberProvider.ts:336`;
initial draw: `:164-166`.

#### `distribution.list/measurement@value`

*Data field:* `DistributionData.distributionList[]`. *Paired with:* the sibling `<measurement>` values
(the whole list scales as one).

**Domain.** Real, domain units; an explicit, verbatim value list. No limits, clips, mode or deviation
apply — the provider stores the array as the series and returns `series[index % length]` untouched
(`RandomNumberProvider.ts:171-177,279-280`); a fractional index linearly interpolates between two
neighbouring entries (`:276,293-303`). Any `limit.*`/`clip.*`/`mode` attributes on a
`distribution.list` are parsed (`DistributionData` parses unconditionally) and then IGNORED.

**Neutral.** `0.0`, linear. The value is delivered to `addOffsetsToAttributes` unmodified, so a list of
zeros is the exact identity (`ImprecisionMap.ts:634-646`).

**Exaggerability.** Fully exaggerable, `x' = s·x`, trivially exact (the values are returned verbatim,
so the rendered offsets are exactly s× the originals — no PRNG involvement at all, making
`distribution.list` the ideal fixture family for deterministic exaggeration tests). Caveat: in the
timing domain with no explicit `milliseconds.timingBasis`, the grid is `max−min` of the list, so
scaling also rescales the grid (`ImprecisionMap.ts:369-372`).

**Evidence.** parse: `src/mpm/elements/maps/data/DistributionData.ts:95-100` (child `<measurement>`
elements, `@value` → `distributionList`); write: `src/mpm/elements/maps/ImprecisionMap.ts:191-195`
(`addDistributionList` takes the prepared element); factory: `:341-343` →
`src/supplementary/RandomNumberProvider.ts:171-177`; read: `:279-280`; min/max used for the
timing-basis derivation: `src/mpm/elements/maps/data/DistributionData.ts:124-136` via
`src/mpm/elements/maps/ImprecisionMap.ts:369-372`.

### Walker notes — asynchrony + imprecision

**Reaching the maps.** Both map types live only in `<dated>` blocks — this family has NO styles/defs
(`src/mpm/names.ts:21-26` declares only articulation/ornamentation/dynamics/metricalAccentuation/
tempo/rubato styles), so every number is on a dated map element and there is no def-level indirection
to follow. Global: `performance.getGlobal()!.getDated()!.getMap(name)`
(`src/mpm/elements/Performance.ts:443-452`). Per part:
`for (const part of performance.getAllParts()) part.getDated()!.getMap(name)`
(`Performance.ts:225,600-628`; `Part.getDated` at `src/mpm/elements/Part.ts:137`; `Dated.getMap` at
`src/mpm/elements/Dated.ts:123`). Map-type keys are the literal local names:
`ASYNCHRONY_MAP='asynchronyMap'`, `IMPRECISION_MAP_TIMING='imprecisionMap.timing'`, `.dynamics`,
`.toneduration`, `.tuning` (`src/mpm/names.ts:36-41`) — the imprecision domain is encoded in the
ELEMENT NAME, not an attribute (`ImprecisionMap.getDomain`,
`src/mpm/elements/maps/ImprecisionMap.ts:84-87`), and `ImprecisionMap.setDomain` is a deliberate no-op
stub (`:78-82`), so a transform can never retype a map in place. Part maps shadow global ones wholesale
per map type (`Performance.ts:600-628`); a part without its own asynchronyMap inherits the global one,
which matters if exaggeration is ever scoped per part.

**Classes / files.** `AsynchronyMap` (`src/mpm/elements/maps/AsynchronyMap.ts:19`, factory registered
`:116`), `ImprecisionMap` (`src/mpm/elements/maps/ImprecisionMap.ts:38`, four domain factories
`:660-671`), `DistributionData` (`src/mpm/elements/maps/data/DistributionData.ts:23`, type constants
`:24-29`). Entry iteration: `GenericMap.getAllElements()`/`getElement(i)`/`size()`; each entry is a
`KeyValue<date, Element>` whose value is the live `<asynchrony>` or `<distribution.*>` element.

**Reading a distribution.** `imprecisionMap.getDistributionDataOf(i)`
(`ImprecisionMap.ts:206-216`) returns a `DistributionData` snapshot with `endDate` filled from the
NEXT map entry of any kind (not the next distribution). `DistributionData` is a read-only snapshot with
no setters — its `xml` field (`DistributionData.ts:53`) is the live element, so an exaggeration applier
must write through the XML, and should use `attribute(name, el)!.setValue(String(v))`
(`src/xml/tree.ts:435-438` for the reader; `Attribute.setValue`) rather than
`el.addAttribute(new Attribute(...))`, because `addAttribute` removes-then-pushes
(`src/xml/XomTypes.ts:492-500`) and therefore MOVES the attribute to the end of the serialized
attribute list, breaking byte-identity at s = 1 (`DESIGN.md` property P1).

**Walk the XML, not only the parsed map.** `GenericMap.parseData` skips any child without a `@date`
attribute (`src/mpm/elements/maps/GenericMap.ts:143-146`) while leaving it in the document, so a
transform that iterates `getAllElements()` will silently miss such an entry and re-serialize it
unscaled. For a text-in/text-out transform, enumerate the map element's child elements directly and
match local names against
`DistributionData.UNIFORM/GAUSSIAN/TRIANGULAR/BROWNIAN/COMPENSATING_TRIANGLE/LIST`
(`DistributionData.ts:24-29`) plus `'asynchrony'`.

**Render order** (for reasoning about interactions, not for the transform itself). Global: asynchrony
then imprecision.timing on the pedal map only (`Performance.ts:544-546`). Per part: asynchrony on
pedal/channelVolume/position/score, then articulation and ornamentation millisecond modifiers, then
the four imprecision maps in the order timing, dynamics, toneduration, tuning
(`Performance.ts:749-777`), all with `shakePolyphonicPart = true`. Asynchrony operates purely on
already-computed `milliseconds.date`/`.date.end` (`AsynchronyMap.ts:63-109`), so it composes additively
with imprecision.timing.

### Hazards — asynchrony + imprecision

- **CONFIRMED DEFECT — a `seed` on either correlated distribution renders NaN for every affected
  note.** `ImprecisionMap.ts:352` calls `random.setSeed(dd.seed)` AFTER the
  brownianNoise/compensatingTriangle branches have already called `doHandover` (`:325, :337`);
  `setSeed` wipes the memoised series (`RandomNumberProvider.ts:186-190`, whose own doc-comment says
  the initial value "must then be restored with `setInitialValue`"), so
  `brownianNoiseDistribution`/`compensatingTriangleDistribution` read `series[-1] === undefined` and
  produce NaN, which propagates through every subsequent value and into `milliseconds.date`. Reproduced
  end-to-end against `dist/`: seeded brownianNoise → `NaN , NaN , NaN , NaN`; the same distribution
  WITHOUT `@seed` renders fine. Consequence for the exaggeration campaign: never build fixtures or
  determinism tests on seeded `distribution.correlated.*`; use `distribution.list` (verbatim, PRNG-free)
  or seeded uniform/gaussian/triangular instead. Worth a Java cross-check — Java's `ArrayList` would
  throw `IndexOutOfBounds` where TS silently yields NaN.
- **CONFIRMED TRAP — `distribution.triangular` and `distribution.correlated.compensatingTriangle`
  WITHOUT `clip.lower`/`clip.upper` silently render as a complete no-op.** `DistributionData` leaves
  `lowerClip`/`upperClip` null (`DistributionData.ts:71-75`); `ImprecisionMap` passes them through
  non-null assertions (`:314-315, :334-335`); `RandomNumberProvider.clip` compares against null
  (coerced to 0) and returns null (`:335-339`), so every offset is null and adding it is a no-op.
  Verified: a clipped triangular moved the notes to 2.14/500.54/994.14/1500.01 ms, the identical
  distribution without clips left them at exactly 0/500/1000/1500. Treat missing clips as a document
  defect (the writer API makes them mandatory: `ImprecisionMap.ts:129-147, :167-189`) — do not invent
  defaults, and do not let an exaggeration transform drop a clip attribute that scaled to 0.
- **`milliseconds.timingBasis` fallback only covers the ABSENT case.** `ImprecisionMap.ts:357` tests
  `=== null`, so a PRESENT value of 0 bypasses the 100.0 fallback and throws `OutOfRangeError` from the
  index guard (verified: "RandomNumberProvider.getValue: NaN is not a usable index"), and a PRESENT
  negative value degenerates the whole distribution to one constant offset, because `getValue` clamps
  the index with `Math.max(0, index)` (`RandomNumberProvider.ts:275`) so every note reads `series[0]`
  (verified: all notes shifted by an identical 4.0441 ms). Also bounded above: `msDate/basis` must stay
  ≤ `MAX_INDEX = 1e7` (`RandomNumberProvider.ts:27,251-256`).
- **THE ONE WAY MAGNITUDE SCALING CHANGES THE RANDOM SEQUENCE**: in the TIMING domain an absent
  `milliseconds.timingBasis` is derived from exactly the attributes exaggeration scales —
  `limit.upper − limit.lower` (uniform/gaussian/brownianNoise, `ImprecisionMap.ts:363`),
  `clip.upper − clip.lower` (both triangular kinds, `:367`), `max − min` of the measurement list
  (`:370-371`). Scaling them rescales the sampling grid and re-indexes the entire sequence, so the
  rendered offsets are NOT s× the originals (verified: ±20 → ±40 gave 4.04→8.09 at index 0 but
  1.05→−11.1 at index 1). The derived value is written to the `DistributionData` object only, never
  back to the XML (`:363`), so the clean fix is for the applier to materialise the pre-scaling derived
  basis as an explicit attribute (then everything downstream is exactly homogeneous), or to document
  the grain change as intended.
- **Gaussian limits are REJECTION bounds, not a support parameterisation**
  (`RandomNumberProvider.ts:341-343` gating the do/while at `:313-318`). Scaling `deviation.standard`
  without the limits changes the truncation ratio, changes how many `nextRandom` draws each value
  consumes, and desynchronises everything after it (verified: base [2.84, −12.49, −1.03, −7.97] vs
  std-only×2.5 [7.09, −2.59, 4.90, −5.98] — unrelated numbers). Worse, limits at (0,0) with
  `deviation.standard` > 0 make every candidate fail, burn the 10000-attempt safety break (`:316`) per
  value, and then return an out-of-limits number. Rule: scale (`deviation.standard`, `limit.lower`,
  `limit.upper`) as one atomic triple.
- **The whole family is positively homogeneous of degree 1 in its value-space attributes** — measured,
  not assumed. Joint scaling by s reproduces s× the base sequence to floating-point exactness for
  uniform (diff 0), gaussian (diff 0), triangular (≤4e-15), brownianNoise (diff 0) and
  compensatingTriangle (≤3e-15). This gives exact P1/P2/P4/P5 and free P3 domain closure — but only for
  s ≥ 0. s < 0 inverts every lower/upper pair and must be rejected at the API boundary. s = 0 is
  well-defined and meaningful here ("remove all imprecision"), unlike the log-space dimensions.
- **Writer/parser asymmetry on `degreeOfCorrelation`**: the writer clamps with `Math.max(x, 0.0)`
  (`ImprecisionMap.ts:180`) — which still admits exactly 0, the value that divides by zero and yields
  NaN (`RandomNumberProvider.ts:357-360`; verified [0, NaN, NaN]) — while the parser applies no clamp
  at all (`DistributionData.ts:88-90`), so a negative value from a document reaches the renderer and
  pins the series to a clip bound (verified doc = −2 → [0, 15, 15, 15]). Any transform touching it must
  enforce > 0 itself.
- **Parsing leniency**: this family uses plain `parseFloat`/`parseInt`
  (`DistributionData.ts:56-99`, `AsynchronyMap.ts:45,74`), NOT the strict `parseJavaDouble` that the
  style defs use (e.g. `src/mpm/elements/styles/defs/RubatoDef.ts:52`). So `'12abc'` silently becomes
  12, Java literals like `'1.0d'` become NaN, and a missing `milliseconds.offset` yields
  `parseFloat('')` = NaN (`getAttributeValue` returns `''` for a missing attribute,
  `src/xml/tree.ts:435-438`) which NaN-poisons every date in the segment. `@seed` goes through
  `parseInt`, truncating `'42.9'` to 42. A round-tripping transform should therefore preserve
  unparseable text verbatim rather than re-serializing `Number(...)` of it.
- **Clamping is asymmetric across domains and matters for how far exaggeration can usefully go.**
  TIMING floors the result at 0 (`ImprecisionMap.ts:641-642`). TONEDURATION does NOT (`:643`) — there
  is no floor at all, unlike `AsynchronyMap`'s `Math.max(ms, startDateMs + 1)`
  (`AsynchronyMap.ts:97`) — so an exaggerated negative toneduration offset can push
  `milliseconds.date.end` before `milliseconds.date`, and `Msm.renderMidi` emits the noteOff at that
  rounded value regardless (`src/msm/Msm.ts:1336-1344`). DYNAMICS offsets are unclamped in the map; the
  MIDI path compresses partwise via `fitVelocities(0,127)` (`src/msm/Msm.ts:1613-1648`) and
  `EventMaker` clamps to 0..127 (`src/midi/EventMaker.ts:441,468`), but the data path does not
  (`DESIGN.md` R6). Dynamics imprecision also requires the note to already carry `@velocity`
  (`ImprecisionMap.ts:428-429`), i.e. it only bites after the dynamics map has run.
- **TUNING is write-only in espressivo**: the offsets are added to a `tuning.offset` attribute that
  `ImprecisionMap` creates if absent (`ImprecisionMap.ts:438-444`) and that NOTHING else in `src/` ever
  reads (grep for `'tuning'` over `src` returns only `ImprecisionMap`, the map-name constants and two
  doc comments); `@detuneUnit` is likewise never consulted by the renderer. Exaggerating the tuning
  domain therefore changes the MSM output attribute only — no audible MIDI effect. Report it as
  transformed but flag the inertness so callers do not chase a silent knob.
- **Rendered imprecision is nondeterministic even with a working seed, so exaggeration must be
  validated on the DOCUMENT, never on rendered bytes.** All call sites pass
  `shakePolyphonicPart = true` (`Performance.ts:546,752,771-777`); `shakeOffsets`/`shakeTimingOffsets`
  pick the keeper with a bare `Math.random()` (`ImprecisionMap.ts:540,554`) and `shake()` re-rolls the
  rest through an unseeded triangular spanning [x/2, x] (`:608-625`). Two consequences: (a)
  `PARITY.md` §4 forbids byte-comparing imprecision output; (b) for simultaneous notes the realized
  deviation is 0.5–1.0× the scaled value — still monotone in s, but the effective exaggeration in dense
  polyphony is damped and never amplified.
- **An `imprecisionMap` with no `.domain` suffix parses fine and renders nothing**: `getDomain()`
  returns `''` and the domain switch falls through to `return` (`ImprecisionMap.ts:84-87, 261-277`) —
  yet the factory is registered for the bare name (`:659`). A distribution element whose local name
  matches none of the six constants also renders nothing (`default: continue`, `:345-347`) while still
  counting as the predecessor `dd` for the next correlated handover (`:286-292`). Report such maps as
  present-but-inert rather than transforming them silently.
- **Number and order of PRNG draws IS the output** (the randomness contract at
  `ImprecisionMap.ts:21-34`). A pure document transform does not change draw counts — with exactly two
  exceptions, both listed above: the timing-domain derived grid, and the gaussian rejection rate. Those
  are the only two paths by which scaling an attribute reindexes or redraws the sequence rather than
  simply scaling it.

---

## 8. Movement (pedal / controller positions)

| Attribute | Type | Domain (enforced where) | Neutral | Paired with | Exaggerability |
|---|---|---|---|---|---|
| `movement@date` | double | any finite; map key; missing ⇒ dropped | none (coordinate) | next entry's `@date` | **EXCLUDED** (R5, and doubly load-bearing) |
| `movement@position` | double (`Normalized`) | nominally 0..1; enforced **nowhere** | none renderer-justified | `@transition.to` | **WEAK — exclude by default** |
| `movement@transition.to` | double (`Normalized`) | as `@position`; ABSENCE is a mode switch | relation `to == position` (flat) | `@position` | as `@position`; pair-only |
| `movement@curvature` | double | [0,1] by monotonicity; **no clamp here** | `0.0` (proved linear) | `@protraction` | **MEANINGFUL**, needs own clamp |
| `movement@protraction` | double | [-1,1] by monotonicity; **no clamp here** | `0.0` (branch + limit) | `@curvature` | **BEST in family** |
| `style@date` (in a movementMap) | double | as `movement@date` | none | — | **EXCLUDED** |

### Per-attribute detail

#### `movement@date`

*Data field:* `MovementData.startDate` (and `MovementData.endDate`, derived from the *next* entry's
date). *Paired with:* the next movement's `@date`, which becomes this one's `endDate`.

**Domain.** Any finite double as parsed. `date` is the map key: `GenericMap.parseData` does a bare
`parseFloat` (`src/mpm/elements/maps/GenericMap.ts:145`) and an element WITHOUT `date` is dropped from
the map index entirely (`GenericMap.ts:143-144`, it stays in the document but is invisible to every
lookup). `MovementMap.getMovementDataOf` takes it from the key, not the attribute
(`src/mpm/elements/maps/MovementMap.ts:94`). Enforced nowhere else; the only runtime consequence of a
value is at `src/mpm/elements/maps/MovementMap.ts:178`, where `md.startDate >= 0` silently skips
negative-dated movements.

**Neutral.** None exists. `date` is a timeline coordinate, not a magnitude: it enters the render only
as the x-endpoints of the Bezier (`bezierPoint(..., startDate, endDate, ...)`,
`src/mpm/elements/maps/data/bezier.ts:101`) and as the *previous* entry's span end
(`MovementMap.getEndDate`, `src/mpm/elements/maps/MovementMap.ts:153-159`). There is no value at which
it "has no effect".

**Exaggerability.** EXCLUDED, and not merely by `DESIGN.md` R5 (symbolic invariance). Each date is
load-bearing twice — entry N's `date` is also entry N-1's `endDate` — so scaling one date rescales two
segment spans, and because the value component is a fixed smoothstep in t while the date component is
the Bezier x, changing the span does not merely stretch the curve, it re-samples it (different
subdivision count out of `sampleSegment`). Leave untouched.

**Evidence.** parse: `src/mpm/elements/maps/GenericMap.ts:143-155` (key + skip-if-absent),
`src/mpm/elements/maps/MovementMap.ts:94`; also `src/mpm/elements/maps/data/MovementData.ts:38` (dead
path, see hazards). consumption: `src/mpm/elements/maps/MovementMap.ts:153-159` (`getEndDate`), `:178`
(negative-date skip), `src/mpm/elements/maps/data/bezier.ts:101`. write:
`src/mpm/elements/maps/MovementMap.ts:54, :73`.

#### `movement@position`

*Data field:* `MovementData.position`. *Type:* double (cast to the `Normalized` brand at the parse
site). *Paired with:* `movement@transition.to` (same segment), and the FOLLOWING movement's implicit
position when that one omits the attribute.

**Domain.** Nominally the normalized 0..1 pedal depth (documented at
`src/mpm/elements/maps/data/MovementData.ts:21-22` and `src/units.ts:36`), but ENFORCED NOWHERE.
`MovementMap.getMovementDataOf` is a bare `parseFloat(...) as Normalized` with no bounds check
(`src/mpm/elements/maps/MovementMap.ts:109`); `addMovement` writes it unchecked (`:55, :74`). The value
is multiplied by 127 (`src/mpm/elements/maps/data/MovementData.ts:169`) and emitted as
`<position value>` (`src/mpm/elements/maps/MovementMap.ts:206-208`). Only the MIDI exporter clamps, to
0..127 (`src/midi/EventMaker.ts:536`); the plain-data path does not — `readControlChangePoint` casts
straight to `Midi7Bit` (`src/api/pipeline.ts:260`). Measured: position -0.5 → `transition.to` 2.0
yields `value` from -63.50 to 254.00 in the positionMap, unflagged. ABSENCE is meaningful: with no
`position` attribute the movement inherits the preceding movement's `transition.to`
(`MovementMap.ts:99-109` / `:143-151`), yields 0 when the scan reaches entry 0 (the deliberately-kept
`j > 0` parity bug, `MovementMap.ts:144`), or the whole movement is logged-and-skipped when the
predecessor has no `transition.to` (`MovementMap.ts:100-107`).

**Neutral.** No renderer-justified neutral exists. `getPositionAt`/`getMovementSegment` treat
`position` as an ABSOLUTE controller level — `(3-2t)t²*(transitionTo - position) + position` at
`src/mpm/elements/maps/data/MovementData.ts:118` and `tuple[1] *= 127` at `:169` — so every value is an
instruction and none is "no instruction". 0.0 is only the *data class* default (`MovementData.ts:22`)
and means "pedal fully up", which is a performance decision, not its absence. Three editorial
candidates, in decreasing defensibility: (a) 0.5 — midpoint of the bounded proportion, and at 63.5/127
the value adjacent to the switching point of MIDI CC64 (`CC_Damper_Pedal = 64`,
`src/midi/EventMaker.ts:137`), giving a logit that is domain-closed on (0,1); (b) the map-wide
geometric mean, mirroring `DESIGN.md` §1.1's global scope for volume; (c) 0.0 with
boundary-power-lower. NOTE the threshold in (a) is a property of the receiving synth, not of this
codebase: nothing in espressivo thresholds CC64 — the sampled value passes through rounded
(`src/msm/Msm.ts:1441`) and clamped (`EventMaker.ts:536`) but never binarized.

**Exaggerability.** WEAK — recommend exclusion by default, but for a sharper reason than `DESIGN.md`'s
current line ("controller positions are not deviations from a neutral performance"). The decisive
fact: the canonical pedal map is a sequence of exact 0.0 and 1.0 values, and BOTH log-around-geomean
and logit have poles at exactly 0 and 1 (ln 0). Under the limit convention those poles are fixed
points, so the transform is well-defined but is the IDENTITY on precisely the documents that dominate
the corpus; it only reshapes interior (half-pedal) values. That is a real but narrow musical dimension
— "sharpen or soften half-pedalling" — not a contrast-scaling one. Compounding it: on a switch-type
receiver any change that does not cross value 64 is inaudible, and the sampler emits only ~17 events
for a full 0→1 ramp at the default step, so fine reshaping is quantized away. If included anyway:
logit around 0.5, clamp to [0,1], report clamps; never log-around-geomean (P3 domain closure fails
upward — a scaled position > 1.0 leaves 127 unclamped on the data path, violating the spirit of R6).

**Evidence.** parse: `src/mpm/elements/maps/MovementMap.ts:99-109` (incl. inheritance), `:143-151`
(`getPreviousPosition`); dead second parser at `src/mpm/elements/maps/data/MovementData.ts:40-43`.
consumption: `src/mpm/elements/maps/data/MovementData.ts:118` (curve value), `:160-161` (exact start
point unshifted), `:169` (×127), `src/mpm/elements/maps/MovementMap.ts:206-210`
(`<position value>`), `src/msm/Msm.ts:1441-1451` (round → CC), `src/midi/EventMaker.ts:536` (clamp),
`src/api/pipeline.ts:260` (NO clamp). write: `src/mpm/elements/maps/MovementMap.ts:55, :74`.

#### `movement@transition.to`

*Data field:* `MovementData.transitionTo`. *Paired with:* `movement@position`.

**Domain.** Identical to `@position`: nominal 0..1, unenforced, bare `parseFloat` at
`src/mpm/elements/maps/MovementMap.ts:110-111` and `src/mpm/elements/maps/data/MovementData.ts:45-48`.
ABSENCE is the load-bearing state, not a default: `isConstantMovement()` is exactly
`transitionTo === null` (`MovementData.ts:84-86`), `getDatePosition` then short-circuits to
`[startDate, position]` for EVERY t (`MovementData.ts:123`), and `getMovementSegment` skips pushing an
end point (`MovementData.ts:163-166`). Measured result for a constant movement: three identical events
`[[0,63.5],[0,63.5],[0,63.5]]` — same date, same value, no span. So a constant movement is not a flat
ramp, it is a degenerate three-event stack at `startDate`.

**Neutral.** The one renderer-justified neutral in this family is a RELATION, not a value:
`transition.to === position` makes the segment flat, and then curvature and protraction become
unobservable (the value component `(3-2t)t²*(transitionTo - position) + position`,
`MovementData.ts:118` / `bezier.ts:102`, collapses to the constant `position`). That is the
`DESIGN.md` §1.1 "local" scope neutral — the transition pair's own mean. For positions that mean should
be arithmetic (or the logit midpoint), not geometric: a geometric mean is undefined the moment either
endpoint is 0.0, which is the most common pedal value there is.

**Exaggerability.** Same verdict as `@position`: exclude by default; if included, treat as the pair
partner under the SAME transform and the same center, never independently. One thing that does work in
its favour: because a following `<movement>` that omits `position` inherits this attribute's value at
read time (`MovementMap.ts:99-109`), scaling `transition.to` automatically carries the scaled value
into the next segment's start with no fix-up — PROVIDED the applier does not materialize an explicit
`position` where the document had none. Materializing one would freeze the pre-exaggeration value and
break the chain.

**Evidence.** parse: `src/mpm/elements/maps/MovementMap.ts:110-111`;
`src/mpm/elements/maps/data/MovementData.ts:45-48` (dead path). consumption:
`src/mpm/elements/maps/data/MovementData.ts:84-86` (`isConstantMovement`), `:118`, `:123` (constant
short-circuit), `:163-166` (exact end point pushed), `:169` (×127);
`src/mpm/elements/maps/data/bezier.ts:102`. inheritance sink:
`src/mpm/elements/maps/MovementMap.ts:143-151`. write: `src/mpm/elements/maps/MovementMap.ts:56-57, :75`.

#### `movement@curvature`

*Data field:* `MovementData.curvature` (private cache `MovementData.x1`/`x2`, `MovementData.ts:31,
:97`). *Paired with:* `movement@protraction` — the pair's joint neutral (0, 0) is the linear ramp;
neither is neutral alone.

**Domain.** [0, 1]. This bound is not decorative: `curvature` IS the x-coordinate of the first inner
Bezier control point, `[curvature, 1.0 - curvature]` (`src/mpm/elements/maps/data/bezier.ts:31-33`),
and x1,x2 in [0,1] is exactly the condition that keeps the date component x(t) monotone. Verified
numerically over a 201-point sweep: curvature 1.2 (x1=1.2, x2=-0.2) and curvature -0.2 (x1=-0.2,
x2=1.2) both produce a NON-monotone date sequence, whereas 0, 1/3, 0.4, 0.5 and 1.0 are all monotone.
ENFORCED NOWHERE IN THIS FAMILY — `MovementMap.ts:116-117` is a bare `parseFloat`, and `addMovement`
writes it unchecked (`MovementMap.ts:58-59`). The identical parameter in the DYNAMICS family is clamped
at both ends of the pipe (`DynamicsMap.clampCurvature`,
`src/mpm/elements/maps/DynamicsMap.ts:100-110`, applied on read at `:172` and on write at `:51, :78`).
Class default is 0.4 (`src/mpm/elements/maps/data/MovementData.ts:28`) and a null is coerced to 0.0 in
place at `MovementData.ts:94`.

**Neutral.** `0.0` — and this is derived from the renderer, not assumed. With protraction = 0,
curvature = 0 gives x1 = 0, x2 = 1, so in `bezierPoint` u = 3·0 - 3·1 + 1 = -2, v = 0 + 3 = 3, w = 0,
and the date component becomes x(t) = (3t² - 2t³)·span (`src/mpm/elements/maps/data/bezier.ts:99-101`)
— the SAME smoothstep as the hardcoded value component (3 - 2t)t² at `bezier.ts:102`. The two cancel
and position becomes exactly LINEAR in date. Measured max |value - date/span| over 201 samples:
1.1e-16 at (0, 0); 0.0962 at (1/3, 0); 0.1155 at the class default (0.4, 0); 0.1443 at (0.5, 0);
0.2887 at (1, 0). So (curvature, protraction) = (0, 0) is the family's identity shape, and the 0.4
default is an editorial S-curve, NOT a neutral. Note this differs from the dynamics family, where the
same parameter defaults to null→0.0 (`DynamicsData.ts:39, :121`) i.e. already neutral.

**Exaggerability.** MEANINGFUL, with real caveats. Deviation from 0 is one-sided, so plain linear
scaling breaks P3 (domain closure) for s > 1/x; the domain-closed choice is `DESIGN.md` §1's
boundary-power (lower), T(x) = ln(1-x), `x' = 1 - (1-x)^s`, which fixes 0 and never leaves [0,1) —
x = 1 is a pole (T = -∞) and needs an explicit fixed-point case. Musical effect: it changes WHERE
INSIDE THE SEGMENT the pedal level crosses the receiver's on/off point, i.e. it moves the perceived
pedal-change instant without touching any date — a genuine expressive axis. Dead in three situations:
when `transition.to` is absent (`MovementData.ts:123` returns before the Bezier), when
`transition.to === position` (flat curve), and on the LAST map entry (never rendered,
`MovementMap.ts:178`). Effect is also quantized by the sampler — at the default `maxStep` 0.1 a 0→1
ramp is 17 events regardless of curvature (measured: n=17 at (0,0), (0.4,0), (1,0) and (0.4,0.5)), so
sub-sample reshaping is invisible. MUST be clamped by the applier: this family has no guard of its own
(see hazards).

**Evidence.** parse: `src/mpm/elements/maps/MovementMap.ts:116-117`;
`src/mpm/elements/maps/data/MovementData.ts:50-51` (dead path). null-coercion:
`src/mpm/elements/maps/data/MovementData.ts:93-98`. consumption:
`src/mpm/elements/maps/data/bezier.ts:27-47` (control points), `:99-101` (date component). domain
precedent, NOT applied here: `src/mpm/elements/maps/DynamicsMap.ts:92-110, :172`; `PARITY.md:419-422`.
write: `src/mpm/elements/maps/MovementMap.ts:58-59` (unclamped).

#### `movement@protraction`

*Data field:* `MovementData.protraction` (private cache `MovementData.x1`/`x2`). *Paired with:*
`movement@curvature`.

**Domain.** [-1, 1], by the same monotonicity argument as curvature. At p = +1 the general formula
(`src/mpm/elements/maps/data/bezier.ts:35-45`) sends both control points to x = 1 (all motion crammed
to the end of the span); at p = -1 both go to x = 0 (all motion at the start). |p| > 1 pushes them
outside [0,1] and the date sequence stops being monotone — verified at (curvature 0, protraction 1.5):
x1 = 1.5, x2 = 1.0, date component non-monotone. ENFORCED NOWHERE IN THIS FAMILY (bare `parseFloat` at
`MovementMap.ts:118-119`, unchecked write at `:60-61`); the dynamics family clamps the identical
parameter to [-1,1] on read and write (`DynamicsMap.clampProtraction`,
`src/mpm/elements/maps/DynamicsMap.ts:112-125, :175, :54, :82`). Class default 0.0
(`MovementData.ts:29`), null coerced to 0.0 in place (`MovementData.ts:95`).

**Neutral.** `0.0`, on two independent grounds. (a) It is literally the branch condition:
`if (protraction === 0.0) return [curvature, 1.0 - curvature]`
(`src/mpm/elements/maps/data/bezier.ts:31-33`) — the unskewed control points. (b) That branch is not a
discontinuity dressed as a special case: the general formula is continuous at 0 and reduces to the same
pair in the limit from both sides (for p>0, x1 = c + (1-c)p → c and x2 = 1-c + cp → 1-c; for p<0,
x1 = c(1+p) → c and x2 = 1-c + (1-c)p → 1-c). The branch exists only because the general formula
divides by `protraction` (documented at `bezier.ts:23-25`). So 0 is a true no-skew fixed point, and it
is also the class default — the only attribute in this family whose default IS its neutral.

**Exaggerability.** BEST-BEHAVED ATTRIBUTE IN THE FAMILY, and the one I would actually ship if the
family is included at all. Signed, symmetric, neutral at 0, and the deviation has a clean musical
reading: how far the pedal's motion is pushed toward the end (+) or the start (-) of its span — i.e.
late vs. early pedalling within a notated span, with the notated dates untouched (R5-safe).
`DESIGN.md`'s linear-0 space fits directly, but it exits [-1,1] once |s·p| > 1; a sign-preserving
boundary-power, T(x) = -sign(x)·ln(1-|x|), keeps P3 closure and P4's fixed point exactly. Same
conditionality as curvature: inert when `transition.to` is absent or equals `position`, and inert on
the map's last entry. Must be clamped or transformed — an unclamped |p| > 1 does NOT throw, it silently
corrupts (see hazards).

**Evidence.** parse: `src/mpm/elements/maps/MovementMap.ts:118-119`;
`src/mpm/elements/maps/data/MovementData.ts:53-54` (dead path). null-coercion:
`src/mpm/elements/maps/data/MovementData.ts:93-98`. consumption:
`src/mpm/elements/maps/data/bezier.ts:27-47` (the `p===0` branch at `:31`, the general formula at
`:35-45`). domain precedent, NOT applied here:
`src/mpm/elements/maps/DynamicsMap.ts:112-125, :175`. write:
`src/mpm/elements/maps/MovementMap.ts:60-61` (unclamped).

#### `style@date` (a `<style>` switch inside a `movementMap`)

*Data field:* none (never reaches `MovementData`).

**Domain.** Same as `movement@date`. A movementMap may legally contain `<style date name.ref>` entries
— `GenericMap.addStyleSwitch` (`src/mpm/elements/maps/GenericMap.ts:438-445`) is inherited by
`MovementMap` and is exercised in its test suite (`tests/mpm/elements/MovementMap.test.ts:623-632`).
`name.ref` is a string; `date` is the only numeric attribute.

**Neutral.** None — a date, and doubly inert here because NO movement style vocabulary exists anywhere
in the codebase: there is no `movementStyles` / `movementDef` (`src/mpm/elements/styles/defs` contains
Tempo/Dynamics/Articulation/Rubato/Ornament/AccentuationPattern/DynamicsGradient/TemporalSpread and
nothing for movement), and `MovementMap.getMovementDataOf` never consults a style —
`resolveEntryIndex(index, 'movement')` (`src/mpm/elements/maps/MovementMap.ts:90`,
`GenericMap.ts:469-473`) makes any `<style>` entry read back as null.

**Exaggerability.** EXCLUDED (a date). Report it only so the applier's walker does not mistake
`<style>` for `<movement>` — and so it knows that a `<style>` entry still counts toward `size()`, which
changes which entry the render treats as "last". See hazards: that interaction has a nasty consequence.

**Evidence.** `src/mpm/elements/maps/GenericMap.ts:438-445` (`addStyleSwitch`), `:469-473`
(`resolveEntryIndex` rejects it), `:143-144` (a style without `name.ref` is dropped from the index),
`src/mpm/elements/maps/MovementMap.ts:90`; `tests/mpm/elements/MovementMap.test.ts:623-632`.

### Walker notes — movement

1. `Mpm.getAllPerformances(): readonly Performance[]` — `src/mpm/Mpm.ts:345` (also
   `getPerformance(i|name)`, `Mpm.ts:325-337`).
2. GLOBAL map: `performance.getGlobal()` (`src/mpm/elements/Performance.ts:289`) → `Global.getDated()`
   (`src/mpm/elements/Global.ts:80`) → `Dated.getMap('movementMap')`
   (`src/mpm/elements/Dated.ts:123`), cast to `MovementMap`. The map-type constant is `MOVEMENT_MAP` =
   `'movementMap'` — `src/mpm/names.ts:32`, re-exported as `Mpm.MOVEMENT_MAP` at `src/mpm/Mpm.ts:79`.
3. PER-PART map: `performance.getAllParts()` (`src/mpm/elements/Performance.ts:225`) →
   `Part.getDated()` (`src/mpm/elements/Part.ts:137`) → same `Dated.getMap(MOVEMENT_MAP)`.
4. RESOLUTION ORDER, which an applier must respect: a part's own movementMap wins, otherwise the global
   one is used — `Performance.resolvePartMaps`, `src/mpm/elements/Performance.ts:607`
   (`(dated.getMap(MOVEMENT_MAP) as MovementMap | null) ?? globalMaps.movement`); the global set is
   collected at `Performance.ts:454`. Consequence: editing the GLOBAL movementMap changes every part
   that has none of its own — no per-part duplication is needed, and duplicating would change
   behaviour.
5. THERE ARE NO STYLES OR DEFS FOR THIS FAMILY. No `movementStyles`, no `movementDef` anywhere in
   `src/` or `tests/`; `src/mpm/elements/styles/defs` holds only
   Tempo/Dynamics/Articulation/Rubato/Ornament/AccentuationPattern/DynamicsGradient/TemporalSpread. The
   entire numeric surface of the family lives on `<movement>` elements in `<movementMap>` — no header
   walk is required.
6. ENUMERATING ENTRIES: `map.getAllElementsOfType('movement')`
   (`src/mpm/elements/maps/GenericMap.ts:240`) returns `readonly KeyValue<number, Element>[]` — the
   live, date-sorted index; use it rather than `size()`/`getElement(i)` so `<style>` entries are
   filtered out. Raw XML access: `KeyValue.getValue()` is the `<movement>` `Element`; read/write its
   attributes with the house helpers `attribute(name, e)` / `getAttributeValue(name, e)` from
   `src/xml/tree.ts`, which match on LOCAL NAME and are therefore namespace-agnostic (important — see
   hazards on the `xmlns=""` corpus quirk).
7. SEMANTIC READ (do not reimplement): `MovementMap.getMovementDataOf(index)` —
   `src/mpm/elements/maps/MovementMap.ts:89-123` — returns a `MovementData` with `position`
   inheritance, `endDate`, curvature/protraction/controller resolved. This is the ONLY parser the
   render path uses. `new MovementData(xml)` (`src/mpm/elements/maps/data/MovementData.ts:34-67`) is a
   SECOND, independent parser that is dead in `src/` (used only by
   `tests/mpm/elements/MovementMap.test.ts:647,657`) and disagrees with the live one — see hazards.
8. RENDER ENTRY POINT, for checking whether an edit is observable: `MovementMap.renderMovementToMap(ctx?)`
   — `src/mpm/elements/maps/MovementMap.ts:173-183` — builds a fresh `positionMap` (a `GenericMap`, not
   an MPM map); it is appended to the MSM part at `src/mpm/elements/Performance.ts:697-702`, given
   tempo + asynchrony but deliberately NOT rubato and NOT imprecision at `Performance.ts:758-760`, and
   finally becomes CC events at `src/msm/Msm.ts:1422-1454` / `src/api/pipeline.ts:300-313`.
9. MUTATION SAFETY: `GenericMap` keeps the element array and the XML in step; every mutator updates both
   (class comment at `src/mpm/elements/maps/GenericMap.ts:44-52`). Editing an attribute IN PLACE on an
   `Element` obtained from `getAllElementsOfType` is safe for
   position/transition.to/curvature/protraction (they are not keys). Editing `date` is NOT — call
   `map.sort()` (`GenericMap.ts:187`) afterwards, which refreshes the cached keys from the XML. The
   exaggeration engine should never need this (R5).

### Hazards — movement

- **NO CLAMPS IN THIS FAMILY, unlike its twin.** `curvature` and `protraction` are the same Bezier
  parameters as in the dynamics family and share the same code
  (`src/mpm/elements/maps/data/bezier.ts`), but `MovementMap` parses and writes both with a bare
  `parseFloat` / `String()` (`MovementMap.ts:58-61, :116-119`) while `DynamicsMap` guards them at BOTH
  ends of the pipe (`DynamicsMap.ts:100-125`, applied at `:51, :54, :78, :82, :172, :175`; the
  asymmetry is documented in `PARITY.md:419-422`). Any exaggeration applier for movement must supply
  its own clamp or a domain-closed transform.
- **OUT-OF-RANGE CURVE PARAMETERS CORRUPT SILENTLY — there is no error path.** curvature outside [0,1]
  or |protraction| > 1 puts a Bezier control point outside [0,1], the date component x(t) stops being
  monotone (verified at curvature 1.2, curvature -0.2, protraction 1.5), and the sampler then emits
  `<position>` elements whose dates go backwards. `GenericMap.addElement` inserts date-sorted
  (`GenericMap.ts:369-385` → `insertElement:396-418`), so those events are SILENTLY REORDERED: the
  value sequence gets shuffled relative to time and you get a garbled pedal curve, not an exception.
- **THE `MovementData` XML CONSTRUCTOR IS A SECOND, DIVERGENT PARSER AND IS DEAD IN `src/`.**
  `new MovementData(xml)` (`MovementData.ts:34-67`) is referenced only from tests
  (`MovementMap.test.ts:647, :657`); the render path builds `MovementData` by hand in
  `MovementMap.getMovementDataOf` (`MovementMap.ts:89-123`). They disagree on the case that matters:
  for a `<movement>` with NO `position` attribute the constructor keeps its 0.0 field default, while
  `getMovementDataOf` inherits the previous entry's `transition.to`. An applier that reads through the
  constructor will see a different document than the renderer does.
- **THE LAST MAP ENTRY IS NEVER RENDERED.** `renderMovementToMap` guards with
  `movementIndex < this.size() - 1` (`MovementMap.ts:175-181`) because a movement is a transition
  TOWARDS the next one. So every numeric attribute on the final `<movement>` is inert at render time
  while still being byte-visible in the document — the R4 "transformed" report will over-claim unless
  it excludes it. Negative-dated movements are likewise skipped (`md.startDate >= 0`,
  `MovementMap.ts:178`).
- **…AND `size()` COUNTS `<style>` ENTRIES**, so a trailing style switch makes the last real movement
  renderable with `endDate = Number.MAX_VALUE` (`getEndDate` finds no following `<movement>` and
  returns `Number.MAX_VALUE`, `MovementMap.ts:153-159`). Reproduced: a map of [movement@0 (0→1),
  style@1000] renders 17 events ending at `<position date="1.7976931348623157e+308" value="127">`. Not
  caused by exaggeration, but any tooling that adds or reorders entries in a movementMap can trip it.
- **`addStyleSwitch` WITH A LATE DATE INSERTS AT INDEX 0.** `insertElement(kv, firstAtDate=true)` scans
  forward for the first key ≥ the new one and, finding none, falls through to
  `splice(0, 0, element)` (`GenericMap.ts:396-418`). The fallthrough is correct for the
  `firstAtDate=false` branch and wrong for the true branch. Reproduced: `addMovement(date 0)` then
  `addStyleSwitch(date 1000)` leaves the style at index 0, and `getMovementDataOf(0)` then returns null
  because `resolveEntryIndex` rejects a `<style>`. This is a faithful bug-for-bug port — Java's
  `GenericMap.insertElement` has the identical fallthrough with the identical comment.
- **A CONSTANT MOVEMENT IS A DEGENERATE THREE-EVENT STACK, NOT A FLAT RAMP.** With `transition.to`
  absent, `getDatePosition` returns `[startDate, position]` for every t (`MovementData.ts:123`) and no
  end point is pushed (`MovementData.ts:163-166`), so the segment renders as three identical events at
  `startDate` (measured: `[[0,63.5],[0,63.5],[0,63.5]]`). Corollary for the applier: never ADD a
  `transition.to` where the document had none, and never remove one — the attribute's presence is a
  mode switch, not a default.
- **THE FIRST SAMPLE IS ALWAYS DUPLICATED.** `getMovementSegment` unshifts an exact start point in
  front of the subdivision, whose t=0 sample is the same point (`MovementData.ts:136-146, :160-161`).
  Harmless, but a diffing harness comparing event counts before/after exaggeration must expect it.
- **POSITION VALUES ARE CLAMPED ON THE MIDI PATH ONLY.** `EventMaker.createControlChange` clamps to
  0..127 (`src/midi/EventMaker.ts:536`) and `Msm.parsePositionMap` rounds (`Msm.ts:1441`); the
  plain-data facade path does neither — `readControlChangePoint` casts straight to `Midi7Bit`
  (`src/api/pipeline.ts:255-262`). Measured: position -0.5 → 2.0 yields values -63.50 .. 254.00 in
  `PerformedPart.controlChanges`. This is the movement-family analogue of `DESIGN.md` R6 for velocity,
  and it is currently unguarded.
- **`controller` IS A STRING, NOT AN ENUM, AND ITS FALLBACK IS SILENT.** Only `'sustain'` → CC64 and
  `'soft'` → CC67 are mapped; anything else (including a typo, and including an absent attribute) falls
  through to controller number 0 = bank select, in both consumers (`src/msm/Msm.ts:1443-1449`,
  `src/api/pipeline.ts:264-269`). Faithful to Java (`Msm.java:1092`). Not exaggerable, but an applier
  must copy it verbatim. It was also the subject of a 2026-08-08 fix (it used to be looked up in the
  `xml:` namespace and assigned to `xmlId`) — see `MovementData.ts:59-66` and `PARITY.md:118-119`.
- **`getPositionAt` AND `tForDate` ARE DEAD IN THE RENDER PATH.** `MovementData.getPositionAt`
  (`MovementData.ts:109-119`) is called only from tests; the render samples via
  `getDatePosition`/`bezierPoint`, which never inverts the curve. That matters because `tForDate`'s
  binary search (`bezier.ts:57-78`) assumes a monotone x(t) and its loop condition is
  `Math.abs(diffX) >= 1.0` with `tt *= 0.5` — on a non-monotone or unreachable target `tt` underflows
  to 0 and the loop cannot terminate. Out-of-range curvature/protraction would therefore be an infinite
  loop, not merely wrong output, for any FUTURE caller that revives `getPositionAt`.
- **NAMESPACE QUIRK IN THE SHIPPED CORPUS.** The reference fixtures serialize the map as
  `<movementMap xmlns="">` with children re-declaring the MPM namespace:
  `<movement xmlns="http://www.cemfi.de/mpm/ns/1.0" .../>`
  (`tests/integration/fixtures/all-maps-reference/movement.mpm:2` and `all_maps.mpm:2`). Current code
  does NOT reproduce that — `'movementMap'` is in `GenericMap`'s `MPM_NAMES` set
  (`GenericMap.ts:37`) so a fresh map serializes as
  `<movementMap xmlns="http://www.cemfi.de/mpm/ns/1.0">` (verified). So the corpus contains both
  shapes. A namespace-strict XPath walker will miss the fixture form; the house helpers in
  `src/xml/tree.ts` match on local name and are safe.
- **NOTHING IN THE PIPELINE GENERATES A `movementMap`.** The MEI converter never emits one (no
  `MovementMap` reference in `src/mei/Mei2MsmMpmConverter.ts`; "movement" there means an MEI `mdiv`).
  movementMaps come only from hand-authored or mpmify-generated MPM. So the exaggeration engine's
  movement dimension is exercised by a narrow, externally-produced corpus — and the family already has
  a documented fixture blind spot of exactly this kind (`PARITY.md:424-431`: every fixture
  `<dynamics>` carries `curvature="0.0" protraction="0.0"`, which is why a port that read neither kept
  passing certification).
- **`movementSampleMaxStep` IS A RENDER OPTION, NOT AN MPM ATTRIBUTE** — do not put it in the registry.
  Default 0.1 in the normalized 0..1 domain (`src/mpm/RenderOptions.ts:17-31, :42`; resolved at
  `MovementMap.ts:202-203`). It sets the event density of everything this family produces and therefore
  bounds how fine a curvature/protraction change can be before it is quantized away. Feeding it a
  0..127 threshold is the documented 16129 bug (`src/units.ts:4-9`).

---

## 9. Conventions brief

Everything below is derived from `refactor/ARCHITECTURE.md` (the design ruling — its numbered
**RULE**s are normative), `refactor/CHARTER.md` (invariants, which win over `ARCHITECTURE.md`),
`eslint.config.js`, `tsconfig*.json`, `vitest.config.ts`, `package.json`, and the existing
`src/api/**`, `src/units.ts`, `tests/api/**`, `tests/mpm/**`. The package name is `espressivo`.

Read the rule you are about to touch before writing code. Every module in this tree opens with a JSDoc
block that cites the RULE numbers it implements and *why* the shape is what it is — match that house
style; it is the project's primary defence against a future worker "tidying" something load-bearing.

### 9.0 The verify command (exact)

```sh
npm run verify
```

which is exactly `npm run build && npm run typecheck:tests && vitest run`
(`tsc` → `tsc -p tsconfig.tests.json` → full vitest suite).

- **Charter invariant 1**: `npm run verify` must be green before every commit. No `--skip`, no test
  exclusion.
- **`npm run lint` is deliberately NOT part of verify** (`refactor/lint-debt.md` says so explicitly) —
  there are ~1011 inherited errors. That is not a licence to add more: the standing expectation is
  **zero new lint errors from a new module** (T13's facade added 8 files and 0 errors). Run
  `npx eslint src/your/new/file.ts` on your own files.
- Formatting: `npm run format` / `npm run format:check` (Prettier is the sole authority;
  `eslint-config-prettier` is last in the config).
- Coverage: `npm run test:coverage`. Charter invariant 7: **functions ≥ 92.0 %**, uncovered scoped
  statements must not grow, test count decreases only with journaled justification.

### 9.1 Error classes

**The root lives in `src/xml/errors.ts`, not in `src/api/`.** `MeicoError extends Error` is declared at
L0/L1 because `MissingNodeError` is thrown from `src/xml/tree.ts` and a layer-1 module may not import
from layer 6 (RULE M1). Declaring a second `MeicoError` anywhere would give the facade a root that
`instanceof` cannot see from the interior.

| class | file | thrown by |
|---|---|---|
| `MeicoError extends Error` | `src/xml/errors.ts` | root of everything deliberate |
| `MissingNodeError` | `src/xml/errors.ts` | the `require*` accessors in `src/xml/tree.ts` (RULE N2a) |
| `NumberFormatError` | `src/xml/errors.ts` | `src/supplementary/parseJavaDouble.ts` (caught by `create*` factories) |
| `OutOfRangeError` | `src/xml/errors.ts` | `RandomNumberProvider` index guards |
| `ParseError`, `EmptyDocumentError`, `PerformanceNotFoundError`, `InvalidOptionError` | `src/api/errors.ts` | the facade |

**RULE E2 (quoted):**

> `src/api/errors.ts`:
> ```ts
> export class MeicoError extends Error {}
> export class ParseError extends MeicoError {}              // not well-formed, or wrong root element
> export class EmptyDocumentError extends MeicoError {}      // parsed, but nothing to convert
> export class PerformanceNotFoundError extends MeicoError {}// named/indexed performance absent
> export class InvalidOptionError extends MeicoError {}      // ppq <= 0, non-finite seed, …
> export class MissingNodeError extends MeicoError {}        // thrown by the require* accessors (N2a)
> ```
> The facade converts every interior `null`-meaning-failure into a thrown typed error and **never
> returns `null` itself** (consistent with N4). Every error carries the offending document kind and,
> where cheap, the element name — never a stack of interior XomTypes objects.

Pattern to copy:

- **Empty bodies.** `export class ParseError extends MeicoError {}` — no custom constructor, no error
  codes, no extra fields. The semantics live in the JSDoc above the class.
- `src/api/errors.ts` **re-exports** the two shared ones and imports `MeicoError` separately to extend
  it:
  ```ts
  export { MeicoError, MissingNodeError } from '../xml/errors.js';
  import { MeicoError } from '../xml/errors.js';
  ```
- **Message shape**: prefix with the document kind — `` `${kind}: the input is not well-formed XML` ``,
  `` `MSM: expected a <msm> root element, found <mpm>` ``,
  `` `ppq must be a positive integer, got ${String(options.ppq)}` ``.
- **Wrapping a foreign throw**: use the `cause` option and normalize whitespace, as `pipeline.ts`'s
  `parseOrThrow` does — `@xmldom/xmldom` exports its *own* class named `ParseError`, so never let one
  escape.
- **Validate options before parsing anything** (`checkConvertOptions`-style helpers at the top of the
  module), so a bad option is an `InvalidOptionError`, never a downstream `TypeError`.

**RULE E1 — the interior is frozen.** `src/` layers L0–L5 keep Java's logs-and-returns-null behaviour
bug-for-bug. Do not add throws, guards, or "fix" a malformed-input path in interior code. Sanctioned
exceptions only: the `require*` family (N2a), the `getXml()` narrowing (N3), and anything already
recorded in the §6.3 parity ledger / `PARITY.md`. (Charter bug policy, 2026-08-09: obvious bugs *may*
now be fixed, but only under TD1 discipline — fixture-byte proof, pinning tests, negative control, and
a `PARITY.md` "Fixed bugs" entry.)

### 9.2 Branded units (`src/units.ts`)

Five brands, all `number & { readonly [brand]: Name }`: `Ticks`, `Milliseconds`, `Normalized`,
`Midi7Bit`, `Bpm`.

- **`src/units.ts` is type-only and must stay so.** It compiles to `export {};` and nothing else. *Do
  not add a value to it.*
- **RULE U2 — no runtime converters.** There is no `asTicks(n)`. A raw number becomes branded through
  an `as` cast at the few construction sites (normally where an XML attribute is parsed):
  `parseFloat(attr.getValue()) as Ticks`. `as` erases; a helper function emits, and then "type-level
  only" can no longer be proven by an emitted-JS diff.

**RULE U3 (quoted) — where brands apply, and only here:**

> - **(a) the facade's *output* types only** (`src/api/types.ts`): `PerformedNote.date`/`.duration`
>   (`Ticks`), `.milliseconds.date`/`.end` (`Milliseconds`), `.velocity`/`.pitch` (`Midi7Bit`),
>   `ControlChangePoint.date` (`Ticks`), `.milliseconds` (`Milliseconds`), `.value` (`Midi7Bit`),
>   `PerformanceData.ppq` (`Ticks`).
> - **(b) three interior declarations — the ones the confusion actually bit**: `MovementData.position`
>   and `.transitionTo` (`Normalized | null`), `MovementData.getMovementSegment(maxStepSize:
>   Normalized)` — the **parameter only** — and `DEFAULT_MOVEMENT_SAMPLE_MAX_STEP: Normalized`.

**RULE U3a — facade *inputs* are never branded.** Every `*Options` field is plain `number`, including
`PerformOptions.movementSampleMaxStep`. Brands are free for readers of output data and hostile to
writers of input (U2 forbids converters, so a branded input would force callers to write
`0.05 as Normalized`). The facade applies the brand internally with one `as` at the boundary — see
`src/api/pipeline.ts:247-260, 351`.

**RULE U4 / U4a — where brands must NOT go.** Nowhere inside parity-frozen arithmetic
(`Performance.perform`, the render loops, `computeDuration`, `computePitch`). Heuristic: if branding a
declaration needs more than ~5 `as` casts elsewhere, don't — document the unit in the JSDoc instead.
`MovementData.getMovementSegment` and `DynamicsData.getSubNoteDynamicsSegment` **return types are
explicitly exempt** and stay `number[][]`: the returned array is mutable working state (spliced,
unshifted, then scaled ×127 in place), so a `readonly` tuple return would contradict I4 and I6 at once.

Notes: `@typescript-eslint/no-unnecessary-type-assertion` ignores brand casts (they change the type).
In **tests** you may define a file-local converter —
`const norm = (x: number): Normalized => x as Normalized;` — because it emits nothing into `dist/` (see
`tests/mpm/elements/MovementMap.test.ts:24`).

### 9.3 Readonly / immutability

**RULE I1 — the six mutation boundaries, exhaustive.** Mutating an object that outlives the current
expression is allowed only in: (1) `src/xml/**`, the XomTypes tree; (2) `Mei2MsmMpmConverter` during
one `convert()` call; (3) `Performance.perform` and every `render*ToMap`, which mutate the MSM **clone**
(`perform` opens with `msm.clone()` — that call *is* the boundary, do not move it); (4)
`Midi`/`Sequence`/`Track` while building a file; (5) `RandomNumberProvider.series`; (6)
`RenderContext.streamOrdinal` for the duration of one `perform` call.

- **RULE I2** — outside those six, an exported function that assigns to a parameter or to a
  property/element of a parameter is a violation. `no-param-reassign` is **`error` in `src/`**.
- **RULE I3 (facade)** — (a) never mutate inputs (free: inputs are strings); (b) every return value
  freshly allocated, `!==` at every level across two calls; (c) survives `structuredClone`.
- **RULE I4 — `readonly` where it is free.** Apply to: private fields never reassigned after
  construction (`prefer-readonly` is an error over `src/`); `readonly T[]` / `ReadonlyMap` on
  **parameters and return types** that are only read; `as const` on static data tables. **Do not**
  apply `readonly T[]` to a field mutated in place (`MovementData.series`/`ts`, `GenericMap`'s element
  lists). `readonly` goes on the boundary, not on working state.
- **RULE I5 — no shared mutable statics.** `src/` currently has zero non-`readonly` static fields and
  must keep it that way. A knob belongs in `RenderOptions` threaded through `RenderContext`, not on a
  class. Audit:
  ```sh
  grep -rnE "^[[:space:]]*(private |protected |public )?static (readonly )?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[:=]" \
    src --include='*.ts' | grep -v "static readonly"
  ```
  must return nothing.
- **RULE I6** — no allocation-heavy immutability in hot rendering loops. If a spot wants persistent
  structures, write a `DISCOVERED:` note in `refactor/log.md` instead of doing it.

New code also follows **RULE C5** (no new Java-style `getX()`/`setX()` — new modules use `readonly`
properties and plain functions), **RULE C2** (`no-extraneous-class` is 0 and stays 0: no static-only
utility classes — use a module of exported functions), and **RULE C4** (no new `createXxx` factory
names; use `fromXml` / `fromName` / a plain exported function).

### 9.4 Facade RULEs (quoted)

**RULE F1 (plain data, and how it is proven).**

> Every facade input and output is a value that survives `structuredClone` and `postMessage` unchanged.
> The permitted types are: `string`, `number`, `boolean`, `null`, `Uint8Array`, plain object literals,
> and arrays of those. No class instances, no `Map`/`Set`, no functions, no getters, and — the
> charter's explicit prohibition — **no XomTypes type (`Element`, `Attribute`, `Document`, `Nodes`,
> `Elements`, `Text`, `Builder`) may appear in any facade signature**, not even behind `readonly`.
>
> `Uint8Array` is technically a class instance, so read "no class instances" as "no class instances
> **other than** the `Uint8Array` binary payloads that RULE F3 sanctions".

**RULE F2 (XML crosses the boundary as text).**

> MEI, MSM and MPM documents enter and leave the facade as XML **strings**. This is not a compromise, it
> is the design: a string is plain data by construction, it makes F1 free, it makes RULE I3 (never
> mutate inputs) free, and it keeps the XML interior genuinely interior.

**RULE F2a (which serializer).**

> Every facade function that returns document text produces it with **`getRootElement().toXML()`**,
> never `Document.toXML()` and never `XmlBase.toXML()`. … Facade *inputs* accept either form, since the
> parser tolerates a missing declaration.

**RULE E2** — quoted in full in §9.1 above.

**RULE N4 (facade output has no `undefined`).**

> In `src/api/types.ts`, every field of every *output* type is always present; absence is `null`. Every
> *input* option is `?:` and is never `null`. Reason: `JSON.stringify` silently drops `undefined`
> properties, so an output type containing `undefined` is not round-trip stable under JSON and fails
> RULE F1's second test. This is mechanically checkable, but the check must cover **both** files: grep
> `src/api/` (not just `types.ts`) for `?:` and confirm every hit is inside an `*Options` type or an
> inline input-object parameter. `pipeline.ts` declares input objects inline — e.g.
> `{ readonly msm: XmlText; readonly mpm?: XmlText }` on `renderExpressiveMidi` — so a
> `types.ts`-only grep would miss them.

**RULE U3** — quoted in full in §9.2 above.

Supporting facade rules you will also hit: **F3** (`Uint8Array` is the one sanctioned class, for MIDI
bytes; excluded from the JSON leg), **F4** (nothing under `src/api/` imports `fs`, `path`, `process`,
or calls `require`; no function takes or returns a path), **F5** (named-parameter objects at every
multi-document call: `renderExpressiveMidi({ msm, mpm })`, never positional), **F6** (`KeyValue`,
`Msm`, `Mpm`, `Mei`, `Midi`, `Performance` never appear in facade signatures), **F7** (a `seed` in the
MPM always wins over `options.seed`; omitting `options.seed` must be bit-identical to today).

**RULE N1** (applies everywhere, not just the facade): `null` means "the domain says there is nothing
here"; `undefined` means "the caller did not supply this". Never interchangeable. Optional
params/properties use `?:`; domain absence in a return type or stored state uses `| null`.

### 9.5 Import style

- **ESM throughout** (`"type": "module"`). **Every relative import carries a `.js` suffix** even though
  the source is `.ts` — `import { Msm } from '../msm/Msm.js';`. This is repo-wide and load-bearing:
  `eslint.config.js` configures `import/resolver: typescript` and
  `import/parsers: { '@typescript-eslint/parser': ['.ts'] }` precisely so `import/no-cycle` can follow
  those specifiers. Tests use the same convention (`'../../src/api/index.js'`).
- **`import type` for type-only imports**, and it is mandatory where a layer boundary is crossed:
  `src/msm/**` may only reach `src/mpm/**` via `import type` (the eslint zone sets `allowTypeImports`
  for that zone alone).
- **Layering (RULE M1), enforced by `@typescript-eslint/no-restricted-imports` zones:** L0/L1 leaves
  (`src/xml/**`, `src/music/**`, `src/supplementary/**`, `src/version.ts`, `src/units.ts`) import
  nothing higher → `src/midi/**` (L2) → `src/msm/**` (L3) → `src/mpm/**` (L4) → `src/mei/**` (L5) →
  `src/api/**` (L6) → `src/index.ts` (L7). `src/mpm/**` must not import `src/mei/**` **at all**.
  Nothing in `src/` imports `src/api/**`.
- **`import/no-cycle` is an error** (`maxDepth: Infinity`). Concretely: a module under
  `src/mpm/elements/**` imports name constants from `src/mpm/names.js`, **never from `Mpm.js`**.
  `names.ts` is a leaf and must stay import-free.
- **New typed map?** Call `GenericMap.registerMapFactory(...)` at the bottom of your module (RULE M4 —
  do not convert the registry to a `switch`) and add the side-effect import to
  `src/mpm/elements/maps/index.ts`, whose only job is running those registrations. Keep
  `package.json`'s `sideEffects` list in mind (`./dist/mpm/Mpm.js`, `./dist/mpm/elements/maps/*.js`).
- **Barrel**: `src/index.ts` re-exports the facade **member by member**, not `export *`, because
  `src/api/index.ts` re-exports `MeicoError`/`MissingNodeError` which `src/index.ts` already exports
  from `src/xml/errors.js` (two star exports of one name are ambiguous). `src/api/index.ts` itself is
  `export * from './errors.js'; export * from './pipeline.js'; export type * from './types.js';`.
- Import ordering is not lint-enforced, but the house pattern is: interior value imports, then
  `import type` blocks, then same-directory imports — alphabetical within a group.

### 9.6 Test file layout & naming

- All tests live under `tests/`, **outside** `tsconfig.json`'s `include`; they are typechecked by
  `tsconfig.tests.json` via `npm run typecheck:tests` (part of `verify`), under full `strict`.
- Layout **mirrors `src/`, with the `maps/` level flattened**:
  - `src/mpm/Mpm.ts` → `tests/mpm/Mpm.test.ts`
  - `src/mpm/RenderOptions.ts` → `tests/mpm/RenderOptions.test.ts`
  - `src/mpm/elements/maps/MovementMap.ts` → `tests/mpm/elements/MovementMap.test.ts`
  - `src/mpm/elements/styles/**` → `tests/mpm/elements/styles/**`, defs under `styles/defs/`
  - `src/mpm/elements/metadata/**` → `tests/mpm/elements/metadata/**`
  - `src/api/**` → `tests/api/**`
- Filename is `<ClassOrModuleName>.test.ts`. Top-level `describe('<Unit>')`, nested
  `describe('<methodName>')`, `it(...)`. Older suites use `it('should …')`; newer ones use plain
  declarative present tense (`it('renders byte-identical MIDI for the same seed')`). Both are accepted
  — be consistent within a file. Long files use `// ---------` banner comments between `describe`
  groups.
- `globals: true` is set in `vitest.config.ts`, but **every file still explicitly imports**
  `{ describe, it, expect }` (and `vi` where needed) from `'vitest'`. Keep that.
- `testTimeout: 30000`.
- **Split by concern for the facade**, following `tests/api/`: `pipeline.test.ts` (behaviour + error
  policy), `plain-data.test.ts` (F1/N4/I3 — structural walker, `structuredClone`, `MessageChannel`
  postMessage, JSON round trip, no-shared-references), `determinism.test.ts` (F7/I5 through the
  facade), `facade-equivalence.test.ts` (byte equivalence against the class API).
- Fixtures: `tests/integration/fixtures/**` is **immutable** (charter invariant 2 — never modify,
  delete or add; if you think one is wrong, STOP and log `BLOCKED`). Read them with
  `readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures', …), 'utf-8')`.
- **Charter invariant 3**: `tests/integration/*.test.ts` may change only *mechanically* (imports,
  renamed API calls) — never weaken normalization or assertions. **Invariant 4**: unit tests may be
  rewritten for new APIs, but assertion strength must be preserved (same behaviours checked, not
  fewer).
- Never add byte-comparison for imprecision-map output (nondeterministic by design); gate it
  structurally (element counts, attribute names, finite in-range values) or by seed.
- **Coverage include list is explicit** (`vitest.config.ts`): `src/api/**`, `src/mpm/**`, `src/msm/**`,
  `src/xml/**`, `src/music/**`, `src/mei/{Mei,mpmNoteIds,Mei2MsmMpmConverter}.ts`, four
  `src/midi/*.ts`, `src/units.ts`, `src/version.ts` — and `src/supplementary/` **file by file**. A new
  module under `src/supplementary/` is invisible to the coverage invariant until you name it there.
- Lint relaxations in `tests/**`: `explicit-module-boundary-types` off, `no-non-null-assertion` off (so
  `createTempoMap()!` in test setup is fine — it is not in `src/`).

### 9.7 Lint rules that commonly bite

Baseline is typescript-eslint `strict` + `stylistic` (non-type-checked) plus three type-aware rules
over `src/` only. Prettier config is last and owns all formatting.

| rule | where | what bites |
|---|---|---|
| `explicit-module-boundary-types` | `src/` (off in tests) | every **exported** function/method needs an explicit return type, including `: void` |
| `no-unnecessary-condition` | type-aware, `src/` only | a `?? []` or `if (x)` guard on an already-non-nullable type — the most common new-code failure |
| `no-unnecessary-type-assertion` | type-aware, `src/` only | `getXml()!` in **new** `src/` code is now an error. Brand `as` casts are unaffected |
| `prefer-readonly` | type-aware, `src/` only | private fields never reassigned after construction (this is how RULE I4 is measured at all) |
| `no-param-reassign` | **`error` in `src/`**, `warn` in tests | `props: false`, so it flags rebinding the parameter itself |
| `eqeqeq: ['error','always',{ null: 'ignore' }]` | all | `x == null` is **blessed and load-bearing** (RULE N5) |
| `no-restricted-imports` (layer zones) + `import/no-cycle` | `src/` | the architecture gates; `no-cycle` fails **silently** if resolver settings break |
| `no-extraneous-class` | all | must stay at **0** (RULE C2). No static-only utility classes — export functions from a module |
| `no-non-null-assertion` | `src/` (off in tests) | ~917 inherited violations. **Do not add new ones**, do not bulk-fix old ones |
| `prefer-template`, `no-var`, `prefer-const`, `prefer-for-of` | all | mechanical; `prefer-for-of` fires on index loops that never use the index |
| `unified-signatures`, `no-explicit-any`, `no-empty-function`, `no-unused-vars` | all | inherited debt; keep new files at zero |

Notes on the four that bite hardest. `no-unnecessary-condition` became the top new-code failure once
RULE N2b/N3 narrowed `allChildElements` → `Element[]` and `getXml()` → `Element`; the defensive guard
you were about to write is now redundant. `no-unnecessary-type-assertion`: `getXml()` returns
`Element`, so use `getXmlOrNull()` if you genuinely need `| null`. `eqeqeq` blesses `x == null` because
the XOM layer returns `null` on some paths and `undefined` on others — "fixing" one occurrence to
`=== null` introduces a bug. `no-param-reassign` only flags rebinding the parameter itself; mutation
*through* a parameter is governed by RULE I1/I2 instead. For `no-non-null-assertion`, narrowing return
types is the sanctioned cure and each narrowing carries an EQ-RISK gate; RULE C4 likewise explains why
9 `string | Element` overload pairs are deliberately left uncollapsed. If you touch the eslint
resolver/parser settings, re-run the `no-cycle` negative control (re-point an `elements/**` module's
`names.js` import at `Mpm.js` and confirm it fires).

Prettier: `printWidth: 100`, `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "all"`,
`arrowParens: "always"`, `endOfLine: "lf"`. `refactor/` and `tests/integration/fixtures/` are
prettier-ignored.

### 9.8 Ten-second checklist for a new module

1. Pick your layer; import only downward, `.js` suffixes, `import type` across a boundary.
2. Top-of-file JSDoc naming the RULEs the module implements and the trap it avoids.
3. Exported functions get explicit return types; no static-only classes; no new `createXxx`.
4. `null` = domain absence, `?:`/`undefined` = "caller didn't supply". Facade outputs: no `undefined`,
   ever.
5. `readonly` on params/returns/private fields; not on in-place working arrays; no mutable statics.
6. Errors: extend `MeicoError` with an empty body, kind-prefixed messages, `{ cause }` when wrapping.
7. Brands only per U3/U3a — outputs yes, `*Options` inputs no, parity arithmetic no.
8. Add the mirrored `tests/<layer>/<Name>.test.ts`; add the file to `vitest.config.ts`'s coverage
   `include` if it is under `src/supplementary/`.
9. `npx eslint <your files>` → zero, then `npm run format:check`.
10. `npm run verify` green before commit; one work item = one commit on `ts-idiomatic`, message
    `refactor(<id>): <title>`.

### 9.9 Facade conventions (condensed)

The facade lives in `src/api/{types,errors,pipeline,index}.ts` and is additive — `src/index.ts` keeps
its class surface and re-exports the facade member-by-member (not `export *`, because `api/index`
re-exports `MeicoError`/`MissingNodeError` which `index.ts` already exports from `xml/errors.js`).

Hard rules (`ARCHITECTURE.md` §2, quoted above): **F1** plain data only (string/number/boolean/null/
`Uint8Array`/plain objects/arrays; no class instances, `Map`/`Set`, functions, getters, and NO XomTypes
type in any signature, not even behind `readonly`); **F2** documents cross as XML text; **F2a**
serialize with `getRootElement().toXML()` (never `Document.toXML()` — it prefixes an XML declaration
the equivalence fixtures do not have); **F3** `Uint8Array` is the one sanctioned class, for MIDI bytes,
excluded from the JSON round-trip leg; **F4** no `fs`/`path`/`process`/`require` and no file paths
anywhere under `src/api/`; **F5** named-parameter objects at every multi-document call —
`renderExpressiveMidi({ msm, mpm })`, never positional; **F6** `KeyValue`/`Msm`/`Mpm`/`Mei`/`Midi`/
`Performance` never appear in a facade signature; **F7** an MPM `seed` attribute always beats
`options.seed` and omitting `options.seed` must be bit-identical to today.

Types: **N4** — every field of every OUTPUT type is always present, absence is `null`; every INPUT
option is `?:` and never `null`. The mechanical check must grep all of `src/api/`, not just `types.ts`,
because `pipeline.ts` declares input objects inline. **U3(a)** brands the output numbers
(`Ticks`/`Milliseconds`/`Midi7Bit`) with one `as` applied internally at the read boundary; **U3a**
leaves every `*Options` field plain `number` because RULE U2 forbids converter functions and a branded
input would force callers to write `0.05 as Normalized`. `XmlText` is a bare `string` alias,
deliberately unbranded (F5's parameter names do the disambiguation).

Errors: **E2** — the `MeicoError` root is declared in `src/xml/errors.ts` (a layer-1 module may not
import layer 6, and `MissingNodeError` is thrown from `xml/tree.ts`); `api/errors.ts` re-exports it plus
`MissingNodeError` and adds `ParseError`, `EmptyDocumentError`, `PerformanceNotFoundError`,
`InvalidOptionError` — all empty-bodied `extends MeicoError {}`, semantics in the JSDoc. The facade
converts every interior null-meaning-failure into a typed throw and never returns null. Messages are
document-kind-prefixed; wrap foreign throws with `{ cause }` (xmldom exports its own class also named
`ParseError`). Options are validated before anything is parsed. **E1** keeps the interior on Java's
logs-and-returns-null behaviour, bug-for-bug.

**I3**: the facade never mutates inputs (free — inputs are strings), every return value is freshly
allocated and `!==` at every level across two calls, and survives `structuredClone`/`postMessage`.

### 9.10 Test conventions (condensed)

Verify: `npm run verify` = `npm run build && npm run typecheck:tests && vitest run`. Lint is
deliberately NOT in the gate (~1011 inherited errors) but a new module is expected to add zero — run
`npx eslint <files>` yourself. Coverage: `npm run test:coverage`; charter invariant 7 requires
functions ≥ 92.0 % and no growth in uncovered scoped statements.

Layout: `tests/` mirrors `src/` with the `maps/` level flattened —
`src/mpm/elements/maps/MovementMap.ts` → `tests/mpm/elements/MovementMap.test.ts`; styles →
`tests/mpm/elements/styles/`, defs → `styles/defs/`, metadata → `tests/mpm/elements/metadata/`;
`src/api/**` → `tests/api/**`. Files are named `<ClassOrModule>.test.ts`. Structure is top-level
`describe('<Unit>')` > `describe('<method>')` > `it(...)`, with `// ------` banner comments between
groups in long files. Older suites use `it('should ...')`, newer ones plain declarative present tense;
be consistent within a file.

`vitest.config.ts` sets `globals: true` and `testTimeout` 30000, but every test file still explicitly
imports `{ describe, it, expect }` (and `vi`) from `'vitest'`. Source imports use relative paths with
`.js` suffixes (`'../../src/api/index.js'`). `tests/` is excluded from `tsconfig.json` and typechecked
separately under strict by `tsconfig.tests.json` (the `typecheck:tests` step of verify), so tests must
compile.

Lint relaxations in `tests/**`: `explicit-module-boundary-types` off, `no-non-null-assertion` off (so
`createTempoMap()!` in setup is fine); `no-param-reassign` stays `warn`. A test-local brand converter
(`const norm = (x: number): Normalized => x as Normalized`) is allowed because it emits nothing into
`dist/` — RULE U2 only binds `src/`.

Fixtures: `tests/integration/fixtures/**` is immutable (charter invariant 2 — never modify, delete or
add; if one looks wrong, STOP and log BLOCKED). Read via `readFileSync` +
`join(dirname(fileURLToPath(import.meta.url)), ...)`. `tests/integration/*.test.ts` may change only
mechanically (imports, renamed calls) — never weaken normalization or assertions (invariant 3). Unit
tests may be rewritten for new APIs but assertion strength must be preserved (invariant 4).

Facade tests split by concern, following `tests/api/`: `pipeline.test.ts` (behaviour + error policy,
hand-built minimal MSM strings to reach one error path at a time), `plain-data.test.ts` (RULE F1/N4/I3
— a cycle-guarded structural walker, `structuredClone`, a real `MessageChannel` postMessage hop, JSON
round trip, and a no-shared-references walk), `determinism.test.ts` (F7/I5 through the facade),
`facade-equivalence.test.ts` (byte equivalence against the class API over auto-discovered fixtures).

Never byte-compare imprecision-map output (nondeterministic by design) — gate it structurally or by
seed. A new module under `src/supplementary/` must be added by name to `vitest.config.ts`'s coverage
`include` (that directory is listed file by file, not by glob) or it is invisible to the coverage
invariant.

---

## 10. Prototype behaviors

What the mpm-renderer Java prototype (`Exaggerate`, `ModifyService`, `PerformService`, `Shader`,
`Isolation`) actually does, each item with a KEEP / ADAPT / DROP verdict for the port. This is the
input to `DESIGN.md` §5.

### 10.1 Verdict index

| # | Behavior | Verdict |
|---|---|---|
| 1 | Exaggerate identity at 1.0 (default construction) | **KEEP** |
| 2 | One scalar drives all eight dimensions | **ADAPT** |
| 3 | `applyWeights` is a lerp of the deviation from 1.0 | **KEEP** |
| 4 | `scale()` is fieldwise multiplication, NOT lerp | **ADAPT** |
| 5 | `applyWeights` mutates in place | **DROP** |
| 6 | Boxed-`Double` null checks are dead branches | **DROP** |
| 7 | Tempo exaggeration = log-space scaling around the pair geometric mean | **KEEP** |
| 8 | Dynamics exaggeration = same log-space treatment | **KEEP** |
| 9 | Exaggeration only touches TRANSITIONS, never static instructions | **ADAPT** |
| 10 | `meanTempoAt` exaggeration = logit-space scaling around 0.5 | **ADAPT** |
| 11 | Rubato exaggeration = power law on intensity | **KEEP** |
| 12 | Three incompatible operations share one parameter name | **ADAPT** |
| 13 | `dynamicsGradient` and `accentuation` are bare multipliers on `@scale` | **ADAPT** |
| 14 | `temporalSpread` uses the POPULATION geometric mean across all ornament defs | **ADAPT** |
| 15 | Articulation exaggeration is declared but never implemented | **ADAPT** |
| 16 | `scaleTempo` / `scaleDynamics` are plain unclamped multiplies | **KEEP** op / **ADAPT** clamping |
| 17 | Clamps to musical bounds under extreme exaggeration | **ADAPT** |
| 18 | Rubato clamp floor is 0.1, not 1.0 | **ADAPT** |
| 19 | Default weight preset (the actual musical tuning) | **KEEP** as data, **DROP** as a static method |
| 20 | `Shader.bringOut`: empty selection ⇒ identity | **KEEP** |
| 21 | `Shader.bringOut`: MPM element type ⇒ which fields are SPARED | **KEEP** mapping, **ADAPT** mechanism |
| 22 | `Shader.bringOut`: unmatched id ⇒ ALL fields reduced | **DROP** |
| 23 | `Shader.bringOut`: suppression is a hardcoded field SET, applied via multiplication | **ADAPT** |
| 24 | Shader looks elements up by unescaped XPath string interpolation | **DROP** |
| 25 | Bring-out and isolation are mutually exclusive modes | **DROP** |
| 26 | Isolation: structural stripping with reconstructed neutral defaults | **DROP** |
| 27 | Isolation: transition `endDate` capping after stripping | **DROP** |
| 28 | Movement elements produce CC but must not drive the note range | **ADAPT** |
| 29 | Instruction range extension by instruction type | **ADAPT** |
| 30 | `contextualize`: pad the excerpt and duck the surrounding music | **DROP** |
| 31 | Sketchiness curve: separate exponents per dimension | **ADAPT** |
| 32 | Humanization is unconditional and never actually off | **DROP** |
| 33 | `forEachStyle` ignores its type parameter for part-level headers | **DROP** (bug) |
| 34 | `scaleTimingImprecision` domain guard is unreachable | **DROP** |
| 35 | Yamaha Disklavier channel forcing | **ADAPT** |
| 36 | Onset shifting to zero after excerpting | **ADAPT** |
| 37 | Prototype test suite reaches for real fixtures for pure-math code | **ADAPT** |

### 10.2 Detail

#### 1. Exaggerate identity at 1.0 (default construction) — KEEP

`ExaggerateTest.defaultConstructor_allFieldsAreOne` + `valueConstructor_setsAllFields`
(`ExaggerateTest.java:14-38`): all eight fields (tempo, dynamics, rubato, temporalSpread,
dynamicsGradient, relativeVelocity, relativeDuration, accentuation) default to 1.0; the scalar ctor
sets all eight to the same value. 1.0 is the universal neutral/no-op point for every dimension.

**Verdict.** KEEP — 1.0-is-neutral is the load-bearing invariant of the whole design; every op
(log-space lerp, power, plain multiply) has 1.0 as its fixed point. Carry it forward as an explicit
`IDENTITY` constant, but drop the "one scalar sets all eight fields" ctor (see next item).

#### 2. One scalar drives all eight dimensions — ADAPT

`ExaggerateTest.java:28-38` and `PerformService.java:93` (`new Exaggerate(exaggerate)`): a single
user-facing `exaggerate` number is broadcast to all eight fields, then differentiated only by the
weight vector.

**Verdict.** ADAPT — keep "one knob for the user", but the broadcast is only meaningful because
weights immediately re-differentiate it. In the redesign make it `Exaggerate.uniform(s)` composed with
an explicit named preset, so the broadcast is a documented step rather than a constructor side effect.

#### 3. `applyWeights` is a lerp of the deviation from 1.0 — KEEP

`ExaggerateTest.applyWeights_*` (`ExaggerateTest.java:40-94`) / `ModifyService.java:85-94`:
`v' = (v - 1) * w + 1`. Pinned: w=1 is identity, w=0 collapses to 1.0 (neutral, i.e. dimension
disabled), w=0.5 halves the deviation, and w may exceed 1 (dynamics 1.1, accentuation 1.3,
temporalSpread 1.5) to amplify.

**Verdict.** KEEP — this is the correct affine-around-neutral form and the one genuinely well-designed
piece of the prototype. Keep it as the ONLY way weights/presets are applied, and keep the
w=0 ⇒ dimension-off and w>1 ⇒ amplify semantics.

#### 4. `scale()` is fieldwise multiplication, NOT lerp — ADAPT

`ExaggerateTest.scale_multipliesFieldwise` / `scale_identityPreservesValues`
(`ExaggerateTest.java:96-119`) / `ModifyService.java:96-105`: `v' = v * s`. Used only at
`PerformService.java:98` to fold `Shader.bringOut` suppression into the exaggeration vector.

**Verdict.** ADAPT — the operation is fine in isolation but wrong for its one caller. Multiplying a
value whose neutral is 1.0 by 0.1 does not move it toward neutral, it drives it to 0.21 (strong
inverse-exaggeration). Worse, it is non-monotone in intent: exaggerate=2 → 0.21 for suppressed fields
but exaggerate=3 → 0.31, so asking for MORE exaggeration flattens the background LESS. In the redesign
express suppression as a weight vector and compose with `applyWeights` (lerp) only; delete
multiplicative `scale()`.

#### 5. `applyWeights` mutates in place — DROP

`ExaggerateTest.java:44,63,75,86,103` — every combinator returns `void` and mutates `this`; fields are
public boxed `Double` (`ModifyService.java:63-70`). Order of mutation is load-bearing at
`PerformService.java:93-101` and `110-114`.

**Verdict.** DROP — mutable public boxed fields plus `void` combinators. Redesign as a frozen readonly
record with pure `withWeights(w)` / `combine(...)` returning new values, so composition order is
visible in the call site rather than in hidden state.

#### 6. Boxed-`Double` null checks are dead branches — DROP

`ModifyService.modify` (`ModifyService.java:136,142,148,154,160,166`) guards each dimension with
`if (params.exaggerate.X != null)`, but every field is initialized to 1.0 and never nulled — so every
branch always runs, and every map/style is rewritten even at exaggerate=1.0 (attribute values get
re-serialized via `Double.toString`, and clamps get applied to already-out-of-range source values).

**Verdict.** DROP — the "optional per-dimension" intent never materializes. In the redesign either make
dimensions genuinely optional (undefined = skip the pass entirely) or drop the guard and short-circuit
on `value === 1` so identity is a true no-op on the document.

#### 7. Tempo exaggeration = log-space scaling around the pair geometric mean — KEEP

`ModifyServiceTest.exaggerateTempo_scaleGreaterThanOne_widensDifference` /
`scaleLessThanOne_narrowsDifference` / `preservesGeometricMean`
(`ModifyServiceTest.java:83-139`) and `ModifyService.java:248-264`: for a (bpm, transition.to) pair,
take `logMean = (log bpm + log to)/2` and push both endpoints away from it by `scale`. Pins: gap in log
space widens for s>1, narrows for s<1, and `sqrt(bpm*to)` is preserved to within 0.5 BPM.

**Verdict.** KEEP — geometric-mean preservation is the right invariant for a ratio quantity like tempo,
and it is what makes exaggeration musically safe (the passage does not get globally faster or slower,
only more contrastive). Keep and state it as an explicit law, and test it exactly (tolerance 0.5 BPM
only exists to hide clamp/rounding leakage).

#### 8. Dynamics exaggeration = same log-space treatment on (volume, transition.to) — KEEP

`ModifyService.java:227-244`; `ModifyServiceTest` only pins the clamp (line `162-174`), not the mean
preservation. Identical algorithm to tempo, different clamp window.

**Verdict.** KEEP — same law as tempo. In the redesign factor the two into ONE
`exaggeratePair(a, b, s)` helper; the prototype duplicates ~15 lines. Add the missing geometric-mean
test for dynamics.

#### 9. Exaggeration only touches TRANSITIONS, never static instructions — ADAPT

`ModifyService.java:232-233` and `252-253`: entries are skipped unless BOTH the base value AND
`transition.to` are present and positive. A map of static instructions (p, f, mf with no transitions) is
completely untouched by exaggeration.

**Verdict.** ADAPT — this is the biggest behavioral gap. "Exaggerate the performance" should widen
contrast BETWEEN successive instructions (piano vs forte), not only within a single crescendo.
Redesign: compute a map-level reference (weighted geometric mean over the whole map, as
`Isolation.computeWeightedAverage*` already does for another purpose) and push every instruction away
from it; treat the pairwise transition case as a special case of the same rule.

#### 10. `meanTempoAt` exaggeration = logit-space scaling around 0.5 — ADAPT

`ModifyService.java:265-273`: clamp `meanTempoAt` to (1e-6, 1-1e-6), take log-odds, multiply by
`scale`, sigmoid back. Comment explicitly notes the sigmoid removes the need for a hard clamp.
Untested — no test touches `meanTempoAt`.

**Verdict.** ADAPT — the maths is sound and self-clamping (a good model for how to make clamps
unnecessary elsewhere), but it is entirely unpinned by tests and the (0,1) codomain assumption is
undocumented. Keep the technique, add tests (s=1 identity, s>1 pushes toward the nearer extreme, 0.5 is
a fixed point), and reuse the "transform to an unbounded space, scale, transform back" pattern instead
of hard clamps wherever possible.

#### 11. Rubato exaggeration = power law on intensity — KEEP

`ModifyServiceTest.exaggerateRubato_scaleOfOne_noChange` / `scaleGreaterThanOne_increasesAboveOne`
(`ModifyServiceTest.java:178-215`) and `ModifyService.java:278-287`: `intensity' = intensity^scale`.
Pins: s=1 is exactly identity (x^1); for intensity>1, s=2 increases it. Note 1.0 is a fixed point in
BOTH directions, so intensities below 1 are pushed further below.

**Verdict.** KEEP — power law around the natural neutral 1.0 is exactly right for a ratio parameter and
is the cleanest of the three exaggeration shapes. Use it as the template for the new articulation
`relativeVelocity`/`relativeDuration` handling (same neutral, same ratio semantics).

#### 12. Three incompatible operations share one parameter name — ADAPT

"exaggerate" means log-space-lerp-around-pair-mean for tempo/dynamics (`ModifyService.java:227-275`),
power-law for rubato (`278-287`), log-space-around-population-mean for temporalSpread (`291-318`), and
PLAIN MULTIPLICATION for dynamicsGradient (`320-329`) and accentuation (`331-340`). Only the shared 1.0
fixed point makes them interchangeable at all.

**Verdict.** ADAPT — the shared neutral is a real design asset, keep it. But make the per-dimension
transfer function explicit and named (`logSpreadAroundMean` / `powerLaw` / `linearMultiply`) rather than
implicit in the method body, because the weights preset (dynamics 1.1 vs dynamicsGradient 0.3) is only
interpretable once you know which curve a weight feeds.

#### 13. `dynamicsGradient` and `accentuation` are bare multipliers on `@scale` — ADAPT

`ModifyService.java:320-340` — read attribute `scale`, multiply by f, clamp to [0.01, 50]. No mean, no
neutrality logic. Completely untested (no test in `ModifyServiceTest` covers either).

**Verdict.** ADAPT — a plain multiply on `@scale` is defensible (`@scale` is already a deviation
multiplier with neutral 1.0), but it means an exaggerate of 2 on a `@scale` of 3 yields 6, unbounded
growth with no reference point, while tempo's version is mean-preserving. Unify: `scale' = scale^s`
(power form) keeps 1.0 fixed and makes it consistent with rubato. Also add the missing tests.

#### 14. `temporalSpread` exaggeration uses the POPULATION geometric mean across all ornament defs — ADAPT

`ModifyService.java:291-318`: collects every `OrnamentDef`'s `frameLength` in the style, computes the
geometric mean of the whole population, then spreads each def away from it. Untested.

**Verdict.** ADAPT — degenerate by construction: with a single ornament def (the common case)
`logMean == logLen`, so exaggeration is an exact no-op forever, at every scale. Redesign against a
fixed musical reference frame length (or a per-def neutral), not the sample mean, so a one-def style
still responds.

#### 15. Articulation exaggeration is declared but never implemented — ADAPT

`relativeVelocity`/`relativeDuration` exist on `Exaggerate` (`ModifyService.java:68-69`), get weights
0.3/0.2 (`PerformService.java:55-56`), and `Shader` maps type `'articulation'` onto them
(`Shader.java:22`) — but `ModifyService.modify` (`114-172`) has no articulation branch at all. The two
fields are pure bookkeeping; they influence nothing in the rendered output.

**Verdict.** ADAPT — the intent (both are ratio parameters with neutral 1.0, articulation weights
deliberately low because articulation is perceptually loud) is sound and worth carrying. Implement as a
power law over articulationStyle defs AND per-note articulation elements: `relativeVelocity' = rv^s`,
`relativeDuration' = rd^s`, leaving the `absolute*` attributes alone. This is the prototype's largest
unfinished edge.

#### 16. `scaleTempo` / `scaleDynamics` are plain unclamped multiplies — KEEP the op, ADAPT the clamping

`ModifyServiceTest.scaleTempo_doublesAllBpmValues` / `factorOfOne_noChange` /
`scaleDynamics_halvesAllVolumes` (`ModifyServiceTest.java:35-79`) and `ModifyService.java:174-204`:
multiply bpm (and `transition.to`) or volume (and `transition.to`) by f, with NO clamping —
deliberately asymmetric with the `exaggerate*` family, which always clamps.

**Verdict.** KEEP the operation (a global tempo/loudness offset is a distinct, legitimate concept from
exaggeration), ADAPT the clamping asymmetry. The sketchiness path feeds `increase.tempo = s^0.6`
straight into an unclamped multiply (`PerformService.java:108`), so a high sketchiness can produce
BPM > 400 that no clamp catches — the exact failure mode the exaggerate clamps exist to prevent.

#### 17. Clamps to musical bounds under extreme exaggeration — ADAPT

`ModifyServiceTest.exaggerateTempo_clampsToMusicalBounds` (s=100 ⇒ bpm ∈ [10,400], line `141-158`),
`exaggerateDynamics_clampsToMidiRange` (s=100 ⇒ volume ∈ [1,127], line `162-174`),
`exaggerateRubato_clampsToRubatoRange` (s=50 ⇒ intensity ∈ [0.1,5.0], line `217-229`).

**Verdict.** ADAPT — the tests pin "output stays inside a plausible window under absurd input", which is
a real property worth keeping, but they hardcode the specific window into the test. With clamps
becoming optional, restate as: (a) clamps off ⇒ exaggeration is exactly mean-preserving and monotone;
(b) clamps on ⇒ output inside the configured window. Note the two laws CONFLICT: once any endpoint
saturates, the geometric mean is no longer preserved, and at s=100 every value saturates so the map is
destroyed rather than exaggerated. Prefer a symmetric shrink (reduce the effective exponent until both
endpoints fit) over independent per-endpoint clamping, so mean preservation survives.

#### 18. Rubato clamp floor is 0.1, not 1.0 — ADAPT

`ModifyService.java:39-40`, `MIN_RUBATO_INTENSITY=0.1` / `MAX=5.0`, applied at line `284`.

**Verdict.** ADAPT — asymmetric around the neutral 1.0 (0.1× below, 5× above, i.e. one decade down but
only half a decade up in log terms). Whether intentional is undocumented. If clamps become optional
presets, make the window explicitly log-symmetric around neutral unless there is a stated musical
reason not to be.

#### 19. Default weight preset (the actual musical tuning) — KEEP as data, DROP as a static method

`PerformService.getDefaultWeights` (`PerformService.java:47-58`): tempo 1.0, dynamics 1.1, rubato 0.2,
accentuation 1.3, temporalSpread 1.5, dynamicsGradient 0.3, relativeDuration 0.2, relativeVelocity 0.3.
Pinned by `ExaggerateTest.applyWeights_withDefaultWeights` (line `82-94`) for tempo/dynamics/rubato
only.

**Verdict.** KEEP as data, DROP as a static method. This vector is the accumulated musical judgement of
the prototype (rubato and articulation are perceptually violent ⇒ damped to 0.2-0.3; temporalSpread and
accentuation are subtle ⇒ boosted past 1.0) and must survive verbatim as the `default` named preset. But
the test pinning three of eight values is the wrong shape — assert the whole preset object, and put the
rationale in a comment per field.

#### 20. `Shader.bringOut`: empty selection ⇒ identity — KEEP

`ShaderTest.bringOut_emptyIds_allFieldsDefault` (`ShaderTest.java:29-40`) / `Shader.java:38-40`: with no
selected ids, all eight fields stay 1.0 (no suppression).

**Verdict.** KEEP — correct and necessary guard: no selection means no bring-out, not total flattening.

#### 21. `Shader.bringOut`: MPM element type ⇒ which fields are SPARED — KEEP mapping, ADAPT mechanism

`ShaderTest.bringOut_tempoId`/`dynamicsId`/`rubatoId`/`multipleTypes` (`ShaderTest.java:42-77`) /
`Shader.java:16-23,42-59`: start from ALL eight fields marked for reduction, then for each selected id
look up its element `localName` and REMOVE that type's fields from the reduce set. Mapping:
tempo→[tempo], dynamics→[dynamics], rubato→[rubato], accentuationPattern→[accentuation],
ornament→[temporalSpread, dynamicsGradient], articulation→[relativeVelocity, relativeDuration]. Spared
fields stay at 1.0; everything else is SET (not multiplied) to `factor`. Multiple selected types spare
multiple field groups (union of exclusions).

**Verdict.** KEEP the mapping table (it is the domain knowledge: one MPM element type governs one or two
exaggeration dimensions, and ornament/articulation are the two-field cases), ADAPT the mechanism. The
subtractive "reduce everything except" construction is inside-out and produces the nonexistent-id
hazard below; build the spare-set additively from matched types and derive suppression from it.

#### 22. `Shader.bringOut`: unmatched id ⇒ ALL fields reduced — DROP

`ShaderTest.bringOut_nonexistentId_allFieldsReduced` (`ShaderTest.java:79-92`): a typo'd or unknown id
suppresses all eight dimensions to `factor` instead of failing or no-op'ing. The same path fires for any
element type absent from `TYPE_TO_FIELDS` — notably `movement` (sustain pedal) and `style`, which are
perfectly valid selections.

**Verdict.** DROP — silently flattening the entire performance is the worst possible response to a bad
id, and it is reachable in normal use by selecting a pedal marking. Redesign: unmatched ids either raise
or contribute nothing, and an empty spare-set means no suppression at all (identity), never total
suppression.

#### 23. `Shader.bringOut`: suppression is a hardcoded field SET, applied via multiplication — ADAPT

`Shader.java:57-59` sets each reduced field to exactly `factor`; `PerformService.java:97-101` then folds
it in with `params.exaggerate.scale(...)` at a hardcoded factor of 0.1.

**Verdict.** ADAPT — keep the concept (spotlight one dimension by damping the rest), fix the
composition. Suppression belongs in weight space: `weights[f] = suppressionFactor` for non-spared
fields, combined through the lerp, so a suppressed dimension lands NEAR NEUTRAL (1.0) rather than at
0.1-0.3 where it actively inverts the score's own contrast. Also lift the 0.1 to a named parameter of
the preset.

#### 24. Shader looks elements up by unescaped XPath string interpolation — DROP

`Shader.java:46`: `xml.query("//*[@xml:id='" + id + "']")`, run once per selected id over the whole
performance tree.

**Verdict.** DROP — an id containing a quote breaks the query, and it is O(ids × tree). Redesign: build
one id→element index for the performance and look up by key.

#### 25. Bring-out and isolation are mutually exclusive modes — DROP

`PerformService.java:87-101`: if `isolate` is true the performance is structurally stripped
(`Isolation.stripNonSelected`) and `Shader` is skipped; if false and selection is MPM_IDS,
`Shader.bringOut` is applied to the intact performance instead. Two entirely different mechanisms behind
one boolean.

**Verdict.** DROP the mode switch along with isolation — with isolation gone, bring-out becomes the
single, always-available spotlight mechanism. This is the simplification the redesign is buying.

#### 26. Isolation: structural stripping with reconstructed neutral defaults — DROP

`IsolationTest.testStripNonSelected_mapsAreCorrectlyStripped` / `preservesStyleElements` /
`selectedTempoAffectsOutput` / `selectedDynamicsAffectOutput` (`IsolationTest.java:137-177, 209-245,
307-375`) and `Isolation.java:90-160`: delete every non-selected instruction, preserve `<style>`
switches, insert a weighted-average neutral tempo/dynamics at date 0 so notes before the selection are
not left at meico's velocity-100 default.

**Verdict.** DROP per the redesign brief. Salvage exactly one idea:
`Isolation.computeWeightedAverageTempo`/`Dynamics` (duration-weighted mean over a map,
`Isolation.java:34-88`) is the map-level reference point that the new contrast-based exaggeration needs
(see item 9). Keep the function, discard its stripping caller.

#### 27. Isolation: transition `endDate` capping after stripping — DROP

`IsolationTest.testStripNonSelected_tempoEndDateIsPreserved` /
`testIsolatedTempo_transitionShapeIsPreserved` (`IsolationTest.java:486-552`) and
`Isolation.capTransitionEndDates` (`Isolation.java:162-218`): when a selected instruction's successor is
deleted, `endDate` degenerates to `Double.MAX_VALUE` and the transition stretches to infinity (flat
tempo), so a cap element is re-inserted at the original `endDate`.

**Verdict.** DROP — this is pure repair work for damage that only stripping causes. It ceases to exist
when isolation does. (It is also the tell that stripping was structurally the wrong approach: the
mechanism required a second mechanism to undo its own corruption.)

#### 28. Movement elements produce CC but must not drive the note range — ADAPT

`IsolationTest.testMovementOnly_producesEmptyNoteRange` / `testMovementDoesNotExpandNoteRange` /
`testMovementWithDynamics_rangeFromDynamicsOnly` /
`testMixedSelection_notesOnlyFromNoteDrivingInstructions` /
`testMovementOnlySelection_midiHasNoNotesButHasCCEvents` (`IsolationTest.java:86-117, 388-463`) and
`Isolation.java:224-249`: selecting only `<movement>` elements yields range [0,0] — sustain-pedal CC
events render, zero notes do; mixing movements into a selection never widens the note window.

**Verdict.** ADAPT — genuinely hard-won domain knowledge (pedal markings are not note-selecting
instructions) and it survives isolation's removal IF any excerpt/window feature survives. If the
redesign keeps excerpting, carry this classification forward as an explicit "note-driving vs
control-only instruction type" predicate; if excerpting also goes, it dies with it.

#### 29. Instruction range extension by instruction type — ADAPT

`IsolationTest.testTempo`/`testDynamics`/`testRubato`/`testAccentuation`/`testCombination`
(`IsolationTest.java:58-124`) pin exact ranges ([720,3600], [2520,3600], [3600,4320], [2880,3600]) and
`Isolation.java:270-330` computes them: tempo/dynamics extend to their `endDate`, rubato to
`startDate+frameLength`, accentuation to `startDate + patternLength*720`. Union across a combined
selection.

**Verdict.** ADAPT — the per-type "effective duration" rule (each instruction type spans differently:
explicit `endDate` vs `frameLength` vs pattern length) is real domain knowledge worth keeping IF
excerpting survives. The tests themselves are DROP: they hardcode absolute tick values from one specific
fixture, so they break on any fixture change and document nothing about the rule.

#### 30. `contextualize`: pad the excerpt and duck the surrounding music — DROP

`PerformService.java:147-149` with `CONTEXT_AMOUNT=0.375`, implemented at `Isolation.java:413-446`:
widen the window by `0.375*4*720` ticks before and half that after, then inject dynamics at volume 30 to
make the surrounding context quiet.

**Verdict.** DROP — and note the implementation is broken independently of the redesign: line `436` tests
`dd.startDate <= endTarget` and line `443` calls `addDynamics(endTarget + 1, "30.0")`, where `endTarget`
is a VOLUME (from `getDynamicsAt`) being used as a DATE. Whatever the intended ducking behaviour was,
this code cannot be implementing it. If context-ducking is wanted later, rewrite from the spec, not from
this.

#### 31. Sketchiness curve: separate exponents per dimension — ADAPT

`PerformService.java:103-115`: `s = max(sketchiness, 1)`; `increase.tempo = s^0.6`;
`exaggerate.dynamics *= 1/s^0.5` (sketchier ⇒ flatter dynamics); `exaggerate.rubato *= s^0.7` (sketchier
⇒ more rubato); `imprecisionMs = 80 * log2(s+1)`.

**Verdict.** ADAPT — the musical model (a sketchier read-through is faster, flatter, more rubato-y and
less precise) is a coherent artistic statement worth keeping, but it is expressed as four bare exponents
applied with `*=` onto an already-weighted vector, so it silently composes with the weights and with
bring-out in an order-dependent way. Redesign as a named preset that produces a weight vector, combined
through the same lerp as everything else.

#### 32. Humanization is unconditional and never actually off — DROP

`ModifyService.modify` calls `humanize()` unconditionally as its first statement
(`ModifyService.java:115`); `PerformService.java:103-104` computes s=1.0 when sketchiness is null, giving
`imprecisionMs = 80*log(2)/log(2)` = exactly 80 ms. So ANY call that passes an exaggerate value silently
gets an 80 ms timing-imprecision distribution injected into the global map.

**Verdict.** DROP — hidden, unrequested, and it makes exaggeration non-deterministic and non-reproducible
(every render differs). Redesign: humanization is its own explicitly-requested transform with its own
amount, never a side effect of `modify()`; the neutral amount is 0 and 0 means no map is added.

#### 33. `forEachStyle` ignores its type parameter for part-level headers — DROP (bug)

`ModifyService.java:359-378`: the global-header branch honours the `type` argument (line `364`), but the
per-part loop hardcodes `Mpm.ORNAMENTATION_STYLE` (line `373`). Currently masked because the only caller
passes `ORNAMENTATION_STYLE` (line `149`).

**Verdict.** DROP (bug) — it becomes a live defect the moment articulation-style exaggeration is
implemented, which is exactly what the redesign is adding. The traversal helper must honour its type for
both global and part scopes.

#### 34. `scaleTimingImprecision` domain guard is unreachable — DROP

`ModifyService.java:206-212` accepts domains `'timing'` or `'toneduration'`, but its only caller (line
`129`) already selects `Mpm.IMPRECISION_MAP_TIMING`, so the toneduration branch can never fire.

**Verdict.** DROP — dead branch. Either traverse all imprecision domains and keep the guard, or drop the
guard and traverse one.

#### 35. Yamaha Disklavier channel forcing — ADAPT

`PerformService.java:155-162`: strips any existing `midi.channel` and forces channel 0 on every part
before MIDI export, because the target instrument ignores other channels.

**Verdict.** ADAPT — legitimate hardware requirement, but it is hardcoded into the render path so
multi-timbral output is impossible. Make it an explicit output option (`forceChannel?: number`) rather
than an unconditional rewrite.

#### 36. Onset shifting to zero after excerpting — ADAPT

`PerformService.shiftOnsetsToFirstNote` (`PerformService.java:229-264`): after filtering, find the
minimum `milliseconds.date` across notes and subtract it from every dated element, flooring at 0, so an
excerpt starts at t=0.

**Verdict.** ADAPT — correct and useful for excerpt playback, and it correctly shifts ALL dated elements
(not just notes) so pedal/CC stay aligned. Keep as a standalone excerpt utility, independent of both
isolation and exaggeration.

#### 37. Prototype test suite reaches for real fixtures for pure-math code — ADAPT

`ShaderTest` (`ShaderTest.java:21-27`) loads `input.mpm` through meico just to resolve six element ids by
type; `ModifyServiceTest` (line `25-31`) loads it to test log-space arithmetic. Several tests silently
pass by returning early when the fixture lacks the needed shape
(`ModifyServiceTest.java:89,108,127,206` — `if (idx < 0) return;`).

**Verdict.** ADAPT — the maths (exaggerate curves, weight lerp, type→field mapping) is pure and must be
tested on synthetic in-memory data with exact assertions. The early-return escapes mean several
"passing" tests currently assert nothing at all on a fixture without transitions. Keep fixture-based
tests only for the end-to-end render path.

### 10.3 Magic-number inventory

Every hardcoded constant in the prototype, with its role. `DESIGN.md` C2 forbids carrying any of these
forward unnamed; each must become a documented option, a named preset value, or be dropped with a
recorded reason.

**`ModifyService.java` — clamps and the neutral**

| line | constant | role |
|---|---|---|
| `:35` | `MIN_BPM = 10.0` | lower clamp for exaggerated tempo (`bpm` and `transition.to`) |
| `:36` | `MAX_BPM = 400.0` | upper clamp for exaggerated tempo; pinned by `ModifyServiceTest.java:151` |
| `:37` | `MIN_VELOCITY = 1.0` | lower clamp for exaggerated dynamics volume (MIDI floor; 0 would be silence) |
| `:38` | `MAX_VELOCITY = 127.0` | upper clamp for exaggerated dynamics volume; pinned by `ModifyServiceTest.java:171` |
| `:39` | `MIN_RUBATO_INTENSITY = 0.1` | lower clamp for rubato intensity after the power law; asymmetric around neutral 1.0 |
| `:40` | `MAX_RUBATO_INTENSITY = 5.0` | upper clamp for rubato intensity; pinned by `ModifyServiceTest.java:226` |
| `:41` | `MIN_FRAME_LENGTH = 1.0` | lower clamp for ornament `temporalSpread` `frameLength` (ticks); untested |
| `:42` | `MAX_FRAME_LENGTH = 2000.0` | upper clamp for the same; untested |
| `:43` | `MIN_SCALE_FACTOR = 0.01` | lower clamp for `@scale` of ornamentation and metricalAccentuation elements; untested |
| `:44` | `MAX_SCALE_FACTOR = 50.0` | upper clamp for the same `@scale`; untested |
| `:63-70` | `1.0` ×8 | `Exaggerate` field defaults — the universal neutral / no-op point for every dimension |
| `:86-93` | `- 1.0` / `+ 1.0` | in `applyWeights`; encodes 1.0 as the lerp pivot (deviation-from-neutral form) |
| `:110` | `0.0` | `humanize()`: the imprecision distribution is inserted at the start of the piece |
| `:110` | `4.0` | `humanize()`: `degreeOfCorrelation` — smoothness of the compensating-triangle timing noise; wholly undocumented |
| `:110` | `300.0` | `humanize()`: `millisecondsTimingBasis` — the ms window the distribution is defined over |
| `:237`, `:257` | `/ 2.0` | arithmetic mean of exactly two logs = geometric mean of a value/transition PAIR (hardcodes "exactly two endpoints") |
| `:269` | `1e-6` (twice, as `1e-6` and `1.0 - 1e-6`) | epsilon clamping `meanTempoAt` into the open interval so the logit is finite |
| `:271` | implicit `0.5` | the neutral fixed point of the logit/sigmoid `meanTempoAt` scaling (log-odds of 0.5 is 0) |
| `:308` | `logSum / lengths.size()` | population geometric mean over ALL ornament defs in a style; degenerate (exact no-op) when a style has one def |

**`PerformService.java` — the musical tuning**

| line | constant | role |
|---|---|---|
| `:30` | `MAX_EXEMPLIFY_DURATION = 5760.0` | max excerpt length in ticks; 5760/720 = 8 quarter notes = 2 bars of 4/4. DUPLICATED at `Isolation.java:31` |
| `:31` | `CONTEXT_AMOUNT = 0.375` | context padding as a fraction of a 4/4 bar (0.375·4·720 = 1080 ticks = 1.5 beats before, half that after) |
| `:34` | `SKETCH_TEMPO_EXP = 0.6` | sketchiness→tempo increase exponent (`s^0.6`); feeds the UNCLAMPED `scaleTempo` |
| `:35` | `SKETCH_RUBATO_EXP = 0.7` | sketchiness→rubato exaggeration exponent (`s^0.7`), applied multiplicatively onto the already-weighted rubato |
| `:36` | `SKETCH_DYNAMICS_EXP = 0.5` | sketchiness→dynamics FLATTENING exponent (`1/s^0.5`) |
| `:37` | `SKETCH_IMPRECISION_BASE_MS = 80.0` | base timing imprecision; with `log2(s+1)` at line `:104` this yields exactly 80 ms even at s=1, so humanization is never actually off |
| `:47-58` | tempo 1.0, dynamics 1.1, rubato 0.2, accentuation 1.3, temporalSpread 1.5, dynamicsGradient 0.3, relativeDuration 0.2, relativeVelocity 0.3 | THE musical tuning vector; only tempo/dynamics/rubato are pinned by a test (`ExaggerateTest.java:88-93`) |
| `:99` | `0.1` | bring-out factor, hardcoded at the call site; the value every non-selected dimension is set to before being folded in multiplicatively |
| `:103` | `1.0` | sketchiness floor — values ≤ 1 are coerced to 1, making 1.0 the neutral of that knob too |
| `:104` | `Math.log(s + 1.0) / Math.log(2.0)` | the `+1.0` offset and log base 2; imprecision grows as `log2(s+1)`, = 1.0 at s=1 |
| `:161` | `midi.channel "0"` | Yamaha Disklavier requirement, forced unconditionally on every part |
| `:178` | `d >= minDate && d < maxDate` | half-open note-collection window (inclusive start, exclusive end) |
| `:253`, `:260` | `Math.max(0.0, …)` | floor for shifted onsets; prevents negative `milliseconds.date` |

**`Shader.java`**

| line | constant | role |
|---|---|---|
| `:16-23` | `TYPE_TO_FIELDS` | the type→dimension table (contents below); the only two-field entries are ornament and articulation |

`TYPE_TO_FIELDS` in full: tempo→tempo, dynamics→dynamics, rubato→rubato,
accentuationPattern→accentuation, ornament→[temporalSpread, dynamicsGradient],
articulation→[relativeVelocity, relativeDuration].

**`Isolation.java`**

| line | constant | role |
|---|---|---|
| `:31` | `MAX_EXEMPLIFY_DURATION = 5760.0` | duplicate of `PerformService.java:30` — two independent sources of truth for the same cap |
| `:32` | `DEFAULT_PPQ = 720` | hardcoded ticks-per-quarter used at `:322` and `:414`; `PerformService.perform()`'s ppq parameter is never threaded through |
| `:59` | `100.0` | fallback tempo BPM, returned when no weighted tempo average can be computed |
| `:86` | `70.0` | fallback dynamics, returned when no weighted dynamics average can be computed |
| `:37`, `:66` | `lastDuration` seed `1.0` | the last map entry's weight reuses the previous segment's duration (`endDate` is often `Double.MAX_VALUE`) |
| `:138` | `addTempo(0.0, avg, 0.25)` | `0.25` is the `beatLength` (quarter note) of the injected neutral tempo |
| `:174`, `:202` | `Double.MAX_VALUE / 2` | sentinel threshold for detecting a degenerate (infinite) `endDate` |
| `:179`, `:207` | `- 0.5` | half-tick tolerance when matching a stripped element's `startDate` against the original `endDate` |
| `:268` | `maxDate += 1` | one-tick epsilon so the instruction's own onset falls inside the half-open range |
| `:403` | `date + 1` | one-tick window for a single-instruction example |
| `:414` | `context * 4 * DEFAULT_PPQ` | the `4` hardcodes 4 beats per bar for context width |
| `:416` | `contextInTicks / 2.0` | trailing context is half the leading context |
| `:432`, `:442-443` | volume `"30.0"`, curvature `0.4`, protraction `0.0` | the ducked context loudness and its curve; `endTarget + 1` at `:442-443` uses a VOLUME as a DATE (bug) |

**Test-only constants**

| location | constant | role |
|---|---|---|
| `ShaderTest.java:31,45,54,62,72,96` | 0.1 / 0.3 / 0.5 | bring-out suppression factors exercised; 0.1 matches the production call site |
| `ModifyServiceTest.java:40,71,94,113,132,209,239` | 2.0 / 0.5 | the "widen" and "narrow" probes |
| `ModifyServiceTest.java:146,166` and `:221` | 100.0, 50.0 | deliberately absurd inputs used only to force clamp saturation |
| `ModifyServiceTest.java:137` | tolerance 0.5 BPM | slack on the geometric-mean assertion that hides clamp and `Double.toString` round-tripping; the true law is exact when unclamped |
| `ModifyServiceTest.java:45,60,76,188` and `:249,279` | 1e-6; 0.01 / 0.001 | float comparison epsilons and thresholds |
| `ModifyServiceTest.java:242` | `imprecisionMs 80.0` | the integration test hardcodes the same value `PerformService` computes at s=1 |






