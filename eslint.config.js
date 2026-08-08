import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

/**
 * Flat ESLint config for meico-ts.
 *
 * Baseline: typescript-eslint `strict` + `stylistic` (non-type-checked presets).
 * Type-aware linting is deliberately deferred: it is slow across 26k LOC and its
 * findings (`no-unnecessary-condition`, `restrict-template-expressions`, ...) are
 * entangled with the null-vs-undefined policy that item T12 has to settle first.
 * `refactor/lint-debt.md` records a measured preview of what type-aware rules would
 * add, so that decision can be made with numbers.
 *
 * Formatting is Prettier's job alone; `prettierConfig` must stay last so it can
 * switch off every stylistic rule that would fight the formatter.
 */
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
      // --- Style decisions codified for the refactor (see refactor/state.json T2) ---

      // `===` everywhere. No `null: 'ignore'` exemption yet: the `x == null`
      // idiom is fine in isolation, but every loose comparison in this port has to
      // be read against T12's null-vs-undefined policy before it is blessed or
      // rewritten, so they all stay visible in the debt report until then.
      eqeqeq: 'error',

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
      // refactor/lint-debt.md records that count separately.
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

  prettierConfig,
);
