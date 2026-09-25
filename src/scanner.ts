import { Node, Project, SyntaxKind } from "ts-morph";

/**
 * One entry per affected file, not per call site: the patch generator
 * rewrites the whole file, so a file with several call sites needs one
 * patch and one PR, not one per call.
 */
export interface UsageMatch {
  filePath: string;
  lineNumbers: number[];
  snippet: string;
}

/**
 * Walks a member-access chain like `stripe.charges.create` back to its
 * root identifier, returning that root plus the dotted property path after
 * it. Returns null for anything that isn't a plain identifier-rooted chain
 * (a function call result, a computed index, etc.) — those can't be
 * resolved back to a known client variable, so they're not usages we can
 * confidently match.
 */
function resolvePropertyPath(expr: Node): { root: string; path: string } | null {
  const parts: string[] = [];
  let current: Node = expr;
  while (Node.isPropertyAccessExpression(current)) {
    parts.unshift(current.getName());
    current = current.getExpression();
  }
  if (!Node.isIdentifier(current)) return null;
  return { root: current.getText(), path: parts.join(".") };
}

/**
 * Scans a repo (already checked out locally) for call sites that resolve
 * back to a client instantiated from `packageName`, e.g.
 * findUsages("./repo", "stripe", "charges.create") only matches
 * `stripe.charges.create(...)` where `stripe` was built from an import of
 * "stripe" — not comments, string literals, or unrelated identifiers that
 * merely contain the same text.
 */
export function findUsages(
  repoPath: string,
  packageName: string,
  methodName: string
): UsageMatch[] {
  const project = new Project();
  project.addSourceFilesAtPaths(`${repoPath}/**/*.{ts,js}`);

  const matches: UsageMatch[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const importedNames = sourceFile
      .getImportDeclarations()
      .filter((imp) => imp.getModuleSpecifierValue().includes(packageName))
      .flatMap((imp) => [
        imp.getDefaultImport()?.getText(),
        ...imp.getNamedImports().map((n) => n.getName()),
      ])
      .filter((name): name is string => !!name);

    if (importedNames.length === 0) continue;

    // Variables built from the imported package, e.g.
    // `const stripe = new Stripe(key)` or `const stripe = Stripe(key)`.
    const clientVars = new Set<string>();
    for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const init = decl.getInitializer();
      const nameNode = decl.getNameNode();
      if (!init || !Node.isIdentifier(nameNode)) continue;

      const callee =
        Node.isNewExpression(init) || Node.isCallExpression(init) ? init.getExpression() : undefined;
      if (callee && Node.isIdentifier(callee) && importedNames.includes(callee.getText())) {
        clientVars.add(nameNode.getText());
      }
    }
    if (clientVars.size === 0) continue;

    const lineNumbers: number[] = [];
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const resolved = resolvePropertyPath(call.getExpression());
      if (!resolved || !clientVars.has(resolved.root)) continue;
      if (resolved.path !== methodName && !resolved.path.endsWith(`.${methodName}`)) continue;

      lineNumbers.push(call.getStartLineNumber());
    }

    if (lineNumbers.length > 0) {
      matches.push({
        filePath: sourceFile.getFilePath(),
        lineNumbers,
        snippet: sourceFile.getFullText(),
      });
    }
  }

  return matches;
}
