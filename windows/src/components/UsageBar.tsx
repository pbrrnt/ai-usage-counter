import type { UsageBarVM } from '../types'

interface Props {
  label: string
  icon: string
  iconColor: string
  vm: UsageBarVM
}

// Below 70% just use the provider's own tint (matches CompactView's scheme)
// so low usage doesn't share a color with the 90%+ near-limit warning.
function barColor(fraction: number, baseColor: string): string {
  if (fraction >= 1.0) return '#ff3b30'
  if (fraction >= 0.9) return '#ff9f0a'
  if (fraction >= 0.7) return '#ffd60a'
  return baseColor
}

function infoText(vm: UsageBarVM): string {
  if (vm.usedText.includes('%')) return ''
  if (!vm.limitText) return vm.usedText
  return `${vm.usedText} / ${vm.limitText}`
}

export function UsageBar({ label, icon, iconColor, vm }: Props) {
  const pct = vm.fraction * 100
  const color = barColor(vm.fraction, iconColor)
  const width = `${Math.min(100, Math.max(0, vm.fraction * 100))}%`

  return (
    <div className="usage-bar-row">
      <div className="usage-bar-top">
        <span style={{ fontSize: 10, color: iconColor }}>{icon}</span>
        <span className="usage-label">{label}</span>
        <div className="spacer" />
        {vm.isActive && vm.fraction > 0 && (
          <span className="usage-pct" style={{ color }}>
            {pct.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="bar-track">
        <div
          className="bar-fill"
          style={{
            width,
            background: `linear-gradient(to right, ${color}cc, ${color})`,
          }}
        />
      </div>

      <div className="usage-bar-bottom">
        <span>{infoText(vm)}</span>
        <span style={{ color }}>{vm.resetLabel}</span>
      </div>
    </div>
  )
}
