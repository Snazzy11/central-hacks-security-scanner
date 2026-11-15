import { ActionIcon, Button, Container, Group, Paper, Progress, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { Dropzone, type FileRejection } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { IconFile, IconFileUpload, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { fetchCapabilities, MAX_FILES, MAX_TOTAL_SIZE, uploadFiles } from './api';
import type { DetectionMode, OutputMode } from './types';

const MAX_TOTAL_MB = MAX_TOTAL_SIZE / 1024 ** 2;

const DETECTION_HELP: Record<DetectionMode, string> = {
  script: 'Fast, scripted detection of PII.',
  ai: 'Run script mode, then an AI layer to catch significantly more PII. Takes much longer.',
};

const OUTPUT_HELP: Record<OutputMode, string> = {
  redact: 'Redacts PII in the document.',
  replace: 'Swaps out PII for fake data. Designed to be consistent for each person, phone number, etc.',
};

const formatSize = (bytes: number) =>
  bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const warn = (message: string) => notifications.show({ color: 'red', title: 'Cannot add files', message });

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();
const describeTypes = (fileTypes: string[]) => fileTypes.map(type => type.slice(1).toUpperCase()).join(', ');

export function RedactionPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('script');
  const [outputMode, setOutputMode] = useState<OutputMode>('redact');

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // The file types come from the backend, so this page never offers one the server would refuse.
  const { data: capabilities } = useQuery({ queryKey: ['redact', 'capabilities'], queryFn: fetchCapabilities, staleTime: Infinity });
  const fileTypes = capabilities?.file_types ?? [];
  const typeList = describeTypes(fileTypes);

  // Checking the extension ourselves, rather than through `accept`: `accept` lets in anything
  // with a matching MIME type, so 'text/plain' would also let in .py or .c files.
  const validateType = (file: File) =>
    fileTypes.includes(extensionOf(file.name))
      ? null
      : { code: 'file-invalid-type', message: `Unsupported file type: ${file.name}` };

  const navigate = useNavigate();
  const upload = useMutation({
    mutationFn: uploadFiles,
    onSuccess: batch => navigate(`/results/${batch.batch_id}`),
    onError: err => notifications.show({ color: 'red', title: 'Upload failed', message: err.message }),
  });

  const addFiles = (dropped: File[]) => {
    // skip files already added
    const isNew = (f: File) => !files.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified);
    const fresh = dropped.filter(isNew);

    if (files.length + fresh.length > MAX_FILES) {
      return warn(`You can upload at most ${MAX_FILES} files at once.`);
    }
    if (totalSize + fresh.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_SIZE) {
      return warn(`Total size of all files cannot exceed ${MAX_TOTAL_MB} MB.`);
    }
    setFiles([...files, ...fresh]);
  };

  const onReject = (rejections: FileRejection[]) =>
    warn(`Unsupported file: ${rejections.map(r => r.file.name).join(', ')}. Supported types: ${typeList}.`);

  const atLimit = files.length >= MAX_FILES || totalSize >= MAX_TOTAL_SIZE;
  const usedPercent = Math.min(100, (totalSize / MAX_TOTAL_SIZE) * 100);

  return (
    <Container size="sm">
      <Stack gap="sm" py="xl">
        <Title order={2}>Redact your files</Title>
        <Dropzone
          onDrop={addFiles}
          onReject={onReject}
          validator={validateType}
          inputProps={{ accept: fileTypes.join(',') }}
          loading={upload.isPending || !capabilities}
          p="xl"
          styles={fileInputStyle}
        >
          <Stack align="center" justify="center" gap="xs" mih={200} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={48} stroke={1.5} color="var(--mantine-primary-color-filled)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={48} stroke={1.5} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFileUpload size={48} stroke={1.5} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>
            <Text size="lg" fw={600}>Drag files here or click to browse</Text>
            <Text size="sm" c="dimmed" ta="center">
              {typeList}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {`Up to ${MAX_FILES} files · ${MAX_TOTAL_MB} MB total`}
            </Text>
          </Stack>
        </Dropzone>

        <Paper withBorder p="md">
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={500}>{`${files.length} of ${MAX_FILES} files`}</Text>
            <Text size="sm" c={atLimit ? 'red' : 'dimmed'}>
              {`${formatSize(totalSize)} of ${MAX_TOTAL_MB} MB`}
            </Text>
          </Group>
          <Progress value={usedPercent} color={usedPercent >= 90 ? 'red' : undefined} size="sm" />
        </Paper>

        <Paper withBorder p="md">
          <Stack gap="md">
            <Stack gap={6}>
              <Text size="sm" fw={500}>Detection</Text>
              <SegmentedControl
                fullWidth
                value={detectionMode}
                onChange={v => setDetectionMode(v)}
                disabled={upload.isPending}
                data={[{ label: 'Script mode', value: 'script' }, { label: 'AI mode', value: 'ai' }]}
              />
              <Text size="xs" c="dimmed">{DETECTION_HELP[detectionMode]}</Text>
            </Stack>
            <Stack gap={6}>
              <Text size="sm" fw={500}>Output</Text>
              <SegmentedControl
                fullWidth
                value={outputMode}
                onChange={v => setOutputMode(v)}
                disabled={upload.isPending}
                data={[{ label: 'Redact mode', value: 'redact' }, { label: 'Replace mode', value: 'replace' }]}
              />
              <Text size="xs" c="dimmed">{OUTPUT_HELP[outputMode]}</Text>
            </Stack>
          </Stack>
        </Paper>

        {files.length > 0 && (
          <Stack gap="xs">
            {files.map((f, i) => (
              <Paper key={`${f.name}-${f.size}-${f.lastModified}`} withBorder px="md" py="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" miw={0}>
                    <IconFile size={20} color="var(--mantine-color-dimmed)" />
                    <Text size="sm" truncate>{f.name}</Text>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed">{formatSize(f.size)}</Text>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Remove ${f.name}`}
                      disabled={upload.isPending}
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        <Group justify="flex-end">
          <Button variant="default" disabled={files.length === 0 || upload.isPending} onClick={() => setFiles([])}>
            Clear
          </Button>
          <Button disabled={files.length === 0} loading={upload.isPending} onClick={() => upload.mutate({ files, detectionMode, outputMode })}>
            {files.length > 0 ? `Upload ${files.length} file${files.length === 1 ? '' : 's'}` : 'Upload'}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

const fileInputStyle = {
  root: {
    border: '2px dashed var(--mantine-color-default-border)',
    backgroundColor: 'var(--mantine-color-body)',
    transition: 'border-color 150ms ease, background-color 150ms ease',
    cursor: 'pointer',
  },
};
