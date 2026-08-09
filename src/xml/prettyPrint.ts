import { repeatString } from '../music/text.js';

/**
 * Cosmetic XML re-indentation.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). Nothing on the
 * conversion path calls it — see {@link prettyXml}.
 *
 * Port of `meico.mei.Helper.prettyXml`.
 * @author Axel Berndt
 */

/**
 * given a string of XML code, this method prettifies it
 *
 * Purely textual and purely cosmetic — it splits on tag boundaries and re-indents by a
 * running depth counter. It is **not** used anywhere on the conversion path: the MSM and
 * MPM that the equivalence tests compare are serialized by {@link Element.toXML}, not by
 * this. Only human-facing output goes through here, which is why its edge cases (CDATA
 * handled by an `endsWith(']]>')` guess, comments not handled at all) never mattered.
 *
 * @param xml
 * @return
 */
export function prettyXml(xml: string | null): string {
  if (xml == null || xml.trim().length === 0) return '';

  let stack = 0;
  let pretty = '';
  const rows = xml.trim().replace(/>/g, '>\n').replace(/</g, '\n<').split('\n');

  for (const rawRow of rows) {
    if (rawRow == null || rawRow.trim().length === 0) continue;

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
