# Ornamentation: MPM ornaments become real notes

> **An espressivo addition, and the one feature outside the equivalence claim.** Java meico does
> not implement MPM v3, so there is nothing to be byte-identical to. This is verified against the
> specification and hand-computed vectors instead, in its own fixture directory, and every decision
> that goes beyond what the spec fixes — including where this deliberately differs from the
> unmerged Java branch that also implements v3 — is written up in
> [PARITY.md §6](../PARITY.md), together with the proof that it moves no byte of anything that
> _is_ under the claim. MPM **v2** ornamentation is unchanged and stays inside the equivalence
> claim.
>
> Back to the [README](../README.md).

An ornament is not a note, and most tools leave it that way. espressivo implements the **MPM v3
ornamentation model** — designed by Lars Engeln and Axel Berndt — in which an `<ornament>` carries
the notes it plays: a note pool, the playing order (`|: #a #b :|` for a repeated figure), and an
`<ornamentDef>` saying where in time the figure sits and how it is spaced. The renderer generates
those notes into the performance.

The ornaments come from the MPM, which comes from outside — espressivo does not read `<trill>`,
`<mordent>` or `<turn>` out of an MEI and write them for you ([PARITY.md §9](../PARITY.md)).
Given an MPM that carries one, `performMsm` plays it, and a trill comes out of `performMsmToData`
as three sounding notes where the score had one:

| `id`      | `pitch` | `milliseconds` | `ornamented` | `ornamentSource` | `ornamentSlot` | `ornamentAnchor` |
| --------- | ------- | -------------- | ------------ | ---------------- | -------------- | ---------------- |
| `n20`     | 74      | 7500 → 7767.94 | `true`       | `tr1_n0`         | 0              | `n20`            |
| `meico_…` | 76      | 7767.94 → 8000 | `true`       | `tr1_n1`         | 1              | `n20`            |
| `meico_…` | 74      | 8000 → 8125    | `true`       | `tr1_n0`         | 2              | `n20`            |

All three also carry `ornamentRef: "tr1"`, the `xml:id` of the ornament that produced them.

## Provenance on every generated note

Every generated note says where it came from, so you can join a performance back to the score
without parsing the ornament yourself: `ornamentRef` names the `<ornament>`, `ornamentSource` the
token in its playing order, `ornamentSlot` the position in the expanded figure, `ornamentPass` the
repetition it belongs to, and **`ornamentAnchor` the score note the whole figure decorates** —
which is the field to key on, because generated `id`s are fresh per run. `ornamented` is also true
for a note an ornament merely _altered_: the head of the original note that survives in front of
an end-aligned figure, and any note an MPM v2 ornament shifts or shades.

## The whole model, for hand-written MPM

Hand-written MPM gets the whole model, not just what the MEI signs use: note pools with absolute
pitches or chromatic and diatonic intervals (resolved against the score's key signature), chords
and repetition groups in `note.order`, `repetitions`, `alignment="at end"`, frame values in ticks,
milliseconds or percent of the note's duration, all three `noteoff.shift` modes, and dynamics
gradients across the figure.

## Grace notes

A grace note takes no time from the bar, and MSM has no place for a note without a duration, so
`convertMeiToMsm` leaves every `graceGrp` and grace `chord` out of the MSM — as meico does, byte
for byte. It does not forget them: each movement carries a `graces` list saying what was left out
and where it belongs, which is exactly what a v3 ornament needs to put it back.

```ts
const [movement] = convertMeiToMsm(mei);
movement.graces[0];
// {
//   id: 'pxnvdff', part: 2, date: 4320,
//   principal: 'nanro74',        // the MSM note the group leads to: its @noteid
//   tiedToPrincipal: true,       // the last grace note is tied into it
//   kind: null, attach: null,
//   notes: [
//     { id: 'n1or9mhw', pitch: 46, pitchname: 'b', accidentals: -1, octave: 1, slot: 0 },
//     { id: 'nw7mgns',  pitch: 53, pitchname: 'f', accidentals: 0,  octave: 2, slot: 1 },
//   ],
// }
```

The pitches are the converter's own — key signature, the bar's earlier accidentals,
transposition — and reading them changes nothing in the MSM ([PARITY.md §10](../PARITY.md)).

Played, a group is one `<ornament>` on its principal, its notes the pool, the principal last in
the order. When the last grace note is tied into the principal, the principal _is_ that grace
note, struck early and held, so it takes the last grace note's place rather than following it:

```xml
<!-- B♭ then F, the F tied into the principal: two strikes, the second one held -->
<ornament xml:id="grace_nanro74" date="4320" name.ref="grace" noteid="#nanro74"
          note.order="#n1or9mhw #nanro74" scale="0">
  <note xml:id="n1or9mhw" midi.pitch="46"/>
</ornament>

<!-- untied: the grace, then the principal on its beat -->
<ornament xml:id="grace_nc05e7t" date="22320" name.ref="grace" noteid="#nc05e7t"
          note.order="#n15rsjn #nc05e7t" scale="0">
  <note xml:id="n15rsjn" midi.pitch="72"/>
</ornament>
```

Written in code, the pool is `OrnamentNote`s handed to `OrnamentationMap.addOrnamentV3` as
`notes`, with `noteid` and `noteOrder` beside them —
`new OrnamentNote(note.id, { kind: 'midi', value: note.pitch })` for each grace note.

The `<ornamentDef>` says when: a negative `frame.offset` puts the figure before the beat, and the
last slot — the principal — lands at the frame's end, so `frame.offset="-180ms"` with
`frameLength="180ms"` plays the grace 180 ms early and the principal on time.
`noteoff.shift="monophonic"` lets each grace note give way to the next. Generated notes carry the
provenance below, and `ornamentSource` is the MEI grace note's `xml:id` when the pool note is
named after it, as above.

## Turning it off

One switch, defaulting to on:

```ts
performMsm(movement, { expandOrnaments: false }); // keep them in the MPM, don't play them
```

The ornaments stay in the document — a consumer still reads them — and the score is performed
without them. There was once a second flag of the same name on the conversion side; it went with
[PARITY.md §9](../PARITY.md), and §6.6 records why the two were distinct.
