import { isAbsolute, relative, sep } from "node:path";

export function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}
