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
 */
const LAYER_ZONES = [
  {
    layer: 'leaves',
    files: ['src/xml/**/*.ts', 'src/music/**/*.ts', 'src/supplementary/**/*.ts', 'src/version.ts'],
    forbidden: [
      '**/midi/**',
      '**/msm/**',
      '**/mpm/**',
      '**/mei/**',
      '**/musicxml/**',
      '**/expression/**',
    ],
    why: 'L0/L1 leaf modules import nothing from a higher layer, the expression transform at the top of the tree included (ARCHITECTURE.md RULE M1).',
  },
  {
    layer: 'midi',
    files: ['src/midi/**/*.ts'],
    forbidden: ['**/msm/**', '**/mpm/**', '**/mei/**', '**/musicxml/**', '**/expression/**'],
    why: 'src/midi/** is L2 and must not know about MSM, MPM, MEI, or the expression transform above them (RULE M1).',
  },
  {
    layer: 'msm',
    files: ['src/msm/**/*.ts'],
    forbidden: ['**/mpm/**', '**/mei/**', '**/musicxml/**', '**/expression/**'],
    typeOk: true,
    why: 'src/msm/** is L3: MPM, MEI and the expression transform are above it, so only `import type` may cross (RULE M1).',
  },
  {
    layer: 'mpm',
    files: ['src/mpm/**/*.ts'],
    forbidden: ['**/mei/**', '**/musicxml/**', '**/expression/**'],
    why: 'src/mpm/** is L4 and must not import the MEI layer or the expression transform above it — T14 removed the last 33 such MEI edges (RULE M1/M2).',
  },
  {
    layer: 'mei',
    files: ['src/mei/**/*.ts'],
    forbidden: ['**/expression/**'],
    why: "src/mei/** is the renderer's top interior layer, still below the expression transform.",
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
      '!**/mpm/names.js',
    ],
    why:
      'src/expression/** is a document transform over raw MPM XML: it may use src/xml/**, ' +
      'src/supplementary/** and the MPM name constants, and nothing else. Importing a renderer ' +
      'class would reintroduce exactly what DESIGN.md D-A/A1 forbids — `new Mpm(text)` runs the ' +
      'mutating def parsers in its CONSTRUCTOR, so merely parsing a document rewrites it.',
  },
];
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      // Java-generated ground truth + MEI inputs. Immutable (charter invariant 2).
      'tests/integration/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

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

      // §8.10 audit 4. `src/` reached zero in T16 (the last three sites went with RULE C3's
      // Bézier extraction and the `resolveEntryIndex` rewrite), so promoting this costs
      // nothing here and makes the regression loud. `tests/**` keeps `warn`: the two
      // remaining sites are in `tests/integration/**`, which no source item may touch.
      'no-param-reassign': 'error',
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
