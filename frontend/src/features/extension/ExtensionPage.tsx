import {
  ActionIcon,
  Box,
  Button,
  Code,
  Container,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconBrandChrome,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileZip,
  IconFolderOpen,
  IconPin,
  IconPuzzle,
  IconShieldCheck,
  IconToggleRight,
} from '@tabler/icons-react';
import { Link } from 'react-router';

import { Brand } from '@/components/Brand';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { useAuth } from '@/features/auth/useAuth';

// Served by FastAPI, which zips the repo's extension/ folder on request.
export const EXTENSION_DOWNLOAD_URL = '/api/extension/download';
const EXTENSIONS_PAGE = 'chrome://extensions';

/** Web pages can't link to chrome:// URLs, so offer to copy it instead. */
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
            <Group gap="xs">
              <IconBrandChrome size={28} color="var(--mantine-primary-color-filled)" />
              <Title order={1}>Install the browser extension</Title>
            </Group>
            <Text c="dimmed">
              The extension checks files and pasted text before a website receives them and lets you redact
              personal information first. Everything runs locally in your browser. It isn't in the Chrome Web Store yet, so you add it
              through Chrome's developer mode. It takes about a minute.
            </Text>
          </Stack>

          <Paper withBorder radius="md" p="lg">
            <Group justify="space-between" wrap="wrap" gap="md">
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" size="lg" radius="md"><IconFileZip size={20} /></ThemeIcon>
                <div>
                  <Text fw={600}>piishooter-extension.zip</Text>
                  <Text size="sm" c="dimmed">Works in Chrome, Edge, Brave and other Chromium browsers</Text>
                </div>
              </Group>
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

          <Timeline active={-1} bulletSize={32} lineWidth={2}>
            <Timeline.Item bullet={<IconFileZip size={16} />} title="Unzip the download">
              <Text size="sm" c="dimmed" mt={4}>
                Open
                {' '}
                <Code>piishooter-extension.zip</Code>
                {' '}
                and extract it. You'll get a folder called
                {' '}
                <Code>piishooter-extension</Code>
                {' '}
                with a
                {' '}
                <Code>manifest.json</Code>
                {' '}
                file inside. Put it somewhere
                you won't delete it, because Chrome loads the extension from this folder every time it starts.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={<IconPuzzle size={16} />} title="Open the extensions page">
              <Text size="sm" c="dimmed" mt={4} component="div">
                Paste
                {' '}
                <CopyChromeUrl />
                {' '}
                into the address bar and press Enter. You can also go to
                {' '}
                <b>⋮ menu → Extensions → Manage Extensions</b>
                . In Edge the address is
                {' '}
                <Code>edge://extensions</Code>
                .
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={<IconToggleRight size={16} />} title="Turn on Developer mode">
              <Text size="sm" c="dimmed" mt={4}>
                Turn on the
                {' '}
                <b>Developer mode</b>
                {' '}
                switch in the top-right corner of the page. A new toolbar appears
                with
                {' '}
                <b>Load unpacked</b>
                ,
                {' '}
                <b>Pack extension</b>
                {' '}
                and
                {' '}
                <b>Update</b>
                .
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={<IconFolderOpen size={16} />} title="Load the unpacked folder">
              <Text size="sm" c="dimmed" mt={4}>
                Click
                {' '}
                <b>Load unpacked</b>
                {' '}
                and select the
                {' '}
                <Code>piishooter-extension</Code>
                {' '}
                folder, the one that
                contains
                {' '}
                <Code>manifest.json</Code>
                . Don't select the .zip or a folder above it. The extension now
                shows up in your list as
                {' '}
                <b>PiiShooter</b>
                .
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={<IconPin size={16} />} title="Pin it and sign in">
              <Text size="sm" c="dimmed" mt={4}>
                Click the puzzle-piece icon in the toolbar and pin
                {' '}
                <b>PiiShooter</b>
                . Open it and click
                {' '}
                <b>Log in</b>
                {' '}
                to sign in with your PiiShooter account. If you're already logged in on this site, the extension
                picks that up on its own, and logging out of either one logs out both.
              </Text>
            </Timeline.Item>

            <Timeline.Item bullet={<IconShieldCheck size={16} />} title="Try it out">
              <Text size="sm" c="dimmed" mt={4}>
                Upload a text or Office file, or paste text with an email address or phone number into any
                website. The extension shows what it found and lets you redact it first. In the extension's menu
                you can switch to redacting automatically, choose what to look for, and turn it off for
                specific sites.
              </Text>
            </Timeline.Item>
          </Timeline>
        </Stack>
      </Container>
    </Box>
  );
}
