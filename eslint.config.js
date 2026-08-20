import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

/**
 * Flat ESLint config for meico-ts.
 *
 * Baseline: typescript-eslint `strict` + `stylistic` (non-type-checked presets), plus the
 * three type-aware rules ARCHITECTURE.md RULE N6 names, enabled by T21 over `src/` only.
 * The *presets* stay non-type-checked: N6 rejected `recommendedTypeChecked` explicitly,
 * because hundreds of findings over parity-frozen code would drown a gate that is
 * deliberately outside `npm run verify`. `docs/history/refactor/lint-debt.md` records the measured
 * preview those numbers came from.
 *
 * The architecture rules of ARCHITECTURE.md §1.2 are enforced at the bottom of this file
 * (item T18): `import/no-cycle` for the cycle ban, and per-layer `no-restricted-imports`
 * zones for RULE M1's dependency directions. Both were green at zero violations when
 * added; they exist so the tree cannot drift back.
 *
 * Formatting is Prettier's job alone; `prettierConfig` must stay last so it can
 * switch off every stylistic rule that would fight the formatter.
 */

/**
 * RULE M1's table, as data. Each entry says: files under `layer` may not import from any
 * of `forbidden`. `typeOk` marks the one direction §1.2 permits as `import type` — the MSM
 * layer names `Performance` in `Msm.exportExpressiveMidi`'s signature, and a type import is
 * erased before it can become a module edge.
 *
 * Globs match the import *specifier*, which is always relative here, so `**` has to absorb
 * the leading `../`. `src/mei/**` is the top interior layer of the renderer, so everything
 * below it is fair game for the converter; its only entry is the reverse guard below.
 *
 * An `expression` glob appears in every renderer zone for the REVERSE direction: the expression
 * transform sits above the whole renderer and reads raw XML, so no renderer module may reach up
 * into it. Fencing only the downward direction would leave the new layer half-enforced — the
 * edge count is zero today, and these entries are what keeps it there.
 *
 * A `comparison` glob appears in every zone below it for the same reason, the `expression` zone
 * included: the comparison module (comparison/DESIGN.md §9.7, A24) sits above the expression
 * transform, which it reads for the forward scale-space maps and nothing else.
 */
