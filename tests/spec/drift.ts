/**
 * Compare the MPM this project writes and accepts against the MPM the format actually defines.
 *
 * The corpus is read with a parser that is not ours, deliberately: a conformance probe that
 * measured our output with our own reader would agree with itself about anything both sides get
 * wrong.
 *
 * Two questions, and they are not the same one:
 *
 * - **conformance** — an element, attribute or value we put in a document that MPM has no place
 *   for. Gated in `mpm-drift.test.ts`: every one needs a line in the baseline saying why.
 * - **coverage** — what MPM defines and this corpus never touches. Reported, not gated. It says
 *   where the port is thin, which is a roadmap, not a defect.
 */
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';

export interface AttributeSpec {
  readonly usage: string;
  readonly datatype: string | null;
  readonly facets?: Readonly<Record<string, string>>;
  readonly values?: readonly string[];
  readonly closedValues?: boolean;
  readonly default?: string;
}

export interface ElementSpec {
  readonly gloss: string | null;
  readonly classes: readonly string[];
  readonly attributes: Readonly<Record<string, AttributeSpec>>;
  readonly children: readonly string[];
  readonly empty: boolean;
}

export interface MpmSpec {
  readonly format: string;
  readonly edition: string;
  readonly namespace: string;
  readonly source: { readonly repository: string; readonly commit: string; readonly path: string };
  readonly elements: Readonly<Record<string, ElementSpec>>;
}

/**
 * Where a name was seen. `corpus` is a document under `tests/`; `code` is an element `src/mpm/`
 * constructs in the MPM namespace, which is the port claiming the name whether or not any
 * fixture exercises it.
 *
 * Not "what we write" versus "what we read": this port does not derive MPM from MEI (PARITY.md
 * §9), so every `.mpm` here is an input to something and none is a pinned output of the writer.
 */
export type Origin = 'corpus' | 'code';

interface Seen {
  readonly origins: Set<Origin>;
  readonly files: Set<string>;
}

interface AttributeSighting extends Seen {
  readonly values: Set<string>;
}

export interface Corpus {
  readonly elements: Map<string, Seen>;
  readonly attributes: Map<string, Map<string, AttributeSighting>>;
  /** Per element, the distinct attribute-name sets that occurred, for the required-attribute check. */
  readonly signatures: Map<
    string,
    Map<string, { readonly names: readonly string[]; readonly file: string }>
  >;
  /**
   * Attribute names `src/mpm/` names in a string literal. Flat, with no element attached — the
   * code reads `absoluteDelay` in `ArticulationDef`, which serves both `<articulation>` and
   * `<articulationDef>`, and separating those would take dataflow rather than a scan. Good
   * enough for the one question it answers: supported but unexercised, or absent.
   */
  readonly codeAttributes: Set<string>;
}

const seen = (): Seen => ({ origins: new Set(), files: new Set() });

function record(into: Map<string, Seen>, key: string, origin: Origin, file: string): Seen {
  const entry = into.get(key) ?? seen();
  entry.origins.add(origin);
  entry.files.add(file);
  into.set(key, entry);
  return entry;
}

/** Attributes whose spec value list is closed — the only ones whose values are worth keeping. */
export function closedValueAttributes(spec: MpmSpec): Set<string> {
  const names = new Set<string>();
  for (const element of Object.values(spec.elements))
    for (const [name, att] of Object.entries(element.attributes))
      if (att.closedValues === true) names.add(name);
  return names;
}

export function emptyCorpus(): Corpus {
  return {
    elements: new Map(),
    attributes: new Map(),
    signatures: new Map(),
    codeAttributes: new Set(),
  };
}

/**
 * Walk one document into `corpus`. Only elements in the MPM namespace count: a `.mpm` file may
 * carry foreign markup, and a foreign element is not MPM's to define.
 */
