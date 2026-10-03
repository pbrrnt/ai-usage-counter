import { invoke } from '@tauri-apps/api/core'
import type { ProviderID, ProviderState, ProviderUsageResult, AntigravityUsage } from './types'
import { PROVIDER_LABELS, ALL_PROVIDERS } from './types'
import { formatCountdown, formatClockTime, formatTelegramSessionLine, formatTelegramWeeklyLine, loadJSON, saveJSON } from './utils'

// Percentage-point buffer against float/rounding noise before a drop counts
// as a real reset (rather than treating any decrease at all as significant).
const DROP_THRESHOLD = 1.0
const IMMINENT_SECS = 30 * 60
const HIGH_USAGE_PCT = 80
// A reset time moving later by more than this means a new window started
// (absorbs the few seconds of drift from countdown-based reset fields).
const RESET_MOVED_MS = 10 * 60 * 1000

interface Tracked {
  prevPct: number | null
  warned: boolean
  warnedHigh: boolean
  // Absolute reset time (epoch ms) of the window prevPct belongs to. Lets a
  // reset be detected even with no visible drop — e.g. it happened while the
  // app was closed and usage has since climbed past the old value elsewhere.
  resetAt?: number | null
  // Signals with no reset time (scraped Gemini/Codex pages) need a drop to
  // show up on two polls in a row before it counts — one half-loaded page
  // that misreads "85% left" as 15% used would otherwise announce a fake
  // reset and re-arm the 80% warning.
  dropSeen?: boolean
}

const STORAGE_KEY = 'resetTracking'

// Persisted so a restart (app relaunch, not just window hide/show) doesn't
// lose the prevPct baseline — otherwise a reset that happens while the app
// is closed just gets silently absorbed as a new baseline on the next poll,
// with no notification. Same localStorage approach as the provider cache in
// store.ts.
function loadTracking(): Map<string, Tracked> {
  return new Map(Object.entries(loadJSON<Record<string, Tracked>>(STORAGE_KEY) ?? {}))
}

// Called once per refresh cycle (and on sign-out) rather than per signal.
export function saveTracking() {
  saveJSON(STORAGE_KEY, Object.fromEntries(tracking))
}

// Module-level, not store state — nothing ever renders this, it's pure
// bookkeeping for refreshAll() to consult on each poll (mirrors how
// initWindow() keeps its own timers as plain closure variables).
const tracking = loadTracking()

// Resolves true only when Telegram actually accepted the message.
function notify(text: string): Promise<boolean> {
  return invoke<boolean>('send_telegram_message', { text }).catch(e => {
    console.error('Telegram notify failed:', e)
    return false
  })
}

// Sets the flag up front (so an in-flight send isn't duplicated by the next
// poll), then clears it again if the send didn't go through — offline, or
// Telegram not configured yet — so a later poll retries instead of the
// warning being lost for the rest of the cycle.
function warnOnce(entry: Tracked, flag: 'warned' | 'warnedHigh', text: string) {
  entry[flag] = true
  notify(text).then(ok => {
    if (!ok) {
      entry[flag] = false
      saveTracking()
    }
  })
}

