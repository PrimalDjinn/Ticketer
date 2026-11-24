/**
 * The same as `POST /api/integrations/v1/sessions`, as a GET with query parameters (snake_case, `context[key]=…`),
 * answering `302` to the login link: for apps whose backend only proxies a redirect. Key in a header, never the URL.
 */
export default defineEventHandler(async (event) => {
  const app = await requireIntegrationApp(event)
  const input = await getValidatedQuery(event, (query) => sessionInputShape.parse(sessionInputFromQuery(flatQueryShape.parse(query))))
  const result = await startIntegrationSession(event, app, input)
  setResponseHeader(event, 'cache-control', 'no-store')
  return sendRedirect(event, result.url, 302)
})
