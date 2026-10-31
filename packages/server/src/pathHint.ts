// "/c/Users/x" is how Git Bash (MSYS) writes "C:/Users/x". A server on Windows reads it as a folder "c" on the current drive.
const MSYS_PATH = /^\/([a-zA-Z])(?:\/(.*))?$/;

// The Windows form of a Git Bash path, or undefined when the path is not written that way.
export function msysToWindows(received: string): string | undefined {
  const match = MSYS_PATH.exec(received);
  return match === null ? undefined : `${(match[1] as string).toUpperCase()}:/${match[2] ?? ''}`;
}

// What a user needs when a path they sent does not lead to a file: what the server received, what it read, and the form it
// expects. Empty when the path was read as it was written (the file is simply not there).
export function receivedPathHint(received: string, resolved: string, platform: NodeJS.Platform = process.platform): string {
  const windowsForm = platform === 'win32' ? msysToWindows(received) : undefined;
  if (windowsForm !== undefined) {
    return `You sent "${received}", the Git Bash form of a Windows path; this server runs on Windows and read it as ${resolved}. Send "${windowsForm}" (or "${windowsForm.replaceAll('/', '\\')}") instead.`;
  }
  if (received !== resolved && !/^[a-zA-Z]:[\\/]|^[\\/]/.test(received)) {
    return `You sent the relative path "${received}"; the server read it from its own folder as ${resolved}. Send an absolute path ("C:/..." or "C:\\...", "/..." on Linux and macOS).`;
  }
  return '';
}
