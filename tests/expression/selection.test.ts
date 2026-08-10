/**
 * `resolveSelection` — DESIGN.md D-I's type → dimension table, and the two ways an id can fail.
 *
 * The documents here are hand-built for the same reason the applier's are: what needs covering
 * is one element of every selectable type plus the types that must NOT resolve, and no fixture
 * in the corpus carries an `xml:id` on a `<distribution.*>` or a `<movement>` at all. The
 * end-to-end runs against real fixtures live in `tests/api/spotlight.test.ts`.
 *
 * The last block is the one that would catch a silent drift: it cross-checks the table against
 * `REGISTRY_ROWS`, so a dimension that gained or lost a site element cannot leave the selection
 * vocabulary claiming something the write vocabulary no longer supports.
 */
import { describe, it, expect } from 'vitest';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { REGISTRY_ROWS, EXPRESSION_DIMENSIONS } from '../../src/expression/registry.js';
import {
  SELECTABLE_IMPRECISION_MAPS,
  SELECTABLE_TYPES,
  resolveSelection,
} from '../../src/expression/selection.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';

/** A one-performance document from a `<header>` body and a `<dated>` body. */
function document(dated: string, header = ''): string {
  return (
    `<mpm xmlns="${MPM_NAMESPACE}"><performance name="P">` +
    `<global><header>${header}</header><dated>${dated}</dated></global>` +
    `</performance></mpm>`
  );
}

const resolve = (text: string, ids: readonly string[]) => resolveSelection(parseMpmRoot(text), ids);

/**
 * One instruction of every selectable type, each with an id, plus the three types that must
 * not resolve: a `<style>` switch, a def inside a `styleDef`, and a distribution in the inert
 * tuning domain.
 */
const EVERY_TYPE = document(
  '<tempoMap><style xml:id="sty" date="0.0" name.ref="S"/>' +
    '<tempo xml:id="tem" date="0.0" bpm="90" beatLength="0.25"/></tempoMap>' +
    '<dynamicsMap><dynamics xml:id="dyn" date="0.0" volume="60"/></dynamicsMap>' +
    '<rubatoMap><rubato xml:id="rub" date="0.0" frameLength="720" intensity="0.5"/></rubatoMap>' +
    '<articulationMap><articulation xml:id="art" date="0.0" relativeDuration="0.8"/></articulationMap>' +
    '<metricalAccentuationMap><accentuationPattern xml:id="acc" date="0.0" name.ref="P" scale="1.0"/>' +
    '</metricalAccentuationMap>' +
    '<ornamentationMap><ornament xml:id="orn" date="0.0" name.ref="arp" scale="1.0"/></ornamentationMap>' +
    '<asynchronyMap><asynchrony xml:id="asy" date="0.0" milliseconds.offset="25.0"/></asynchronyMap>' +
    '<movementMap><movement xml:id="mov" date="0.0" position="1.0" transition.to="0.0" curvature="0.4"/>' +
    '</movementMap>' +
    '<imprecisionMap.timing><distribution.uniform xml:id="dtim" date="0.0" limit.lower="-5" limit.upper="5"/>' +
    '</imprecisionMap.timing>' +
    '<imprecisionMap.dynamics><distribution.gaussian xml:id="ddyn" date="0.0" deviation.standard="3"/>' +
    '</imprecisionMap.dynamics>' +
    '<imprecisionMap.toneduration><distribution.list xml:id="ddur" date="0.0">' +
    '<measurement xml:id="mea" value="4.0"/></distribution.list></imprecisionMap.toneduration>' +
    '<imprecisionMap.tuning><distribution.uniform xml:id="dtun" date="0.0" limit.lower="-1" limit.upper="1"/>' +
    '</imprecisionMap.tuning>',
  '<tempoStyles><styleDef name="S"><tempoDef xml:id="def" name="fast" value="140.0"/></styleDef></tempoStyles>',
);

