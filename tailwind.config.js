/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
      './pages/**/*.{js,jsx}',
      './components/**/*.{js,jsx}',
      './app/**/*.{js,jsx}',
      './src/**/*.{js,jsx}',
    ],
    prefix: "",
    theme: {
      container: {
        center: true,
        padding: '2rem',
        screens: {
          '2xl': '1400px'
        }
      },
      extend: {
        colors: {
          border: '#E7E8F0', input: '#DFE2EB', ring: '#8B5CF6',
          background: '#F6F7FB', foreground: '#202438',
          primary: { DEFAULT: '#7C3AED', foreground: '#FFFFFF' },
          secondary: { DEFAULT: '#F0EBFF', foreground: '#6D28D9' },
          destructive: { DEFAULT: '#DC3545', foreground: '#FFFFFF' },
          muted: { DEFAULT: '#F0F2F7', foreground: '#73798B' },
          accent: { DEFAULT: '#F0EBFF', foreground: '#6D28D9' },
          popover: { DEFAULT: '#FFFFFF', foreground: '#202438' },
          card: { DEFAULT: '#FFFFFF', foreground: '#202438' },
          chart: { '1': '#EDE9FE', '2': '#DBEAFE', '3': '#D1FAE5', '4': '#FEF3C7', '5': '#FCE7F3' },
          sidebar: { DEFAULT: '#FFFFFF', foreground: '#202438', primary: '#7C3AED', 'primary-foreground': '#FFFFFF', accent: '#F0EBFF', 'accent-foreground': '#6D28D9', border: '#E7E8F0', ring: '#8B5CF6' },
        },
        boxShadow: { soft: '0 3px 16px rgba(24, 30, 65, 0.045)' },
        fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
        borderRadius: { lg: '14px', md: '10px', sm: '7px' },
        keyframes: {
          'accordion-down': {
            from: {
              height: '0'
            },
            to: {
              height: 'var(--radix-accordion-content-height)'
            }
          },
          'accordion-up': {
            from: {
              height: 'var(--radix-accordion-content-height)'
            },
            to: {
              height: '0'
            }
          }
        },
        animation: {
          'accordion-down': 'accordion-down 0.2s ease-out',
          'accordion-up': 'accordion-up 0.2s ease-out'
        }
      }
    },
    plugins: [require("tailwindcss-animate")],
  }