/**
 * String utilities. Leaf module — imports nothing.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2). {@link repeatString} was
 * `private static` in `Helper`, where it sat next to its only caller `prettyXml`; the move
 * table sends the two to different modules, so it is exported here and imported by
 * `src/xml/prettyPrint.ts`. See the T14 log entry for why that call was made.
 *
 * Port of the string half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * this method parses an input string, extracts all integer substrings and returns them as a list of integers
 * @param input
 * @return
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
 * just a little helper method to separate the filename from the extension
 * @param filename filename string incl. extension (may include the complete path)
 * @return filename/path without extension
 */
export function getFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');

  if (i === 0) return filename;

  return filename.substring(0, i);
}

/**
 * just a helper method for prettyXml(): two spaces per nesting level
 * @param stack
 * @return
 */
export function repeatString(stack: number): string {
  let indent = '';
  for (let i = 0; i < stack; i++) {
    indent += '  ';
  }
  return indent;
}
