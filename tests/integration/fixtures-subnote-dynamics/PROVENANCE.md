# `fixtures-subnote-dynamics/` — provenance

Java-generated ground truth for `@subNoteDynamics`, which **no fixture under
`tests/integration/fixtures/` sets**: every `<volume>` entry in the corpus carries
`mandatory="true"`, so only the non-sub-note branch of `DynamicsMap` was ever reached, every
`channelVolumeMap` in the repository had exactly one entry at date 0, and the branch that
produces a continuous ramp was unexercised.

Generated 2026-08-21 from `meico@1d662105` — the same fork commit as every other reference
family here — by `GenerateSubNoteDynamicsReference.java`, kept alongside so the set can be
regenerated. It is modelled on `GenerateAllMapsReference`'s helpers so its output is comparable
with that family. Build and run:

    javac -nowarn -cp "externals/*" -d <scratch> $(find src/meico -name '*.java')
    cp -R src/resources <scratch>/resources        # InstrumentsDictionary reads these
    javac -nowarn -cp "<scratch>:externals/*" -d <scratch> GenerateSubNoteDynamicsReference.java
    java -cp "<scratch>:externals/*" GenerateSubNoteDynamicsReference <out>

It is a **sibling** of `fixtures/` because CHARTER invariant 2 freezes `fixtures/**` against
additions as well as edits, following `fixtures-v3/`, `fixtures-layers-to-staffs/`,
`fixtures-multi-instruction/` and `fixtures-pedal/`.

## The pair pins the difference, not one side

Both documents carry the same MSM (eight quarter notes) and the same two dynamics
instructions — a transition 40 → 120 across the first half, and 120 → 40 with curvature and
protraction across the second. They differ in one boolean.

|                        | `<volume>` entries                             | note velocities                   | expressive MIDI |
| ---------------------- | ---------------------------------------------- | --------------------------------- | --------------- |
| `subnote_dynamics_off` | **1**, at date 0, `value="100"` (the default)  | the ramp: 40, 59.98…, 80, 100.02… | 199 bytes       |
| `subnote_dynamics_on`  | **54**, a continuous ramp at non-integer dates | flat 100 throughout               | 355 bytes       |

That is the semantic: with `subNoteDynamics` off, a dynamic is quantised to one velocity per
note; with it on, the velocity stays flat and the shape is emitted as a continuous MIDI
channel-volume ramp instead. The difference is byte-visible in the MIDI, which is why one
fixture would not have been enough — a suite that only had the `on` case could not tell a
regression from the `off` behaviour.
