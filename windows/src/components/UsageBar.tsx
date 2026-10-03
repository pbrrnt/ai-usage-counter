import type { UsageBarVM } from '../types'
import { usageColor } from '../utils'

interface Props {
  label: string
  icon: string
  iconColor: string
  vm: UsageBarVM
}

function infoText(vm: UsageBarVM): string {
  if (vm.usedText.includes('%')) return ''
  if (!vm.limitText) return vm.usedText
  return `${vm.usedText} / ${vm.limitText}`
}

export function UsageBar({ label, icon, iconColor, vm }: Props) {
  const pct = vm.fraction * 100
  const color = usageColor(vm.fraction)
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
