/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.vue',
    './src/**/*.ts',
    './src/**/*.js',
    './src/**/*.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
      },
      colors: {
        // Primary brand color from Figma
        brand: {
          50: '#F0F4F9',
          100: '#E4EAF1',
          500: '#6644FF',
          900: '#18222F',
        },
        // Neutral colors from Figma
        neutral: {
          50: '#F0F4F9',
          100: '#E4EAF1',
          200: '#D3DAE4', 
          300: '#CBD5E1',
          400: '#A2B5CD',
          500: '#94A3B8',
          600: '#8196B1',
          700: '#4F5464',
          800: '#344054',
          900: '#172940',
        },
        // Status colors
        success: {
          500: '#17B26A',
        },
        // Text colors from Figma
        text: {
          primary: '#172940',
          secondary: '#344054', 
          tertiary: '#475467',
          muted: '#A0AFBF',
          placeholder: '#94A3B8',
        }
      },
      fontSize: {
        'xs': ['10px', { lineHeight: '1.5em' }],
        'sm': ['12px', { lineHeight: '1.21em' }],
        'base': ['14px', { lineHeight: '1.21em' }],
        'lg': ['16px', { lineHeight: '1.5em' }],
        'xl': ['24px', { lineHeight: '1.21em' }],
      },
      spacing: {
        '1.5': '6px',
        '2.5': '10px',
        '4.5': '18px',
        '15': '60px',
        '18': '72px',
      },
      borderRadius: {
        'md': '6px',
        'lg': '8px',
      },
      boxShadow: {
        'border': 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [],
}