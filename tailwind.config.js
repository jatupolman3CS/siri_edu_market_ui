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
        // Filled buttons/badges with white text (WCAG AA contrast — pink-500 + white fails).
        primary: { DEFAULT: '#B83864', hover: '#8A2C4D' },
        // Input/select/textarea borders.
        'line-strong': '#A07F90',
        // Minimal Light Pink palette
        pink: {
          50:  '#FFF7FA',
          100: '#FFEAF1',
          200: '#FFD6E4',
          300: '#FFB8CE',
          400: '#FF8AAF',
          500: '#F2638E',
          600: '#D94B78',
          700: '#B83864',
          800: '#8A2C4D',
          900: '#5C1D33',
        },
        cream: '#FFFBF7',
        ink: {
          DEFAULT: '#2A1B22',
          soft: '#5A4751',
          muted: '#76646D',
        },
        line: '#F3E6EC',
        surface: '#FFFFFF',
        canvas: '#FFF7FA',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
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
        'soft':  '0 4px 16px -4px rgba(242, 99, 142, 0.10)',
        'pop':   '0 10px 30px -8px rgba(242, 99, 142, 0.18)',
        'float': '0 20px 60px -20px rgba(242, 99, 142, 0.25)',
      },
      backgroundImage: {
        'gradient-pink': 'linear-gradient(135deg, #FFF7FA 0%, #FFE2EC 100%)',
        // Only used behind white text (home seller CTA, auth-layout aside). primary → primary-hover
        // so white text stays ≥ 5.5:1 at the lightest stop (the old #FFB8CE → #F2638E was ≈ 1.6–3:1).
        'gradient-pink-strong': 'linear-gradient(135deg, #B83864 0%, #8A2C4D 100%)',
        'gradient-cream': 'linear-gradient(180deg, #FFFBF7 0%, #FFF7FA 100%)',
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
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};
