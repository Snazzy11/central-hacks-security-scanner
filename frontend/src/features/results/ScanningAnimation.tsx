import { Group, Paper, Text } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { useState } from 'react';

import classes from './Results.module.css';

const LINE_WIDTHS = ['70%', '100%', '90%', '95%', '60%', '100%', '85%', '45%'];

/** A little page with a line sweeping over it, plus how long it's been going. */
export function ScanningAnimation({ fileCount, done }: { fileCount: number; done: number }) {
  const [seconds, setSeconds] = useState(0);
  useInterval(() => setSeconds(s => s + 1), 1000, { autoInvoke: true });

  return (
    <Paper withBorder p="lg">
      <Group gap="lg" wrap="nowrap">
        <div className={classes.scanner} aria-hidden>
          {LINE_WIDTHS.map((width, i) => <div key={i} className={classes.docLine} style={{ width }} />)}
          <div className={classes.laser} />
        </div>
        <div>
          <Text fw={600} role="status">
            {fileCount > 1 ? 'Analyzing files' : 'Analyzing file.'}
          </Text>
          <Text size="sm" c="dimmed">Bigger files or more files will take longer, as well as AI mode.</Text>
        </div>
      </Group>
    </Paper>
  );
}
