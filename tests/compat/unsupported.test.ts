import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeXslt30Transformer,
  makeXsltTransformer,
  validateAgainstSchema,
  validateAgainstSchemaString,
  writeStringToFile,
  xslTransformToDocument,
  xslTransformToString,
} from '../../src/compat/unsupported.js';
import { Builder, Document } from '../../src/xml/XomTypes.js';

// Moved verbatim from tests/mei/Helper.test.ts by T14: the unimplementable Helper members.

// ---------------------------------------------------------------------------
// writeStringToFile – guards
// ---------------------------------------------------------------------------
describe('writeStringToFile', () => {
  it('should refuse a null string', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeStringToFile(null, 'out.txt')).toBe(false);
    expect(errSpy).toHaveBeenCalledWith('String undefined!');
    errSpy.mockRestore();
  });

  it('should refuse a null filename', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeStringToFile('content', null)).toBe(false);
    expect(errSpy).toHaveBeenCalledWith('Filename undefined!');
    errSpy.mockRestore();
  });

  it('should write the string plus a trailing newline, creating the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meico-helper-'));
    const file = join(dir, 'nested', 'out.txt');

    try {
      expect(writeStringToFile('<mei/>', file)).toBe(true);
      expect(readFileSync(file, 'utf-8')).toBe('<mei/>\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// environment stubs – XSLT and schema validation are not available here
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// environment stubs – XSLT and schema validation are not available here
// ---------------------------------------------------------------------------
describe('XSLT and schema validation stubs', () => {
  it('validateAgainstSchema should warn instead of validating', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateAgainstSchema('file.mei', 'schema.rng')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('validateAgainstSchemaString should warn instead of validating', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateAgainstSchemaString('<mei/>', 'schema.rng')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('the XSLT entry points should all return null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = new Builder().build('<mei/>') as Document;

    expect(xslTransformToDocument(doc, 'style.xsl')).toBeNull();
    expect(xslTransformToString(doc, 'style.xsl')).toBeNull();
    expect(xslTransformToString('<mei/>', 'style.xsl')).toBeNull();
    expect(makeXsltTransformer('style.xsl', null, null, null)).toBeNull();
    expect(makeXslt30Transformer('style.xsl')).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(5);

    warnSpy.mockRestore();
  });
});
