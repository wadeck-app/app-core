import { useAbTest } from '@wadeck-app/dsl-ui';
import { useDockTests } from '../useDockTests.js';

export type NavLabels = 'full' | 'trimmed';
export type NavSwitcher = 'off' | 'button' | 'shortcut';
export type NavBreadcrumb = 'none' | 'trail' | 'back';
export type NavTabOrder = 'registered' | 'alpha' | 'recent';
export type NavTabs = 'both' | 'name';
export type NavContrib = 'flat' | 'logo' | 'puzzle';
export type NavDashMenu = 'modules' | 'all-pages' | 'recent';

// The A/B tests open on the navigation (see the A/B testing rule in the project CLAUDE.md), one dock row each.
export function useNavExperiments() {
  const labels = useAbTest<NavLabels>({
    id: 'nav-labels',
    label: 'Menu labels',
    initial: 'full',
    options: {
      full: { label: 'Full', hint: 'Today: the page label as the module wrote it ("Flow Executions" under Flow).' },
      trimmed: { label: 'Trimmed', hint: 'Drops the module name when the label starts with it ("Executions" under Flow): the tab already says it.' },
    },
  });
  const switcher = useAbTest<NavSwitcher>({
    id: 'nav-switcher',
    label: 'Quick switcher',
    initial: 'off',
    options: {
      off: { label: 'Off', hint: 'Today: no way to jump to a page without going through its module tab.' },
      button: { label: 'Button', hint: 'A Search button in the top bar, and Ctrl+K (Cmd+K on a Mac): type a module or page, arrows, Enter.' },
      shortcut: { label: 'Shortcut', hint: 'Ctrl+K / Cmd+K only, with nothing added to the top bar.' },
    },
  });
  const breadcrumb = useAbTest<NavBreadcrumb>({
    id: 'nav-breadcrumb',
    label: 'Breadcrumb',
    initial: 'none',
    options: {
      none: { label: 'None', hint: 'Today: nothing above the page says where you are besides the highlighted tab and menu entry.' },
      trail: { label: 'Trail', hint: 'A trail above the page: module, page, and the detail page or form you are on. Earlier crumbs are links.' },
      back: { label: 'Back link', hint: 'Only on a detail page or form: one link back to the page it belongs to, nothing on the menu pages.' },
    },
  });
  const tabs = useAbTest<NavTabs>({
    id: 'nav-tabs',
    label: 'Tabs',
    initial: 'both',
    options: {
      both: { label: 'Logo + name', hint: 'Today: the module logo and its name.' },
      name: { label: 'Name only', hint: 'No logo in the tabs: more room for names. The logo stays in the menu and the widgets.' },
    },
  });
  const tabOrder = useAbTest<NavTabOrder>({
    id: 'nav-tab-order',
    label: 'Tab order',
    initial: 'registered',
    options: {
      registered: { label: 'Registered', hint: 'Today: the order the modules were registered in.' },
      alpha: { label: 'A to Z', hint: 'Alphabetical by module name: the tabs never move, and a module is easy to find.' },
      recent: { label: 'Recent', hint: 'The modules you used last come first (after the dashboard). The tabs move as you work.' },
    },
  });
  const contrib = useAbTest<NavContrib>({
    id: 'nav-contrib',
    label: 'Added pages',
    initial: 'flat',
    options: {
      flat: { label: 'Flat', hint: 'Today: a page another module added to a menu looks like the menu own pages.' },
      logo: { label: 'Logo', hint: 'The logo of the module that added the page, before its label.' },
      puzzle: { label: 'Puzzle', hint: 'A small puzzle icon marks the pages added by another module.' },
    },
  });
  const dashMenu = useAbTest<NavDashMenu>({
    id: 'nav-dash-menu',
    label: 'Dashboard menu',
    initial: 'modules',
    options: {
      modules: { label: 'Modules', hint: 'Today: one entry per module (the same as the tabs).' },
      'all-pages': { label: 'All pages', hint: 'Every page of every module, as "Module: Page": reach any page in one click from the dashboard.' },
      recent: { label: 'Recent', hint: 'The pages you opened last (up to 6), newest first; the modules until you have visited some.' },
    },
  });
  const tests = [labels, switcher, breadcrumb, tabs, tabOrder, contrib, dashMenu];
  // In the one dock of the app-wide host when there is one, else the caller shows a dock of its own.
  const hosted = useDockTests(tests);
  return { labels: labels.value, switcher: switcher.value, breadcrumb: breadcrumb.value, tabs: tabs.value, tabOrder: tabOrder.value, contrib: contrib.value, dashMenu: dashMenu.value, tests, hosted };
}
