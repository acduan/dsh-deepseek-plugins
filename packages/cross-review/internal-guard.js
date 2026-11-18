// @local/dsh-cross-review/internal-guard
// Host plugin mounted INSIDE the `cross-review-internal` preset.
//
// Why this exists: the internal arbiter must not be able to modify the
// workspace. Turning off `write` / `edit` / `applyPatch` in that preset removes
// the file tools, but the shell tool stays, and the shell does not read a
// preset-level default: `sandboxPolicy.resolve()` is
//
//     mode: request.mode ?? overrideOf(session) ?? this.defaultMode
//
// and the subagent runtime appends the parent's explicit sandbox mode onto every
// child session (`source: 'delegation'`). A main agent running under
// `danger-full-access` therefore hands that mode to its arbiter, and the
// preset's `mode: read-only` never applies. Verified against this installation:
// 91 of 91 recorded child sessions carry an inherited `sandbox/mode` event.
//
// The fix is to make the guarantee real at the only point that can see the
// concrete call: pin the arbiter's own session to `read-only` before its shell
// runs, then refuse the call if the effective mode is still wider. The pin is a
// normal durable `sandbox/mode` event, so the confinement the pwsh/bash sandbox
// enforces afterwards is the runtime's own, not a prompt request.

export const name = 'cross-review-internal-guard'
export const inject = ['tools']

const SHELL_TOOLS = new Set(['bash', 'pwsh'])

// A short, shell-agnostic list of read-only commands that work inside the
// constrained (read-only) sandbox. Some cmdlets — Get-Process, Get-NetTCPConnection,
// Get-CimInstance, Get-Service — fail or silently return nothing under
// ConstrainedLanguage, which used to make the arbiter report "service is down"
// when the service was actually running. Point it at native tools instead.
const SAFE_FORENSICS_HINT =
  '可改用只读取证命令：netstat -ano、tasklist、tasklist /FI "PID eq <pid>"、where、type、findstr、dir、Get-Content；' +
  'Get-Process / Get-NetTCPConnection / Get-CimInstance 在只读沙箱下可能静默失败，那是沙箱限制、不是被检查对象异常。'

// Only the mode is read; the service is optional so a profile without a sandbox
// policy still mounts this row and simply cannot vouch for the shell.
function policyOf(ctx) {
  const policy = ctx.get('sandboxPolicy')
  return policy !== undefined && typeof policy.resolve === 'function' ? policy : undefined
}

function modeOf(ctx, session) {
  const policy = policyOf(ctx)
  if (policy === undefined) return undefined
  try {
    return policy.resolve({ session }).mode
  } catch {
    return undefined
  }
}

/**
 * Narrow one session to `read-only` by appending its own mode event.
 * @returns the effective mode after the attempt.
 */
function pinReadOnly(ctx, session) {
  const policy = policyOf(ctx)
  if (policy === undefined || session === undefined) return undefined
  const current = modeOf(ctx, session)
  if (current === undefined || current === 'read-only') return current
  try {
    session.append('sandbox/mode', { mode: 'read-only' })
  } catch {
    // A read-only session log (or a closed one) leaves the wider mode in place;
    // the caller below then refuses the shell instead of running it.
  }
  return modeOf(ctx, session)
}

export function apply(ctx) {
  ctx.tools.guard((exec) => {
    const session = exec?.agent?.session
    if (session === undefined) return undefined

    // Pin before deciding, so the first shell call already runs confined and
    // every later call (file tools included) sees the narrow mode.
    const mode = pinReadOnly(ctx, session)

    if (!SHELL_TOOLS.has(exec?.name)) return undefined
    if (mode === undefined) {
      // No sandbox policy to vouch for: running a shell here would be
      // unconfined, which is exactly what this preset must not allow.
      return `交叉复核子代理的 shell 不可用：当前组合没有可用的沙箱策略，无法保证只读。请改用 read/glob/grep 取证。`
    }
    if (mode !== 'read-only') {
      return `交叉复核子代理的 shell 被限制在只读沙箱内（当前 ${mode}，无法收窄）。请改用 read/glob/grep 取证，或让主代理把命令输出作为证据提供。${SAFE_FORENSICS_HINT}`
    }
    return undefined
  })
}

// Exported for local unit checks; not part of the Cordis contract.
export { pinReadOnly, modeOf, SHELL_TOOLS }
