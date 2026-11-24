/** Reply time and public status for the public home, the issues page and the chat widget (shared, fetched once). */
export function usePublicOverview(options: { server?: boolean } = {}) {
  return useFetch<PublicOverview>('/api/public/overview', {
    key: 'public-overview',
    server: options.server ?? true,
    default: () => ({ reply: { minutes: null, sample: 0, text: null }, status: { open: 0, urgent: false, latest: [] } }),
  })
}
