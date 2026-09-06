import { invoke } from '@tauri-apps/api/core'
import type { ProviderID, ProviderState, ProviderUsageResult, AntigravityUsage } from './types'
import { PROVIDER_LABELS, ALL_PROVIDERS } from './types'
import { formatCountdown, formatClockTime, formatTelegramSessionLine, formatTelegramWeeklyLine } from './utils'

// Percentage-point buffer against float/rounding noise before a drop counts
// as a real reset (rather than treating any decrease at all as significant).
const DROP_THRESHOLD = 1.0
const IMMINENT_SECS = 30 * 60
const HIGH_USAGE_PCT = 80

interface Tracked {
  prevPct: number | null
  warned: boolean
  warnedHigh: boolean
}

const STORAGE_KEY = 'resetTracking'

// Persisted so a restart (app relaunch, not just window hide/show) doesn't
// lose the prevPct baseline — otherwise a reset that happens while the app
// is closed just gets silently absorbed as a new baseline on the next poll,
// with no notification. Same localStorage approach as the provider cache in
// store.ts.
function loadTracking(): Map<string, Tracked> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw)))
  } catch {
    return new Map()
  }
}

function saveTracking() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(tracking)))
  } catch {}
}

// Module-level, not store state — nothing ever renders this, it's pure
// bookkeeping for refreshAll() to consult on each poll (mirrors how
// initWindow() keeps its own timers as plain closure variables).
const tracking = loadTracking()

function notify(text: string) {
  invoke('send_telegram_message', { text }).catch(e => console.error('Telegram notify failed:', e))
}

function checkSignal(key: string, provider: string, signal: string, pct: number | null, resetSecs: number | null) {
  if (pct == null) return
  const prev = tracking.get(key)

  if (!prev || prev.prevPct == null) {
    tracking.set(key, { prevPct: pct, warned: false, warnedHigh: pct >= HIGH_USAGE_PCT })
    saveTracking()
    return
  }

  if (pct < prev.prevPct - DROP_THRESHOLD) {
    notify(`✅ ${provider} — ${signal} รีเซ็ตแล้วครับ (ใช้ไป ${pct.toFixed(1)}%)`)
    tracking.set(key, { prevPct: pct, warned: false, warnedHigh: false })
    saveTracking()
    return
  }

  prev.prevPct = pct

  if (!prev.warnedHigh && pct >= HIGH_USAGE_PCT) {
    notify(`⚠️ ${provider} — ${signal} ใช้ไปแล้ว ${HIGH_USAGE_PCT}% ครับ (ใช้ไป ${pct.toFixed(1)}%)`)
    prev.warnedHigh = true
  }

  if (!prev.warned && resetSecs != null && resetSecs > 0 && resetSecs < IMMINENT_SECS) {
    notify(`⏰ ${provider} — ${signal} ใกล้รีเซ็ตแล้ว อีก ${formatCountdown(resetSecs)} (เวลา ${formatClockTime(resetSecs)} น.)`)
    prev.warned = true
  }

  saveTracking()
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
