// The host contexts of dsl-ui (its `HOST_CONTEXTS`) that this shell provides to the pages of the modules, and those it does not. A module
// build or test hands the first list to the DSL compiler (`providedContexts`) to find, before it ships, a view that needs a context the
// shell lacks. Served by GET /api/shell-settings (`providedContexts`).
// Every name of dsl-ui is in exactly one of the two lists, and the shell's own test (frontend-shell `App.hostContexts.test.tsx`) mounts the
// shell and checks each against what a page really finds: when this file and App.tsx / AppLayout.tsx disagree, that test fails.
// ThemeContext: the theme control of the top bar is the shell's own (`theme/ThemeControls.tsx`), it does not use dsl-ui's ThemeContext.
export const PROVIDED_HOST_CONTEXTS: readonly string[] = ['AbExperimentsContext', 'HeaderActionsContext', 'RouterContext', 'ToastContext', 'UrlParamContext'];
export const NOT_PROVIDED_HOST_CONTEXTS: readonly string[] = ['ThemeContext'];
