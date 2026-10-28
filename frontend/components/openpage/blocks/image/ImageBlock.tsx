import { ImageIcon } from 'lucide-react'
import type { BlockConfig } from '../types'
import { El } from '../El'
import { listElementId, subElementId } from '@/lib/openpage/element-style'

function Placeholder({ className }: { className?: string }) {
  return (
    <div className={`bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center ${className || ''}`}>
      <ImageIcon size={32} className="text-text-3" />
    </div>
  )
}

export function ImageBlock({ block }: { block: BlockConfig }) {
  const { variant, props } = block
  const src = props.src as string | undefined
  const alt = (props.alt as string) || ''
  const title = props.title as string | undefined
  const subtitle = props.subtitle as string | undefined
  const imageSide = (props.imageSide as string) || 'left'
  const images = (props.images as { _id?: string; src?: string; alt?: string }[]) || []

  const heading = (className: string) =>
    title ? (
      <El block={block} id="image:title" as="h2" className={className}>
        {title}
      </El>
    ) : null
  const sub = (className: string) =>
    subtitle ? (
      <El block={block} id="image:subtitle" as="p" className={className}>
        {subtitle}
      </El>
    ) : null

  if (variant === 'side-by-side') {
    return (
      <div className="px-6 py-12 @lg:px-16 @lg:py-16">
        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-8 @lg:gap-12 items-center">
          <El block={block} id="image:media" className={`reveal-scale reveal-d1 rounded-lg overflow-hidden ${imageSide === 'right' ? '@lg:order-2' : ''}`}>
            {src
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={src} alt={alt} className="w-full h-full object-cover" />
              : <Placeholder className="w-full h-64 @lg:h-80" />}
          </El>
          <div className={`reveal-fade-up reveal-d2 ${imageSide === 'right' ? '@lg:order-1' : ''}`}>
            {heading('text-2xl font-display font-semibold mb-3')}
            {sub('text-text-1 leading-relaxed')}
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'grid') {
    // Every image is shown (the grid wraps); the subtitle sits under the title.
    const gridImages = images.length > 0
      ? images
      : [{ src: undefined, alt: '1' }, { src: undefined, alt: '2' }, { src: undefined, alt: '3' }, { src: undefined, alt: '4' }]

    return (
      <div className="px-6 py-12 @lg:px-16 @lg:py-16">
        {title || subtitle ? (
          <div className="reveal-fade-up reveal-d1 text-center mb-6">
            {heading('text-2xl font-display font-semibold mb-2')}
            {sub('text-text-2 text-sm max-w-xl mx-auto')}
          </div>
        ) : null}
        <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
          {gridImages.map((img, i) => {
            const id = listElementId({ path: ['images'] }, (img as { _id?: string })._id || `idx_${i}`)
            return (
              <El key={id} block={block} id={id} className={`reveal-scale reveal-d${Math.min(i + 2, 8)} aspect-square rounded-lg overflow-hidden`}>
                {img.src ? (
                  <El block={block} id={subElementId(id, 'image')} className="w-full h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt={img.alt || ''} className="w-full h-full object-cover" />
                  </El>
                ) : (
                  <Placeholder className="w-full h-full" />
                )}
              </El>
            )
          })}
        </div>
      </div>
    )
  }

  // hero-image (default)
  return (
    <div className="reveal-scale reveal-d1 relative">
      <El block={block} id="image:media">
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={alt} className="w-full h-64 @lg:h-96 object-cover" />
          : <Placeholder className="w-full h-64 @lg:h-96" />}
      </El>
      {(title || subtitle) && (
        <div className="absolute inset-0 bg-gradient-to-t from-bg-0/80 to-transparent flex flex-col justify-end p-6 @lg:p-12 pointer-events-none">
          <div className="pointer-events-auto">
            {heading('reveal-fade-up reveal-d2 text-2xl @lg:text-3xl font-display font-bold mb-2')}
            {sub('reveal-fade-up reveal-d3 text-text-1 text-sm @lg:text-base max-w-lg')}
          </div>
        </div>
      )}
    </div>
  )
}
