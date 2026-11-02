import { QueryClient } from '@tanstack/react-query'

// one shared client for the whole app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // data counts as fresh for 30 seconds, so going back and forth between pages does not spam the API
      staleTime: 30_000,
      // keep unused data in memory for 5 minutes
      gcTime: 5 * 60_000,
      // retry once, and never retry a rejected request (4xx)
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})