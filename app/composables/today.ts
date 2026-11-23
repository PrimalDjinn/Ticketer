/**
 * Today's calendar day (`YYYY-MM-DD`), hydration-safe: the server's value travels in the payload so the client
 * hydrates with the same markup, then switches to the viewer's own local day once mounted.
 */
export function useToday() {
  const today = useState('today', () => localToday())
  onMounted(() => {
    today.value = localToday()
  })
  return today
}
