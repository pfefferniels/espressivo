/**
 * The validation gate and the write discipline.
 *
 * These are three one-line rules with document-level consequences, and each is asserted here
 * directly rather than only through the applier, because each is the kind of rule that a
 * later refactor can quietly relax without any per-dimension test noticing.
 */
import { describe, expect, it } from 'vitest';
import {
  clampIntoRange,
  gateAndTransform,
  refusalNoteKind,
  writeNumber,
} from '../../src/expression/gate.js';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { rowFor } from '../../src/expression/registry.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import { attribute } from '../../src/xml/tree.js';
import type { Element } from '../../src/xml/XomTypes.js';

function element(markup: string): Element {
  return parseMpmRoot(`<mpm xmlns="${MPM_NAMESPACE}">${markup}</mpm>`).getChildElements().get(0);
}

describe('writeNumber — the three write rules', () => {
  it('writes an existing attribute in place', () => {
    const dynamics = element('<dynamics volume="60"/>');
    expect(writeNumber(dynamics, 'volume', 72.5)).toBe('written');
    expect(attribute('volume', dynamics)?.getValue()).toBe('72.5');
  });

  it('never creates an attribute — materializing one would invent a gesture', () => {
    const dynamics = element('<dynamics volume="60"/>');
    expect(writeNumber(dynamics, 'transition.to', 90)).toBe('absent');
    expect(attribute('transition.to', dynamics)).toBeNull();
  });

  it('skips a write whose spelling is unchanged, so the no-op contract stays exact', () => {
    const dynamics = element('<dynamics volume="60"/>');
    expect(writeNumber(dynamics, 'volume', 60)).toBe('unchanged');
  });

  it('does write when only the SPELLING differs — which is why P1 needs the short-circuit', () => {
    const dynamics = element('<dynamics volume="60.0"/>');
    expect(writeNumber(dynamics, 'volume', 60)).toBe('written');
    expect(attribute('volume', dynamics)?.getValue()).toBe('60');
  });

  it('refuses a non-finite value — the global invariant, second lock', () => {
    const dynamics = element('<dynamics volume="60"/>');
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(writeNumber(dynamics, 'volume', value)).toBe('non-finite');
    }
    expect(attribute('volume', dynamics)?.getValue()).toBe('60');
  });
});

describe('gateAndTransform — read → validate → transform → validate', () => {
  const curvature = rowFor('dynamics', 'curvature')!;

  it('transforms a value inside the row’s domain', () => {
    expect(gateAndTransform(curvature, { kind: 'boundary-power-low' }, 0.3, 2)).toEqual({
      ok: true,
      value: 1 - Math.pow(0.7, 2),
    });
  });

  it('refuses an out-of-domain input rather than repairing it, and names the attribute', () => {
    const refused = gateAndTransform(curvature, { kind: 'boundary-power-low' }, 1.5, 2.5);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe('out-of-domain-input');
    expect(refused.error.detail).toContain('@curvature');
  });

  it('reports a saturation refusal as its own kind, not as an ordinary domain failure', () => {
    const refused = gateAndTransform(curvature, { kind: 'boundary-power-low' }, 0.9, 17);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe('saturation-refused');
  });

  it('maps every transform refusal reason onto the report vocabulary', () => {
    expect(refusalNoteKind('out-of-domain-input')).toBe('out-of-domain-input');
    expect(refusalNoteKind('saturation-to-boundary')).toBe('saturation-refused');
    expect(refusalNoteKind('non-finite-result')).toBe('non-finite-result');
  });
});

describe('clampIntoRange', () => {
  it('reports whether it bit, so the report can count the event', () => {
    expect(clampIntoRange(200, { min: 1, max: 127 })).toEqual({ value: 127, clamped: true });
    expect(clampIntoRange(0.4, { min: 1, max: 127 })).toEqual({ value: 1, clamped: true });
    expect(clampIntoRange(64, { min: 1, max: 127 })).toEqual({ value: 64, clamped: false });
  });
});
