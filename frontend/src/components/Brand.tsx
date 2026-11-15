import { Image, useComputedColorScheme } from '@mantine/core';
import { Link } from 'react-router';

import lightLogo from '../logo/piishooter logo v5 vers light.png';
import darkLogo from '../logo/piishooter logo v5 vers.png';

// useComputedColorScheme, since useMantineColorScheme can return "auto"
export function Brand({ height = 40 }: { height?: number }) {
  const scheme = useComputedColorScheme('light');
  return (
    <Link to="/" style={{ display: 'flex' }} aria-label="PiiShooter home">
      <Image src={scheme === 'light' ? lightLogo : darkLogo} h={height} w="auto" alt="PiiShooter" />
    </Link>
  );
}
