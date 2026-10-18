import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo, moduleColor, moduleColor2, type LogoTone } from './Logo.js';
import { activeNavModule, type NavModule } from './navModel.js';
import type { TabHighlight } from './tabHighlight.js';

const BASE = 'flex items-center whitespace-nowrap text-sm font-medium transition-colors';
const INACTIVE = 'text-muted hover:text-content';
// Color of the Dashboard tab, which has no module: the app accent (default blue, since no module is active).
const DASHBOARD_COLOR = 'var(--color-primary-solid)';

// The logo has one size in the top bar, whatever the tab, the state or the style: emphasis never resizes it.
interface TabLogo {
  tone: LogoTone;
  ring?: boolean;
  glow?: boolean;
}

interface TabLook {
  className: string;
  style?: React.CSSProperties;
  // Style of the name only (gradient-painted text).
  nameStyle?: React.CSSProperties;
  logo: TabLogo;
  // Extra element drawn inside the tab (the dot, the glow bar).
  decoration?: React.ReactNode;
  // Show only the logo; the name stays for screen readers and as a tooltip.
  iconOnly?: boolean;
}

// How one tab looks for each way of emphasizing the active module. `color` is the module color (or the app accent) and
// `color2` its second hue, used by the two-tone gradients.
// The gap is part of each class string, not of BASE: two competing gap-* classes are resolved by Tailwind's
// stylesheet order, not by their order in the string.
function tabLook(highlight: TabHighlight, a: boolean, color: string, color2: string): TabLook {
  const mix = (c: string, pct: number): string => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  // Gradient of the "Gradient" family: the module color, strongest at the left, fading out to the right.
  const fadeRight = `linear-gradient(90deg, ${mix(color, 28)}, transparent)`;
  // A tab as tall as the top bar, painted with `css` when active. Used by the "Full" families.
  const fullHeight = (css: React.CSSProperties): TabLook => ({
    className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
    style: a ? css : undefined,
    logo: { tone: 'solid' },
  });
  switch (highlight) {
    case 'current':
      return { className: `gap-1.5 ${a ? 'text-primary' : INACTIVE}`, logo: { tone: 'solid' } };
    case 'pill':
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'bg-primary-light font-semibold text-primary' : `${INACTIVE} hover:bg-bg`}`,
        logo: { tone: a ? 'solid' : 'muted' },
      };
    case 'solid':
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'bg-primary-solid font-semibold text-white shadow-sm' : `${INACTIVE} hover:bg-bg`}`,
        logo: { tone: a ? 'inverted' : 'muted' },
      };
    case 'underline':
      return {
        // Top padding equals the bottom border: the text stays on the same line as the other tabs and the brand.
        className: `gap-1.5 border-b-2 pt-0.5 ${a ? 'border-primary-solid font-semibold text-content' : `border-transparent ${INACTIVE}`}`,
        logo: { tone: a ? 'solid' : 'muted' },
      };
    case 'ring':
      // Wider gap: the ring (2px + 2px offset) must not touch the name.
      return { className: `gap-3 ${a ? 'font-semibold text-content' : INACTIVE}`, logo: { tone: a ? 'solid' : 'muted', ring: a } };
    case 'invert':
      return { className: `gap-2 ${a ? 'font-semibold text-content' : INACTIVE}`, logo: { tone: a ? 'swapped' : 'solid' } };
    case 'outline':
      return { className: `gap-2 ${a ? 'font-semibold text-content' : INACTIVE}`, logo: { tone: a ? 'solid' : 'outline' } };
    case 'glow':
      // Wider gap: the glow reaches 4px around the logo.
      return { className: `gap-3 ${a ? 'font-semibold text-content' : INACTIVE}`, logo: { tone: 'solid', glow: a } };
    case 'expand':
      return { className: `rounded-full p-1 ${a ? 'gap-2 bg-bg pr-3 font-semibold text-content' : 'hover:bg-bg'}`, logo: { tone: 'solid' }, iconOnly: !a };
    case 'lift':
      return {
        className: `gap-1.5 rounded-lg px-3 py-1 ${a ? 'bg-bg font-semibold text-content shadow-sm ring-1 ring-primary-solid' : `${INACTIVE} hover:bg-bg`}`,
        logo: { tone: 'solid' },
      };
    case 'contrast':
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'bg-content font-semibold text-surface' : `${INACTIVE} hover:bg-bg`}`,
        logo: { tone: 'solid' },
      };
    case 'chip':
      return {
        className: `gap-1.5 rounded-md px-2 py-1 ${a ? 'font-semibold text-white' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { backgroundColor: color } : undefined,
        logo: { tone: a ? 'glass' : 'solid' },
      };
    case 'ghost':
      return {
        className: `gap-1.5 rounded-full border-2 px-3 py-0.5 ${a ? 'font-semibold' : `border-transparent ${INACTIVE}`}`,
        style: a ? { borderColor: color, color } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradient':
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: fadeRight, boxShadow: `inset 3px 0 0 ${color}` } : undefined,
        logo: { tone: 'solid' },
      };
    // The next three keep the Gradient colors (the module color only, no second hue) and change one thing each.
    case 'gradientSoft':
      // Same gradient, without the solid bar on the left edge.
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: fadeRight } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientFull':
      // The gradient fills the whole height of the top bar, not just the text: the tab stretches (self-stretch) to the bar.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: fadeRight } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientEdges':
      // The color starts at both edges and meets in the middle, where the tab is the lightest.
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(90deg, ${mix(color, 28)}, transparent 50%, ${mix(color, 28)})` } : undefined,
        logo: { tone: 'solid' },
      };
    // More variants of Gradient, still the module color only.
    case 'gradientEdgesInv':
      // Reverse of Edges: transparent at both edges, strongest in the middle.
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(90deg, transparent, ${mix(color, 28)} 50%, transparent)` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientFullDown':
      // Full-height tab, the gradient running vertically: strongest at the top of the bar, gone at the bottom.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(180deg, ${mix(color, 28)}, transparent)` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientFullUp':
      // The opposite: strongest at the bottom of the bar, as if the tab were lit from the underline.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(0deg, ${mix(color, 28)}, transparent)` } : undefined,
        logo: { tone: 'solid' },
      };
    // Four takes on Full up (bottom to top), playing on intensity, shape and shade of the module color.
    case 'fullUpStrong':
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(0deg, ${mix(color, 50)}, transparent 90%)` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'fullUpSoft':
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(0deg, ${mix(color, 14)}, transparent)` } : undefined,
        logo: { tone: 'solid' },
      };
    // Steps between Up soft (linear, very light) and Up glow (radial at the bottom center, strong), in that order.
    case 'upBlend':
      // Up soft's light base plus a small radial glow at the bottom center.
      return fullHeight({ backgroundImage: `radial-gradient(60% 90% at 50% 100%, ${mix(color, 32)}, transparent 100%), linear-gradient(0deg, ${mix(color, 14)}, transparent)` });
    case 'upGlowSoft':
      // Up glow's shape at roughly half its intensity.
      return fullHeight({ backgroundImage: `radial-gradient(75% 100% at 50% 100%, ${mix(color, 28)}, transparent 100%)` });
    case 'upGlowLine':
      return fullHeight({ backgroundImage: `radial-gradient(75% 100% at 50% 100%, ${mix(color, 28)}, transparent 100%)`, boxShadow: `inset 0 -1px 0 ${mix(color, 55)}` });
    case 'upGlowTall':
      // The ellipse is taller than the tab, so the glow reaches the top of the bar.
      return fullHeight({ backgroundImage: `radial-gradient(75% 150% at 50% 100%, ${mix(color, 32)}, transparent 100%)` });
    case 'upGlowWide':
      // The ellipse is wider than the tab, so the glow spreads over its whole width.
      return fullHeight({ backgroundImage: `radial-gradient(120% 100% at 50% 100%, ${mix(color, 32)}, transparent 100%)` });
    case 'fullUpGlow':
      // A glow centered on the bottom edge of the tab: strongest at the bottom center, softer toward the sides and the top.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { backgroundImage: `radial-gradient(75% 100% at 50% 100%, ${mix(color, 50)}, transparent 100%)` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'fullUpDeep':
      // A shade variation of the same color: a darker version at the very bottom, the module color in the middle, then nothing.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(0deg, ${mix(`color-mix(in srgb, ${color} 70%, black)`, 45)}, ${mix(color, 20)} 55%, transparent)` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientFullEdges':
      // Full height, and the color starting at both edges to meet in the middle.
      return {
        className: `gap-1.5 self-stretch px-4 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: `linear-gradient(90deg, ${mix(color, 28)}, transparent 50%, ${mix(color, 28)})` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'gradientUnder':
      // The Gradient fade, with a solid bar along the bottom edge instead of the left one.
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { background: fadeRight, boxShadow: `inset 0 -2px 0 ${color}` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'innerGlow':
      // A glow that stays inside the pill: a thin tinted edge and a soft inner halo, no fill.
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { boxShadow: `inset 0 0 0 1px ${mix(color, 45)}, inset 0 0 14px ${mix(color, 45)}` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'sweep':
      // Two background layers: a glossy highlight over a diagonal gradient from the module color to a darker shade of it.
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'font-semibold text-white shadow-sm' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { backgroundImage: `linear-gradient(115deg, rgba(255,255,255,0.28), transparent 45%), linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, black))` } : undefined,
        logo: { tone: a ? 'glass' : 'solid' },
      };
    case 'sweepSoft':
      // Sweep, calmer: the gradient starts at the right with the module color and runs left to a slightly more
      // transparent version of the same color (no dark end, and no white: mixing with white washed the pill out and let it
      // dominate), with a lighter highlight mirrored on the right.
      return {
        className: `gap-1.5 rounded-full px-3 py-1 ${a ? 'font-semibold text-white shadow-sm' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { backgroundImage: `linear-gradient(245deg, rgba(255,255,255,0.18), transparent 45%), linear-gradient(270deg, ${color}, ${mix(color, 78)})` } : undefined,
        logo: { tone: a ? 'glass' : 'solid' },
      };
    case 'aurora':
      // Gradient border: the plain fill is clipped to the padding box, the gradient shows through the transparent border.
      return {
        className: `gap-1.5 rounded-full border-2 border-transparent px-3 py-0.5 ${a ? 'font-semibold text-content' : INACTIVE}`,
        style: a
          ? {
              backgroundImage: `linear-gradient(var(--color-surface), var(--color-surface)), linear-gradient(90deg, ${color}, ${color2})`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
            }
          : undefined,
        logo: { tone: a ? 'duotone' : 'solid' },
      };
    case 'underglow':
      return {
        className: `relative gap-1.5 py-2 ${a ? 'font-semibold text-content' : INACTIVE}`,
        logo: { tone: 'solid' },
        decoration: a ? (
          <span
            aria-hidden="true"
            data-decoration="underglow"
            className="absolute inset-x-1 bottom-1 h-[3px] rounded-full"
            style={{ backgroundImage: `linear-gradient(90deg, ${color}, ${color2})`, boxShadow: `0 2px 10px ${mix(color, 60)}` }}
          />
        ) : undefined,
      };
    case 'spotlight':
      // A radial light cone falling from the top edge of the tab.
      return {
        className: `gap-1.5 rounded-md px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a ? { backgroundImage: `radial-gradient(90% 140% at 50% 0%, ${mix(color, 60)}, transparent 80%)`, boxShadow: `inset 0 1px 0 ${mix(color, 80)}` } : undefined,
        logo: { tone: 'solid' },
      };
    case 'mesh':
      // Two soft radial blobs (module color top-left, second hue bottom-right) on the surface, with a thin tinted border.
      return {
        className: `gap-1.5 rounded-full border border-transparent px-3 py-1 ${a ? 'font-semibold text-content' : `${INACTIVE} hover:bg-bg`}`,
        style: a
          ? {
              backgroundColor: 'var(--color-surface)',
              backgroundImage: `radial-gradient(120% 160% at 0% 0%, ${mix(color, 55)}, transparent 60%), radial-gradient(120% 160% at 100% 100%, ${mix(color2, 50)}, transparent 60%)`,
              boxShadow: `inset 0 0 0 1px ${mix(color, 40)}`,
            }
          : undefined,
        logo: { tone: a ? 'duotone' : 'solid' },
      };
    case 'aura':
      // No pill: the name itself is painted with the two-tone gradient.
      return {
        className: `gap-1.5 ${a ? 'font-semibold' : INACTIVE}`,
        nameStyle: a ? { backgroundImage: `linear-gradient(90deg, ${color}, ${color2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : undefined,
        logo: { tone: a ? 'duotone' : 'solid' },
      };
    case 'topline':
      return {
        // Bottom padding equals the top border (see Underline).
        className: `gap-1.5 border-t-2 pb-0.5 ${a ? 'border-primary-solid font-semibold text-content' : `border-transparent ${INACTIVE}`}`,
        logo: { tone: a ? 'solid' : 'muted' },
      };
    case 'dot':
      return {
        // Symmetric padding keeps the text on the shared line; the dot sits in the bottom padding.
        className: `relative gap-1.5 py-2 ${a ? 'font-semibold text-content' : INACTIVE}`,
        logo: { tone: a ? 'solid' : 'muted' },
        decoration: a ? <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary-solid" /> : undefined,
      };
  }
}

