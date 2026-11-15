import {
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconBrandChrome,
  IconCurrencyDollarOff,
  IconDatabaseOff,
  IconDownload,
  IconEyeOff,
  IconFileUpload,
  IconScan,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'react-router';

import { Brand } from '@/components/Brand';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { useAuth } from '@/features/auth/useAuth';

const STEPS = [
  {
    icon: IconFileUpload,
    title: '1. Upload',
    text: 'Drop files into the web app, or let our browser extension catch a file you are about to upload to another site.',
  },
  {
    icon: IconScan,
    title: '2. We keep your sensitive data from being leaked',
    text: 'Names, emails, phone numbers, addresses, IDs and more are detected. Optionally, an AI check runs on top to catch what the rules miss.',
  },
  {
    icon: IconDownload,
    title: '3. Get it back',
    text: 'You get your file back with the sensitive details redacted or swapped for realistic fake ones, ready to share.',
  },
];

const MODES = [
  { title: 'Script mode', text: 'Fast, rule-based detection of personal information patterns.' },
  { title: 'AI mode', text: 'Runs script mode, then adds an AI check layer on top to catch personal information the rules miss.' },
  { title: 'Redact mode', text: 'Removes all personal information from your document.' },
  { title: 'Replace mode', text: 'Swaps personal information for consistent fake data, so the same real value always becomes the same fake one.' },
];

const PROMISES = [
  { icon: IconDatabaseOff, text: 'We never keep your data. Files are processed and returned to you, not stored.' },
  { icon: IconEyeOff, text: 'We never use your files to train any model, ours or anyone else\'s.' },
  { icon: IconCurrencyDollarOff, text: 'We never sell or share your data with anyone, ever.' },
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <Box>
      <Container size="md" py="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Brand />
          </Group>
          <Group>
            <ColorSchemeToggle />
            {user
              ? <Button component={Link} to="/redact">Open app</Button>
              : (
                  <>
                    <Button component={Link} to="/login" variant="default">Log in</Button>
                    <Button component={Link} to="/signup">Sign up</Button>
                  </>
                )}
          </Group>
        </Group>
      </Container>

      <Container size="md">
        <Stack align="center" gap="lg" py={80} ta="center">
          <Title order={1} fz={{ base: 36, sm: 52 }} lh={1.1}>
            Share your files, not your personal data
          </Title>
          <Text size="lg" c="dimmed" maw={600}>
            Upload a document and get it back with names, emails, IDs and other sensitive details redacted or
            replaced with realistic fake data. Safe to share, safe to feed to other tools.
          </Text>
          <Group>
            <Button
              component={Link}
              to="/extension"
              size="lg"
              leftSection={<IconBrandChrome size={20} />}
            >
              Add to browser
            </Button>
            <Button component={Link} to={user ? '/redact' : '/signup'} size="lg" variant="default">
              {user ? 'Open the web app' : 'Use the web app'}
            </Button>
          </Group>
        </Stack>

        <Stack gap="md" pb={60}>
          <Title order={2} ta="center">How it works</Title>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            {STEPS.map(({ icon: Icon, title, text }) => (
              <Paper key={title} withBorder p="lg" radius="md">
                <ThemeIcon size={44} radius="md" variant="light" mb="sm">
                  <Icon size={24} />
                </ThemeIcon>
                <Text fw={600} mb={4}>{title}</Text>
                <Text size="sm" c="dimmed">{text}</Text>
              </Paper>
            ))}
          </SimpleGrid>
          <Text ta="center" c="dimmed" mt="xs">
            With the extension installed, it catches file uploads on the sites you use, offers to send the file
            through our service, and swaps in the cleaned version when it is ready.
          </Text>
        </Stack>

        <Stack gap="md" pb={60}>
          <Title order={2} ta="center">Choose how it works for you</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {MODES.map(({ title, text }) => (
              <Paper key={title} withBorder p="md" radius="md">
                <Text fw={600}>{title}</Text>
                <Text size="sm" c="dimmed">{text}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Paper id="privacy" withBorder p="xl" radius="lg" mb={60}>
          <Group gap="xs" mb="xs">
            <ThemeIcon variant="light" size="lg" radius="md"><IconTrash size={20} /></ThemeIcon>
            <Title order={2}>Privacy</Title>
          </Group>
          <Text c="dimmed" mb="md">
            Your documents are the whole point of this app, so protecting them comes first.
          </Text>
          <Stack gap="sm">
            {PROMISES.map(({ icon: Icon, text }) => (
              <Group key={text} gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" radius="xl" size="md"><Icon size={16} /></ThemeIcon>
                <Text>{text}</Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      </Container>

      <Container size="md" py="xl">
        <Text ta="center" size="sm" c="dimmed">
          <Anchor component={Link} to="/login" c="dimmed">Log in</Anchor>
          {' · '}
          <Anchor href="#privacy" c="dimmed">Privacy</Anchor>
        </Text>
      </Container>
    </Box>
  );
}
