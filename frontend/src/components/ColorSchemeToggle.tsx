import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  return (
    <ActionIcon
      variant="default"
      aria-label="Toggle color scheme"
      onClick={() => setColorScheme(scheme === 'light' ? 'dark' : 'light')}
    >
      {scheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
    </ActionIcon>
  );
}

export function getColorScheme() {
  return ColorSchemeToggle();
}
