# Campaign records

Working records of the completed campaigns that produced this port: charters, design docs,
append-only journals, verification reports, research notes and probe tools.

These are kept rather than deleted for one concrete reason: **PARITY.md and the code cite them.**
`PARITY.md` backs its equivalence claims with `[T…]` and wave entries that live in these journals,
and ~180 JSDoc comments across `src/` and `tests/` cite rulings by their identifier — `RULE M1`,
the `D10 id-uniqueness ruling`, `[T19]`. Without these files those citations are dead ends, and
the reasoning behind a deliberate-looking oddity in the code becomes unrecoverable. They are
history, not documentation: read `README.md` and `ARCHITECTURE.md` first.

## Layout

| Path | What it is |
| --- | --- |
| `refactor/` | The swarm that turned the verbatim Java port into idiomatic TypeScript (T0–T23, complete). `CHARTER.md` holds the invariants still in force — immutable fixtures, the coverage floor, the `PARITY NOTE` convention. `state.json` is its finished work queue, kept because it records the T13 acceptance criteria and the downstream-consumer requests that `tests/api/determinism.test.ts` cites. |
| `ornamentation/` | The MPM v3 ornamentation programme, plus `research/` (five prior-art reports) and `tools/` (byte-probe scripts). |
| `expression/` | The expression-transform campaign — `exaggerateMpm` / `spotlightMpm`. |

`ARCHITECTURE.md` deliberately does **not** live here. It sits at the repository root because it
is not history: its numbered RULEs are the standing architectural contract, cited from 72 files in
`src/` and `tests/`, and enforced in part by `eslint.config.js` (`import/no-cycle` and the
per-layer `no-restricted-imports` zones implement RULE M1's table).

## Convention for future campaigns

A campaign record goes in `docs/history/<campaign>/`. Keep the repository root for things a
newcomer needs: source, tests, `README.md`, `PARITY.md`, `ARCHITECTURE.md`.

Records are also exempt from Prettier via a single `docs/history/` entry in `.prettierignore`.
They are hand-formatted and mostly append-only, and — the sharper reason — they are cited by
`file.md:LINE` anchors, so reformatting one silently invalidates every anchor pointing into it
while leaving the build green.

## Citation paths

These documents moved on 2026-08-10. Records written before then may cite the old locations; the
files themselves were relocated unmodified, so **line numbers in existing `:NNN` anchors remain
valid** — only the path prefix changed.

| Old | New |
| --- | --- |
| `refactor/ARCHITECTURE.md` | `ARCHITECTURE.md` |
| `refactor/{CHARTER,log,lint-debt}.md`, `refactor/state.json` | `docs/history/refactor/…` |
| `ornamentation/…` | `docs/history/ornamentation/…` |
| `expression/…` | `docs/history/expression/…` |

To update a branch written against the old layout:

```sh
perl -pi -e '
  s{(?<![\w/])refactor/ARCHITECTURE\.md}{ARCHITECTURE.md}g;
  s{(?<![\w/])refactor/(CHARTER\.md|log\.md|lint-debt\.md|state\.json)}{docs/history/refactor/$1}g;
  s{(?<![\w/])ornamentation/(LOG\.md|CAMPAIGN\.md|DESIGN\.md|research/[\w.-]+\.(md|mjs)|tools/[\w.-]+\.mjs)}{docs/history/ornamentation/$1}g;
  s{(?<![\w/])expression/(LOG\.md|CAMPAIGN\.md|DESIGN\.md|SURVEY\.md|REVIEW-FINDINGS\.md|W\d-VERIFICATION\.md)}{docs/history/expression/$1}g;
' $(git ls-files -- '*.ts' '*.md' '*.js' '*.mjs')
```

The lookbehind is load-bearing: without it the `expression/` rule also rewrites `src/expression/`
and `tests/expression/`, which are ordinary source. It also means paths inside URLs are skipped —
check Markdown links by hand.

One deliberate exception: statements *about the old layout* inside the journals ("`.prettierignore`
exempts `refactor/`") are left alone. They record what was true when written, and rewriting them
would falsify the record rather than fix a link.
