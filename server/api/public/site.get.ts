/** Branding and the bot-protection widget, for every page (loaded once per visit by app/plugins/site.ts). */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-cache')
  return siteInfo(event)
})
