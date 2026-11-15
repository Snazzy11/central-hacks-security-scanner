import { Anchor, Box, Button, Container, Group, List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

import { Brand } from '@/components/Brand';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { useAuth } from '@/features/auth/useAuth';

// "statements" about the code
const STEPS = [
  'Upload files to PiiShooter, or download the extension to let it catch file uploads.',
  'PiiShooter scans it for more than 10 types of personally identifiable information.',
  'Choose between script mode and AI mode. Script mode is fast, AI mode is more complete but slower. Both run fully local.',
  'Download your file with data either redacted or swapped out for fake data.',
];

const MODES = [
  { title: 'Script mode', text: 'Very fast, scripted detection of PII.' },
  { title: 'AI mode', text: 'Script mode plus an AI layer. Over 99.99% detection rate, but slow.' },
  { title: 'Redact mode', text: 'Simply blacks out the PII.' },
  { title: 'Replace mode', text: 'Swaps PII for fake data. The same person or number always gets the same fake data.' },
  // { title: 'Script mode', text: 'Rapid, radical, regex reader to remove really ruinous data if exposed to the internet.' },
  // { title: 'AI mode', text: 'Use a magic math machine to miraculously monitor most media modalities for a more mature defensive posture.' },
  // { title: 'Redact mode', text: 'Removes all personal information from your document.' },
  // { title: 'Replace mode', text: 'Swaps personal information for consistent fake data, so the same real value always becomes the same fake one.' },
];

const PROMISES = [
  'Your original file is deleted as soon as it has been redacted.',
  'We don\'t train any models on your files.',
  'We don\'t sell or share any of your data.',
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <Box>
      <Container size="md" py="md">
        <Group justify="space-between">
          <Brand height={73} />
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
            Get the personal info out of your files before you share them
          </Title>
          <Text size="lg" c="dimmed" maw={600}>
            Upload a PDF, Word doc or text file. We find names, emails, phone numbers, SSNs and the like, and either
            black them out or swap in fake ones.
          </Text>
          <Group>
            <Button component={Link} to="/extension" size="lg">Get the extension</Button>
            <Button component={Link} to={user ? '/redact' : '/signup'} size="lg" variant="default">
              {user ? 'Open the web app' : 'Use the web app'}
            </Button>
          </Group>
        </Stack>

        <Stack gap="md" pb={60}>
          <Title order={2}>How it works</Title>
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="xl">
            {STEPS.map((text, i) => (
              <div key={text}>
                <Text fz={32} fw={700} c="lime.7" lh={1}>{i + 1}</Text>
                <Text mt="xs">{text}</Text>
              </div>
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap="md" pb={60}>
          <Title order={2}>Modes</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {MODES.map(({ title, text }) => (
              <Paper key={title} withBorder p="md">
                <Text fw={600}>{title}</Text>
                <Text size="sm" c="dimmed">{text}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Stack id="privacy" gap="sm" pb={60}>
          <Title order={2}>Privacy</Title>
          <List spacing="xs">
            {PROMISES.map(text => <List.Item key={text}>{text}</List.Item>)}
          </List>
        </Stack>
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