const LAYER_ZONES = [
  {
    layer: 'leaves',
    files: [
      'src/prelude/**/*.ts',
      'src/xml/**/*.ts',
      'src/music/**/*.ts',
      'src/supplementary/**/*.ts',
      'src/version.ts',
    ],
    forbidden: [
      '**/midi/**',
      '**/msm/**',
      '**/mpm/**',
      '**/mei/**',
      '**/musicxml/**',
      '**/expression/**',
      '**/comparison/**',
    ],
    why: 'L0/L1 leaf modules import nothing from a higher layer, the expression transform and the comparison module at the top of the tree included (ARCHITECTURE.md RULE M1).',
  },
  {
    layer: 'midi',
    files: ['src/midi/**/*.ts'],
    forbidden: [
      '**/msm/**',
      '**/mpm/**',
      '**/mei/**',
      '**/musicxml/**',
      '**/expression/**',
      '**/comparison/**',
    ],
    why: 'src/midi/** is L2 and must not know about MSM, MPM, MEI, or the two document layers above them (RULE M1).',
  },
  {
    layer: 'msm',
    files: ['src/msm/**/*.ts'],
    forbidden: ['**/mpm/**', '**/mei/**', '**/musicxml/**', '**/expression/**', '**/comparison/**'],
    typeOk: true,
    why: 'src/msm/** is L3: MPM, MEI, the expression transform and the comparison module are above it, so only `import type` may cross (RULE M1).',
  },
  {
    layer: 'mpm',
    files: ['src/mpm/**/*.ts'],
    forbidden: ['**/mei/**', '**/musicxml/**', '**/expression/**', '**/comparison/**'],
    why: 'src/mpm/** is L4 and must not import the MEI layer or the two document layers above it — T14 removed the last 33 such MEI edges (RULE M1/M2).',
  },
  {
    layer: 'mei',
    files: ['src/mei/**/*.ts'],
    forbidden: ['**/expression/**', '**/comparison/**'],
    why: "src/mei/** is the renderer's top interior layer, still below the expression transform and the comparison module.",
  },
  {
    layer: 'expression',
    files: ['src/expression/**/*.ts'],
    // Negated last, gitignore-style: everything under `src/mpm/` is forbidden EXCEPT
    // `names.ts`, which is the MPM vocabulary — the namespace URI plus the six style-collection
    // and thirteen map local names. That module is a documented leaf that imports nothing (it
    // exists precisely to break the `Mpm` ⇄ element-module cycle), so depending on it is
    // depending on the format's spelling, not on the renderer.
    forbidden: [
      '**/midi/**',
      '**/msm/**',
      '**/mei/**',
      '**/musicxml/**',
      '**/mpm/**',
      '**/comparison/**',
      '!**/mpm/names.js',
    ],
    why:
      'src/expression/** is a document transform over raw MPM XML: it may use src/xml/**, ' +
      'src/supplementary/** and the MPM name constants, and nothing else. Importing a renderer ' +
      'class would reintroduce exactly what DESIGN.md D-A/A1 forbids — `new Mpm(text)` runs the ' +
      'mutating def parsers in its CONSTRUCTOR, so merely parsing a document rewrites it.',
  },
  {
    layer: 'comparison',
    files: ['src/comparison/**/*.ts'],
    // comparison/DESIGN.md §9.7 (A24) specifies this zone, negations included. It PERMITS
    // `**/expression/**`, which is the whole point of §4's placement decision: the forward
    // scale-space maps `T` live in `expression/transforms.ts` so they sit beside the closed
    // forms they are property-tested against, and comparison is their only consumer.
    //
    // Two carve-outs, both narrow, both measured:
    //   - `mpm/names.js`, exactly as the expression zone carves it out — the format's
    //     spelling, from a leaf that imports nothing.
    //   - `mpm/elements/maps/data/bezier.js`, the ideal-curve math §5.3 compares against
    //     rather than transliterating a fourth copy of. Safe for the same reason: it imports
    //     nothing, so it drags in neither `Mpm.js` nor the map modules whose
    //     `registerMapFactory` side effects exist. And it is outside `package.json`'s
    //     `sideEffects` list — that glob is `./dist/mpm/elements/maps/*.js` and the compiled
    //     module is one directory deeper, so bundlers are told it is side-effect-free.
    //
    // THE STAIRCASE IS NOT DECORATION. This rule matches with gitignore semantics (ESLint
    // builds an `ignore` matcher from the group, `no-restricted-imports.js:311`), and
    // gitignore cannot re-include a file whose parent directory is excluded. DESIGN §9.7
    // specifies the carve-out as one negation, `!**/mpm/elements/maps/data/bezier.js`, and
    // that form is silently INERT: `**/mpm/**` excludes `mpm/elements` as a directory, so the
    // negation never fires and the import stays blocked. Re-including each ancestor and
    // re-excluding its contents is gitignore's own idiom for "everything under here except
    // this one file". Verified by negative control: with the single negation the bezier
    // import errored; with the staircase it is allowed while `mpm/Mpm.js`,
    // `mpm/elements/GenericMap.js`, `mpm/elements/maps/TempoMap.js` and
    // `mpm/elements/maps/data/TempoData.js` all still error.
    forbidden: [
      '**/api/**',
      '**/midi/**',
      '**/msm/**',
      '**/mei/**',
      '**/musicxml/**',
      // `**/music/**` and `src/units.ts` were named by the `why` below as outside the zone and
      // were absent from this list, so the stated zone and the enforced one disagreed (W3
      // MINOR-7). Zero live violations either way — which is exactly why nothing would have
      // caught the drift until an import turned it into a defect.
      '**/music/**',
      '**/units.js',
      '**/mpm/**',
      '!**/mpm/names.js',
      '!**/mpm/elements',
      '**/mpm/elements/*',
      '!**/mpm/elements/maps',
      '**/mpm/elements/maps/*',
      '!**/mpm/elements/maps/data',
      '**/mpm/elements/maps/data/*',
      '!**/mpm/elements/maps/data/bezier.js',
    ],
    why:
      'src/comparison/** reads two MPM documents and writes none: it may use src/xml/**, ' +
      'src/supplementary/**, src/expression/** (the forward maps of comparison/DESIGN.md §4), ' +
      'the MPM name constants and the dependency-free Bézier math, and nothing else. The ban ' +
      'on the renderer classes is the same one the expression zone carries and for the same ' +
      'reason — `new Mpm(text)` runs the mutating def parsers in its CONSTRUCTOR, so merely ' +
      'parsing a document rewrites it, and a comparison that mutates its input is not one. ' +
      '`**/api/**` is banned for the same reason at one remove (MINOR-5): src/api/index.ts ' +
      'transitively reaches Mpm.js, and it is an upward import besides — W3 builds the facade ' +
      'and creates the temptation.',
  },
];
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      // Agent worktrees are checkouts of this same repo nested inside it; linting them lints
      // another branch's work-in-progress and attributes it here.
      '.claude/worktrees/**',
      // Java-generated ground truth + MEI inputs. Immutable (charter invariant 2).
      'tests/integration/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Node scripts, not library code. `scripts/bench.mjs` is a measurement tool that runs
  // against `dist/`, so it is the one place in the repo that legitimately prints to stdout
  // and reads `process.argv`; the two globals are declared rather than pulled from the
  // `globals` package to avoid a dependency for two names.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },

  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // --- Style decisions codified for the refactor (see docs/history/refactor/state.json T2) ---

      // `===` everywhere, except `x == null`. T12 settled the null-vs-undefined policy
      // (ARCHITECTURE.md RULE N5) and blessed that one idiom: in TypeScript it is the
      // correct test for "null or undefined", and it is load-bearing here because the XOM
      // layer returns `null` on some paths and `undefined` on others. Rewriting any of
      // these to `=== null` introduces a bug. T14 applied the relaxation and edited not one
      // comparison.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',

      // A parameter kept for API parity with Java and deliberately unused is spelled with a
      // leading underscore, which is the language's own convention for saying so. Without
      // this, `Msm.writeMsmString(_filename)` and `Mpm.writeMpmString(_filename)` — both
      // Java's `write*(String filename)`, both returning the XML instead of writing a file —
      // are the last `no-unused-vars` finding in their directories, and the only way to clear
      // them is to delete a published parameter or to scatter `eslint-disable` comments.
      // `docs/history/refactor/lint-debt.md:564,596` and `log.md:2694,3175,3643` each named
      // this exact fix and each deferred it to "whoever owns the config"; three deferrals is
      // enough. It only RELAXES the rule, and only for parameters, so nothing that was caught
      // before stops being caught: the default `args: 'after-used'` already ignores an unused
      // parameter that is followed by a used one, which is every other `_`-prefixed parameter
      // in the tree (81 of them, all in callbacks like `(_unused, index) => …`).
      //
      // The half that did NOT change earns its keep: an unused local or import is still an
      // error, which is what caught three stale imports in `src/mpm` and an
      // `InstrumentsDictionary` variable that existed only to feed a `console.log` deleted
      // hours earlier.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Exported API must state its return type; inference is fine internally.
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // `for (let i = 0; i < xs.length; i++)` over an indexable => `for..of`.
      '@typescript-eslint/prefer-for-of': 'error',

      // --- Immutable-friendly direction (CHARTER.md, 2026-08-08) ---

      // Reassigning a parameter hides the fact that the caller's value is being
      // shadowed. Deliberately `warn`, not `error`: the charter grants the
      // conversion/rendering core an explicit mutation boundary, so some of these
      // are legitimate and T12 has to draw that line before this can be enforced.
      // Left at the default `props: false` — it flags rebinding the parameter
      // itself, not mutation through it. Flipping `props: true` would flag
      // `renderXToMap(map)`-style writes, which ARE the documented purpose here;
      // docs/history/refactor/lint-debt.md records that count separately.
      'no-param-reassign': 'warn',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      // Test helpers are internal by definition, and `!` on a fixture lookup that
      // is provably present is clearer than a redundant guard.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // --- Type-aware linting (T21; ARCHITECTURE.md RULE N6) ---
  //
  // Three named rules, no preset, `src/` only. The preset was rejected by name in N6: over
  // parity-frozen code it adds hundreds of findings to a gate that is deliberately not part
  // of `npm run verify`. These three each pay for themselves — `prefer-readonly` is the only
  // way to measure RULE I4 at all, and the other two are the safety net for the null policy
  // (N2b's `?? []` guards and N3's `!`s become *provably* dead here rather than by argument).
  //
  // `projectService` is what makes them work and what makes them slow, so it is scoped to
  // `src/**` exactly as N6 requires; `tests/**` keeps the cheap syntactic parse.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // --- The functional turn ---
      //
      // A sum type is only worth having if every arm is handled. `src/` has 68 `switch`
      // statements against 29 exhaustiveness checks, and that gap is where the next arm gets
      // dropped silently. Type-aware, so it lives in this block rather than the syntactic one.
      // Each measured against the tree before being turned on; all but the first were
      // already at zero, so they cost nothing and stop the tree drifting back.
      //
      //   no-unnecessary-type-parameters       2 — a type parameter used once is a `any` in
      //                                            disguise, which is the opposite of the point
      //   no-unnecessary-template-expression   1
      //   prefer-reduce-type-parameter         0
      //   no-unnecessary-boolean-literal-compare 0
      //   require-array-sort-compare           0 — `.sort()` on numbers sorts lexicographically,
      //                                            which for a tick list is a silent disaster
      //
      // NOT enabled, having been measured and found cosmetic here:
      //   prefer-nullish-coalescing  56 sites, and they are not the bug hunt they look like.
      //     41 are `if (x === null) x = d`, where the field is `T | null` and `??=` means
      //     exactly the same thing. The 15 real `||` were each checked for the failure that
      //     makes this rule worth having — a falsy-but-valid left operand — and none has it:
      //     they are `map.get(k) || 0` over a counter, `namespaceURI || ''`, and the like,
      //     where the falsy value and the default coincide. No `date || …` or `velocity || …`
      //     anywhere, which is the case that would actually have bitten.
      //   prefer-optional-chain      17 sites, pure style.
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/no-unnecessary-template-expression': 'error',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // §8.10 audit 4. `src/` reached zero in T16 (the last three sites went with RULE C3's
      // Bézier extraction and the `resolveEntryIndex` rewrite), so promoting this costs
      // nothing here and makes the regression loud. `tests/**` keeps `warn`: the two
      // remaining sites are in `tests/integration/**`, which no source item may touch.
      'no-param-reassign': 'error',
    },
  },

  // --- A library does not narrate to stdout ---
  //
  // `console.log` is progress, and progress is the host's business, not a library's. The
  // six directories below reached zero of them when the factories stopped printing their
  // failures: nine narration lines in `Mei.ts` ("Resolving copyofs and sameas's:", " done"),
  // four in `Performance.perform`, two conversion banners, and four sites that were
  // *diagnostics* filed under `log` and now sit on `error` beside their own neighbours. The
  // ban is what stops the count going back up.
  //
  // Scoped to these six and not to `src/**` for one reason: `src/msm/**` (11) and
  // `src/midi/**` (20) still have theirs, and they belong to other people's work. Widen the
  // glob when they are done.
  //
  // `console.error` is deliberately NOT banned. ~55 sites remain in `src/mpm` and they are a
  // different species from the ones this campaign converted: "this value is out of range,
  // here is the clamped one", not "this element cannot be read". Converting a warn-and-repair
  // site to a `Result` means changing what the function returns on the SUCCESS path too, and
  // that is a larger and separately-argued change.
  {
    files: [
      'src/mpm/**/*.ts',
      'src/mei/**/*.ts',
      'src/xml/**/*.ts',
      'src/music/**/*.ts',
      'src/expression/**/*.ts',
      'src/prelude/**/*.ts',
    ],
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },

  // --- Architecture enforcement (T18; ARCHITECTURE.md §1.2, RULES M1/M3/M4) ---

  {
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    settings: {
      // Both of these are load-bearing, and their failure mode is a SILENT PASS — the rule
      // reports nothing because it never sees a graph, not because the graph is acyclic.
      // If you change either, re-run the negative control: re-point any
      // `src/mpm/elements/**` module's `names.js` import at `Mpm.js` and confirm
      // `import/no-cycle` fires.
      //   - resolver: sources import each other with `.js` specifiers naming `.ts` files.
      //   - parsers:  no-cycle walks the graph by re-parsing each *dependency*, and
      //               without this mapping it hands `.ts` files to espree, which cannot
      //               read them, so every dependency looks import-free.
      'import/parsers': { '@typescript-eslint/parser': ['.ts'] },
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: 'tsconfig.json' },
      },
    },
    rules: {
      /**
       * The T18 rule. Zero cycles as of that item; before it there were 31 runtime cycles,
       * all through `Mpm.ts`, and deep-importing any `mpm/elements/**` module threw.
       *
       * `no-cycle` ignores `import type` edges by construction (they are erased by tsc and
       * cannot deadlock module evaluation), which is exactly the notion of "cycle" that
       * matters here — `Msm` ⇄ `Performance` and `Global` ⇄ `Dated` are type-only closures
       * that §1.2 deliberately permits, and this rule correctly stays quiet about them.
       */
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
    },
  },

  ...LAYER_ZONES.map(({ files, forbidden, typeOk, why }) => ({
    files,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: forbidden, allowTypeImports: typeOk ?? false, message: why }] },
      ],
    },
  })),

  prettierConfig,
);
