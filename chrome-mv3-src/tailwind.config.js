/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: '#F7F7F7',
        card: '#FFFFFF',
        ink: '#111111',
        sub: '#666666',
        weak: '#999999',
        line: '#E5E5E5',
        btnhov: '#2B2B2B',
        disabled: '#D4D4D4',
        fill: '#F2F2F2',
        dpage: '#0F0F0F',
        dcard: '#1A1A1A',
        dink: '#F5F5F5',
        dsub: '#A6A6A6',
        dweak: '#7F7F7F',
        dline: '#2A2A2A',
        dfill: '#242424'
      },
      fontFamily: {
        rounded: [
          'Quicksand', 'Nunito', 'Resource Han Rounded CN', 'Yuanti SC',
          'PingFang SC', 'Microsoft YaHei UI', 'system-ui', 'sans-serif'
        ]
      },
      borderRadius: {
        card: '16px',
        ctl: '12px',
        sm2: '10px'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
        pop: '0 8px 24px rgba(0,0,0,0.08)'
      },
      fontSize: {
        body: ['14px', '1.65'],
        small: ['12px', '1.5'],
        title: ['16px', '1.4']
      }
    }
  },
  plugins: []
};