// Top level of the navigation: one entry per module, with its colored 2-letter logo and name. Pages live in the
// ModuleSidebar. A tab stays highlighted on every page of its module and points to the module's first page.
// `highlight` picks how the active tab stands out.
export function ModuleTabs({ navModules, highlight = 'current' }: { navModules: NavModule[]; highlight?: TabHighlight }): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  // 'expand' folds inactive tabs to their icon, and the Dashboard has none: it keeps a plain tab.
  const dashboard = tabLook(highlight === 'expand' ? 'current' : highlight, pathname === '/', DASHBOARD_COLOR, DASHBOARD_COLOR);
  return (
    // As tall as the top bar (self-stretch): the bar's height does not depend on the highlight style, and a tab can fill it.
    // Scrolls instead of wrapping when there are more modules than the bar can hold.
    <nav aria-label="Modules" className="flex min-w-0 items-center gap-4 self-stretch overflow-x-auto">
      <Link to="/" className={`${BASE} ${dashboard.className}`} style={dashboard.style} aria-current={pathname === '/' ? 'page' : undefined}>
        <span style={dashboard.nameStyle}>Dashboard</span>
        {dashboard.decoration}
      </Link>
      {navModules.map((m) => {
        const isActive = active?.id === m.id;
        const look = tabLook(highlight, isActive, moduleColor(m.id), moduleColor2(m.id));
        return (
          <Link
            key={m.id}
            to={m.pages[0].routePath}
            title={look.iconOnly ? m.title : undefined}
            className={`${BASE} ${look.className}`}
            style={look.style}
            aria-current={isActive ? 'true' : undefined}
          >
            <Logo tone={look.logo.tone} ring={look.logo.ring} glow={look.logo.glow} title={m.title} moduleId={m.id} />
            <span className={look.iconOnly ? 'sr-only' : ''} style={look.nameStyle}>
              {m.title}
            </span>
            {look.decoration}
          </Link>
        );
      })}
    </nav>
  );
}
