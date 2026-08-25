/**
 * Distil the MPM ODD into `tests/spec/mpm-spec.json`, the machine-readable form the drift
 * probe compares against (`tests/spec/mpm-drift.test.ts`).
 *
 *   npm run mpm:spec                                   clone axelberndt/MPM@master and distil
 *   node scripts/fetch-mpm-spec.mjs --ref <sha|tag>    pin a revision
 *   node scripts/fetch-mpm-spec.mjs --from <dir>       distil from a local MPM checkout
 *
 * Go through `npm run mpm:spec`: it runs prettier over the result, and without that every
 * refresh leaves `format:check` red on a file nobody edited.
 *
 * The ODD, not the generated RelaxNG, because the ODD carries what the probe needs and the RNG
 * drops: `usage="req"`, `defaultVal`, and the gloss that makes an uncovered-element list
 * readable. Only the schemaSpec's own xinclude list is followed — `src/specs/` holds files that
 * are not in the schema, and a spec that is not included is not part of MPM.
 *
 * The distilled JSON is checked in and the network is not in the test path. Refreshing it is
 * this command plus a review of the diff, and `source.commit` in the JSON says what the file in
 * the tree was built from — `drift-baseline.json` records the same commit and the probe refuses
 * to run when the two disagree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests/spec/mpm-spec.json');
const REPO = 'https://github.com/axelberndt/MPM.git';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

// ---- DOM helpers -----------------------------------------------------------------------
// The ODD is written with a `tei:` prefix throughout, but match on local names anyway so a
// reformatting upstream cannot silently empty the result.

const kids = (node, localName) =>
  Array.from(node.childNodes).filter((n) => n.nodeType === 1 && n.localName === localName);

const kid = (node, localName) => kids(node, localName)[0] ?? null;

function descendants(node, localName, out = []) {
  for (const n of Array.from(node.childNodes)) {
    if (n.nodeType !== 1) continue;
    if (n.localName === localName) out.push(n);
    descendants(n, localName, out);
  }
  return out;
}

const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : null);

// ---- load ------------------------------------------------------------------------------

let src = flag('--from');
let tmp = null;
let commit;

if (src) {
  src = join(src, 'src');
} else {
  tmp = mkdtempSync(join(tmpdir(), 'mpm-odd-'));
  const ref = flag('--ref');
  execFileSync('git', ['clone', '--quiet', '--depth', '1', REPO, tmp], { stdio: 'inherit' });
  if (ref) {
    execFileSync('git', ['-C', tmp, 'fetch', '--quiet', '--depth', '1', 'origin', ref], {
      stdio: 'inherit',
    });
    execFileSync('git', ['-C', tmp, 'checkout', '--quiet', 'FETCH_HEAD'], { stdio: 'inherit' });
  }
  src = join(tmp, 'src');
}
commit = execFileSync('git', ['-C', dirname(src), 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();

const parse = (path) => new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/xml');

const odd = parse(join(src, 'mpm.odd'));
const schemaSpec = descendants(odd, 'schemaSpec')[0];
const edition = descendants(odd, 'edition')[0]?.getAttribute('n') ?? 'unknown';
const namespace = schemaSpec.getAttribute('ns');

/** Only what the schemaSpec includes. `src/specs/` also holds files the schema does not use. */
const included = descendants(schemaSpec, 'include').map((n) => n.getAttribute('href'));

// ---- read the specs --------------------------------------------------------------------

/** @type {Map<string, Element>} */ const elementSpecs = new Map();
/** @type {Map<string, Element>} */ const attClassSpecs = new Map();
/** @type {Map<string, Element>} */ const modelClassSpecs = new Map();

for (const href of included) {
  const root = parse(join(src, href)).documentElement;
  const ident = root.getAttribute('ident');
  if (root.localName === 'elementSpec') elementSpecs.set(ident, root);
  else if (root.localName === 'classSpec')
    (root.getAttribute('type') === 'atts' ? attClassSpecs : modelClassSpecs).set(ident, root);
  else if (root.localName !== 'moduleSpec')
    throw new Error(`${href}: unexpected spec root <${root.localName}>`);
}

/** The one thing the probe cannot recover if it silently reads nothing. */
if (elementSpecs.size === 0) throw new Error('no elementSpec found — the ODD layout changed');

// ---- attDef -> distilled record --------------------------------------------------------