export function collect(
  corpus: Corpus,
  xml: string,
  {
    file,
    origin,
    spec,
    watch,
  }: { file: string; origin: Origin; spec: MpmSpec; watch: Set<string> },
): void {
  // Java meico writes a UTF-8 BOM; xmldom refuses the declaration behind one.
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'text/xml');

  const walk = (node: Element): void => {
    if (node.namespaceURI === spec.namespace) {
      const name = node.localName;
      record(corpus.elements, name, origin, file);

      const attributes = corpus.attributes.get(name) ?? new Map<string, AttributeSighting>();
      corpus.attributes.set(name, attributes);

      const names: string[] = [];
      for (const attr of Array.from(node.attributes)) {
        // `xmlns` and `xmlns:*` are the serializer's, not the vocabulary's.
        if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
        names.push(attr.name);
        const entry = attributes.get(attr.name) ?? { ...seen(), values: new Set<string>() };
        entry.origins.add(origin);
        entry.files.add(file);
        if (watch.has(attr.name)) entry.values.add(attr.value);
        attributes.set(attr.name, entry);
      }

      names.sort();
      const signatures = corpus.signatures.get(name) ?? new Map();
      const key = names.join(' ');
      if (!signatures.has(key)) signatures.set(key, { names, file });
      corpus.signatures.set(name, signatures);
    }

    for (const child of Array.from(node.childNodes))
      if (child.nodeType === 1) walk(child as Element);
  };

  if (doc.documentElement) walk(doc.documentElement as unknown as Element);
}

export function collectFile(
  corpus: Corpus,
  path: string,
  options: { file: string; origin: Origin; spec: MpmSpec; watch: Set<string> },
): void {
  collect(corpus, readFileSync(path, 'utf8'), options);
}

/**
 * What `src/mpm/` names, as `code` sightings.
 *
 * Three passes, and the difference between them is what a match is allowed to prove.
 *
 * The first two can raise a conformance finding, so they only match a claim on the vocabulary: a
 * literal paired with `MPM_NAMESPACE`, and the `names.ts` constants. A literal paired with some
 * other element's namespace — `volume` and `position`, written into a rendered map — is not such
 * a claim, and the pairing is what excludes it.
 *
 * The third answers only "supported but unexercised, or absent", so it may be blunt: any bare
 * literal that is already a name in the spec. It can never invent a finding, because a name the
 * spec has is by definition not drift; `GenericMap`'s own private table of MPM names, which the
 * first two passes cannot see, is why it is here.
 */
export function collectCode(
  corpus: Corpus,
  {
    files,
    names,
    spec,
  }: {
    files: readonly { readonly path: string; readonly text: string }[];
    names: readonly string[];
    spec: MpmSpec;
  },
): void {
  const knownAttributes = new Set(
    Object.values(spec.elements).flatMap((element) => Object.keys(element.attributes)),
  );

  for (const name of names) record(corpus.elements, name, 'code', 'src/mpm/names.ts');

  for (const { path, text } of files) {
    for (const [, name] of text.matchAll(/new Element\(\s*'([^']+)'\s*,\s*MPM_NAMESPACE/g))
      if (name !== undefined) record(corpus.elements, name, 'code', path);

    for (const [, literal] of text.matchAll(/'([^'\n]+)'/g)) {
      if (literal === undefined) continue;
      if (literal in spec.elements) record(corpus.elements, literal, 'code', path);
      if (knownAttributes.has(literal)) corpus.codeAttributes.add(literal);
    }
  }
}

// ---- findings ---------------------------------------------------------------------------

export type FindingKind =
  | 'unknown-element'
  | 'unknown-attribute'
  | 'misplaced-attribute'
  | 'value-not-in-list'
  | 'missing-required';

export interface Finding {
  readonly kind: FindingKind;
  /** Stable identity, and the key a baseline entry is written against. */
  readonly key: string;
  readonly detail: string;
  readonly origins: readonly Origin[];
  readonly files: readonly string[];
}

export interface Coverage {
  /** Defined by MPM and named by neither a document nor the code — the port does not have it. */
  readonly unreached: readonly string[];
  /** Named in code but in no document: supported, unexercised. */
  readonly codeOnly: readonly string[];
  /** Pairs no document carries, but whose attribute name `src/mpm/` reads or writes somewhere. */
  readonly unexercised: readonly string[];
  /** Pairs no document carries and no name in `src/mpm/` matches — the port's actual gaps. */
  readonly unsupported: readonly string[];
  readonly elementsInCorpus: number;
  readonly elementsDefined: number;
  readonly attributesExercised: number;
  readonly attributesDefined: number;
}

