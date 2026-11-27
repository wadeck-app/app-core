import type { HostContext } from '@wadeck-app/dsl-ui';

// Which of the host contexts of dsl-ui (its `HOST_CONTEXTS`) this shell provides to the pages of the modules. A record, not a list: every
// name dsl-ui knows must be decided here, so a context added by a new dsl-ui (or a typo) is a compile error, not a silent gap.
// The names that are true are written in build-info.json (`providedContexts`), which `app-core-cli check` hands to the DSL compiler: a view
// that needs a context this shell does not provide then fails the module's build, not the page of a user.
// `App.hostContexts.test.tsx` mounts the shell and checks each entry against what a page really finds.
// ThemeContext: the theme control of the top bar is the shell's own (`theme/ThemeControls.tsx`), it does not use dsl-ui's ThemeContext.
export const SHELL_HOST_CONTEXTS: Record<HostContext, boolean> = {
  AbExperimentsContext: true,
  HeaderActionsContext: true,
  RouterContext: true,
  ThemeContext: false,
  ToastContext: true,
  UrlParamContext: true,
};

export function providedHostContexts(): HostContext[] {
  return (Object.keys(SHELL_HOST_CONTEXTS) as HostContext[]).filter((name) => SHELL_HOST_CONTEXTS[name]).sort();
}
