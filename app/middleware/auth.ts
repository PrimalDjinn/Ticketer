/** Pages behind this need a registered account; guests are sent to sign in (and keep their history once they do). */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user } = useUserSession()
  if (!loggedIn.value || user.value?.isGuest) {
    return navigateTo({ path: '/auth/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined })
  }
})
