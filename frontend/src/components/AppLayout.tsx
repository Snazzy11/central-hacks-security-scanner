import { AppShell, Button, Container, Group, Text, Title } from '@mantine/core';
import { Outlet } from 'react-router';

import { useAuth } from '@/features/auth/useAuth';

import { ColorSchemeToggle } from './ColorSchemeToggle';

/** Header + page area for logged-in pages. Child routes render where <Outlet /> is. */
export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>Hackathon App</Title>
          <Group>
            <Text size="sm" c="dimmed">{user?.first_name} {user?.last_name}</Text>
            <ColorSchemeToggle />
            <Button variant="light" onClick={logout}>Log out</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="sm">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