const sorted = (s: Set<string>): string[] => [...s].sort();

/** Every element that declares `name`, for the "exists, but not here" message. */
function elementsDeclaring(spec: MpmSpec, attribute: string): string[] {
  return Object.entries(spec.elements)
    .filter(([, e]) => attribute in e.attributes)
    .map(([name]) => name)
    .sort();
}

export function conformance(spec: MpmSpec, corpus: Corpus): Finding[] {
  const findings: Finding[] = [];

  for (const [element, sighting] of corpus.elements) {
    const defined = spec.elements[element];
    if (defined === undefined) {
      findings.push({
        kind: 'unknown-element',
        key: `unknown-element ${element}`,
        detail: `<${element}> is not an element of MPM ${spec.edition}`,
        origins: sorted(sighting.origins) as Origin[],
        files: sorted(sighting.files),
      });
      // Its attributes cannot be judged against a spec that does not have the element.
      continue;
    }

    for (const [attribute, att] of corpus.attributes.get(element) ?? []) {
      const origins = sorted(att.origins) as Origin[];
      const files = sorted(att.files);
      const declared = defined.attributes[attribute];

      if (declared === undefined) {
        const elsewhere = elementsDeclaring(spec, attribute);
        findings.push(
          elsewhere.length > 0
            ? {
                kind: 'misplaced-attribute',
                key: `misplaced-attribute ${element}/@${attribute}`,
                detail: `<${element}> @${attribute} is defined on ${elsewhere.join(', ')}, not here`,
                origins,
                files,
              }
            : {
                kind: 'unknown-attribute',
                key: `unknown-attribute ${element}/@${attribute}`,
                detail: `<${element}> @${attribute} is not an attribute of MPM ${spec.edition}`,
                origins,
                files,
              },
        );
        continue;
      }

      if (declared.closedValues === true && declared.values !== undefined)
        for (const value of sorted(att.values))
          if (!declared.values.includes(value))
            findings.push({
              kind: 'value-not-in-list',
              key: `value-not-in-list ${element}/@${attribute}=${value}`,
              detail: `@${attribute}="${value}" is outside the closed list ${declared.values.join(' | ')}`,
              origins,
              files,
            });
    }

    const required = Object.entries(defined.attributes)
      .filter(([, att]) => att.usage === 'req')
      .map(([name]) => name);

    for (const attribute of required) {
      const offenders = [...(corpus.signatures.get(element) ?? new Map()).values()].filter(
        (signature) => !signature.names.includes(attribute),
      );
      if (offenders.length === 0) continue;
      findings.push({
        kind: 'missing-required',
        key: `missing-required ${element}/@${attribute}`,
        detail: `<${element}> occurs without the required @${attribute}`,
        // A signature can only come from a document, whatever else claims the element name.
        origins: ['corpus'],
        files: [...new Set(offenders.map((o) => o.file))].sort(),
      });
    }
  }

  return findings.sort((a, b) => a.key.localeCompare(b.key));
}

export function coverage(spec: MpmSpec, corpus: Corpus): Coverage {
  const unreached: string[] = [];
  const codeOnly: string[] = [];
  const unexercised: string[] = [];
  const unsupported: string[] = [];
  let attributesDefined = 0;
  let attributesExercised = 0;
  let elementsInCorpus = 0;

  for (const [element, defined] of Object.entries(spec.elements)) {
    const origins = corpus.elements.get(element)?.origins;
    if (origins === undefined) unreached.push(element);
    else if (origins.has('corpus')) elementsInCorpus += 1;
    else codeOnly.push(element);

    const exercised = corpus.attributes.get(element);
    for (const attribute of Object.keys(defined.attributes)) {
      attributesDefined += 1;
      if (exercised?.has(attribute) === true) attributesExercised += 1;
      else if (corpus.codeAttributes.has(attribute)) unexercised.push(`${element}/@${attribute}`);
      else unsupported.push(`${element}/@${attribute}`);
    }
  }

  return {
    unreached,
    codeOnly,
    unexercised,
    unsupported,
    elementsInCorpus,
    elementsDefined: Object.keys(spec.elements).length,
    attributesExercised,
    attributesDefined,
  };
}
