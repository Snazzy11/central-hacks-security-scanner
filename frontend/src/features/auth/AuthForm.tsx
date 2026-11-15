import { Anchor, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';

import { useAuth } from './useAuth';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { user, login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/redact" replace />;

  const isLogin = mode === 'login';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await (isLogin ? login : register)(email, password);
    }
    catch (err) {
      notifications.show({
        color: 'red',
        title: isLogin ? 'Could not log in' : 'Could not sign up',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <Container size={420} my={80}>
      <Title ta="center">{isLogin ? 'Log in' : 'Sign up'}</Title>
      <Paper withBorder p="xl" mt="lg">
        <form onSubmit={submit}>
          <Stack>
            <TextInput
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              required
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              description={isLogin ? undefined : 'At least 8 characters'}
              value={password}
              onChange={e => setPassword(e.currentTarget.value)}
            />
            <Button type="submit" loading={busy}>{isLogin ? 'Log in' : 'Sign up'}</Button>
            <Text size="sm" ta="center">
              {isLogin ? 'No account? ' : 'Already registered? '}
              <Anchor component={Link} to={isLogin ? '/signup' : '/login'}>
                {isLogin ? 'Sign up' : 'Log in'}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
