import { ActionIcon, Box, Button, Code, Container, CopyButton, Group, Paper, Stack, Text, Timeline, Title, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconDownload } from '@tabler/icons-react';
import { Link } from 'react-router';

import { Brand } from '@/components/Brand';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { useAuth } from '@/features/auth/useAuth';

// FastAPI zips the extension/ folder on request
export const EXTENSION_DOWNLOAD_URL = '/api/extension/download';
const EXTENSIONS_PAGE = 'chrome://extensions';

// Pages can't link to chrome:// URLs, so copy it instead
function CopyChromeUrl() {
  return (
    <Group gap={4} display="inline-flex" wrap="nowrap">
      <Code>{EXTENSIONS_PAGE}</Code>
      <CopyButton value={EXTENSIONS_PAGE} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
            <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} size="sm" onClick={copy} aria-label="Copy address">
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export function ExtensionPage() {
  const { user } = useAuth();

  return (
    <Box>
      <Container size="md" py="md">
        <Group justify="space-between">
          <Brand height={73} />
          <Group>
            <ColorSchemeToggle />
            <Button component={Link} to={user ? '/redact' : '/signup'} variant="default">
              {user ? 'Open app' : 'Use the web app'}
            </Button>
          </Group>
        </Group>
      </Container>

      <Container size="sm" py="xl">
        <Stack gap="xl">
          <Stack gap="xs">
            <Title order={1}>Install the browser extension</Title>
            <Text c="dimmed">
              It checks files and pasted text before a website gets them, and lets you redact PII first. It all runs
              in your browser. It's not on the Chrome Web Store yet, so you load it through developer mode. Takes
              about a minute.
            </Text>
          </Stack>

          <Paper withBorder p="lg">
            <Group justify="space-between" wrap="wrap" gap="md">
              <div>
                <Text fw={600}>piishooter-extension.zip</Text>
                <Text size="sm" c="dimmed">Chrome, Edge, Brave or any other Chromium browser</Text>
              </div>
              <Button
                component="a"
                href={EXTENSION_DOWNLOAD_URL}
                download="piishooter-extension.zip"
                size="md"
                leftSection={<IconDownload size={18} />}
              >
                Download extension
              </Button>
            </Group>
          </Paper>

          <Timeline active={-1} bulletSize={26} lineWidth={2}>
            <Timeline.Item bullet={1} title="Unzip the download">
              <Text size="sm" c="dimmed" mt={4}>
                Open <Code>piishooter-extension.zip</Code> and extract it. You'll get a folder called{' '}
                <Code>piishooter-extension</Code> with a <Code>manifest.json</Code> file inside. Put it somewhere
                you won't delete it, because Chrome loads the extension from this folder every time it starts.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={2} title="Open the extensions page">
              <Text size="sm" c="dimmed" mt={4} component="div">
                Paste <CopyChromeUrl /> into the address bar and press Enter. You can also go to{' '}
                <b>⋮ menu → Extensions → Manage Extensions</b>. In Edge the address is <Code>edge://extensions</Code>.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={3} title="Turn on Developer mode">
              <Text size="sm" c="dimmed" mt={4}>
                Turn on the <b>Developer mode</b> switch in the top-right corner of the page. A new toolbar appears
                with <b>Load unpacked</b>, <b>Pack extension</b> and <b>Update</b>.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={4} title="Load the unpacked folder">
              <Text size="sm" c="dimmed" mt={4}>
                Click <b>Load unpacked</b> and select the <Code>piishooter-extension</Code> folder, the one that
                contains <Code>manifest.json</Code>. Don't select the .zip or a folder above it. The extension now
                shows up in your list as <b>PiiShooter</b>.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={5} title="Pin it and sign in">
              <Text size="sm" c="dimmed" mt={4}>
                Click the puzzle-piece icon in the toolbar and pin <b>PiiShooter</b>. Open it and click{' '}
                <b>Log in</b> to sign in with your PiiShooter account. If you're already logged in on this site, the
                extension picks that up on its own, and logging out of either one logs out both.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={6} title="Try it out">
              <Text size="sm" c="dimmed" mt={4}>
                Upload a text or Office file, or paste an email address or phone number into any site. It shows
                what it found and lets you redact it first. From the extension's menu you can make it redact
                automatically, pick what to look for, or turn it off for certain sites.
              </Text>
            </Timeline.Item>
          </Timeline>
        </Stack>
      </Container>
    </Box>
  );
}
