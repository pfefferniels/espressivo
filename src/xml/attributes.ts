import { Attribute, Element } from './XomTypes.js';
import { attribute } from './tree.js';

/**
 * Reading an attribute back as the value that would have written it, and patching one in place.
 *
 * These are the primitives the `Add<X>Options` writing surfaces are built on — the MPM maps'
 * `get<X>OptionsOf` / `update<X>At`, and the MSM element readers. Every `add<X>` turns an
 * options object into attributes with `String(value)`; these read that spelling back. The law
 * they hold, asserted in `tests/mpm/elements/maps/options-roundtrip.test.ts` and
 * `tests/msm/writingSurface.test.ts`:
 *
 * > for any element `add<X>` produced, `add<X>(get<X>OptionsOf(…))` produces the same element,
 * > attribute for attribute and byte for byte.
 *
 * What they read is the document **as written**, not as a renderer resolves it: an absent
 * attribute reads as `undefined` and stays distinguishable from one that spells out its own
 * default, which is what makes the round trip an inverse at all. Nothing here adds vocabulary
 * — an attribute the options type does not name is not read, and — see {@link patchAttribute} —
 * not disturbed either.
 */

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/** `@name` as a number, or undefined where the element does not carry it. */
export function readNumber(element: Element, name: string): number | undefined {
  const text = attribute(name, element)?.getValue();
  return text === undefined ? undefined : parseFloat(text);
}

/** `@name` verbatim. */
export function readString(element: Element, name: string): string | undefined {
  return attribute(name, element)?.getValue();
}

/**
 * `@name` as a flag.
 *
 * `"false"` reads as `false` although no `add<X>` writes it: MPM's boolean attributes default
 * to false when absent, so a document that spells the default out means what omitting it means.
 * Feeding that back to `add<X>` therefore drops the attribute — the meaning survives, the bytes
 * do not, and only for a document this library did not write.
 */
export function readBoolean(element: Element, name: string): boolean | undefined {
  const text = attribute(name, element)?.getValue();
  return text === undefined ? undefined : text === 'true';
}

/**
 * `@name` as the number it spells, or as the string it is.
 *
 * The test is whether writing the parsed number back would reproduce the text, which is what
 * makes this the exact inverse of the `String(value)` every `add<X>` writes. So `"120"` is 120,
 * while `"Allegro"`, `"120.0"` and `"1e2"` stay strings — the last two because a document that
 * spelled a number that way is entitled to keep its spelling through a round trip.
 */
export function readNumberOrString(element: Element, name: string): number | string | undefined {
  const text = attribute(name, element)?.getValue();
  if (text === undefined) return undefined;
  const value = parseFloat(text);
  return Number.isFinite(value) && String(value) === text ? value : text;
}

/**
 * The name {@link attribute} has to be given to find `attributeName`.
 *
 * `attribute` matches LOCAL names, so the one attribute whose qualified name differs from its
 * local one has to be asked for by the local half: `xml:id` is found as `id`, and asking for
 * `'xml:id'` finds nothing at all. That is deliberate over there and byte-visible — see the
 * comment on `tree.ts`'s `attribute` — so the adjustment belongs here.
 */
function lookupName(attributeName: string): string {
  return attributeName === 'xml:id' ? 'id' : attributeName;
}

/** `@xml:id`. */
export function readId(element: Element): string | undefined {
  return attribute(lookupName('xml:id'), element)?.getValue();
}

/**
 * Apply one field of a patch to `element`.
 *
 * Three cases, and the middle one is why this takes the patch object rather than a value: a key
 * the patch does not carry leaves the attribute alone, a key it carries as `undefined` removes
 * it, and any other value writes it. `Partial<Add<X>Options>` cannot express that distinction
 * on its own — `{ meanTempoAt: undefined }` and `{}` have the same type — so the `in` test is
 * the API, and callers get "leave it" for free by omitting the key.
 *
 * An existing attribute is written **through**, not replaced. `Element.addAttribute` is
 * documented as remove-then-append, so re-setting one would move it to the end of the
 * serialized order and an edited document would differ from its source by attribute order alone,
 * on every attribute anything touched. A newly added attribute does land at the end; there is no
 * position for it to keep. Finding the existing one goes through {@link lookupName}, without
 * which `xml:id` is never found: removing it is then a silent no-op, and re-setting it takes the
 * append arm — which no writer's output shows only because every one of them puts `xml:id` last.
 *
 * An attribute no options type names — MPM's own `corresp` on nothing, a consumer's foreign
 * annotation — is never seen by this function and so survives every patch.
 *
 * @param key the options field. Checked against `T`, so a renamed field fails to compile here
 *   rather than silently stopping being written.
 * @param attributeName the attribute it stands for, where the two differ (`transitionTo` →
 *   `transition.to`, `id` → `xml:id`).
 */
export function patchAttribute<T extends object>(
  element: Element,
  patch: T,
  key: keyof T & string,
  attributeName: string = key,
): void {
  if (!(key in patch)) return;

  const value: unknown = patch[key];
  const existing = attribute(lookupName(attributeName), element);

  if (value === undefined) {
    if (existing !== null) element.removeAttribute(existing);
    return;
  }

  const text = String(value);
  if (existing !== null) {
    existing.setValue(text);
    return;
  }

  element.addAttribute(
    attributeName === 'xml:id'
      ? new Attribute('xml:id', XML_NAMESPACE, text)
      : new Attribute(attributeName, text),
  );
}
