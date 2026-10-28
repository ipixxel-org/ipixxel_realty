import type { BlockConfig } from '../types'

export function DividerBlock({ block }: { block: BlockConfig }) {
  const { variant } = block
  const height = Number(block.props.height) || 60
  const width = (block.props.width as string) || 'full'
  const color = typeof block.props.color === 'string' && block.props.color ? block.props.color : undefined
  const thickness = Number(block.props.thickness)
  const lineStyle = block.props.lineStyle === 'dashed' || block.props.lineStyle === 'dotted' ? block.props.lineStyle : 'solid'

  // `w-full` is required: inside the flex row a bare max-width collapses the
  // line to zero width, which is why Centered and Narrow showed nothing.
  const widthClass = width === 'narrow' ? 'w-full max-w-32' : width === 'centered' ? 'w-full max-w-xs' : 'w-full'

  if (variant === 'space') {
    return <div style={{ height: `${height}px` }} />
  }

  if (variant === 'dots') {
    return (
      <div className="flex items-center justify-center gap-2 py-8" style={{ minHeight: `${height}px` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-text-3" style={{ backgroundColor: color }} />
        ))}
      </div>
    )
  }

  // line (default)
  return (
    <div className="flex items-center justify-center px-6" style={{ minHeight: `${height}px` }}>
      <div
        className={`${widthClass} mx-auto border-t border-border-default`}
        style={{
          borderTopColor: color,
          borderTopStyle: lineStyle,
          borderTopWidth: Number.isFinite(thickness) && thickness > 0 ? `${thickness}px` : undefined,
        }}
      />
    </div>
  )
}
