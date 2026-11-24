import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Ticketer',
  description: 'Help desk, public issue tracker and project tracker. Runs on Cloudflare Workers or Docker.',
  base: '/Ticketer/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/Ticketer/favicon.ico' }]],
  themeConfig: {
    nav: [
      { text: 'Get started', link: '/guide/overview' },
      { text: 'Administer', link: '/admin/first-admin' },
      { text: 'Use', link: '/use/tickets' },
      { text: 'Integrate', link: '/integrate/' },
      { text: 'Reference', link: '/reference/environment-variables' },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Overview', link: '/guide/overview' },
          { text: 'Deploy to Cloudflare', link: '/guide/deploy-cloudflare' },
          { text: 'Run with Docker', link: '/guide/docker' },
          { text: 'Local development', link: '/guide/local-development' },
        ],
      },
      {
        text: 'Administer',
        items: [
          { text: 'Create the first admin', link: '/admin/first-admin' },
          { text: 'Invite people and manage roles', link: '/admin/invite-people' },
          { text: 'Control who can sign up', link: '/admin/sign-up' },
          { text: 'Set up email', link: '/admin/email' },
          { text: 'Set up single sign-on', link: '/admin/single-sign-on' },
          { text: 'Set up single sign-on with Authentik', link: '/admin/sso-authentik' },
          { text: 'Delete accounts and personal data', link: '/admin/delete-accounts' },
          { text: 'Connect an app', link: '/admin/integrations' },
        ],
      },
      {
        text: 'Use Ticketer',
        items: [
          { text: 'Work with tickets', link: '/use/tickets' },
          { text: 'Publish an issue', link: '/use/public-issues' },
          { text: 'Answer support chats', link: '/use/support-inbox' },
          { text: 'Plan work in projects', link: '/use/projects' },
        ],
      },
      {
        text: 'Integrate your app',
        items: [
          { text: 'Choose an integration flow', link: '/integrate/' },
          { text: 'Create a login link', link: '/integrate/login-link' },
          { text: 'Redirect with an API key', link: '/integrate/redirect' },
          { text: 'Create signed launch links', link: '/integrate/signed-links' },
          { text: 'Create prefill links', link: '/integrate/prefill-links' },
          { text: "Look up a person's tickets", link: '/integrate/tickets' },
          { text: 'Delete a person', link: '/integrate/delete-people' },
          { text: 'Security model', link: '/integrate/security' },
          { text: 'Handle integration errors', link: '/integrate/errors' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Environment variables', link: '/reference/environment-variables' },
          { text: 'Roles and permissions', link: '/reference/roles' },
          { text: 'Integration API', link: '/reference/integration-api' },
          { text: 'Command-line tool', link: '/reference/cli' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/PrimalDjinn/Ticketer' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/PrimalDjinn/Ticketer/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the Apache License 2.0.',
    },
  },
})
