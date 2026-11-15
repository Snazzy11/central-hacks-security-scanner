import { createTheme } from '@mantine/core';

/**
 * Look and feel lives here. Mantine turns this object into CSS variables
 * (--mantine-color-lime-6, --mantine-radius-md, ...) and every component reads
 * from them, so changing a value restyles the whole app. You rarely need to write CSS.
 *
 * Quick wins:
 *  - primaryColor: any built-in palette: 'blue' | 'indigo' | 'violet' | 'grape' | 'pink' |
 *    'red' | 'orange' | 'yellow' | 'lime' | 'green' | 'teal' | 'cyan' | 'gray' ...
 *  - Custom brand colour: generate 10 shades at https://mantine.dev/colors-generator,
 *    add them under `colors: { brand: [...] }`, then set primaryColor: 'brand'.
 *  - Light/dark: the toggle in the header handles it; the default follows the OS.
 *
 * Per-component styling: use style props (<Text c="dimmed" mt="md" fw={600} />).
 * For anything custom, add a Foo.module.css next to the component and use Mantine
 * variables in it, e.g. `background: var(--mantine-color-body)`.
 */
export const theme = createTheme({
  primaryColor: 'lime',
  primaryShade: 6, // lime.6 in both light and dark mode
  autoContrast: true, // lime is light, so filled buttons get dark text instead of white
  defaultRadius: 'md',
  // Loaded in index.html. Headings need it too: Mantine gives them their own default font.
  fontFamily: 'Barlow, sans-serif',
  headings: { fontFamily: 'Barlow, sans-serif', fontWeight: '700' },
});
