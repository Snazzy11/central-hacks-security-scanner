import { Loader, Stack, Tabs, Text } from '@mantine/core';

import { useDeleteNote, useMyNotes, usePublicNotes } from './hooks';
import { NoteCard } from './NoteCard';
import { NoteForm } from './NoteForm';
import type { Note } from './types';

export function NotesPage() {
  const mine = useMyNotes();
  const everyone = usePublicNotes();
  const remove = useDeleteNote();

  return (
    <Tabs defaultValue="mine">
      <Tabs.List mb="md">
        <Tabs.Tab value="mine">My notes</Tabs.Tab>
        <Tabs.Tab value="public">Public feed</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="mine">
        <Stack>
          <NoteForm />
          <NoteList
            notes={mine.data}
            loading={mine.isLoading}
            onDelete={note => remove.mutate(note.id)}
          />
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="public">
        <NoteList notes={everyone.data} loading={everyone.isLoading} />
      </Tabs.Panel>
    </Tabs>
  );
}

interface NoteListProps {
  notes: Note[] | undefined;
  loading: boolean;
  onDelete?: (note: Note) => void;
}

function NoteList({ notes, loading, onDelete }: NoteListProps) {
  if (loading) return <Loader />;
  if (!notes?.length) return <Text c="dimmed">Nothing here yet.</Text>;

  return (
    <Stack>
      {notes.map(note => (
        <NoteCard key={note.id} note={note} onDelete={onDelete && (() => onDelete(note))} />
      ))}
    </Stack>
  );
}
