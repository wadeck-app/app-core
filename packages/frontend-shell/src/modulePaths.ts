// A module page that declares the path "/" is the module's home page, mounted at /modules/<id>.
export function modulePagePath(moduleId: string, pagePath: string): string {
  return pagePath === '/' ? `/modules/${moduleId}` : `/modules/${moduleId}${pagePath}`;
}
