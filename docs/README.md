# Documentation

The [README](../README.md) is the short version: install, quick start, the API table, and a
paragraph on each of the things espressivo adds to meico. These are the long versions.

| Guide                                        | What it covers                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`ornamentation.md`](ornamentation.md)       | The MPM v3 ornamentation model: signs become sounding notes, the provenance every generated note carries, the two switches |
| [`expression.md`](expression.md)             | `exaggerateMpm` / `spotlightMpm` — MPM in, MPM out; what `s` means, what is guaranteed, building a slider                  |
| [`comparison.md`](comparison.md)             | `compareMpm` / `diffMpm` / `compareMpmCorpus` / scapes — the metric, the decomposition, the cookbook, and the three limits |
| [`fitting.md`](fitting.md)                   | `fitMpm` / `listFitters` / `validateChain` — the pipeline the other way: an aligned recording in, the MPM that explains it |
| [`reading.md`](reading.md)                   | Reading an MPM as data — the object model, resolved instructions, charting one instruction's curve                         |
| [`layers-to-staffs.md`](layers-to-staffs.md) | `Mei.layersToStaffs()` — one MSM part, channel and instrument per MEI layer                                                |
| [`equivalence.md`](equivalence.md)           | How "produces what meico produces" is enforced, and the eight deliberate departures                                        |

Two documents live at the repository root because they are not guides:

- [`PARITY.md`](../PARITY.md) — the parity ledger. Every divergence from Java meico, every bug
  reproduced on purpose, with Java line citations. Cited by identifier from the guides above.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — the standing architectural contract. Its numbered
  `RULE`s are cited from 72 files in `src/` and `tests/`, and partly enforced by `eslint.config.js`.
