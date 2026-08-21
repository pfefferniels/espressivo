# working rules for this repo

design rules live in [ARCHITECTURE.md](ARCHITECTURE.md) (`RULE M*`, `F*`, `N*`, `C*`, `I*`, `U*`,
`E*`), and every deliberate divergence from Java meico lives in [PARITY.md](PARITY.md). the rules
below are about **how we write comments**. they are newer than most of the code, so the existing
corpus does not follow them yet — that is expected, see D4.

## RULE D1 — comment only what the code cannot say

a comment earns its place when the code or its docstring does not speak for itself:

- a non-obvious invariant, or an order that is load-bearing
- a Java-parity quirk: why this reproduces something that looks wrong
- why the obvious thing was **not** done

do not restate the signature, do not narrate the next line, do not explain a name that already
explains itself. if you cannot name what a comment adds, delete it.

the long form of a parity story belongs in PARITY.md, not in the source. from the source, point at
it in one line:

```ts
// `'id'`, not `'xml:id'`: `attribute()` matches local names only. PARITY.md §1.
const xmlId = attribute('id', e);
```

not four lines retelling the ledger entry.

## RULE D2 — delete stale comments, do not append to them

when you change code, the comment above it is yours to **rewrite or remove**, not to extend. a
comment describing what the code used to do is worse than no comment (ARCHITECTURE.md's own
preamble says the same about superseded rules).

specifically:

- do not leave dev history in the source — "was X before T14", "changed in the refactor", "used to
  use parseFloat". git and the commit message hold that.
- do not add a remark next to an existing remark because the existing one is there. adapting to the
  surroundings is how a two-line comment becomes twelve.
- if a comment block has grown into a small essay, cut it back to the load-bearing sentence while
  you are in there.

## RULE D3 — plain language, lowercase

short sentences, ordinary words, lowercase. a comment is a note to the next person, not prose.

```ts
// java reads this once, up front, so the branches below don't compose — last write wins
```

not

```ts
// NOTE: The Java implementation reads the duration exactly once, at the top of the block,
// which is load-bearing, because it means that each of the three branches computes from the
// original value rather than from what its predecessor wrote...
```

keep capitals for the things that are actually names — `RULE N1`, `ArticulationMap.java:293`,
`@modified`.

## RULE D4 — do not sweep the old comments

these rules apply to comments you **write or touch**. leave the rest alone: a repo-wide comment
rewrite would be a huge diff with no behaviour change, and it would bury real work in review. when
you edit a function, bring its comments to D1–D3; otherwise walk past.

## docstrings

same rules, one difference: a public docstring may be longer, because it is the API's
documentation and readers cannot see the body. it still should not carry dev history.

## reporting work

the same restraint applies to what you write back to the user. report the measurement, not the
narrative around it. commit messages and PARITY.md entries may be long **when they carry evidence**
— a probe transcript, a byte count, a negative control. they should not re-narrate that evidence in
prose afterwards.
