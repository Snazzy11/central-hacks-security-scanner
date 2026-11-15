import { Image, useComputedColorScheme } from '@mantine/core';
import { Link } from 'react-router';

import lightLogo from '../logo/piishooter logo v5 vers light.png';
import darkLogo from '../logo/piishooter logo v5 vers.png';

/**
 * The logo, linking to the home page. Sized by height so it fits whatever bar it sits in.
 * useComputedColorScheme (not useMantineColorScheme) so "auto" resolves to the real light/dark.
 */
export function Brand({ height = 40 }: { height?: number }) {
  const scheme = useComputedColorScheme('light');
  return (
    <Link to="/" style={{ display: 'flex' }} aria-label="PiiShooter home">
      <Image src={scheme === 'light' ? lightLogo : darkLogo} h={height} w="auto" alt="PiiShooter" />
    </Link>
  );
}
