import { Title } from '@mantine/core';
import { Link } from 'react-router';

export const APP_NAME = 'PiiShooter';

/** App name as clickable text that links to the home page. */
export function Brand() {
  return (
    <Title /* TODO: Change out for logo */ order={3}>
      <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>{APP_NAME}</Link>
    </Title>
  );
}
