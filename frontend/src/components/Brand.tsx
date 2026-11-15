import { Title, useMantineColorScheme } from '@mantine/core';
import darkLogo from '../logo/piishooter logo v5 vers.png';
import lightLogo from '../logo/piishooter logo v5 vers light.png';
import { Link } from 'react-router';
/** App name as clickable text that links to the home page. */
export function Brand() {
  const { colorScheme } = useMantineColorScheme();
  return (
    <Title>
      <Link to="/">
        {colorScheme === 'light' ? <img src={lightLogo} width={250}></img> : <img src={darkLogo} width={250}></img>}
      </Link>
    </Title>
  );
}
