import { repeatString } from '../music/text.js';

/**
 * Cosmetic XML re-indentation.
 *
 * Moved verbatim out of `mei/Helper` (ARCHITECTURE.md §8.2). Nothing on the conversion path
 * calls it — see {@link prettyXml}.
 *
 * Port of `meico.mei.Helper.prettyXml`.
 * @author Axel Berndt
 */

/**
 * Re-indent a string of XML: purely textual and purely cosmetic, splitting on tag boundaries
 * and indenting by a running depth counter. Null or blank input yields `''`.
 *
 * Not used anywhere on the conversion path — the MSM and MPM the equivalence tests compare are
 * serialized by {@link Element.toXML} — which is why its edge cases (CDATA handled by an
 * `endsWith(']]>')` guess, comments not handled at all) never mattered.
 */
export function prettyXml(xml: string | null): string {
  if (xml == null || xml.trim().length === 0) return '';

  let stack = 0;
  let pretty = '';
  const rows = xml.trim().replace(/>/g, '>\n').replace(/</g, '\n<').split('\n');

  // `String.split` never yields a null element, so Java's per-row null check has nothing to
  // test here; the empty-row skip does all the work.
  for (const rawRow of rows) {
    if (rawRow.trim().length === 0) continue;

    const row = rawRow.trim();
    if (row.startsWith('<?')) {
      pretty += `${row}\n`;
    } else if (row.startsWith('</')) {
      const indent = repeatString(--stack);
      pretty += `${indent + row}\n`;
    } else if (row.startsWith('<') && !row.endsWith('/>')) {
      const indent = repeatString(stack++);
      pretty += `${indent + row}\n`;
      if (row.endsWith(']]>')) stack--;
    } else {
      const indent = repeatString(stack);
      pretty += `${indent + row}\n`;
    }
  }

  return pretty.trim();
}
