import { Button, Paper, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { type FormEvent, useState } from 'react';

import { useCreateNote } from './hooks';

export function NoteForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const create = useCreateNote();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { title, body, is_public: isPublic },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
        },
      },
    );
  };

  return (
    <Paper withBorder p="md">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Title" required value={title} onChange={e => setTitle(e.currentTarget.value)} />
          <Textarea label="Body" autosize minRows={2} value={body} onChange={e => setBody(e.currentTarget.value)} />
          <Switch label="Make public" checked={isPublic} onChange={e => setIsPublic(e.currentTarget.checked)} />
          <Button type="submit" loading={create.isPending}>Add note</Button>
        </Stack>
      </form>
    </Paper>
  );
}
