/**
 * the plausibility channel — the Hofmann-roll defence, as data.
 *
 * the design names four `plausibleRange` bands and the design carries them on the rows. A value outside its
 * band is REPORTED and the distance is left exactly as it was. The design is built around a 1927
 * Hofmann roll whose `<tempo>` writes `@beatLength` in TICKS rather than as a fraction of a
 * whole note, which makes the resolved quarter-BPM absurd while every number in the report stays
 * finite and plausible-looking.
 *
 * A document walk, not an evaluator hook: the pass reads the registry (`sites`,
 * `plausibleRange`) and walks the ordered map views the document layer already produced. Nothing
 * about it is dimension-specific, and it produces the site reference the design wants (container,
 * date, index among the map's entries, `xml:id`) as a by-product.
 *
 * Only instruction sites are walked, for the word "resolved": a `<*Def>`'s value is
 * performed only where an instruction references it, so reporting every def in a style
 * collection would flag values no performance ever reaches. A def-carried value that IS
 * performed goes unreported here — a stated limitation, and the band it would have tripped is
 * the same band the referencing instruction's own attributes are checked against.
 */
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import { readScopeMapViews, type ComparisonDocument } from './document.js';
import { COMPARISON_REGISTRY_ROWS, type ComparisonJndKey } from './registry.js';
import type { ComparisonDocumentRole } from './errors.js';
import type { ComparisonSiteRef } from './report.js';

/** One value outside its row's `plausibleRange`, with everything needed to report it. */
export interface PlausibilityFinding {
  readonly key: ComparisonJndKey;
  readonly value: number;
  readonly range: readonly [number, number];
  readonly site: ComparisonSiteRef;
}

/** The bands in force for this run: registry defaults with `options.plausibleRange` over them. */
export type PlausibleRanges = Partial<Record<ComparisonJndKey, readonly [number, number]>>;

/**
 * Every implausible instruction value in one document.
 *
 * @param overrides the caller's bands, which REPLACE the registry's for the keys they name —
 *   a band is a claim about a corpus, and a caller who states one has stated all of it.
 */
export function plausibilityFindings(
  document: ComparisonDocument,
  role: ComparisonDocumentRole,
  ticksPerQuarter: number,
  overrides: PlausibleRanges = {},
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];

  for (const scope of document.scopes) {
    if (scope.scope === 'part' && !scope.renderable) continue;
    const views = readScopeMapViews(scope);
    for (const [container, view] of views) {
      const rows = COMPARISON_REGISTRY_ROWS.filter((row) =>
        row.sites.some((site) => site.kind === 'instruction' && site.container === container),
      );
      if (rows.length === 0) continue;

      for (const [index, entry] of view.entries.entries()) {
        const element = entry.element;
        const localName = element.getLocalName();
        for (const row of rows) {
          if (row.element !== localName) continue;
          const range = overrides[row.key] ?? row.plausibleRange;
          if (range === null) continue;
          const raw = readAttributeValue(element, row.attribute);
          if (raw === null) continue;
          const value = readNumericAttributeValue(element, row.attribute);
          // An unusable value is not implausible — it is `⊥`, and the readers already price
          // and report it. Reporting it here as well would put the same fact in two channels
          // with two different meanings.
          if (!Number.isFinite(value)) continue;
          if (value >= range[0] && value <= range[1]) continue;
          findings.push({
            key: row.key,
            value,
            range,
            site: {
              document: role,
              scope: scope.scope,
              partIndex: scope.partIndex,
              container,
              date: Number.isFinite(entry.date)
                ? (entry.date * document.scaleFactor) / ticksPerQuarter
                : null,
              index,
              attribute: row.attribute,
              xmlId: readAttributeValue(element, 'id'),
            },
          });
        }
      }
    }
  }

  return findings;
}
