# One part per voice: splitting MEI layers

> **A backport, not an invention.** `Mei.layersToStaffs()` is upstream `meico.mei.Mei`, added in
> cemfi/meico **v0.11.10** and amended in **v0.11.12**. The Java fork this port is measured against
> is v0.11.2 and predates both, so there was no reference method to be byte-equivalent to; ground
> truth was obtained by splicing upstream's method into a scratch copy of the fork and generating
> from that. The construction, the two upstream behaviours reproduced, and the one deliberate
> hardening are in [PARITY.md §8](../PARITY.md).
>
> **The equivalence suite for this pass no longer exists.** What it compared was the MPM a
> conversion derived alongside the MSM, and [PARITY.md §9](../PARITY.md) removed that half of
> the converter; the 32 generated files went with it. The method, its return value and §8's
> rulings all stand — the byte gate under them does not. §9.4 records the loss, and §8 says
> what regenerating would take.
>
> Back to the [README](../README.md).

MEI keeps the voices of a keyboard or divisi staff as sibling `<layer>` elements inside one
`<staff>`, and the conversion makes one MSM `<part>` per `<staffDef>` — so those voices arrive
merged into a single part, sharing one MIDI channel and one instrument. `Mei.layersToStaffs()`
rewrites the encoding first, giving every layer its own staff and therefore **its own part,
channel and instrument**:

```ts
import { Mei, Mei2MsmMpmConverter } from 'espressivo';

const mei = Mei.fromXml(readFileSync('piano.mei', 'utf8'));
const [provenance] = mei.layersToStaffs(); // staff 1 / layers 1,2  ->  staffs 11, 12

const [msm] = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
// two parts now, numbered 11 and 12, on MIDI channels 0 and 1

provenance.get('11'); // { origStaff: '1', origLayer: '1' }
provenance.get('12'); // { origStaff: '1', origLayer: '2' }
```

The return value is one map per `mdiv` — one per movement, matching what the converter emits —
from each generated staff's `@n` back to the staff and layer it came from. You need it because the
numbering is lossy: `111` alone cannot say whether it was staff 1 / layer 11 or staff 11 / layer 1.
Java discards this map; keeping it is the one deliberate departure, and
[PARITY.md §8.4](../PARITY.md) says why.

It is opt-in and mutates the instance — clone first if you still need the original — and the
default pipeline is unchanged if you never call it. New staffs are numbered by concatenating the
original `staff@n` and `layer@n`, and each staff's `<staffDef>` is copied so clef, key,
transposition and instrument follow the voice.

## Two edges worth knowing

Both are inherited from meico and both are detailed in [PARITY.md §8](../PARITY.md):

- Control events keep their original `@staff`, so a `<slur staff="1">` becomes a dangling reference
  once the staffs are renumbered, and is dropped.
- An `<oStaff>` whose children are `<oLayer>` elements is removed rather than split, so do not run
  the pass over ossia content you need to keep.
