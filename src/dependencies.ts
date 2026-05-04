// Plugin-side parsing for B7 drift detection. The BE has the authoritative
// AST-based extractor; here we use lightweight regex on the file's text to
// surface drift between the Python facet and the # Dependencies section.

const PYTHON_BLOCK_RE = /#\s*Python\s*\n\s*```python\n([\s\S]*?)```/;
const DEPS_SECTION_RE = /#\s*Dependencies\s*\n([\s\S]*?)(?=\n#\s|$)/;
const COMPUTE_CALL_RE = /context\.compute\(\s*["']([^"']+)["']/g;
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g;

export interface DriftReport {
  python: Set<string>;
  deps: Set<string>;
  hasDrift: boolean;
  hasDependenciesSection: boolean;
  // Items in Python but not in deps — these are "missing from the section".
  missingFromDeps: string[];
  // Items in deps but not in Python — stale entries the section still lists.
  stale: string[];
}

export function pythonComputeCalls(fileContent: string): Set<string> {
  const out = new Set<string>();
  const m = fileContent.match(PYTHON_BLOCK_RE);
  if (!m) return out;
  const code = m[1];
  COMPUTE_CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPUTE_CALL_RE.exec(code)) !== null) {
    out.add(match[1]);
  }
  return out;
}

export function depsSectionWikilinks(fileContent: string): { found: boolean; ids: Set<string> } {
  const out = new Set<string>();
  const m = fileContent.match(DEPS_SECTION_RE);
  if (!m) return { found: false, ids: out };
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(m[1])) !== null) {
    out.add(match[1].trim());
  }
  return { found: true, ids: out };
}

export function detectDrift(fileContent: string): DriftReport {
  const python = pythonComputeCalls(fileContent);
  const { found, ids: deps } = depsSectionWikilinks(fileContent);
  const missingFromDeps = [...python].filter(p => !deps.has(p));
  const stale = [...deps].filter(d => !python.has(d));
  return {
    python,
    deps,
    hasDependenciesSection: found,
    hasDrift: missingFromDeps.length > 0 || stale.length > 0,
    missingFromDeps,
    stale,
  };
}
