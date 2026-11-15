import { AppShell, Button, Group, Text } from '@mantine/core';
import { IconHome } from '@tabler/icons-react';
import { Link, Outlet } from 'react-router';

import { useAuth } from '@/features/auth/useAuth';

import { Brand } from './Brand';
import { ColorSchemeToggle } from './ColorSchemeToggle';

/** Header + page area for logged-in pages. Child routes render where <Outlet /> is. */
export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <AppShell header={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Brand />
            <Button component={Link} to="/" variant="default" leftSection={<IconHome size={16} />}>
              Home
            </Button>
            <Button component={Link} to="/redact">Redact My Files</Button>
          </Group>
          <Group>
            <Text size="sm" c="dimmed">{user?.email}</Text>
            <ColorSchemeToggle />
            <Button variant="light" onClick={logout}>Log out</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
