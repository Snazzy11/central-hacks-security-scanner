import { notifications } from '@mantine/notifications';
import { MutationCache, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
  // One place for "a save failed" toasts so features don't each repeat it
  mutationCache: new MutationCache({
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Something went wrong', message: error.message });
    },
  }),
});
