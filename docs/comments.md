# Comment style

The rules this codebase's comments are held to. They come from the usual sources —
Ousterhout's _A Philosophy of Software Design_ (ch. 12–16), Kernighan & Pike's _The
Practice of Programming_, and the TSDoc conventions — narrowed to the two failure modes
this tree actually has: comments that narrate the refactor, and comments that restate the
line below them.

## The test a comment has to pass

**A comment earns its place by adding precision or intuition.** Precision means a fact the
code cannot state: a unit, a range, a boundary condition, an ordering guarantee, an
aliasing or mutation contract. Intuition means the level above the code: what this is for,
why it is shaped this way, what breaks if you change it.

A comment written at the same level as the code it sits on is a restatement, and a
restatement is worse than nothing — it costs a read and rots independently. Delete it.

## What belongs in a comment here

- **Units, ranges, boundary conditions.** Ticks or milliseconds, 0-based or 1-based,
  inclusive or exclusive, what happens at zero.
- **Invariants and ordering.** Especially where a downstream artefact depends on them —
  the exported MIDI event order, map sort order, id assignment.
- **Mutation and aliasing.** Which arguments are written through, what is safe to share.
- **Deliberate deviation from meico.** Where the port does something the Java does not, or
  keeps a Java quirk on purpose, say which and why. The parity tests are the reason.
- **Citations.** MIDI/MEI/MPM specification clauses, `DESIGN.md` sections, `docs/history/`
  rulings. Cite; do not paraphrase at length.
- **Measured facts.** A number that came from running something, with what it was measuring.

## What does not

- **How the code got here.** "This used to be…", "no longer", "T20 dissolved…", phase and
  task ids, notes about earlier notes. That is the commit log's job, and the commit log
  already has it.
- **Restatement.** `// increment i` over `i++`; a `@param bytes the bytes` that repeats the
  signature.
- **Argument and self-assessment.** The code does not need to be defended, praised, or
  advertised in its own comments. State the fact, not the case for it.
- **Duplicate documentation.** Document a decision once and reference it from the other
  places. Two copies disagree eventually.
- **Commented-out code**, and TODOs with no owner.

## Form

- Interface comment: one to three sentences, unless the contract genuinely needs more.
  Lead with what the thing is for, not with how it works.
- Implementation comment: precede the block it explains, not every line in it.
- Plain declarative prose. No bold-for-emphasis, no rhetorical build-up, no second-person
  lecture.
- `@param` / `@returns` only where they say something the signature does not.
- Section banners only where a file has genuinely separate sections.
