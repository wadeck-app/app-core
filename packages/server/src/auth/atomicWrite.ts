import * as fs from 'node:fs';
import * as path from 'node:path';

// Writes a file so that a reader never sees half of it: the content goes to a temporary file next to it (mode 0600), then replaces
// the target in one rename. On Windows the mode is not enforced (Node ignores it there): the file is protected by the ACL of the
// user profile only, and any process of the same user can read it.
export function writeFileAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}
