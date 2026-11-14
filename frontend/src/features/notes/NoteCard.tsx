import { ActionIcon, Badge, Card, Group, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';

import type { Note } from './types';

interface Props {
  note: Note;
  /** Omit to hide the delete button (e.g. in the public feed). */
  onDelete?: () => void;
}

export function NoteCard({ note, onDelete }: Props) {
  return (
    <Card withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600}>{note.title}</Text>
        <Group gap="xs" wrap="nowrap">
          {note.is_public && <Badge variant="light">public</Badge>}
          {onDelete && (
            <ActionIcon variant="subtle" color="red" aria-label="Delete note" onClick={onDelete}>
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
      {note.body && <Text size="sm" c="dimmed" mt="xs">{note.body}</Text>}
    </Card>
  );
}
