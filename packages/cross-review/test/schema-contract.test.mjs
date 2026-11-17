// Contract test against the *runtime's own* JSON Schema validator.
//
// The plugin declares `output.schema` on both tools, and the DSH tool pipeline
// validates every return value against it (`createSuccessResult` in
// `@deepseek-ai/dsh-tools`): a mismatch throws `ToolOutputError` and the caller
// receives a tool error instead of the value. That is exactly how a verdict
// vocabulary drift stayed invisible — the unit tests called `execute()`
// directly and never went through the pipeline.
//
// This file closes that gap by importing the validator from the installed DSH,
// which is resolved from DSH_INSTALL_DIR rather than from this package. A
// profile plugin must not *ship* such an import (the installation moves between
// app updates); a local test may, and it skips cleanly when the installation
// cannot be reached.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  FINAL_TOOL_SCHEMA,
  criteriaWithIds,
  errorFinalAudit,
  normalizeFinalAudit,
  skippedFinalAudit,
} from '../preset.js'

const require = createRequire(import.meta.url)

/** Resolve the runtime's schema validator from the running installation, or undefined. */
async function loadRuntimeValidator() {
  const anchor = process.env.DSH_INSTALL_DIR
  if (typeof anchor !== 'string' || anchor === '') return undefined
  let packageDir
  try {
    packageDir = path.dirname(require.resolve('@deepseek-ai/dsh-tools/package.json', { paths: [anchor] }))
  } catch {
    return undefined
  }
  // `lib/types/json-schema.js` is the enforcing implementation; older or newer
  // layouts may only expose the bundled re-export, so try both.
  const candidates = [
    path.join(packageDir, 'lib', 'types', 'json-schema.js'),
    path.join(packageDir, 'lib', 'shared-DGx6D7zk.js'),
  ]
  for (const candidate of candidates) {
    try {
      const module = await import(pathToFileURL(candidate).href)
      if (typeof module.validateJsonSchemaValue === 'function') return module.validateJsonSchemaValue
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

const validate = await loadRuntimeValidator()

test('the runtime validator is reachable from this installation', async (t) => {
  if (validate === undefined) {
    t.skip('DSH installation not reachable from this test run (DSH_INSTALL_DIR unset or layout changed)')
    return
  }
  assert.equal(typeof validate, 'function')
})

test('every reachable cross_review_final value passes the runtime output validation', async (t) => {
  if (validate === undefined) {
    t.skip('DSH installation not reachable from this test run')
    return
  }
  const cases = {
    'arbiter disabled': skippedFinalAudit('裁决者已在设置中停用'),
    'audit duty disabled': skippedFinalAudit('交付审核已在设置中关闭'),
    'child timed out': errorFinalAudit('无法完成交付审核：交叉复核超时（180s）', 'magpie/x'),
    'child stopped with error': errorFinalAudit('子代理未正常完成（stopReason=error）', 'magpie/x'),
    'undecidable verdict': normalizeFinalAudit(undefined, 'not json', 'm'),
    'ruling outside vocabulary': normalizeFinalAudit({ ruling: 'probably fine' }, '', 'm'),
    ready: normalizeFinalAudit({ ruling: 'ready' }, '', 'm'),
    'not ready': normalizeFinalAudit({ ruling: 'not_ready' }, '', 'm'),
    'need more evidence': normalizeFinalAudit({ ruling: 'need_more_evidence' }, '', 'm'),
    'ready with a failed criterion': normalizeFinalAudit(
      { ruling: 'ready', criteria: [{ item: 'x', status: 'fail', evidence: 'y' }] },
      '',
      'm',
    ),
    'ready with unverified criteria': normalizeFinalAudit(
      { ruling: 'ready', criteria: [{ item: 'x', status: 'unverified', evidence: '' }] },
      '',
      'm',
    ),
    'criterion with an AC id': normalizeFinalAudit(
      { ruling: 'ready', criteria: [{ item: 'x', criterion_id: 'AC1', status: 'pass', evidence: 'ok' }] },
      '',
      'm',
    ),
    'coverage downgrade': normalizeFinalAudit(
      { ruling: 'ready', criteria: [{ item: 'a', status: 'pass', evidence: 'e' }] },
      '',
      'm',
      { expectedCriteria: criteriaWithIds(['a', 'b']), noToolCalls: true },
    ),
  }
  for (const [label, value] of Object.entries(cases)) {
    assert.deepEqual(validate(FINAL_TOOL_SCHEMA, value, 'value'), [], `${label} must pass the runtime validator`)
  }
})
