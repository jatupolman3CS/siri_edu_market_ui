/**
 * Light / dark colour tokens — the single source of truth for both themes.
 *
 * Every themeable colour is a CSS variable holding space-separated RGB channels (`--ink-rgb: 42 27 34`),
 * wired into Tailwind as `rgb(var(--ink-rgb) / <alpha-value>)` so `text-ink/60`, `bg-brand-50/40`, `from-surface`
 * … keep working. The `themeTokensPlugin` below emits the variables:
 *   :root                       light values (default)
 *   :root[data-theme="dark"]    dark values   (set by core/services/theme.service.ts)
 *   .tokens-light               light values again — put it on a subtree that must stay "light-on-dark"
 *                               whatever the page theme is (admin chrome, auth aside, seller CTA)
 *   @media print                dark pages still print with the light values
 * Each context also re-declares the colour aliases (`--ink`, `--brand-50`, `--pink-50`, …) because a custom
 * property that contains var() is resolved where it is declared, not where it is used.
 *
 * Dark mapping rules (so unthemed Tailwind families behave without touching templates):
 *   · neutrals (slate/gray/zinc/neutral/stone): the scale is mirrored (50↔950, 100↔900 …)
 *   · colour families (red/amber/emerald/…): 50–300 become dark tints of the 500 shade, 600–950 mirror
 *     to the lighter shades so `text-emerald-700` stays readable on a dark surface
 *   · brand: explicit table below
 * Families not listed (teal, cyan, green, lime, fuchsia, pink, zinc…) stay on Tailwind's static light values.
 */
const colors = require('tailwindcss/colors');
const plugin = require('tailwindcss/plugin');

const toRgb = (hex) => hex.replace('#', '').match(/.{2}/g).map((h) => parseInt(h, 16));
const channels = (hex) => toRgb(hex).join(' ');
const mix = (fg, bg, t) => fg.map((v, i) => Math.round(v * t + bg[i] * (1 - t)));

/** Dark card surface — the base the coloured tints are blended into. */
const DARK_SURFACE = [15, 23, 42];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const MIRROR = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };
// Neutral TEXT shades 400/500 are the muted tiers: mirrored they would be 2.3:1 / 3.7:1 on the dark surface, so they
// both land on the light 400 (≥ 6:1) and 600+ step up from there.
const MIRROR_NEUTRAL = { ...MIRROR, 400: 400, 500: 400, 600: 300, 700: 200, 800: 100, 900: 50, 950: 50 };
const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const COLOR_FAMILIES = ['red', 'orange', 'amber', 'yellow', 'emerald', 'sky', 'blue', 'indigo', 'violet', 'purple', 'rose'];
const TINT = { 50: 0.1, 100: 0.16, 200: 0.26, 300: 0.4 };

const BRAND_LIGHT = {
  50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6',
  500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843',
};
// 50–300 are pink blended into the dark slate surface at 8 / 13 / 21 / 34 % — a faint violet-pink tint, never a plum slab.
const BRAND_DARK = {
  50: '#211b33', 100: '#2c1d38', 200: '#3d2141', 300: '#5a2850', 400: '#f472b6',
  500: '#ec4899', 600: '#f472b6', 700: '#f9a8d4', 800: '#fbcfe8', 900: '#fce7f3',
};

const SEMANTIC_LIGHT = {
  ink: '#0f172a', 'ink-soft': '#475569', 'ink-muted': '#5f6f86',
  line: '#e2e8f0', 'line-strong': '#8692a6',
  surface: '#ffffff', canvas: '#f8fafc', cream: '#f1f5f9',
};
const SEMANTIC_DARK = {
  ink: '#f8fafc', 'ink-soft': '#cbd5e1', 'ink-muted': '#94a3b8',
  line: '#1e293b', 'line-strong': '#64748b',
  surface: '#0f172a', canvas: '#050b14', cream: '#0a1120',
};

function build(mode) {
  const dark = mode === 'dark';
  const out = {};
  const semantic = dark ? SEMANTIC_DARK : SEMANTIC_LIGHT;
  for (const [name, hex] of Object.entries(semantic)) out[name] = channels(hex);
  const brand = dark ? BRAND_DARK : BRAND_LIGHT;
  for (const [shade, hex] of Object.entries(brand)) out[`brand-${shade}`] = channels(hex);
  for (const fam of NEUTRALS) {
    for (const s of SHADES) out[`${fam}-${s}`] = channels(colors[fam][dark ? MIRROR_NEUTRAL[s] : s]);
  }
  for (const fam of COLOR_FAMILIES) {
    for (const s of SHADES) {
      if (!dark || s === 400 || s === 500) {
        out[`${fam}-${s}`] = channels(colors[fam][s]);
      } else if (TINT[s]) {
        out[`${fam}-${s}`] = mix(toRgb(colors[fam][500]), DARK_SURFACE, TINT[s]).join(' ');
      } else {
        out[`${fam}-${s}`] = channels(colors[fam][MIRROR[s]]);
      }
    }
  }
  return out;
}

const LIGHT = build('light');
const DARK = build('dark');

/** `--x-rgb` channel variables + the colour aliases scss/component styles read (`var(--ink)`, `var(--pink-300)`). */
function toVars(set) {
  const vars = {};
  for (const [name, value] of Object.entries(set)) vars[`--${name}-rgb`] = value;
  for (const name of Object.keys(SEMANTIC_LIGHT)) vars[`--${name}`] = `rgb(var(--${name}-rgb))`;
  for (const shade of Object.keys(BRAND_LIGHT)) {
    vars[`--brand-${shade}`] = `rgb(var(--brand-${shade}-rgb))`;
    // Legacy alias — ~96 component stylesheets still read var(--pink-N). 50–700 only, as before.
    if (Number(shade) <= 700) vars[`--pink-${shade}`] = `rgb(var(--brand-${shade}-rgb))`;
  }
  return vars;
}

const themeTokensPlugin = plugin(({ addBase }) => {
  addBase({
    ':root': { 'color-scheme': 'light', ...toVars(LIGHT) },
    ':root[data-theme="dark"]': { 'color-scheme': 'dark', ...toVars(DARK) },
    '.tokens-light': { 'color-scheme': 'light', ...toVars(LIGHT) },
    '@media print': { ':root[data-theme="dark"]': { 'color-scheme': 'light', ...toVars(LIGHT) } },
  });
});

const v = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

/**
 * `bg-solid-rose-600`, `from-solid-emerald-700` … — Tailwind's static default shades (500–950), for FILLS that carry white text.
 * The themed scale mirrors 600+ to lighter shades in dark mode (right for text), which would wash such a fill out.
 */
function solidColors() {
  const out = {};
  for (const fam of [...NEUTRALS, ...COLOR_FAMILIES]) {
    out[fam] = Object.fromEntries(SHADES.filter((s) => s >= 500).map((s) => [s, colors[fam][s]]));
  }
  return out;
}

/** Tailwind `theme.extend.colors` entries — every value is a themed CSS variable. */
function themedColors() {
  const out = {
    ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted') },
    line: { DEFAULT: v('line') },
    'line-strong': v('line-strong'),
    surface: v('surface'),
    canvas: v('canvas'),
    cream: v('cream'),
    brand: Object.fromEntries(Object.keys(BRAND_LIGHT).map((s) => [s, v(`brand-${s}`)])),
    solid: solidColors(),
  };

  for (const fam of [...NEUTRALS, ...COLOR_FAMILIES]) {
    out[fam] = Object.fromEntries(SHADES.map((s) => [s, v(`${fam}-${s}`)]));
  }
  return out;
}

module.exports = { themeTokensPlugin, themedColors };
