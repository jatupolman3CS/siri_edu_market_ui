const { themeTokensPlugin, themedColors } = require('./tailwind.theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    // Responsive tiers (responsive-ui.md §1): phone <744, tablet 744–1023, laptop 1024–1279, desktop ≥1280.
    // Replaces Tailwind's defaults on purpose (NOT in extend) — md is 744 (iPad mini portrait), not 768.
    screens: { sm: '640px', md: '744px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    extend: {
      colors: {
        // Filled buttons/badges with white text (WCAG AA — brand-500 + white is only 3.5:1; brand-600 = 4.6:1).
        // Same pink in light and dark — a filled button keeps its white label in both themes.
        primary: { DEFAULT: '#db2777', hover: '#be185d' },
        // Fixed dark ink for fills that must NOT flip with the theme (image badges, scrims). `ink` itself is a
        // text colour that turns light in dark mode.
        'ink-deep': '#2a1b22',
        // Admin chrome base — stays dark plum in both themes (brand-900 itself turns light in dark mode).
        'brand-deep': '#831843',
        // Premium Cyber-Pink Glassmorphism, light + dark: ink / line / surface / canvas / cream / brand and the
        // slate-gray-neutral-stone + red-amber-emerald-… families are CSS-variable colours (tailwind.theme.js).
        ...themedColors(),
      },
      fontFamily: {
        sans: ['Prompt', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xs': '0.5rem',
        'sm': '0.75rem',
        'md': '1rem',
        'lg': '1.25rem',
        'xl': '1.5rem',
        '2xl': '2rem',
        '3xl': 'var(--radius-card)', // signature radius — 24px phone / 32px ≥744 / 40px ≥1280 (styles.scss)
        '4xl': '3rem',
      },
      boxShadow: {
        'soft':  '0 4px 16px -4px rgba(236, 72, 153, 0.12)',
        'pop':   '0 10px 30px -8px rgba(236, 72, 153, 0.20)',
        'float': '0 20px 60px -20px rgba(219, 39, 119, 0.28)',
        // Glassmorphism: soft pink drop shadow + 1px inner white highlight on the top edge.
        'glass': 'var(--glass-shadow)',
        // Cyber-pink neon accent (focus rings / hero CTAs).
        'glow':  '0 0 0 1px rgba(236, 72, 153, 0.35), 0 0 24px rgba(236, 72, 153, 0.35)',
      },
      backgroundImage: {
        'gradient-pink': 'linear-gradient(135deg, rgb(var(--brand-50-rgb)) 0%, rgb(var(--brand-200-rgb)) 100%)',
        // Only used behind white text (home seller CTA, auth-layout aside). primary → primary-hover
        // so white text stays ≥ 4.6:1 at the lightest stop (brand-500 #ec4899 is only 3.5:1 — never put white text on it).
        'gradient-pink-strong': 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)',
        'gradient-cream': 'linear-gradient(180deg, rgb(var(--cream-rgb)) 0%, rgb(var(--brand-50-rgb)) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  // Every `hover:` utility is emitted inside @media (hover: hover) so touch devices never get sticky hover.
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [themeTokensPlugin],
  corePlugins: {
    preflight: true,
  },
};