function readAttDef(node) {
  const datatype = kid(node, 'datatype');
  const dataRef = datatype ? descendants(datatype, 'dataRef')[0] : null;
  const valList = kid(node, 'valList');
  const defaultVal = kid(node, 'defaultVal');

  const rec = {
    usage: node.getAttribute('usage') || 'opt',
    datatype: dataRef?.getAttribute('name') ?? null,
  };
  if (dataRef) {
    const facets = descendants(dataRef, 'dataFacet').map((f) => [
      f.getAttribute('name'),
      f.getAttribute('value'),
    ]);
    if (facets.length > 0) rec.facets = Object.fromEntries(facets);
  }
  if (valList) {
    rec.values = kids(valList, 'valItem').map((v) => v.getAttribute('ident'));
    // Only a closed list is a conformance statement; "semi" and "open" are suggestions.
    rec.closedValues = valList.getAttribute('type') === 'closed';
  }
  if (defaultVal) rec.default = text(defaultVal);
  return rec;
}

/**
 * `base` are the attributes inherited from the attribute classes. `mode="change"` refines one
 * of them rather than replacing it: `temporalSpread` changes `noteoff.shift` to add a default
 * and nothing else, and dropping the class's closed value list there would cost the probe the
 * check it exists for.
 */
function attListOf(node, base = {}) {
  const out = { ...base };
  const attList = kid(node, 'attList');
  if (!attList) return out;
  for (const def of kids(attList, 'attDef')) {
    const ident = def.getAttribute('ident');
    out[ident] =
      def.getAttribute('mode') === 'change'
        ? { ...(out[ident] ?? {}), ...readAttDef(def) }
        : readAttDef(def);
  }
  return out;
}

const memberships = (node) => {
  const classes = kid(node, 'classes');
  return classes ? kids(classes, 'memberOf').map((m) => m.getAttribute('key')) : [];
};

/** Attribute classes are themselves members of attribute classes — resolve transitively. */
function attsOfClass(ident, seen = new Set()) {
  if (seen.has(ident)) return {};
  seen.add(ident);
  const spec = attClassSpecs.get(ident);
  if (!spec) return {};
  let out = {};
  for (const parent of memberships(spec)) out = { ...out, ...attsOfClass(parent, seen) };
  return attListOf(spec, out);
}

// ---- content model ---------------------------------------------------------------------

const modelMembers = new Map();
for (const [ident, spec] of elementSpecs)
  for (const key of memberships(spec))
    if (modelClassSpecs.has(key)) modelMembers.set(key, [...(modelMembers.get(key) ?? []), ident]);

function childrenOf(node) {
  const content = kid(node, 'content');
  if (!content) return [];
  const out = new Set();
  for (const ref of descendants(content, 'elementRef')) out.add(ref.getAttribute('key'));
  for (const ref of descendants(content, 'classRef'))
    for (const member of modelMembers.get(ref.getAttribute('key')) ?? []) out.add(member);
  return [...out].sort();
}

// ---- assemble --------------------------------------------------------------------------

const elements = {};
for (const [ident, spec] of [...elementSpecs].sort(([a], [b]) => a.localeCompare(b))) {
  const classes = memberships(spec);
  let attributes = {};
  for (const key of classes) attributes = { ...attributes, ...attsOfClass(key) };
  attributes = attListOf(spec, attributes);

  const unresolved = classes.filter((key) => !attClassSpecs.has(key) && !modelClassSpecs.has(key));
  if (unresolved.length > 0)
    throw new Error(`${ident}: memberOf names a class the schema does not include: ${unresolved}`);

  elements[ident] = {
    gloss: text(kid(spec, 'gloss')),
    classes: classes.sort(),
    attributes: Object.fromEntries(
      Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)),
    ),
    children: childrenOf(spec),
    empty: kid(spec, 'content') !== null && kid(kid(spec, 'content'), 'empty') !== null,
  };
}

const spec = {
  format: 'MPM',
  edition,
  namespace,
  source: { repository: REPO, commit, path: 'src/mpm.odd' },
  generatedBy: 'scripts/fetch-mpm-spec.mjs',
  elements,
};

writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);
if (tmp) rmSync(tmp, { recursive: true, force: true });

const attCount = new Set(Object.values(elements).flatMap((e) => Object.keys(e.attributes))).size;
console.log(
  `MPM ${edition} @ ${commit.slice(0, 8)} — ${Object.keys(elements).length} elements, ` +
    `${attCount} distinct attributes -> ${OUT.replace(`${ROOT}/`, '')}`,
);
