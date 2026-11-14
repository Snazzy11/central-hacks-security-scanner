import { Alert, Box, Button, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { IconAlertCircle, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';

import { uploadRedactionFile } from './api';

const maxFileSize = 50 * 1024 ** 2; // 50 MB
const maxFileSizeText = '50 MB';

const supportedFileTypes = [MIME_TYPES.pdf, MIME_TYPES.docx, 'text/plain', 'text/markdown'];
const supportedFileTypesText = '.pdf, .docx, .txt, and .md';

export function RedactionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const result = await uploadRedactionFile(file);

      console.log('Upload successful:', result);

      // Next step: start your redaction process.
    }
    catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed',
      );
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Box>
        <Stack>
          <Stack>
            <Title>Redact Your File</Title>
            <Dropzone
              onDrop={(files) => {
                setFile(files[0] ?? null);
                setError(null);
              }}
              onReject={() => setError('Invalid file. Please select a supported file.')}
              accept={supportedFileTypes}
              maxSize={maxFileSize}
              maxFiles={1}
              multiple={false}
              radius="xl"
              p={40}
              styles={fileInputStyle}
            >
              <Stack align="center" justify="center" gap="lg" mih={235}>
                <ThemeIcon
                  size={76}
                  radius="xl"
                  color="blue"
                  variant="light"
                >
                  <IconUpload size={36} stroke={1.5} />
                </ThemeIcon>

                <Stack align="center" gap={6}>
                  <Text fw={700} size="xl">{file ? file.name : 'Select a PDF file'}</Text>
                  <Text c="dimmed" size="sm" ta="center">Drag and drop your file here, or click to browse</Text>
                  <Text c="dimmed" size="xs">
                    Supported file types:
                    {' '}
                    {supportedFileTypesText}
                  </Text>
                  <Text c="dimmed" size="xs">
                    Maximum size
                    {' '}
                    {maxFileSizeText}
                  </Text>
                </Stack>
                <Button
                  size="lg"
                  radius="xl"
                  leftSection={<IconUpload size={18} />}
                  style={{ pointerEvents: 'none' }}
                >
                  Browse files
                </Button>
              </Stack>
            </Dropzone>
            {file && (
              <Group justify="space-between">
                <Text size="sm">{file.name}</Text>

                <Button
                  variant="subtle"
                  color="red"
                  onClick={() => setFile(null)}
                >
                  Remove
                </Button>
              </Group>
            )}

            {error && (
              <Alert
                color="red"
                icon={<IconAlertCircle />}
              >
                {error}
              </Alert>
            )}

            <Button
              disabled={!file || loading}
              loading={loading}
              onClick={handleUpload}
            >
              Upload and Continue
            </Button>
          </Stack>
        </Stack>
      </Box>
    </>
  );
}

const fileInputStyle = {
  root: {
    minHeight: 320,
    border: '2px dashed var(--mantine-color-gray-4)',
    backgroundColor: 'var(--mantine-color-body)',
    transition: 'border-color 150ms ease, background-color 150ms ease',
    cursor: 'pointer',
  },
};
