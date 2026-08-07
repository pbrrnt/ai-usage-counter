import { invoke } from '@tauri-apps/api/core'
import type { ProviderID, ProviderState, ProviderUsageResult, AntigravityUsage } from './types'
import { PROVIDER_LABELS, ALL_PROVIDERS } from './types'
import { formatCountdown, formatClockTime } from './utils'

// Percentage-point buffer against float/rounding noise before a drop counts
// as a real reset (rather than treating any decrease at all as significant).
const DROP_THRESHOLD = 1.0
const IMMINENT_SECS = 30 * 60

interface Tracked {
  prevPct: number | null
  warned: boolean
}

// Module-level, not store state — nothing ever renders this, it's pure
// bookkeeping for refreshAll() to consult on each poll (mirrors how
// initWindow() keeps its own timers as plain closure variables).
const tracking = new Map<string, Tracked>()

function notify(text: string) {
  invoke('send_telegram_message', { text }).catch(e => console.error('Telegram notify failed:', e))
}

function checkSignal(key: string, provider: string, signal: string, pct: number | null, resetSecs: number | null) {
  if (pct == null) return
  const prev = tracking.get(key)

  if (!prev || prev.prevPct == null) {
    tracking.set(key, { prevPct: pct, warned: false })
    return
  }

  if (pct < prev.prevPct - DROP_THRESHOLD) {
    notify(`✅ ${provider} — ${signal} รีเซ็ตแล้วครับ (ใช้ไป ${pct.toFixed(1)}%)`)
    tracking.set(key, { prevPct: pct, warned: false })
    return
  }

  prev.prevPct = pct
  if (!prev.warned && resetSecs != null && resetSecs > 0 && resetSecs < IMMINENT_SECS) {
    notify(`⏰ ${provider} — ${signal} ใกล้รีเซ็ตแล้ว อีก ${formatCountdown(resetSecs)} (เวลา ${formatClockTime(resetSecs)} น.)`)
    prev.warned = true
  }
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
// regular refresh loop already keeps this reasonably up to date).
export function sendUsageSummary(providers: Record<ProviderID, ProviderState>) {
  const lines: string[] = ['📊 สรุปการใช้งาน AI']
  for (const id of ALL_PROVIDERS) {
    const p = providers[id]
    if (p.authState !== 'signed_in') continue
    const parts: string[] = []
    if (p.sessionBar) parts.push(`Session ${p.sessionBar.usedText}${p.sessionBar.resetLabel ? ' · ' + p.sessionBar.resetLabel : ''}`)
    if (p.weeklyBar) parts.push(`Weekly ${p.weeklyBar.usedText}${p.weeklyBar.resetLabel ? ' · ' + p.weeklyBar.resetLabel : ''}`)
    for (const lane of p.quotaLanes) {
      const reset = lane.resetText ? ` · ${lane.resetText}` : ''
      parts.push(`${lane.label} ${lane.pct.toFixed(0)}%${reset}`)
    }
    if (parts.length) lines.push(`${PROVIDER_LABELS[id]}: ${parts.join(' · ')}`)
  }
  if (lines.length === 1) lines.push('ยังไม่ได้เชื่อมต่อ provider ไหนเลยครับ')
  notify(lines.join('\n'))
}
