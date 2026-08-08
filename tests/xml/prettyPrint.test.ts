import { describe, it, expect } from 'vitest';
import { prettyXml } from '../../src/xml/prettyPrint.js';

// Moved verbatim from tests/mei/Helper.test.ts by T14: cosmetic XML re-indentation.

// ---------------------------------------------------------------------------
// prettyXml
// ---------------------------------------------------------------------------
describe('prettyXml', () => {
  it('should return empty string for null', () => {
    expect(prettyXml(null)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(prettyXml('')).toBe('');
  });

  it('should prettify simple XML', () => {
    const xml = '<root><child/></root>';
    const pretty = prettyXml(xml);
    expect(pretty).toContain('<root>');
    expect(pretty).toContain('  <child');
    expect(pretty).toContain('</root>');
  });
});

// ---------------------------------------------------------------------------
// pulseDuration2decimal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// prettyXml – declaration and nesting
// ---------------------------------------------------------------------------
describe('prettyXml – declaration and nesting', () => {
  it('should keep an XML declaration unindented on its own line', () => {
    const pretty = prettyXml('<?xml version="1.0" encoding="UTF-8"?><root><child/></root>');
    const lines = pretty.split('\n');
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(lines[1]).toBe('<root>');
  });

  it('should indent by two spaces per level', () => {
    const pretty = prettyXml('<a><b><c/></b></a>');
    expect(pretty.split('\n')).toEqual(['<a>', '  <b>', '    <c/>', '  </b>', '</a>']);
  });

  it('should indent text content with its element', () => {
    const pretty = prettyXml('<a><b>text</b></a>');
    expect(pretty.split('\n')).toEqual(['<a>', '  <b>', '    text', '  </b>', '</a>']);
  });

  it('should return an empty string for whitespace only input', () => {
    expect(prettyXml('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// writeStringToFile – guards
// ---------------------------------------------------------------------------
