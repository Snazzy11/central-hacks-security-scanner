import { ActionIcon, Button, Group, Loader, Paper, Progress, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { Dropzone, type FileRejection, MIME_TYPES } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconFile, IconFileUpload, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { downloadFile, fetchBatch, MAX_FILES, MAX_TOTAL_SIZE, uploadFiles } from './api';
import type { DetectionMode, OutputMode, UploadedFile } from './types';

const ACCEPTED_TYPES = [MIME_TYPES.pdf, MIME_TYPES.docx, 'text/plain', 'text/markdown'];

const MAX_TOTAL_MB = MAX_TOTAL_SIZE / 1024 ** 2;

const DETECTION_HELP: Record<DetectionMode, string> = {
  script: 'Fast, rule-based detection of PII patterns.',
  ai: 'Runs script mode, then adds an AI check on top to catch PII the rules miss.',
};

const OUTPUT_HELP: Record<OutputMode, string> = {
  redact: 'Redacts all PII in the document.',
  replace: 'Swaps PII for consistent fake data, so the same real value always gets the same fake one.',
};

const formatSize = (bytes: number) =>
  bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const warn = (message: string) => notifications.show({ color: 'red', title: 'Cannot add files', message });

export function RedactionPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('script');
  const [outputMode, setOutputMode] = useState<OutputMode>('redact');

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const upload = useMutation({
    mutationFn: uploadFiles,
    onSuccess: () => setFiles([]),
    onError: err => notifications.show({ color: 'red', title: 'Upload failed', message: err.message }),
  });

  // Files are redacted in the background, so poll the batch until none are still processing.
  const batchId = upload.data?.batch_id;
  const { data: batch } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatch(batchId!),
    enabled: !!batchId,
    refetchInterval: query => (query.state.data?.files.some(f => f.status === 'processing') ? 1500 : false),
  });

  const download = (file: UploadedFile) =>
    downloadFile(file).catch((err: Error) => notifications.show({ color: 'red', title: 'Download failed', message: err.message }));

  const addFiles = (dropped: File[]) => {
    // Skip anything already selected (same name, size and modified time)
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
    warn(`Unsupported file: ${rejections.map(r => r.file.name).join(', ')}. Use PDF, DOCX, TXT or MD.`);

  const atLimit = files.length >= MAX_FILES || totalSize >= MAX_TOTAL_SIZE;
  const usedPercent = Math.min(100, (totalSize / MAX_TOTAL_SIZE) * 100);

  return (
    <Stack gap="lg" py="xl">
      <Stack gap={4}>
        <Title order={2}>Redact your files</Title>
        <Text c="dimmed">Upload documents and we will find and redact sensitive information.</Text>
      </Stack>

      <Dropzone
        onDrop={addFiles}
        onReject={onReject}
        accept={ACCEPTED_TYPES}
        loading={upload.isPending}
        radius="lg"
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
            {`PDF, DOCX, TXT or MD · up to ${MAX_FILES} files · ${MAX_TOTAL_MB} MB total`}
          </Text>
        </Stack>
      </Dropzone>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb={6}>
          <Text size="sm" fw={500}>{`${files.length} of ${MAX_FILES} files`}</Text>
          <Text size="sm" c={atLimit ? 'red' : 'dimmed'}>
            {`${formatSize(totalSize)} of ${MAX_TOTAL_MB} MB`}
          </Text>
        </Group>
        <Progress value={usedPercent} color={usedPercent >= 90 ? 'red' : undefined} size="sm" />
      </Paper>

      <Paper withBorder p="md" radius="md">
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
            <Paper key={`${f.name}-${f.size}-${f.lastModified}`} withBorder px="md" py="xs" radius="md">
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

      {batch && (
        <Stack gap="xs">
          <Title order={4}>Results</Title>
          {batch.files.map(f => (
            <Paper key={f.id} withBorder px="md" py="xs" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" truncate>{f.original_filename}</Text>
                {f.status === 'processing' && <Loader size="xs" />}
                {f.status === 'failed' && <Text size="sm" c="red">Failed</Text>}
                {f.status === 'completed' && (
                  <Button size="xs" leftSection={<IconDownload size={14} />} onClick={() => void download(f)}>
                    Download
                  </Button>
                )}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
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
