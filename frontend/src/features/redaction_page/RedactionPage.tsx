import { ActionIcon, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { Dropzone, type FileRejection, MIME_TYPES } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { IconFile, IconFileUpload, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { MAX_FILES, MAX_TOTAL_SIZE, uploadFiles } from './api';

const ACCEPTED_TYPES = [MIME_TYPES.pdf, MIME_TYPES.docx, 'text/plain', 'text/markdown'];

const MAX_TOTAL_MB = MAX_TOTAL_SIZE / 1024 ** 2;

const formatSize = (bytes: number) =>
  bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const warn = (message: string) => notifications.show({ color: 'red', title: 'Cannot add files', message });

export function RedactionPage() {
  const [files, setFiles] = useState<File[]>([]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const upload = useMutation({
    mutationFn: uploadFiles,
    onSuccess: (data) => {
      notifications.show({ color: 'green', message: `Uploaded ${data.count} file${data.count === 1 ? '' : 's'}` });
      setFiles([]);
    },
    onError: err => notifications.show({ color: 'red', title: 'Upload failed', message: err.message }),
  });

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
            <IconUpload size={48} stroke={1.5} color="var(--mantine-color-indigo-6)" />
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
        <Progress value={usedPercent} color={usedPercent >= 90 ? 'red' : 'indigo'} size="sm" />
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
        <Button disabled={files.length === 0} loading={upload.isPending} onClick={() => upload.mutate(files)}>
          {files.length > 0 ? `Upload ${files.length} file${files.length === 1 ? '' : 's'}` : 'Upload'}
        </Button>
      </Group>
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
