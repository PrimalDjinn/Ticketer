/** Creates tasks for the repository's open issues that aren't linked yet (100 per call; call again while `more`). */
export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const project = await loadProject(key)
  const link = await projectGithubLink(project.id)
  if (!link) throw createError({ status: 400, message: 'Link a repository first' })
  return importOpenIssues(event, link, user.name)
})
