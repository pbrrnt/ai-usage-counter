import { useState, useEffect, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import { ALL_PROVIDERS, PROVIDER_LABELS, PROVIDER_ICONS } from '../types'
import { splitEmojis } from '../utils'

const IS_MAC = navigator.platform.toLowerCase().includes('mac')
const SHORTCUT_LABEL = IS_MAC ? '⌘⇧U' : 'Ctrl+Shift+U'

interface SectionProps {
  id: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

function Section({ id, title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(`section_${id}`)
    return stored === null ? defaultOpen : stored === 'true'
  })
  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem(`section_${id}`, String(next))
  }
  return (
    <div className="setting-col">
      <div className="section-head" onClick={toggle}>
        <span className={`section-chevron ${open ? 'open' : ''}`}>▶</span>
        <span className="setting-label">{title}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

export function Settings() {
  const autoDim = useStore(s => s.autoDim)
  const alwaysOnTop = useStore(s => s.alwaysOnTop)
  const setAutoDim = useStore(s => s.setAutoDim)
  const setAlwaysOnTop = useStore(s => s.setAlwaysOnTop)
  const setShowSettings = useStore(s => s.setShowSettings)
  const visibleProviders = useStore(s => s.visibleProviders)
  const toggleProviderVisible = useStore(s => s.toggleProviderVisible)
  const sessionTokenLimit = useStore(s => s.sessionTokenLimit)
  const weeklyTokenLimit = useStore(s => s.weeklyTokenLimit)
  const refreshInterval = useStore(s => s.refreshInterval)
  const setSessionTokenLimit = useStore(s => s.setSessionTokenLimit)
  const setWeeklyTokenLimit = useStore(s => s.setWeeklyTokenLimit)
  const setRefreshInterval = useStore(s => s.setRefreshInterval)
  const petIcon = useStore(s => s.petIcon)
  const setPetIcon = useStore(s => s.setPetIcon)
  const hoverMode = useStore(s => s.hoverMode)
  const setHoverMode = useStore(s => s.setHoverMode)
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const postalCode = useStore(s => s.postalCode)
  const setPostalCode = useStore(s => s.setPostalCode)
  const [telegramStatus, setTelegramStatus] = useState('Not sent yet')

  const sendTestNotification = async () => {
    setTelegramStatus('Sending…')
    try {
      const sent = await invoke<boolean>('send_telegram_message', { text: '✅ AI Usage Counter — test notification' })
      setTelegramStatus(sent ? 'Sent — check Telegram' : 'Not configured — fill in telegram_config.txt')
    } catch (e) {
      setTelegramStatus(`Failed: ${e}`)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShowSettings])

  return (
    <div
      className="settings-overlay"
      onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
        </div>

        <div className="divider" />

        <div className="settings-body">
          {/* Visible Agents */}
          <Section id="agents" title="👁 Visible Agents">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ALL_PROVIDERS.map(id => (
                <div key={id} className="setting-row" style={{ paddingLeft: 8 }}>
                  <div className="setting-label" style={{ fontSize: 11 }}>
                    <span style={{ display: 'inline-block', width: 16 }}>{PROVIDER_ICONS[id]}</span>
                    {PROVIDER_LABELS[id]}
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={visibleProviders?.includes(id)}
                      onChange={() => toggleProviderVisible(id)}
                    />
                    <span className="toggle-track" />
                  </label>
                </div>
              ))}
            </div>
          </Section>

          <div className="divider" />

          {/* Token Limits */}
          <Section id="tokens" title="Claude Token Limits" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="setting-row">
                <div className="setting-label" style={{ fontSize: 11 }}>Session Limit</div>
                <input
                  type="number"
                  value={sessionTokenLimit || ''}
                  onChange={e => setSessionTokenLimit(Number(e.target.value))}
                  placeholder="0 = auto"
                  style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '2px 6px', width: 90, fontSize: 11, textAlign: 'right' }}
                />
              </div>
              <div className="setting-row">
                <div className="setting-label" style={{ fontSize: 11 }}>Weekly Limit</div>
                <input
                  type="number"
                  value={weeklyTokenLimit || ''}
                  onChange={e => setWeeklyTokenLimit(Number(e.target.value))}
                  placeholder="0 = auto"
                  style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '2px 6px', width: 90, fontSize: 11, textAlign: 'right' }}
                />
              </div>
            </div>
          </Section>

          <div className="divider" />

          {/* Appearance */}
          <Section id="appearance" title="🎨 Appearance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Theme */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Theme</div>
                  <div className="setting-sub">Auto follows Windows' light/dark setting</div>
                </div>
                <select
                  value={theme}
                  onChange={e => setTheme(e.target.value as typeof theme)}
                  style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
                >
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="sunset">Sunset</option>
                </select>
              </div>

              {theme === 'sunset' && (
                <div className="setting-row">
                  <div className="setting-sub" style={{ margin: 0 }}>Thai postal code (for sunrise/sunset)</div>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="10110"
                    style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '2px 6px', width: 60, fontSize: 11, textAlign: 'right' }}
                  />
                </div>
              )}

              {/* Always on top */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Always on Top</div>
                  <div className="setting-sub">Keep the overlay above all other windows</div>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={alwaysOnTop}
                    onChange={e => setAlwaysOnTop(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>

              {/* Auto-dim */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Auto-dim</div>
                  <div className="setting-sub">Fade when idle · full opacity on hover</div>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={autoDim}
                    onChange={e => setAutoDim(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>

              {/* Hover behavior */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Hover Behavior</div>
                  <div className="setting-sub">
                    {hoverMode === 'off' && 'Manual only — use the collapse button or tray click'}
                    {hoverMode === 'pill' && 'Collapse to a floating pill when idle · expand on hover'}
                    {hoverMode === 'tray' && 'Hide entirely · fly out from the tray icon on hover'}
                  </div>
                </div>
                <select
                  value={hoverMode}
                  onChange={e => setHoverMode(e.target.value as typeof hoverMode)}
                  style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
                >
                  <option value="off">Off</option>
                  <option value="pill">Floating pill</option>
                  <option value="tray">Tray icon</option>
                </select>
              </div>

            </div>
          </Section>

          <div className="divider" />

          {/* Walking Pet */}
          <Section id="pet" title="🐾 Walking Pet" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="setting-sub" style={{ marginTop: 0 }}>
                Pick one or more (or type emojis) to walk along the header. Leave empty to turn off.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['🐈', '🐕', '🐧', '🐢', '🦆', '🐤', '🦖', '🐌', '🐝', '👾'].map(e => {
                  const list = splitEmojis(petIcon)
                  const active = list.includes(e)
                  return (
                    <button
                      key={e}
                      onClick={() => setPetIcon(active ? list.filter(x => x !== e).join('') : [...list, e].join(''))}
                      title={active ? `Remove ${e}` : `Add ${e}`}
                      style={{
                        fontSize: 15,
                        lineHeight: 1,
                        padding: '4px 6px',
                        borderRadius: 6,
                        border: active ? '1px solid #00aaff' : '1px solid transparent',
                        background: active ? 'rgba(0,170,255,0.15)' : 'var(--surface-chip)',
                        cursor: 'pointer',
                      }}
                    >
                      {e}
                    </button>
                  )
                })}
              </div>
              <div className="setting-row" style={{ gap: 8 }}>
                <input
                  type="text"
                  value={petIcon}
                  onChange={e => setPetIcon(e.target.value)}
                  placeholder="Type emoji(s)…"
                  style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '4px 8px', width: 110, fontSize: 14, textAlign: 'center' }}
                />
                {petIcon && (
                  <button
                    onClick={() => setPetIcon('')}
                    style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-placeholder-btn)', background: 'var(--surface-chip)', border: 'none', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}
                  >
                    Turn off
                  </button>
                )}
              </div>
            </div>
          </Section>

          <div className="divider" />

          {/* Refresh Interval */}
          <Section id="refresh" title="Refresh Interval" defaultOpen={false}>
            <div className="setting-row">
              <div className="setting-sub">Refresh every (seconds)</div>
              <input
                type="number"
                min={30}
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                style={{ background: 'var(--surface-input)', color: 'var(--text)', border: 'none', borderRadius: 4, padding: '2px 6px', width: 60, fontSize: 11, textAlign: 'right' }}
              />
            </div>
          </Section>

          <div className="divider" />

          {/* Telegram */}
          <Section id="telegram" title="Telegram Notifications" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="setting-sub" style={{ marginTop: 0 }}>
                Configured via telegram_config.txt in the app's data folder — fill in
                BOT_TOKEN and CHAT_ID there, no restart needed.
              </div>
              <div className="setting-row">
                <div className="setting-sub" style={{ margin: 0 }}>{telegramStatus}</div>
                <button
                  onClick={sendTestNotification}
                  disabled={telegramStatus === 'Sending…'}
                  style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', background: 'var(--surface-chip)', border: 'none', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}
                >
                  Send Test
                </button>
              </div>
            </div>
          </Section>

          <div className="divider" />

          {/* Keyboard shortcut info */}
          <div className="setting-col">
            <div className="setting-label">Keyboard Shortcut</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <kbd className="kbd">{SHORTCUT_LABEL}</kbd>
              <span className="setting-sub" style={{ margin: 0 }}>
                Hide / show overlay
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
