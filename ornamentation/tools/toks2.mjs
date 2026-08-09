// Pure CODE token stream: TS scanner tokens with all JSDoc subtrees pruned.
// Line/block comments are trivia and never appear; JSDoc is parsed into nodes, so prune it.
import ts from '/Users/nielspfeffer/Projects/meico-ts/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';

const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const out = [];
function walk(node) {
  const k = ts.SyntaxKind[node.kind];
  if (k.startsWith('JSDoc')) return;
  if (node.getChildCount(sf) === 0) {
    if (k === 'EndOfFileToken') return;
    out.push(k + '\t' + JSON.stringify(node.getText(sf)));
    return;
  }
  node.getChildren(sf).forEach(walk);
}
walk(sf);
process.stdout.write(out.join('\n') + '\n');
