import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createNote, deleteNote, fetchMyNotes, fetchPublicNotes } from './api';

// Both lists share the 'notes' prefix so one invalidate refreshes everything.
export const useMyNotes = () => useQuery({ queryKey: ['notes', 'mine'], queryFn: fetchMyNotes });
export const usePublicNotes = () => useQuery({ queryKey: ['notes', 'public'], queryFn: fetchPublicNotes });

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}
