"use client";

import { useState, useEffect } from "react";
import type { BlockConfig } from "../types";
import { flag } from "../elements/shared";

interface CountdownProps {
  title?: string;
  targetDate?: string;
  deadline?: string;
  showDays?: boolean | string;
  showHours?: boolean | string;
  showMinutes?: boolean | string;
  showSeconds?: boolean | string;
  expiredText?: string;
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function calculateTimeLeft(target: string, now = Date.now()): TimeLeft | null {
  const diff = new Date(target).getTime() - now
  if (!Number.isFinite(diff) || diff <= 0) return null
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export function CountdownBlock({ block }: { block: BlockConfig }) {
  const p = block.props as CountdownProps
  // A fixed date only. (It used to fall back to "now + 7 days", which moved
  // on every render, so the timer never really counted down.)
  const target = (p.targetDate || p.deadline || "").trim()
  const valid = Boolean(target) && Number.isFinite(new Date(target).getTime())
  // undefined = not measured yet: the server and the first browser render
  // show the same placeholder, so the page hydrates without a mismatch.
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null | undefined>(undefined)

  useEffect(() => {
    if (!valid) return
    const tick = () => setTimeLeft(calculateTimeLeft(target))
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [target, valid])

  const showDays = flag(p.showDays, true)
  const showHours = flag(p.showHours, true)
  const showMinutes = flag(p.showMinutes, true)
  const showSeconds = flag(p.showSeconds, true)

  if (valid && timeLeft === null) {
    return (
      <div className="px-6 py-12 text-center">
        <h2 className="text-2xl font-bold text-[var(--color-text-0)] mb-2">{p.title || 'Coming Soon'}</h2>
        <p className="text-[var(--color-text-2)]">{p.expiredText || 'This event has ended.'}</p>
      </div>
    )
  }

  const units = [
    { value: timeLeft?.days, label: 'Days', show: showDays },
    { value: timeLeft?.hours, label: 'Hours', show: showHours },
    { value: timeLeft?.minutes, label: 'Minutes', show: showMinutes },
    { value: timeLeft?.seconds, label: 'Seconds', show: showSeconds },
  ].filter((u) => u.show)

  return (
    <div className="px-6 py-12 text-center">
      {p.title && (
        <h2 className="text-2xl font-bold text-[var(--color-text-0)] mb-6">{p.title}</h2>
      )}
      {!valid ? (
        <p className="text-xs text-[var(--color-text-3)] mb-3">Set the end date in the Content tab.</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3 @md:gap-4">
        {units.map((unit) => (
          <div key={unit.label} className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-xl bg-[var(--color-bg-2)] border border-[var(--color-border-default)] flex items-center justify-center">
              <span className="text-3xl font-bold text-[var(--color-accent)] font-mono">
                {unit.value === undefined ? '--' : String(unit.value).padStart(2, '0')}
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-2)] mt-2 uppercase tracking-wider">{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
