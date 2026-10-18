export type SrcDir = 'backend' | 'dsl-views' | 'dsl-components' | 'commons';

export const SRC_DIRS: readonly SrcDir[];
export const OUTPUT_DIR: string;
export const BACKEND_ENTRY: string;
export const FORBIDDEN_FOLDER_IMPORTS: Record<SrcDir, SrcDir[]>;

export function toPosix(p: string): string;
export function moduleRootOf(file: string): string | undefined;
export function srcFolderOf(moduleRoot: string, absolute: string): SrcDir | undefined;
export function isReactSpecifier(spec: string): boolean;
export function isNodeSpecifier(spec: string): boolean;
export function importSpecifiers(source: string): Array<{ spec: string; line: number }>;
export function hasDefaultExport(source: string): boolean;
export function isDir(p: string): boolean;
export function listFiles(dir: string): string[];
