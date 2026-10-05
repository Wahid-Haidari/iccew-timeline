import { useState } from 'react'

export default function InternsAccordion({
  interns,
  semesterId,
  open,
  onToggle,
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const isControlled = typeof open === 'boolean'
  const isOpen = isControlled ? open : localOpen

  function handleToggle() {
    const nextOpen = !isOpen

    if (!isControlled) {
      setLocalOpen(nextOpen)
    }

    onToggle?.(nextOpen)
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/15 transition-colors"
      >
        <span>
          Interns <span className="ml-1 text-emerald-400">{interns.length}</span>
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <ul className="mt-2 space-y-1 text-sm text-slate-200">
          {interns.map((name) => (
            <li
              key={name}
              data-intern-name={name}
              data-semester-id={semesterId}
              className="flex items-start gap-2"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
