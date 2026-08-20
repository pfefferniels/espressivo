import { describe, it, expect } from 'vitest';
import {
  canonicalBaseline,
  parseMpmDocument,
  parseMpmRoot,
  serializeMpmDocument,
  serializeMpmRoot,
} from '../../src/expression/mpmDocument.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import { globalEnvironment, mpmDocument, performanceDocument } from './rawFixtures.js';

const FLAT = performanceDocument(
  globalEnvironment('', '<tempoMap><tempo date="0.0" bpm="120" beatLength="0.25" /></tempoMap>'),
);

const PRETTY = `<mpm xmlns="${MPM_NAMESPACE}">
  <performance name="P">
    <global>
      <dated>
        <tempoMap>
          <tempo date="0.0" bpm="120" beatLength="0.25"/>
        </tempoMap>
      </dated>
    </global>
  </performance>
</mpm>`;

describe('mpmDocument', () => {
  describe('parse ⇄ serialize', () => {
    it.each([
      ['flat', FLAT],
      ['pretty-printed', PRETTY],
      ['no performances', mpmDocument('')],
      ['attribute values needing escapes', mpmDocument('<performance name="a &amp; b &lt; c" />')],
    ])('is idempotent after one round: %s', (_label, text) => {
      const once = serializeMpmRoot(parseMpmRoot(text));
      const twice = serializeMpmRoot(parseMpmRoot(once));
      expect(twice).toBe(once);
    });

    it('is NOT the identity on the input bytes — but no longer because of xmlns', () => {
      // Why §1.1 contracts identity against canonicalBaseline() and never against the
      // caller's own text. This used to have three reasons and the largest is now gone.
      //
      // `Element.wrap` drops namespace declarations at parse, and `Element.toXML` used to
      // re-emit one on EVERY namespaced element with no check for an inherited declaration —
      // so this seven-element document came back carrying seven declarations where it went in
      // with one, and the comment here said "no applier can avoid this". The serializer now
      // emits a default-namespace declaration only where the namespace actually changes, so
      // the count round-trips exactly and a document does not grow just by being read.
      //
      // One reason remains for THIS fixture, and it is a normalisation rather than a defect:
      // an element written as an empty start/end pair comes back self-closing, so this
      // document's `<header></header>` serializes as `<header />`. (A second applies to
      // documents that carry one: the XML declaration is not re-emitted, RULE F2a.)
      const baseline = canonicalBaseline(FLAT);
      expect(baseline).not.toBe(FLAT);
      expect(baseline.match(/xmlns="/g)).toHaveLength(1);
      expect(FLAT.match(/xmlns="/g)).toHaveLength(1);

      // The document now gets SHORTER, not longer — the inflation is gone.
      expect(baseline.length).toBeLessThan(FLAT.length);

      // And that one reason is the whole of the difference, asserted rather than described so
      // a new one cannot hide behind this comment.
      expect(FLAT).toContain('<header></header>');
      expect(baseline).toContain('<header />');
      expect(baseline).toBe(FLAT.replace('<header></header>', '<header />'));
    });

    it('carries the canonical baseline as its own fixed point', () => {
      expect(canonicalBaseline(canonicalBaseline(PRETTY))).toBe(canonicalBaseline(PRETTY));
    });

    it('preserves whitespace text nodes, which the sortXml pass in GenericMap does not', () => {
      expect(canonicalBaseline(PRETTY)).toContain('\n          <tempo ');
    });

    it('preserves attribute order', () => {
      const out = canonicalBaseline(FLAT);
      expect(out.indexOf('date=')).toBeLessThan(out.indexOf('bpm='));
      expect(out.indexOf('bpm=')).toBeLessThan(out.indexOf('beatLength='));
    });

    it('drops comments and processing instructions — a documented lossy round trip', () => {
      const withComment = mpmDocument('<!-- a note --><?target data?><performance name="P" />');
      expect(canonicalBaseline(withComment)).not.toContain('a note');
      expect(canonicalBaseline(withComment)).not.toContain('target');
    });

    it('serializes without an XML declaration (RULE F2a)', () => {
      expect(serializeMpmDocument(parseMpmDocument(FLAT)).startsWith('<mpm')).toBe(true);
    });
  });

  describe('malformed input', () => {
    // The facade wave turns these into the typed ParseError. Worth pinning here: the throw
    // comes from @xmldom/xmldom's own parser, NOT from Builder's `parsererror` /
    // 'No root element found' guards, which never fire under this parser.
    it.each([
      ['unclosed', '<mpm>'],
      ['empty', ''],
      ['not xml', 'nonsense'],
      ['mismatched', '<a><b></a>'],
    ])('throws on %s input', (_label, text) => {
      expect(() => parseMpmRoot(text)).toThrow();
    });
  });
});
