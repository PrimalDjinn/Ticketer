/** The project's GitHub repository link and options, or null. */
export default defineEventHandler(async (event) => {
  await requireInternal(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const project = await loadProject(key)
  const [link, config] = await Promise.all([projectGithubLink(project.id), githubConfig(event, { decrypt: false })])
  return {
    available: !config.problem,
    link: link
      ? {
          repoId: link.repoId,
          installationId: link.installationId,
          repoFullName: link.repoFullName,
          url: `${config.webUrl}/${link.repoFullName}`,
          createIssues: link.createIssues,
          importIssues: link.importIssues,
          commentsFromGithub: link.commentsFromGithub,
          commentsToGithub: link.commentsToGithub,
          linkedTasks: await linkedTaskCount(project.id),
        }
      : null,
  }
})
