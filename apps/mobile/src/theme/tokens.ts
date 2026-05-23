export const colors = {
  bg: {
    page: '#FDFCF8',
    card: '#FFFFFF',
    placeholder: '#F2EFE7',
  },
  accent: '#C8841E',
  text: {
    primary: '#2C2A24',
    secondary: '#7C7560',
    hint: '#B8B09A',
  },
  divider: '#EFECE3',
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
