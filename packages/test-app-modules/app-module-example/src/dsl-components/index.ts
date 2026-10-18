// Built by `package` into dist-module/dsl-lib/entries.mjs. The default export lists the components the shell
// registers as "<moduleId>:<name>" (here "example:LiveTicks").
import { createElement } from 'react';
import { LiveTicks } from './LiveTicks.js';

export default [
  {
    name: 'LiveTicks',
    category: 'atomic',
    tags: [],
    render: () => createElement(LiveTicks),
  },
];
