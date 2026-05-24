export const colors = {
  bg: {
    page: '#1C1E21',
    card: '#26282C',
    placeholder: '#2F3236',
  },
  accent: '#FF7E40',
  text: {
    primary: '#F5F3EE',
    secondary: '#8E949E',
    hint: '#6E6A63',
  },
  divider: 'rgba(255,255,255,0.08)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const fontSize = {
  titleLg: 19,
  title: 16,
  body: 14,
  sub: 13,
  hint: 12,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
} as const;
