# Menu levels, breadcrumb, sticky: what the documentation says

Read in November 2026 with a web fetch (a small model summarises each page: quotes are exact extracts, not raw HTML). The A/B tests `shell-tertiary`, `shell-breadcrumb` and `shell-header` keep only what this backs.

## Verified by a second read

| Source | Says |
|---|---|
| [Carbon, left panel](https://carbondesignsystem.com/components/UI-shell-left-panel/usage/) | "The left panel does not support three tiers of navigation." Third level: "use tabs within the page." |
| [Fluent 2, Nav](https://fluent2.microsoft.design/components/web/react/core/nav/usage) | "Nav only supports one level of nesting"; deeper: "use Tree instead." |
| [PatternFly, navigation](https://www.patternfly.org/components/navigation/design-guidelines) | Secondary horizontal navigation for "more granular navigation specific to a particular page"; "the page title should reflect the selected secondary navigation item"; its items go to "a distinct URL" (tabs do not); tabs "within the page content" for nested information; "3-level expandable navigation" when 3 levels are needed. |
| [Primer, UnderlineNav](https://primer.style/product/components/underline-nav/guidelines/) | "Don't stack multiple UnderlineNavs … on top of eachother"; "Avoid more than 2 levels of tab hierarchy"; placed "directly above the content it affects." |
| [NN/g, tabs](https://www.nngroup.com/articles/tabs-used-right/) | "avoid stacking tab lists within one tab control"; "Mixing in-page and navigation tabs within one tab control will disorient users"; "The fewer tabs, the better." |
| [NN/g, sticky headers](https://www.nngroup.com/articles/sticky-headers/) | "by using a sticky header you give away some screen real estate on every single page"; "minimize the vertical height from there." |
| [Atlassian, breadcrumbs](https://atlassian.design/components/breadcrumbs/usage) | "Place breadcrumbs at the top left corner of the screen, above the page title"; they "shouldn't replace the main navigation". Nothing on sticky. |

## Read once only (not re-checked)

Carbon breadcrumb: under the header, above the page title. Fluent breadcrumb: "Don't use breadcrumbs alone." NN/g breadcrumbs: a trail at the top of the page, "usually just below the global navigation".

## Not found

- No page read says a breadcrumb should be sticky, nor forbids it. Same for sticky tabs.
- Not obtained: Material 3 (empty, rendered by script), Salesforce, Cloudscape, Spectrum (404), Polaris (moved), Atlassian tabs and navigation pages.
- Nothing read backs a third column, a right rail, a flyout, a breadcrumb dropdown, a trail at the right or at the bottom: removed from the tests.

## Decided (user, November 2026)

- The trail is sticky; the third level is tabs under the trail, in the same sticky block. Not an accordion in the side menu: the third level depends on a choice made in the page (a task opened from a list, its sections as tabs).
- Left open: the dress of the tabs (`shell-tabs-style`: line, menu row, glow, segmented, chips, folder). The line style is the page tabs of dsl-ui; the others borrow from the side menu rows, the glow of the top bar tabs and the chip buttons.
- Removed: placements (accordion, sub-bar, column, rail, flyout, pills), breadcrumb looks, sticky header variants.
