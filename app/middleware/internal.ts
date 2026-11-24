/** Team-only pages (projects, tasks, the support inbox). People outside the team go to their home page. */
export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession()
  if (!isInternal(user.value)) return navigateTo('/')
})
