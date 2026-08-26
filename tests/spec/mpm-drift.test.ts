/**
 * How far the MPM in this repository has drifted from the MPM the format defines.
 *
 * The spec side is `mpm-spec.json`, distilled from the MPM ODD by `scripts/fetch-mpm-spec.mjs`.
 * The observed side is every `.mpm` document under `tests/`, and what `src/mpm/` names in its own
 * source — the second lens because a fixture corpus only shows the constructs somebody wrote a
 * fixture for, and `movementMap` is exactly the case that proves it.
 *
 * The gate is `drift-baseline.json`: a conformance finding has to be written down with a reason
 * before the suite goes green, and a reason that no longer describes anything has to go. New
 * drift therefore cannot arrive silently, and the file reads as a ledger of what MPM this port
 * speaks and where it deliberately does not.
 *
 * The coverage half separates three things the corpus alone conflates: exercised by a fixture,
 * named by the code and by no fixture, named by neither. Only the third is a gap in the port.
 *
 *   npm run mpm:drift    print the full report, including coverage
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  closedValueAttributes,
  collectCode,
  collectFile,
  conformance,
  coverage,
  emptyCorpus,
  type Finding,
  type MpmSpec,
} from './drift.js';
import * as mpmNames from '../../src/mpm/names.js';

const ROOT = join(import.meta.dirname, '..', '..');
const spec = JSON.parse(
  readFileSync(join(import.meta.dirname, 'mpm-spec.json'), 'utf8'),
) as MpmSpec;
const baseline = JSON.parse(
  readFileSync(join(import.meta.dirname, 'drift-baseline.json'), 'utf8'),
) as { spec: { edition: string; commit: string }; accepted: Record<string, string> };

function filesUnder(dir: string, extension: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, extension, found);
    else if (entry.name.endsWith(extension)) found.push(path);
  }
  return found;
}

const corpus = emptyCorpus();
const watch = closedValueAttributes(spec);
const files = filesUnder(join(ROOT, 'tests'), '.mpm').sort();
for (const path of files)
  collectFile(corpus, path, { file: relative(ROOT, path), origin: 'corpus', spec, watch });

collectCode(corpus, {
  files: filesUnder(join(ROOT, 'src/mpm'), '.ts')
    .sort()
    .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') })),
  // Every string constant in `names.ts` is an element name but one: the namespace itself. The
  // module also exports two predicates, which the `typeof` drops.
  names: (Object.values(mpmNames) as unknown[]).filter(
    (value): value is string => typeof value === 'string' && value !== mpmNames.MPM_NAMESPACE,
  ),
  spec,
});

const findings = conformance(spec, corpus);
const covered = coverage(spec, corpus);

function report(): string {
  const lines = [
    `MPM ${spec.edition} @ ${spec.source.commit.slice(0, 8)} vs. ${files.length} documents ` +
      `and the element names src/mpm constructs`,
    '',
    `conformance: ${findings.length} finding(s)`,
  ];
  for (const f of findings)
    lines.push(`  ${f.origins.join('+').padEnd(11)} ${f.detail}  [${f.files.join(', ')}]`);

  // `xml:id` is allowed on nearly every element and carried by almost no fixture, so listing
  // each one buries the rest of the report in a single fact.
  const isId = (name: string): boolean => name.endsWith('/@xml:id');
  const unexercised = covered.unexercised.filter((name) => !isId(name));
  const idsUnexercised = covered.unexercised.length - unexercised.length;

  lines.push(
    '',
    `coverage of MPM ${spec.edition}: ${covered.elementsInCorpus}/${covered.elementsDefined} ` +
      `elements in the corpus, ${covered.attributesExercised}/${covered.attributesDefined} attributes`,
    `  elements src/mpm names that no fixture carries (${covered.codeOnly.length}): ${covered.codeOnly.join(', ')}`,
    `  elements neither names (${covered.unreached.length}): ${covered.unreached.join(', ')}`,
    `  @xml:id: read and written, unexercised on ${idsUnexercised} elements`,
    `  attributes src/mpm names that no fixture carries (${unexercised.length}):`,
    ...unexercised.map((name) => `    ${name}`),
    `  attributes nothing in src/mpm names (${covered.unsupported.filter((n) => !isId(n)).length}):`,
    ...covered.unsupported.filter((name) => !isId(name)).map((name) => `    ${name}`),
  );
  return lines.join('\n');
}

if (process.env.MPM_DRIFT_REPORT === '1') console.log(report());

/** What a new finding has to be pasted into the baseline as, reason still to be written. */
const asBaselineEntries = (list: readonly Finding[]): string =>
  list.map((f) => `    ${JSON.stringify(f.key)}: ${JSON.stringify(f.detail)}`).join(',\n');

describe('MPM spec drift', () => {
  it('reads the spec the baseline was written against', () => {
    expect(`${spec.edition} ${spec.source.commit}`).toBe(
      `${baseline.spec.edition} ${baseline.spec.commit}`,
    );
  });

  it('has a corpus to measure', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(corpus.elements.size).toBeGreaterThan(0);
  });

  it('reports no conformance finding that is not already accounted for', () => {
    const fresh = findings.filter((f) => !(f.key in baseline.accepted));
    expect(
      fresh.length === 0
        ? ''
        : `${fresh.length} new finding(s) against MPM ${spec.edition}. Give each a reason in ` +
            `tests/spec/drift-baseline.json, or change the code:\n\n${asBaselineEntries(fresh)}\n`,
    ).toBe('');
  });

  it('carries no accepted finding that has gone away', () => {
    const keys = new Set(findings.map((f) => f.key));
    const stale = Object.keys(baseline.accepted).filter((key) => !keys.has(key));
    expect(
      stale.length === 0
        ? ''
        : `tests/spec/drift-baseline.json accepts ${stale.length} finding(s) that no longer ` +
            `occur — delete them:\n  ${stale.join('\n  ')}\n`,
    ).toBe('');
  });
});
