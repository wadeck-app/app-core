# @wadeck-app/app-core-sdk

Types and manifest/schema validation for authoring an `app-module` package that app-core loads at
runtime. If you're building a module for Orchestrator, Queue, Flow, or any future daemon, this
package gives you the typed contract -- for the `validate`/`check`/`package`/`dev` CLI commands, see
`@wadeck-app/app-core-cli` instead (installed globally, auto-updating, like every other
`@wadeck-app` CLI in this workspace).

## Install

```sh
npm install --save-dev @wadeck-app/app-core-sdk
```

This stays a project-local dependency, deliberately -- `import type` statements can only be
resolved through real `node_modules` in your own project, so there is no "global" version of this
package. (The CLI tooling has no such constraint; see `@wadeck-app/app-core-cli`.)


## Authoring a module

An app-module is a package named `app-module-<name>` with a `manifest.json` (including its `id`)
and sources under `src/{backend,dsl-views,dsl-components,commons}`. `app-core-cli check` verifies the
layout, `app-core-cli package` builds the publishable `dist-module/`. Full reference (layout rules,
manifest, `package`, registration, backend entry, lifecycle hooks, `$sources`, `ExtensionSlot`, naming, migration checklist, troubleshooting, limitations):
[docs/module-authoring.md](docs/module-authoring.md); begin with its [Start here](docs/module-authoring.md#start-here-the-5-minute-path).
A daemon registers its module with `@wadeck-app/app-core-sdk/register`: [docs/registering-a-module.md](docs/registering-a-module.md).

## Dark theme

app-core ships a light and a dark theme (toggle in the nav bar). Your views follow the active
theme automatically if they only use `@wadeck-app/dsl-ui` components and their semantic props.
Nothing to implement, but do not break it:

- Never put raw colors in a view: no hex/rgb/hsl values, no fixed Tailwind palette classes
  (`bg-white`, `text-gray-700`). They stay the same in both themes and become unreadable in one.
- For color-carrying props, use the semantic values the component declares, never a literal color
  (e.g. `Badge` `variant`: `success`, `warning`, `danger`, `info`, `primary`, `default`).
- Do not add per-theme logic (`dark:` variants, theme checks): the tokens already switch.
- To paint a subtree in a fixed palette regardless of the app theme (terminal, code viewer), wrap it
  in `ThemeScope` instead of hardcoding colors.
- Check both themes before shipping: toggle the nav-bar icon, or set `localStorage.theme` to `dark`
  and reload.
