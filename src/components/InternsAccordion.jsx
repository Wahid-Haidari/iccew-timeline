import { useState } from 'react'

export default function InternsAccordion({
  people = [],
  label = 'Interns',
  linkable = true,
  semesterId,
  open,
  onToggle,
  buttonColor = 'bg-[#f0f0f0] hover:bg-[#f6e9cf]',
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
        className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-[#323232] transition-colors ${buttonColor}`}
      >
        <span>
          {label} <span className="ml-1 text-[#841617]">{people.length}</span>
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
        <ul className="mt-2 space-y-1 text-sm text-[#323232]">
          {people.map((person) => {
            const member = typeof person === 'string' ? { name: person } : person

            return (
              <li
                key={member.name}
                {...(linkable
                  ? {
                    'data-intern-name': member.name,
                    'data-semester-id': semesterId,
                  }
                  : {})}
                className="flex items-start gap-2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#841617]" />
                <span>
                  {member.name}
                  {member.role && (
                    <span className="ml-1 text-[#5a5a5a]">— {member.role}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
