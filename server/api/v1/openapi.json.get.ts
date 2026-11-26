import { z } from 'zod'
import { endpoints } from '../../v1/registry'

/** OpenAPI 3.1 for `/api/v1`, generated from the registry and the handlers' own zod schemas. No sign-in needed. */
const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })

function document(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of endpoints) {
    const parameters: unknown[] = Object.entries(e.params ?? {}).map(([name, type]) => ({ name, in: 'path', required: true, schema: { type } }))
    if (e.query) {
      const schema = jsonSchema(e.query) as { properties?: Record<string, { description?: string }>; required?: string[] }
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        parameters.push({ name, in: 'query', required: schema.required?.includes(name) ?? false, schema: property, description: property.description })
      }
    }
    const security = e.scope ? [{ token: [e.scope] }] : [{ token: [] }]
    paths[`/api/v1${e.path}`] ??= {}
    paths[`/api/v1${e.path}`]![e.method.toLowerCase()] = {
      operationId: `${e.method.toLowerCase()}${e.path.replace(/\{(\w+)\}/g, 'By_$1').replace(/[^a-z0-9]+(.)?/gi, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
      tags: [e.tag],
      summary: e.summary,
      description: [e.description, e.scope ? `Scope: \`${e.scope}\`.` : 'Any token.'].filter(Boolean).join('\n\n'),
      parameters: parameters.length ? parameters : undefined,
      requestBody: e.body
        ? {
            required: true,
            content: {
              'application/json': { schema: jsonSchema(e.body) },
              ...(/comments|messages|^\/tickets$/.test(e.path) ? { 'multipart/form-data': { schema: { type: 'object', description: 'The same fields as form fields, plus `files`.' } } } : {}),
            },
          }
        : undefined,
      security,
      responses: {
        200: { description: 'OK' },
        400: { $ref: '#/components/responses/Error' },
        401: { $ref: '#/components/responses/Error' },
        403: { $ref: '#/components/responses/Error' },
        404: { $ref: '#/components/responses/Error' },
        429: { $ref: '#/components/responses/Error' },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ticketer API',
      version: '1',
      description:
        'Personal access tokens act as the person who made them, limited to their scopes and their role. Create one under Account → Access tokens. Send `Idempotency-Key` with JSON POSTs to retry safely.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: { token: { type: 'http', scheme: 'bearer', description: 'A personal access token, `tkp_…`' } },
      responses: {
        Error: {
          description: 'An error. `message` says what went wrong and how to fix it; `data.code` is stable.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { statusCode: { type: 'integer' }, message: { type: 'string' }, data: { type: 'object', properties: { code: { type: 'string' } } } },
              },
            },
          },
        },
      },
    },
    paths,
  }
}

export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'public, max-age=300')
  setHeader(event, 'access-control-allow-origin', '*')
  return document(getRequestURL(event).origin)
})
