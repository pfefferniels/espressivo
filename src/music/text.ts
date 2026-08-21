/**
 * String utilities. Leaf module — imports nothing.
 *
 * Port of the string half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * Collect every integer substring, in order of appearance.
 *
 * ` bis ` and ` to ` are rewritten to ` -` first, so a written range (`3 bis 7`) comes back
 * as `[3, -7]` — the upper bound negated.
 */
export function extractAllIntegersFromString(input: string): number[] {
  const str = input.replace(/ bis /g, ' -').replace(/ to /g, ' -');
  const p = /-?\d+/g;
  const results: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = p.exec(str)) !== null) {
    results.push(parseInt(m[0], 10));
  }
  return results;
}

/**
 * Strip the extension from a filename, which may include the complete path.
 *
 * A leading dot at index 0 marks a dotfile and the name is returned whole. A name with no
 * dot at all returns the empty string, because `substring` clamps the -1.
 */
export function getFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');

  if (i === 0) return filename;

  return filename.substring(0, i);
}

/**
 * Indentation for `prettyXml`: two spaces per nesting level.
 *
 * Exported because its only caller lives in `src/xml/prettyPrint.ts`; `private static` in Java.
 */
export function repeatString(stack: number): string {
  let indent = '';
  for (let i = 0; i < stack; i++) {
    indent += '  ';
  }
  return indent;
}
