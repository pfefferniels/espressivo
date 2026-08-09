import { describe, it, expect } from 'vitest';
import { extractAllIntegersFromString, getFilenameWithoutExtension } from '../../src/music/text.js';

// Moved verbatim from tests/mei/Helper.test.ts by T14: string utilities.

// ---------------------------------------------------------------------------
// getFilenameWithoutExtension
// ---------------------------------------------------------------------------
describe('getFilenameWithoutExtension', () => {
  it('should strip the extension from a simple filename', () => {
    expect(getFilenameWithoutExtension('test.mei')).toBe('test');
  });

  it('should strip extension from a path', () => {
    expect(getFilenameWithoutExtension('/path/to/file.xml')).toBe('/path/to/file');
  });

  it('should handle multiple dots – strip only the last', () => {
    expect(getFilenameWithoutExtension('my.file.name.txt')).toBe('my.file.name');
  });

  it('should return the filename as-is if it starts with a dot and has no other dot', () => {
    expect(getFilenameWithoutExtension('.hidden')).toBe('.hidden');
  });
});

// ---------------------------------------------------------------------------
// duration2word
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// extractAllIntegersFromString
// ---------------------------------------------------------------------------
describe('extractAllIntegersFromString', () => {
  it('should extract positive integers', () => {
    expect(extractAllIntegersFromString('measure 1 and 2')).toEqual([1, 2]);
  });

  it('should extract negative integers', () => {
    // "to" is replaced by "-", so "range -5 to 10" becomes "range -5 -10"
    expect(extractAllIntegersFromString('range -5 to 10')).toEqual([-5, -10]);
  });

  it('should handle "bis" and "to" as minus', () => {
    expect(extractAllIntegersFromString('1 bis 5')).toEqual([1, -5]);
    expect(extractAllIntegersFromString('1 to 5')).toEqual([1, -5]);
  });

  it('should return empty for no integers', () => {
    expect(extractAllIntegersFromString('no numbers here')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// accidString2decimal / accidDecimal2String
// ---------------------------------------------------------------------------
