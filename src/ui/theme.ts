export const colors = {
  court: '#E8732C',
  courtDark: '#B9551A',
  ink: '#1B1B1F',
  inkMuted: '#5D5E66',
  surface: '#FFFFFF',
  background: '#F6F3EE',
  border: '#E2DDD5',
  success: '#1E8E4F',
  danger: '#C6372F',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Training controls are used one-handed on a court: keep them huge. */
export const touch = { trainingButtonMinHeight: 88, buttonMinHeight: 56 } as const;
