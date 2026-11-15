/**
 * Host half of the "delete session" bundle.
 *
 * Exposes one authenticated Fetch route under the connection channel; the
 * Client half calls it after the user confirms the dialog. Deleting a
 * session means: refuse while its Agent runs, detach it from every
 * Workspace account together with its archived/pinned marks, remove its
 * Session directory (log, lease, session-local artifacts), then drop its
 * derived projection cache. The Workspace registry is authoritative for list
 * membership, so the row leaves the sidebar as soon as its record is detached.
 *
 * @module @local/session-delete
 */
import { rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** The connection service owns browser authentication and Fetch routing. */
export const inject = ['connection']

/** One safe path segment / log-addressable Session id. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

/** @param {unknown} value @param {number} [status] */
function reply(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read one buffered JSON body without trusting its shape.
 * @param {Request} request
 * @returns {Promise<Record<string, unknown> | undefined>}
 */
async function readPayload(request) {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Drop every Workspace-side trace of one Session: list membership, the archive
 * mark, and the pin mark. Each step is independent so one stale record cannot
 * block the rest.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @returns {Promise<Error | undefined>}
 */
async function detachFromWorkspaces(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return undefined
  try {
    for (const workspace of registry.list()) {
      if (!workspace.sessionIds.includes(sessionId)) continue
      await workspace.detachSession(sessionId)
    }
    await registry.unarchiveSession(sessionId)
    await registry.unpinSession(sessionId)
    return undefined
  } catch (error) {
    return error instanceof Error ? error : new Error(describe(error))
  }
}

/**
 * Delete one session.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Request} request
 */
async function deleteSession(ctx, request) {
  const payload = await readPayload(request)
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
  if (!SESSION_ID.test(sessionId)) return reply({ ok: false, code: 'invalid' }, 400)

  try {
    const agent = ctx.get('agents')?.get(sessionId)
    if (agent?.status === 'running') return reply({ ok: false, code: 'running' }, 409)
  } catch {
    /* A missing Agent registry cannot report activity; deletion proceeds. */
  }

  const persistence = ctx.get('sessionPersistence')
  let snapshot
  try {
    snapshot = persistence === undefined ? undefined : await persistence.stat(sessionId)
  } catch (error) {
    return reply({ ok: false, code: 'failed', message: describe(error) }, 500)
  }

  const location = snapshot?.location
  const logPath = location !== undefined && location.kind === 'jsonl' ? location.path : undefined
  const sessionDir = logPath === undefined ? undefined : dirname(logPath)

  // A Session log lives at `<root>/<project>/<encoded id>/session.<v>.jsonl`.
  // Refuse anything else: a changed on-disk layout must never turn this route
  // into a recursive delete of a shared directory.
  if (sessionDir !== undefined && basename(sessionDir) !== sessionId) {
    return reply({ ok: false, code: 'layout' }, 500)
  }

  const detachError = await detachFromWorkspaces(ctx, sessionId)
  if (detachError !== undefined) {
    return reply({ ok: false, code: 'failed', message: describe(detachError) }, 500)
  }

  if (sessionDir !== undefined) {
    try {
      await rm(sessionDir, { recursive: true, force: true })
    } catch (error) {
      return reply({ ok: false, code: 'failed', message: describe(error) }, 500)
    }
    if (logPath !== undefined) {
      try {
        const home = dirname(dirname(dirname(sessionDir)))
        await rm(join(home, 'storages', 'session_projcache', 'sessions', `${basename(sessionDir)}.json`), {
          force: true,
        })
      } catch {
        /* Derived data: a stale row costs one cold replay, never correctness. */
      }
    }
  }

  try {
    ctx.emit('api-session/removed', sessionId)
  } catch {
    /* Connected Client catalogs reconcile on their next catalog read. */
  }
  return reply({ ok: true })
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: '/api/session-delete',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => deleteSession(ctx, request),
      }),
    'session-delete: fetch route',
  )
}
