import { Title } from '@mantine/core';
import svg from '../logo/piishooter logo v4.svg';
// import { Link } from 'react-router';

// export const APP_NAME = 'PiiShooter';

/** App name as clickable text that links to the home page. */
export function Brand() {
  return (
    <Title>
      <img src={svg} width={250}></img>
    </Title>
  );
}
