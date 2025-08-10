import { createLightTheme, createDarkTheme, type BrandVariants } from '@fluentui/react-components';

// Lightweight global CSS to ensure form fields don't overlap and spacing is consistent
export const globalCss = `
  .form-grid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-full { grid-column: 1 / -1; }
  .fui-Field { margin-bottom: 12px; }
`;

const poolDrvBrand: BrandVariants = {
  10: '#020202',
  20: '#111111',
  30: '#1A1A1A',
  40: '#242424',
  50: '#2E2E2E',
  60: '#383838',
  70: '#434343',
  80: '#4E4E4E',
  90: '#5A5A5A',
  100: '#666666',
  110: '#737373',
  120: '#808080',
  130: '#8D8D8D',
  140: '#9B9B9B',
  150: '#A8A8A8',
  160: '#B6B6B6',
};

export const lightTheme = createLightTheme(poolDrvBrand);
export const darkTheme = createDarkTheme(poolDrvBrand);
