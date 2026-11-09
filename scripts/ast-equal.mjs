// Proves that a formatting-only change did not change the program.
//
// Usage: node scripts/ast-equal.mjs <baseRef> [file ...]
//   Without files: every .ts/.tsx/.mjs/.js file that differs between <baseRef> and the working tree.
// For each file it parses the version at <baseRef> (git show) and the working-tree version with the TypeScript
// compiler API and compares the two trees node by node: node kind plus the significant text of identifiers and
// literals (string/template/regex/numeric values), and the sorted list of comment texts.
//
// Ignored on purpose (pure trivia or syntax-only): whitespace, line breaks, quote style ('a' vs "a" have the same
// literal value), trailing commas and semicolons (tokens, not nodes), quoting of property names ({'a': 1} vs {a: 1}),
// leading whitespace inside multi-line comments (re-indentation), and ParenthesizedExpression / ParenthesizedType
// nodes and the association of nested `&&` / `||` / `??` chains (redundant parentheses a formatter may add or drop; they change no evaluation order because the parser has
// already folded precedence into the tree structure, and a needed pair stays needed so the inner structure differs
// if it was ever removed wrongly). Every file in which parentheses were added or removed is listed as a note.
// NOT ignored: comment text, string/template contents, numbers, node structure, modifiers, operators.
// Exit code 0 = all equal, 1 = at least one difference, 2 = usage error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const [baseRef, ...explicit] = process.argv.slice(2);
if (!baseRef) {
  console.error('usage: node scripts/ast-equal.mjs <baseRef> [file ...]');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const files =
  explicit.length > 0
    ? explicit
    : git('diff', '--name-only', baseRef, '--')
        .split('\n')
        .filter((name) => /\.(tsx?|mjs|js)$/.test(name));

const skippable = new Set([ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.ParenthesizedType]);
const nameLike = new Set([ts.SyntaxKind.Identifier, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NumericLiteral]);

// && || ?? are associative in value AND in short-circuit order, so `a && (b && c)` and `a && b && c` are the same
// program; Biome drops such parentheses. Nested chains of the SAME operator are therefore compared as one flat list.
// Other operators (+, *, -, ...) are never flattened, because for them grouping can change the result.
const logicalOps = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const unwrap = (node) => (ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node);
const operandsOf = (node, op) => {
  const inner = unwrap(node);
  return ts.isBinaryExpression(inner) && inner.operatorToken.kind === op
    ? [...operandsOf(inner.left, op), ...operandsOf(inner.right, op)]
    : [node];
};

const parse = (name, text) =>
  ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Flattens a tree to comparable tokens; `parens` counts the skipped parenthesis nodes. */
function flatten(sf) {
  const out = [];
  const where = [];
  const stats = { parens: 0 };
  const visit = (node) => {
    if (skippable.has(node.kind)) {
      stats.parens++;
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isBinaryExpression(node) && logicalOps.has(node.operatorToken.kind)) {
      out.push(`Logical|${ts.SyntaxKind[node.operatorToken.kind]}|`);
      where.push(node);
      for (const operand of operandsOf(node, node.operatorToken.kind)) visit(operand);
      out.push('/');
      where.push(null);
      return;
    }
    const isName =
      (nameLike.has(node.kind) && node.parent && node.parent.name === node) ||
      (node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node);
    const kind = isName ? 'Name' : ts.SyntaxKind[node.kind];
    // SourceFile.text is the whole file (trivia included), so it is not compared here
    const text = node.kind !== ts.SyntaxKind.SourceFile && typeof node.text === 'string' ? node.text : '';
    const regex = node.kind === ts.SyntaxKind.RegularExpressionLiteral ? node.getText(sf) : '';
    out.push(`${kind}|${text}|${regex}`);
    where.push(node);
    ts.forEachChild(node, visit);
    out.push('/');
    where.push(null);
  };
  visit(sf);
  return { tokens: out, where, parens: stats.parens };
}

/** All comment texts of a file, normalised for re-indentation, sorted (positions are trivia). */
function comments(sf) {
  const text = sf.getFullText();
  const found = [];
  const seen = new Set();
  const scan = (ranges) => {
    const fresh = (ranges ?? []).filter((range) => !seen.has(range.pos));
    for (const range of fresh) seen.add(range.pos);
    found.push(
      ...fresh.map((range) =>
        text
          .slice(range.pos, range.end)
          .split('\n')
          .map((line) => line.trim())
          .join('\n'),
      ),
    );
  };
  const visit = (node) => {
    // getChildren(sf) also yields punctuation tokens, so comments before a `)` or `}` are not missed
    scan(ts.getLeadingCommentRanges(text, node.getFullStart()));
    scan(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  scan(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  return found.sort();
}

const firstDiff = (a, b) => {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++)
    if (a[index] !== b[index]) return { index, before: a[index], after: b[index] };
  return null;
};

const problems = [];
const parenNotes = [];
for (const file of files) {
  let before;
  try {
    before = git('show', `${baseRef}:${file}`);
  } catch {
    problems.push(`${file}: not present at ${baseRef}`);
    continue;
  }
  const a = parse(file, before);
  const b = parse(file, readFileSync(file, 'utf8'));
  const flatA = flatten(a);
  const flatB = flatten(b);
  const nodeDiff = firstDiff(flatA.tokens, flatB.tokens);
  if (nodeDiff) {
    const snippet = (flat, sf) => (flat.where[nodeDiff.index]?.getText(sf) ?? '').replace(/\s+/g, ' ').slice(0, 160);
    problems.push(
      `${file}: AST differs at token ${nodeDiff.index}: ${nodeDiff.before} -> ${nodeDiff.after}\n` +
        `    before: ${snippet(flatA, a)}\n    after:  ${snippet(flatB, b)}`,
    );
  }
  const commentDiff = firstDiff(comments(a), comments(b));
  if (commentDiff) {
    problems.push(
      `${file}: comments differ: ${JSON.stringify(commentDiff.before)} -> ${JSON.stringify(commentDiff.after)}`,
    );
  }
  if (flatA.parens !== flatB.parens) parenNotes.push(`${file}: parenthesis nodes ${flatA.parens} -> ${flatB.parens}`);
}

console.log(
  [...parenNotes.map((note) => `note (normalised): ${note}`), ...problems.map((p) => `DIFF ${p}`)].join('\n'),
);
console.log(
  `${files.length} files checked, ${problems.length} with differences, ${parenNotes.length} with parenthesis changes`,
);
process.exit(problems.length > 0 ? 1 : 0);
