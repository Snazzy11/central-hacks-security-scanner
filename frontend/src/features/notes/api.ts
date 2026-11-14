import { api } from '@/lib/api';

import type { Note, NoteCreate } from './types';

export const fetchMyNotes = () => api<Note[]>('/notes');
export const fetchPublicNotes = () => api<Note[]>('/notes/public');
export const createNote = (note: NoteCreate) => api<Note>('/notes', { method: 'POST', json: note });
export const deleteNote = (id: number) => api<void>(`/notes/${id}`, { method: 'DELETE' });
