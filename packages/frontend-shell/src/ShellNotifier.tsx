import React, { useCallback } from 'react';
import { NotifierProvider, type Notification } from '@wadeck-app/dsl-renderer';
import { useToast } from '@wadeck-app/dsl-ui';

// An error names the action and the HTTP status when there is one: the server message alone ("not-found") does not tell
// the user what failed.
export function describeNotification(n: Notification): string {
  if (n.kind === 'success') {
    return n.message;
  }
  const what = n.action === undefined ? 'The action failed' : `Action "${n.action}" failed`;
  return `${what}${n.status === undefined ? '' : ` (HTTP ${n.status})`}: ${n.message}`;
}

// Presents the feedback of every module action (row/batch actions, forms, brains) as a toast. Mounted once, inside the
// ToastProvider, above every page and widget: without it each runner shows its own inline banner.
export function ShellNotifier({ children }: { children: React.ReactNode }): React.ReactElement {
  const toast = useToast();
  const notify = useCallback((n: Notification) => (n.kind === 'success' ? toast.success(describeNotification(n)) : toast.error(describeNotification(n))), [toast]);
  return <NotifierProvider notify={notify}>{children}</NotifierProvider>;
}
