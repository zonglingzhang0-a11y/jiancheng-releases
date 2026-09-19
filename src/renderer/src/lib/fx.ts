// 点击动效：所有 .fx 元素按下时出现涟漪；完成时撒一圈小点

const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

export function installRipple(): void {
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.fx')
    if (!el || reduced()) return
    const r = el.getBoundingClientRect()
    const size = Math.max(r.width, r.height) * 2
    const s = document.createElement('span')
    s.className = 'ripple'
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`
    el.appendChild(s)
    setTimeout(() => s.remove(), 600)
  })
}

export function burst(x: number, y: number): void {
  if (reduced()) return
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('i')
    p.className = 'burst'
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    document.body.appendChild(p)
    const a = (Math.PI * 2 * i) / 10 + (i % 3) * 0.13
    const d = 18 + (i % 4) * 5
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }
      ],
      { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' }
    ).onfinish = () => p.remove()
  }
}

/** 事件的位置，没有鼠标位置时取元素中心 */
export function burstAt(e: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }): void {
  if (e.clientX) return burst(e.clientX, e.clientY ?? 0)
  const el = e.currentTarget as HTMLElement | null
  if (!el?.getBoundingClientRect) return
  const r = el.getBoundingClientRect()
  burst(r.left + r.width / 2, r.top + r.height / 2)
}
