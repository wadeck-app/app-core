import type { ViolationsConfig } from '@wadeck-app/violations-rules'

export default {
  projectTags: ['ts'],
  globalExclude: [
    'node_modules/**',
    'dist/**',
    // Internal hot-swap test double (not a real module, deliberately not
    // named *-app-module) -- see loader.test.ts / http.test.ts.
    'packages/test-app-modules/lifecycle-app-module/v2-fixture/**',
    // DEAD, ORPHANED since the Decision #36 move to packages/test-app-modules/ --
    // this directory should be deleted entirely (blocked by a local destructive-
    // action guardrail during the automated move; needs a manual `rm -rf`). This
    // exclude is a temporary workaround, not a permanent fix -- remove this line
    // once the directory is actually deleted.
    'packages/server/test/fixtures/**',
  ],
  rules: {
    './.violations/rules/app-module-no-raw-timers.ts': true,
    './.violations/rules/app-module-manifest-exists-and-valid.ts': true,
    './.violations/rules/app-module-backend-entry-location.ts': true,
    './.violations/rules/app-module-view-location.ts': true,
    './.violations/rules/app-module-no-react.ts': true,
    './.violations/rules/app-module-naming-convention.ts': true,
  },
} satisfies ViolationsConfig
