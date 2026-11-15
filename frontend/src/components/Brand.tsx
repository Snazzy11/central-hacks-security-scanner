import { Title } from '@mantine/core';
import logo from '../logo/piishooter logo v5 vers.png';
// import { Link } from 'react-router';
// export const APP_NAME = 'PiiShooter';

/** App name as clickable text that links to the home page. */
export function Brand() {
  return (
    <Title>
      <img src={logo} width={250}></img>
    </Title>
  );
}