function checkSignal(key: string, provider: string, signal: string, pct: number | null, resetSecs: number | null) {
  if (pct == null) return
  const now = Date.now()
  const resetAt = resetSecs != null && resetSecs > 0 ? now + resetSecs * 1000 : null
  let entry = tracking.get(key)

  if (!entry || entry.prevPct == null) {
    // First sighting (first launch, a new lane, or after sign-out/re-login):
    // nothing to compare for a reset, but still run the warnings below — this
    // is exactly when the user hasn't been warned about current usage yet.
    entry = { prevPct: pct, warned: false, warnedHigh: false, resetAt }
    tracking.set(key, entry)
  } else {
    const dropped = pct < entry.prevPct - DROP_THRESHOLD
    const prevResetAt = entry.resetAt ?? null
    // Only a newly reported, later reset time counts — not merely passing the
    // old one, since the API can lag a few seconds past the reset and would
    // otherwise get a "reset" announced now and again when the drop lands.
    const windowRolled = prevResetAt != null && resetAt != null && resetAt > prevResetAt + RESET_MOVED_MS
    const hasResetTime = prevResetAt != null || resetAt != null
    if (dropped && !windowRolled && !hasResetTime && !entry.dropSeen) {
      // First low reading — hold the old baseline and wait for the next poll.
      entry.dropSeen = true
      return
    }
    entry.dropSeen = false
    if (dropped || windowRolled) {
      notify(`✅ ${provider} — ${signal} รีเซ็ตแล้วครับ (ใช้ไป ${pct.toFixed(1)}%)`)
      entry = { prevPct: pct, warned: false, warnedHigh: false, resetAt }
      tracking.set(key, entry)
      return
    }
    entry.prevPct = pct
    if (resetAt != null) entry.resetAt = resetAt
  }

  if (!entry.warnedHigh && pct >= HIGH_USAGE_PCT) {
    warnOnce(entry, 'warnedHigh', `⚠️ ${provider} — ${signal} ใช้ไปแล้ว ${HIGH_USAGE_PCT}% ครับ (ใช้ไป ${pct.toFixed(1)}%)`)
  }

  if (!entry.warned && resetSecs != null && resetSecs > 0 && resetSecs < IMMINENT_SECS) {
    warnOnce(entry, 'warned', `⏰ ${provider} — ${signal} ใกล้รีเซ็ตแล้ว อีก ${formatCountdown(resetSecs)} (เวลา ${formatClockTime(resetSecs)} น.)`)
  }
}

// Drop this provider's baseline on sign-out — otherwise re-signing in (a
// different account, or the old logout/login workaround for stale Gemini
// data) compares fresh usage against a stale pre-signout baseline, which can
// fire a false "reset" notification or suppress a real 80% warning because
// warnedHigh was already set from before.
export function clearProviderTracking(providerId: ProviderID) {
  const prefix = `${providerId}:`
  for (const key of tracking.keys()) {
    if (key.startsWith(prefix)) tracking.delete(key)
  }
  saveTracking()
}

export function checkProviderResets(providerId: ProviderID, result: ProviderUsageResult) {
  const provider = PROVIDER_LABELS[providerId]
  checkSignal(`${providerId}:session`, provider, 'Session limit', result.session_pct, result.session_reset_secs)
  checkSignal(`${providerId}:weekly`, provider, 'Weekly limit', result.weekly_pct, result.weekly_reset_secs)
  // Per-model lanes (Claude's Fable 5, Gemini's model quotas)
  for (const lane of result.quota_lanes) {
    checkSignal(`${providerId}:lane:${lane.id}`, provider, lane.label, lane.pct, lane.reset_secs)
  }
}

export function checkAntigravityResets(usage: AntigravityUsage) {
  const provider = PROVIDER_LABELS.antigravity
  for (const lane of usage.lanes) {
    checkSignal(`antigravity:${lane.id}`, provider, lane.label, lane.pct, lane.reset_secs)
  }
}

// Replies to a /usage command from Telegram with current usage for every
// connected provider — whatever's already in the store, no fresh fetch (the
// regular refresh loop already keeps this reasonably up to date). One line
// per provider name, then one line per metric underneath it:
//   Claude
//   Session : 85.0% - Reset at 19:19 (in 1h 30m)
//   Weekly : 76.0% - Reset at Fri 3:59PM - 22h 10m
export function sendUsageSummary(providers: Record<ProviderID, ProviderState>) {
  const lines: string[] = ['📊 สรุปการใช้งาน AI']
  for (const id of ALL_PROVIDERS) {
    const p = providers[id]
    if (p.authState !== 'signed_in') continue
    const rows: string[] = []
    if (p.sessionBar) rows.push(formatTelegramSessionLine(p.sessionBar.fraction * 100, p.sessionBar.resetSecs))
    if (p.weeklyBar) rows.push(formatTelegramWeeklyLine(p.weeklyBar.fraction * 100, p.weeklyBar.resetSecs))
    for (const lane of p.quotaLanes) {
      const reset = lane.resetText ? ` - ${lane.resetText}` : ''
      rows.push(`${lane.label} : ${lane.pct.toFixed(0)}%${reset}`)
    }
    if (rows.length) {
      lines.push(PROVIDER_LABELS[id])
      lines.push(...rows)
    }
  }
  if (lines.length === 1) lines.push('ยังไม่ได้เชื่อมต่อ provider ไหนเลยครับ')
  notify(lines.join('\n'))
}
