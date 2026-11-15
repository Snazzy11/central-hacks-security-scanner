import { Alert, Button, Center, Container, Divider, Group, Loader, Paper, RingProgress, RollingNumber, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { downloadFile, fetchBatch } from '@/features/redaction_page/api';
import type { FileSummary, UploadedFile } from '@/features/redaction_page/types';

import { typeLabel } from './piiTypes';
import classes from './Results.module.css';
import { ScanningAnimation } from './ScanningAnimation';

/** Combine every completed file's summary into one view of the whole batch. */
function combine(files: UploadedFile[]): FileSummary | null {
  const summaries = files.flatMap(f => (f.summary ? [f.summary] : []));
  if (summaries.length === 0) return null;
  const byType: Record<string, number> = {};
  for (const s of summaries) {
    for (const [type, n] of Object.entries(s.by_type)) byType[type] = (byType[type] ?? 0) + n;
  }
  const sum = (key: 'total' | 'unique' | 'words_scanned' | 'elapsed_ms') => summaries.reduce((n, s) => n + s[key], 0);
  return {
    total: sum('total'),
    unique: sum('unique'),
    words_scanned: sum('words_scanned'),
    elapsed_ms: sum('elapsed_ms'),
    by_type: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1])),
    message: '',
  };
}

/** Starts false, flips to true shortly after `ready`, so numbers and bars animate up from zero. */
function useRevealed(ready: boolean, ms = 200) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setRevealed(true), ms);
    return () => clearTimeout(id);
  }, [ready, ms]);
  return revealed;
}

export function ResultsPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { data: batch, error } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatch(batchId!),
    enabled: !!batchId,
    refetchInterval: query => (query.state.data?.files.some(f => f.status === 'processing') ? 1000 : false),
  });

  const files = batch?.files ?? [];
  const processing = files.some(f => f.status === 'processing');
  const summary = batch && !processing ? combine(files) : null;
  const revealed = useRevealed(!!summary);

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="Couldn't load these results">{error.message}</Alert>
      </Container>
    );
  }
  if (!batch) return <Center py={120}><Loader /></Center>;

  const failed = files.filter(f => f.status === 'failed');
  const first = files[0];

  return (
    <Container size="md" py="xl" className={classes.page}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>{processing ? 'Scanning…' : 'All done'}</Title>
            <Text c="dimmed" size="sm">
              {files.length === 1 ? first.original_filename : `${files.length} files`}
              {` · ${first.detection_mode === 'ai' ? 'AI' : 'script'} mode · ${first.output_mode === 'replace' ? 'swapped for fake data' : 'redacted'}`}
            </Text>
          </div>
          <Button component={Link} to="/redact" variant="default" leftSection={<IconArrowLeft size={16} />}>
            Redact more
          </Button>
        </Group>

        {failed.length > 0 && (
          <Alert color="red" title={`Couldn't redact ${failed.length === 1 ? 'one file' : `${failed.length} files`}`}>
            {failed.map(f => f.original_filename).join(', ')}
          </Alert>
        )}

        {processing && (
          <ScanningAnimation fileCount={files.length} done={files.filter(f => f.status !== 'processing').length} />
        )}

        {summary && <FindingsCard summary={summary} files={files.length - failed.length} revealed={revealed} />}

        {!processing && <FilesCard files={files} />}
      </Stack>
    </Container>
  );
}

function FindingsCard({ summary, files, revealed }: { summary: FileSummary; files: number; revealed: boolean }) {
  const entries = Object.entries(summary.by_type);
  const max = entries[0]?.[1] ?? 1;
  const where = files === 1 ? 'the file' : `the ${files} uploaded files`;

  if (summary.total === 0) {
    return (
      <Paper withBorder p="xl">
        <Text className={classes.headline}>{`No PII was detected in ${where}.`}</Text>
        <Text c="dimmed" mt={4}>{`Read ${summary.words_scanned.toLocaleString()} words, but all of them were clean.`}</Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="xl">
      <Group justify="space-between" align="center" wrap="nowrap" gap="xl">
        <div>
          <Text className={classes.headline}>
            <RollingNumber
              value={revealed ? summary.total : 0}
              animationDuration={1200}
              thousandSeparator
              className={`${classes.inlineNumber} ${classes.pop}`}
            />
            {` pieces of PII were removed ${where}.`}
          </Text>
          <Text c="dimmed" mt={6}>
            {`${summary.unique.toLocaleString()} different values, ${summary.words_scanned.toLocaleString()} words read, took ${(summary.elapsed_ms / 1000).toFixed(1)}s.`}
          </Text>
        </div>
        <RingProgress
          size={120}
          thickness={10}
          sectionGap={entries.length > 1 ? 3 : 0}
          transitionDuration={1000}
          rootColor="var(--mantine-color-default-border)"
          visibleFrom="xs"
          sections={entries.map(([type, n]) => ({
            value: revealed ? (n / summary.total) * 100 : 0,
            color: 'var(--pop)',
            tooltip: `${n} ${typeLabel(type, n)}`,
          }))}
        />
      </Group>

      <Divider my="lg" />

      <Title order={4} mb="sm">Redaction Summary</Title>
      <div className={classes.found}>
        {entries.map(([type, n], i) => (
          <div key={type} style={{ display: 'contents' }}>
            <Text className={classes.count}>{n.toLocaleString()}</Text>
            <Text>{typeLabel(type, n)}</Text>
            <div
              className={classes.bar}
              style={{ 'transform': `scaleX(${revealed ? n / max : 0})`, '--delay': `${i * 60}ms` } as CSSProperties}
            />
          </div>
        ))}
      </div>
    </Paper>
  );
}

function FilesCard({ files }: { files: UploadedFile[] }) {
  const completed = files.filter(f => f.status === 'completed');
  const download = (file: UploadedFile) =>
    downloadFile(file).catch((err: Error) => notifications.show({ color: 'red', title: 'Download failed', message: err.message }));
  const downloadAll = async () => {
    for (const f of completed) await download(f);
  };

  return (
    <Paper withBorder p="xl">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{completed.length === 1 ? 'Your cleaned-up file' : 'Your cleaned-up files'}</Title>
        {completed.length > 1 && (
          <Button size="xs" leftSection={<IconDownload size={14} />} onClick={() => void downloadAll()}>Download all</Button>
        )}
      </Group>
      <Stack gap="sm">
        {files.map(f => (
          <Group key={f.id} justify="space-between" wrap="nowrap">
            <Text size="sm" truncate>
              {f.original_filename}
              {f.summary && <Text span size="xs" c="dimmed">{`  (${f.summary.total} removed)`}</Text>}
            </Text>
            {f.status === 'failed'
              ? (
                  <Text size="sm" c="red">Failed</Text>
                )
              : (
                  <Button
                    size="xs"
                    variant={completed.length > 1 ? 'default' : 'filled'}
                    leftSection={<IconDownload size={14} />}
                    onClick={() => void download(f)}
                  >
                    Download
                  </Button>
                )}
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
