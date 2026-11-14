import { Anchor, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type FormEvent, useState } from 'react';
import { Navigate } from 'react-router';

import { useAuth } from './useAuth';

/** One page for both logging in and signing up. */
export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await (mode === 'login' ? login : register)(email, password);
    }
    catch (err) {
      notifications.show({
        color: 'red',
        title: 'Something went wrong',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <Container size={420} my={80}>
      <Title ta="center">{mode === 'login' ? 'Welcome back' : 'Create account'}</Title>
      <Paper withBorder shadow="sm" p="xl" mt="xl">
        <form onSubmit={submit}>
          <Stack>
            <TextInput
              label="Email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              required
              description={mode === 'register' ? 'At least 8 characters' : undefined}
              value={password}
              onChange={e => setPassword(e.currentTarget.value)}
            />
            <Button type="submit" loading={busy}>
              {mode === 'login' ? 'Log in' : 'Sign up'}
            </Button>
            <Text size="sm" ta="center">
              {mode === 'login' ? 'No account? ' : 'Already registered? '}
              <Anchor component="button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
