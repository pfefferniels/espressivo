# Fitting: solving for the MPM a recording implies

> **An espressivo addition.** Java meico applies an MPM to a score; it does not solve for one.
> There is no Java output to be byte-identical to, so this module makes no parity claim of any
> kind, and nothing in it is reachable from the conversion or rendering paths the equivalence
> suites drive. It came in from `mpmify` as a move rather than a port, and what it is held to
> instead — a structural digest of every round-trip case, recorded before the move and
> byte-identical after it — is [PARITY.md §10](../PARITY.md), together with the two measured
> limits of that instrument.
>
> Back to the [README](../README.md).

Everything else in this library runs score → performance: an MSM says what is played, an MPM says
how, and the renderer puts the two together. **Fitting runs the other way.** You already have the
performance — a recording, aligned note by note to its score — and the MPM is what is missing.
`fitMpm` writes it: the document a renderer would need in order to sound that recording again.

That inversion is the thing to hold on to, because it changes what the inputs are. Rendering takes
a score and a performance description. Fitting takes a score **with the recording laid on it**, and
a list of what to explain.

```ts
import { fitMpm } from 'espressivo';

const { mpm, calls, skipped } = fitMpm({ msm: alignment, chain, pedals, sources });
```

## The input is an alignment, not a score

`input.msm` is an MSM whose every `<note>` carries **both halves**: the score in `date`,
`duration`, `midi.pitch`, `pitchname`, `octave` and `accidentals`, and the recording in
`velocity`, `milliseconds.date` and `milliseconds.date.end` — the same three attributes a render
writes. An MSM carrying only the score half is refused with an `EmptyDocumentError`, because it is
a score and there is nothing to fit anything to.

Two things about the recording have no place in that document, and travel beside it:

- **`pedals`.** MSM's `<pedal>` is `date` / `state` / `date.end` in **ticks**, and a recorded pedal
  has no symbolic date at all — where it falls on the score grid is one of the things the fit has
  to work out. So a `FitPedal` is `{ id, type: 'sustain' | 'soft', date, end, source? }`, both
  times in milliseconds from the start of the recording.
- **`sources`.** `source` — which reading of a passage a note came from, what `MakeChoice` selects
  on — is not an MSM attribute. `sources` is one `{ id, source? }` per `<note>` **in document
  order**; the `id` is a checksum on that pairing, not a key, and a mismatch is refused. It is
  positional because a passage aligned twice is two `<note>` elements under one `xml:id`, which is
  the shape `MakeChoice` exists to reduce.

Both are optional. Omit `pedals` and no pedalling is fitted; omit `sources` and no fitter can tell
one reading from another.

The MSM you pass is not modified — a fresh alignment is built from the text on every call.

## The chain is a required input

There is **no default chain, and nothing generates one**. `src/fitting/transformers/Order.ts`
orders transformer _names_; it does not produce calls. "Fit this recording, no instructions given"
is a research problem rather than an API, and the signature says so instead of pretending
otherwise: `chain` sits beside `msm` as a required field.

A chain is a list of `FitCall`s — `{ id, name, options }`, plain JSON. `id` is yours to choose and
is what the result reports back under; `name` is one of `listFitters()`'s; `options` is data.

```ts
import { listFitters, validateChain } from 'espressivo';

listFitters(); // 20 fitters, in reduction order:
// { name: 'MakeChoice',  ordinal: 0,  requires: [] }
// { name: 'InsertPedal', ordinal: 18, requires: ['TranslatePhysicalTimeToTicks'] }

validateChain(chain); // everything wrong with it that can be known without a document
```

`validateChain` answers the two questions `fitMpm` would refuse on, all at once rather than one
exception at a time: a fitter this build does not have (`kind: 'unknown-fitter'`), and a call whose
`requires` nothing before it satisfies (`kind: 'unsatisfied-requirement'`). An empty list means the
chain _runs_ — not that it fits anything, which only the alignment can say.

A `Set`-valued option crosses as `{ dataType: 'Set', value: [...] }` and a `Map` as
`{ dataType: 'Map', value: [[key, value], ...] }`, which is what keeps a saved chain plain data.

## A worked example

The committed alignment lives in `tests/fitting/fixtures/roundtrip/` — an excerpt of a real
reconstruction: Schumann's _Träumerei_, upbeat and four bars, aligned to Welte-Mignon roll 225
(Alfred Grünfeld). It is the triple and the chain as four files, which is what a consumer holds:

```ts
import { readFileSync } from 'node:fs';
import { fitMpm, validateChain, type FitCall, type FitNoteSource, type FitPedal } from 'espressivo';

const dir = 'tests/fitting/fixtures/roundtrip';
const read = (name: string) => readFileSync(`${dir}/${name}`, 'utf-8');

const msm = read('alignment.msm');
const pedals: FitPedal[] = JSON.parse(read('alignment.pedals.json'));
const sources: FitNoteSource[] = JSON.parse(read('alignment.sources.json'));
const { provenance: chain }: { provenance: FitCall[] } = JSON.parse(read('chain.json'));

const problems = validateChain(chain);
if (problems.length > 0) throw new Error(problems.map((problem) => problem.message).join('\n'));

const { mpm, calls, skipped } = fitMpm({ msm, chain, pedals, sources });

calls.length; // 84 — one per call of the chain
skipped; // [] — this build has every fitter the chain names
calls[20]; // { id: 'f55da820-…', name: 'InsertTempo', ordinal: 20,
//   elements: ['tempo_0'], range: { from: 0, to: 720 } }
```

