// Tests for the read-only guard mounted inside the `cross-review-internal`
// preset. The guard exists because a preset-level `sandboxPolicy.mode` cannot
// confine the arbiter's shell: the subagent runtime copies the parent's explicit
// `sandbox/mode` onto the child, which outranks the preset default.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply, modeOf, pinReadOnly } from '../internal-guard.js'

/** A session double that folds `sandbox/mode` appends the way the projection does. */
function makeSession(initialMode, options = {}) {
  const events = initialMode === undefined ? [] : [{ type: 'sandbox/mode', data: { mode: initialMode } }]
  return {
    id: 'child-session',
    events,
    append(type, data) {
      if (options.readOnlyLog) throw new Error('session log is read-only')
      if (type !== 'sandbox/mode') throw new Error(`unexpected event ${type}`)
      events.push({ type, data })
      return { type, data }
    },
    lastMode() {
      let mode
      for (const event of events) if (event.type === 'sandbox/mode') mode = event.data.mode
      return mode
    },
  }
}

function makeCtx(session, options = {}) {
  const guards = []
  const policy = {
    resolve: () => ({ mode: session === undefined ? options.defaultMode : (session.lastMode() ?? options.defaultMode) }),
  }
  const ctx = {
    get: (key) => (key === 'sandboxPolicy' ? (options.noPolicy === true ? undefined : policy) : undefined),
    tools: {
      guard: (guard) => {
        guards.push(guard)
        return () => {}
      },
    },
  }
  return { ctx, guards }
}

test('the guard narrows an inherited wide mode before the shell decides', () => {
  // This is the real defect: a `danger-full-access` parent hands its mode to the
  // child, and a preset default cannot override it.
  const session = makeSession('danger-full-access')
  const { ctx, guards } = makeCtx(session)
  apply(ctx)
  assert.equal(guards.length, 1)
  const denial = guards[0]({ name: 'pwsh', agent: { session } })
  assert.equal(denial, undefined, 'the shell is allowed once the session is narrowed')
  assert.equal(session.lastMode(), 'read-only', 'the session was pinned to read-only')
})

test('the guard allows the shell when the session is already read-only', () => {
  const session = makeSession('read-only')
  const { ctx, guards } = makeCtx(session)
  apply(ctx)
  assert.equal(guards[0]({ name: 'pwsh', agent: { session } }), undefined)
  assert.equal(session.events.length, 1, 'no redundant event is appended')
})

test('the guard refuses the shell when it cannot guarantee read-only', () => {
  // A read-only log means the pin cannot be appended: refuse rather than run an
  // unconfined command.
  const session = makeSession('danger-full-access', { readOnlyLog: true })
  const { ctx, guards } = makeCtx(session)
  apply(ctx)
  const denial = guards[0]({ name: 'pwsh', agent: { session } })
  assert.equal(typeof denial, 'string')
  assert.match(denial, /只读/)
})

test('the guard refuses the shell when no sandbox policy is mounted', () => {
  const session = makeSession('read-only')
  const { ctx, guards } = makeCtx(session, { noPolicy: true })
  apply(ctx)
  const denial = guards[0]({ name: 'pwsh', agent: { session } })
  assert.equal(typeof denial, 'string', 'an unconfined shell must not be silently allowed')
})

test('the guard never denies a read-only tool', () => {
  const session = makeSession('danger-full-access')
  const { ctx, guards } = makeCtx(session)
  apply(ctx)
  for (const name of ['read', 'glob', 'grep', 'read_image', 'web_fetch']) {
    assert.equal(guards[0]({ name, agent: { session } }), undefined, `${name} must stay available`)
  }
})

test('the guard ignores a call without a session', () => {
  const { ctx, guards } = makeCtx(undefined)
  apply(ctx)
  assert.equal(guards[0]({ name: 'pwsh', agent: {} }), undefined)
})

test('pinReadOnly reports the effective mode and is idempotent', () => {
  const session = makeSession('workspace-write')
  const { ctx } = makeCtx(session)
  assert.equal(pinReadOnly(ctx, session), 'read-only')
  assert.equal(pinReadOnly(ctx, session), 'read-only')
  assert.equal(session.events.length, 2, 'the second call appends nothing')
})

test('modeOf degrades to undefined without a policy', () => {
  const session = makeSession('read-only')
  const { ctx } = makeCtx(session, { noPolicy: true })
  assert.equal(modeOf(ctx, session), undefined)
})
