import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

const K = SyntaxKind;

const ENDS_VALUE = new Set([
  K.Identifier,
  K.PrivateIdentifier,
  K.NumericLiteral,
  K.BigIntLiteral,
  K.StringLiteral,
  K.RegularExpressionLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateHead,
  K.TemplateMiddle,
  K.TemplateTail,
  K.CloseParenToken,
  K.CloseBracketToken,
  K.PlusPlusToken,
  K.MinusMinusToken,
  K.ThisKeyword,
  K.SuperKeyword,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
  K.UndefinedKeyword,
]);

const COMMENT_KINDS = new Set([K.SingleLineCommentTrivia, K.MultiLineCommentTrivia]);

const roots = process.argv.slice(2);
const changed = [];
let removedBlocks = 0;
let removedLines = 0;

function expand(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end);
  const lineEnd = nl === -1 ? text.length : nl + 1;
  const ownsLine = /^\s*$/.test(text.slice(lineStart, start));
  const restIsBlank = /^\s*$/.test(text.slice(end, lineEnd));
  if (ownsLine && restIsBlank) return [lineStart, lineEnd];
  if (ownsLine) return [lineStart, end];
  if (restIsBlank) return [start, lineEnd];
  return [start, end];
}

function strip(file) {
  const source = readFileSync(file, "utf8");
  if (source.startsWith("#!")) {
    console.log(`SKIP (shebang): ${file}`);
    return;
  }
  const variant = file.endsWith(".tsx") ? LanguageVariant.JSX : LanguageVariant.Standard;
  const scanner = createScanner(false, variant, source);

  const spans = [];
  let allowRegex = true;
  let templateDepth = 0;
  let guard = source.length * 4 + 1000;
  for (;;) {
    if (guard-- <= 0) {
      console.log(`STOP (no progress): ${file}`);
      return;
    }
    const kind = scanner.scan();
    if (kind === K.EndOfFileToken || kind === K.EndOfFile) break;

    if (kind === K.CloseBraceToken && templateDepth > 0) {
      const resumed = scanner.reScanTemplateToken();
      if (resumed === K.TemplateTail) templateDepth -= 1;
      allowRegex = false;
      continue;
    }

    if (kind === K.TemplateHead) templateDepth += 1;
    if (kind === K.TemplateTail) templateDepth -= 1;

    if (kind === K.SlashToken && allowRegex) {
      const rescanned = scanner.reScanSlashToken();
      if (rescanned !== K.SlashToken) {
        allowRegex = false;
        continue;
      }
    }

    if (COMMENT_KINDS.has(kind)) {
      spans.push(expand(source, scanner.getTokenStart(), scanner.getTokenEnd()));
      continue;
    }

    allowRegex = !ENDS_VALUE.has(kind);
  }

  spans.sort((a, b) => b[0] - a[0]);

  let out = source;
  for (const [start, end] of spans) {
    const raw = source.slice(start, end);
    if (raw.includes("/*")) removedBlocks += 1;
    else removedLines += 1;
    out = out.slice(0, start) + out.slice(end);
  }

  out = out.replace(/^\s+$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^\n+/, "");

  if (out !== source) {
    writeFileSync(file, out);
    changed.push(relative(process.cwd(), file));
  }
}

for (const root of roots) strip(root);

console.log(`${changed.length} files changed`);
console.log(`${removedBlocks} comment blocks, ${removedLines} line comments removed`);