`chain.json` is a work file, and its `provenance` is a `FitCall[]` as it stands — 84 calls over 14
fitters. What comes back for it is an MPM carrying a `tempoMap`, a `rubatoMap`, a `dynamicsMap`, a
`metricalAccentuationMap`, an `articulationMap`, an `ornamentationMap` and a `movementMap` — the
pedalling, in the `<movement>` encoding the README describes.

Three fields come back per call:

- **`elements`** — the `xml:id`s of the MPM elements this call is answerable for. Derived by
  comparing the document before and after the call rather than declared by it, so a fitter that
  reshapes an instruction another one wrote is credited with it too. This is what lets an editor
  select "what did this call do".
- **`range`** — the stretch of score it acted on, in **ticks**. `to` is `null` where the call names
  a date rather than a span, and `range` itself is `null` where there is nothing to place it
  against.
- **`ordinal`** — its position in the order the chain _ran_, which is reduction order and not the
  order you wrote it in.

**An unknown fitter is skipped, not fatal.** A chain saved by a newer build can name a fitter this
one does not have, and the useful answer is the partial fit plus a list of what was dropped — which
is `skipped`, by `FitCall.id`. Pass `{ strict: true }` for an `InvalidOptionError` instead. An
unsatisfied `requires` is fatal in **both** modes: running the well-ordered part of a broken chain
would produce a document that looks fitted and is not.

## The order is the reduction, and it does not permute

Fitting is a reduction. Each fitter explains one slice of the deviation between the score and the
recording and writes the MPM instruction that accounts for it; the next one works on what is left.
`Order.ts` is that reduction, and the chain runs in it whatever order the calls were listed in.
Three places where you can see why:

**A rolled chord has no onset to measure a tempo from.** `InsertTemporalSpread` runs at ordinal 3,
ahead of both tempo fitters. It writes the roll as an ornament and pulls the chord's onsets back
onto one date; a tempo fitted before that would be reading inter-onset intervals off notes that are
one chord in the score and several separate arrivals in the recording.

**`TranslatePhysicalTimeToTicks` is the hinge.** Before it, the fitters work in the recording's own
domain — milliseconds — and several of them rewrite the recorded onsets as they go, which is why
`InsertTempo` and `InsertAsynchrony` are placed ahead of it. After it, the question is where a
recorded onset falls on the **score grid**, in ticks, and that is a question only a tempo map can
answer. Ticks are the one domain `<rubato>` speaks, and `InsertRubato`, `InsertArticulation`,
`MakeDefaultArticulation` and `InsertPedal` all name the hinge in `requires` for that reason. What
the transformer itself still converts is an `<ornament>`'s frame, from milliseconds into ticks in
the document.

**A metrical pattern is invisible under a trend that has not taken its share.**
`InsertMetricalAccentuation` requires `InsertDynamicsInstructions` and follows it. It reads the
residual velocity beat by beat — recorded minus what the MPM already renders — so with the dynamics
curve still unaccounted for, every beat of the bar carries that curve's share and the pattern it
measures is the trend, not the metre.

And a negative control, which the registry states with numbers: `InsertDynamicsGradient` runs before
`InsertTemporalSpread`, because the gradient reads a chord's ramp direction off the very onsets the
spread is about to collapse. Run the other way round, an arpeggio measured at 39/51.5/64 refits as
64/51.5/39 — every ramp reversed, silently. `Order.ts` carries the full note.

## What is not provided

**There is no MEI door.** `convertMeiToMsm` produces a score, and nothing in espressivo reads an
alignment out of an MEI, because there is no standard vocabulary to read one from. The committed
fixture's alignment was baked by mpmify's `scripts/bake/asMSM.ts` out of a vocabulary private to
that project — an `extData` of type `duration`, one of type `velocity`, an `absolute` with an `ms`
suffix. If you have an MEI and a recording, **aligning them and emitting the MSM above is your
job**, and it is the larger half of the work. `fitMpm` starts where the alignment already exists.

**Nothing analyses the recording for you.** `fitMpm` runs the chain it is handed and no more. It
does not decide that this passage wants a rubato and that one an accentuation pattern, and it does
not choose a segmentation; those decisions are the chain, and the chain comes from a person or from
a tool that is not this one. What the module does is carry them out in an order in which they
compose, and report which element of the document each of them is answerable for.

## The full model

The pipeline is `src/fitting/`; `residual.ts` is the best single entry point, because "what does
the MPM as it stands not yet explain" is the quantity every fitter is written against. The facade
and its typed errors — `ParseError`, `EmptyDocumentError`, `InvalidOptionError` and
`FittingEngineError` — are `src/api/fitting.ts`, and what the module is held to in place of
meico-equivalence is [PARITY.md §10](../PARITY.md).
