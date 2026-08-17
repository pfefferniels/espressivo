# Ornamentation: MEI signs become real notes

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

A `<trill>`, `<mordent>` or `<turn>` in the MEI is not a note, and most tools leave it that way.
espressivo implements the **MPM v3 ornamentation model** — designed by Lars Engeln and Axel
Berndt — so an ornament sign becomes an MPM
`<ornament>` carrying the notes it plays — a note pool, the playing order (`|: #a #b :|` for a
repeated figure), and an `<ornamentDef>` saying where in time the figure sits and how it is
spaced — and the renderer then generates those notes into the performance.

Nothing extra is needed to get it. `convertMeiToMsmMpm` writes the ornaments, `performMsm` plays
them, and the trill in `composite_advanced.mei` comes out of `performMsmToData` as three sounding
notes where the score had one:

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

## Turning it off

Two switches, both defaulting to on, and they compose:

```ts
convertMeiToMsmMpm(mei, { expandOrnaments: false }); // don't write ornaments into the MPM
performMsm(movement, { expandOrnaments: false }); // keep them in the MPM, don't play them
```

Why there are two rather than one, and which one a caller wants, is
[PARITY.md §6.6](../PARITY.md).
