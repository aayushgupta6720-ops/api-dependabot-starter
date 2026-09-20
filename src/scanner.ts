import { Project, SyntaxKind } from "ts-morph";

export interface UsageMatch {
  filePath: string;
  lineNumber: number;
  snippet: string;
}

/**
 * Scans a repo (already checked out locally) for call sites that reference
 * a given method name from a given package, e.g. findUsages("./repo", "stripe", "charges.create").
 * Starts simple: flags any call expression whose text contains the method name.
 * Tighten this once you see false positives in your eval set.
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
    const importsPackage = sourceFile
      .getImportDeclarations()
      .some((imp) => imp.getModuleSpecifierValue().includes(packageName));
    if (!importsPackage) continue;

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      if (call.getText().includes(methodName)) {
        matches.push({
          filePath: sourceFile.getFilePath(),
          lineNumber: call.getStartLineNumber(),
          snippet: sourceFile.getFullText(),
        });
      }
    }
  }

  return matches;
}