describe('resolveSelection: D-I maps an element type onto the dimensions it governs', () => {
  it.each([
    ['tem', 'tempo', ['tempo', 'tempoShape']],
    ['dyn', 'dynamics', ['dynamics', 'dynamicsShape']],
    ['rub', 'rubato', ['rubato']],
    ['art', 'articulation', ['articulation']],
    ['acc', 'accentuationPattern', ['accentuation']],
    ['orn', 'ornament', ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics']],
    ['asy', 'asynchrony', ['asynchrony']],
    ['mov', 'movement', ['pedalShape']],
  ])('<%s> spares %s', (id, element, dimensions) => {
    const { resolved, offenders } = resolve(EVERY_TYPE, [id]);
    expect(offenders).toEqual([]);
    expect(resolved).toEqual([{ id, element, dimensions }]);
  });

  it.each([
    ['dtim', 'distribution.uniform', 'imprecisionTiming'],
    ['ddyn', 'distribution.gaussian', 'imprecisionDynamics'],
    ['ddur', 'distribution.list', 'imprecisionDuration'],
  ])(
    'a distribution takes its dimension from the map it sits in, not from its own name (%s)',
    (id, element, dimension) => {
      const { resolved, offenders } = resolve(EVERY_TYPE, [id]);
      expect(offenders).toEqual([]);
      expect(resolved).toEqual([{ id, element, dimensions: [dimension] }]);
    },
  );

  it('spares dimensions in EXPRESSION_DIMENSIONS order, however the ids were given', () => {
    // Deliberately reversed: the union is a set, and a caller diffing two spotlights should not
    // have to sort it first.
    const { spared } = resolve(EVERY_TYPE, ['mov', 'dyn', 'tem']);
    expect(spared).toEqual(['tempo', 'tempoShape', 'dynamics', 'dynamicsShape', 'pedalShape']);
  });

  it('collapses duplicate ids into one entry, in first-mention order', () => {
    const { resolved } = resolve(EVERY_TYPE, ['dyn', 'tem', 'dyn']);
    expect(resolved.map((entry) => entry.id)).toEqual(['dyn', 'tem']);
  });

  it('resolves an id duplicated in the document to the first element in document order', () => {
    // MPM forbids this and nothing here enforces it, so the tie needs a stated winner — the
    // same one the prototype's `node.get(0)` picked.
    const twins = document(
      '<tempoMap><tempo xml:id="twin" date="0.0" bpm="90"/></tempoMap>' +
        '<dynamicsMap><dynamics xml:id="twin" date="0.0" volume="60"/></dynamicsMap>',
    );
    expect(resolve(twins, ['twin']).resolved).toEqual([
      { id: 'twin', element: 'tempo', dimensions: ['tempo', 'tempoShape'] },
    ]);
  });

  it('reads a bare @id as well as @xml:id, because real MPM carries both spellings', () => {
    const bare = document('<asynchronyMap><asynchrony id="a" date="0.0" milliseconds.offset="9"/></asynchronyMap>');
    expect(resolve(bare, ['a']).spared).toEqual(['asynchrony']);
  });

  it('resolves nothing and spares nothing for an empty selection', () => {
    expect(resolve(EVERY_TYPE, [])).toEqual({ resolved: [], offenders: [], spared: [] });
  });
});

describe('resolveSelection: the two failure kinds (A8)', () => {
  it('reports an id no element carries as unresolved', () => {
    const { offenders, resolved } = resolve(EVERY_TYPE, ['nope']);
    expect(resolved).toEqual([]);
    expect(offenders).toEqual([
      { id: 'nope', kind: 'unresolved', element: null, detail: expect.stringContaining('nope') },
    ]);
  });

  it.each([
    ['sty', 'style', 'a style switch'],
    ['def', 'tempoDef', 'a def inside a styleDef'],
    ['mea', 'measurement', 'a measurement inside a distribution.list'],
  ])('reports %s as unmappable — %s governs no dimension', (id, element) => {
    const { offenders, resolved } = resolve(EVERY_TYPE, [id]);
    expect(resolved).toEqual([]);
    expect(offenders).toEqual([
      { id, kind: 'unmappable', element, detail: expect.stringContaining(`<${element}>`) },
    ]);
  });

  it('reports a tuning distribution as unmappable and names the map that decided it (A9)', () => {
    // §7.16: nothing in this codebase reads `tuning.offset`, so the domain is inert by
    // construction and has no dimension to spare — a caller pointing at one has to be told
    // rather than handed a spotlight that quietly damped everything they meant to keep.
    const [offender] = resolve(EVERY_TYPE, ['dtun']).offenders;
    expect(offender.kind).toBe('unmappable');
    expect(offender.element).toBe('distribution.uniform');
    expect(offender.detail).toContain('imprecisionMap.tuning');
  });

  it('lists every offender of both kinds at once, never just the first', () => {
    const { offenders, resolved } = resolve(EVERY_TYPE, ['tem', 'ghost', 'sty', 'phantom']);
    expect(offenders.map((offender) => [offender.id, offender.kind])).toEqual([
      ['ghost', 'unresolved'],
      ['sty', 'unmappable'],
      ['phantom', 'unresolved'],
    ]);
    // The ids that DID resolve are still reported: the caller needs to see what it asked for
    // beside what went wrong, and the facade is what turns any offender into a refused run.
    expect(resolved.map((entry) => entry.id)).toEqual(['tem']);
  });
});

describe('D-I agrees with the registry about what each element type governs', () => {
  /** Every dimension the registry writes at an element of this local name. */
  const dimensionsWrittenAt = (element: string): readonly string[] =>
    EXPRESSION_DIMENSIONS.filter((dimension) =>
      REGISTRY_ROWS.some(
        (row) => row.dimension === dimension && row.sites.some((site) => site.element === element),
      ),
    );

  /** The map local name an instruction of this type lives in. */
  const mapFor = (element: string) =>
    element === 'accentuationPattern' ? 'metricalAccentuationMap' : `${element}Map`;

  it('the selectable vocabulary is exactly D-I\'s nine rows — no more, no fewer', () => {
    // The half that was missing, and the dangerous half. A test that only checks each row
    // against the registry can say nothing about a row that should not exist: a mutation adding
    // `['styleDef', ['tempo','rubato']]` to the table passed all 3958 tests, and under it a
    // `<styleDef>` id spotlit successfully instead of raising SelectionNotFoundError.
    expect([...SELECTABLE_TYPES].sort()).toEqual(
      [
        'accentuationPattern',
        'articulation',
        'asynchrony',
        'dynamics',
        'movement',
        'ornament',
        'rubato',
        'tempo',
      ].sort(),
    );
    // The ninth row, `distribution.*`, is keyed by enclosing map rather than by element name.
    expect([...SELECTABLE_IMPRECISION_MAPS].sort()).toEqual(
      ['imprecisionMap.dynamics', 'imprecisionMap.timing', 'imprecisionMap.toneduration'].sort(),
    );
  });

  it.each(SELECTABLE_TYPES.filter((element) => element !== 'ornament'))(
    '<%s> spares exactly the dimensions the registry writes there',
    (element) => {
      // Iterating the exported table rather than a hand-typed copy of it, so a new row cannot
      // be added without this assertion having an opinion about it.
      const id = 'probe';
      const selectable = document(
        `<${mapFor(element)}><${element} xml:id="${id}" date="0.0"/></${mapFor(element)}>`,
      );
      const [entry] = resolve(selectable, [id]).resolved;
      expect(entry.dimensions).toEqual(dimensionsWrittenAt(element));
    },
  );

  it('<ornament> is the one entry the registry cannot confirm, and says why', () => {
    // An `<ornament>` carries no exaggerable attribute of its own: the three ornament
    // dimensions write into the `<temporalSpread>` and `<dynamicsGradient>` children of the
    // `<ornamentDef>` it references. The table maps what a caller can select; the registry
    // holds what the engine can write. This pins both halves of that sentence.
    expect(dimensionsWrittenAt('ornament')).toEqual([]);
    expect(resolve(EVERY_TYPE, ['orn']).spared).toEqual(
      EXPRESSION_DIMENSIONS.filter((dimension) =>
        REGISTRY_ROWS.some(
          (row) =>
            row.dimension === dimension &&
            row.sites.some(
              (site) => site.element === 'temporalSpread' || site.element === 'dynamicsGradient',
            ),
        ),
      ),
    );
  });

  it('every dimension is spared by at least one selectable type', () => {
    // Otherwise a dimension could only ever be attenuated, never brought out, and the table
    // would have a hole no test of an individual row could show.
    const reachable = new Set(
      ['tem', 'dyn', 'rub', 'art', 'acc', 'orn', 'asy', 'mov', 'dtim', 'ddyn', 'ddur'].flatMap(
        (id) => [...resolve(EVERY_TYPE, [id]).spared],
      ),
    );
    expect([...EXPRESSION_DIMENSIONS].filter((dimension) => !reachable.has(dimension))).toEqual([]);
  });
});
