import { useState } from 'react'
import InternsAccordion from './InternsAccordion'

const colorMap = {
  APD: 'bg-blue-600/80 border-blue-500',
  Energy: 'bg-emerald-700/80 border-emerald-500',
  OFA: 'bg-yellow-600/80 border-yellow-500',
  OKC: 'bg-orange-600/80 border-orange-500',
  'SoBA (Biz)': 'bg-slate-600/80 border-slate-500',
  'SoBA (Dev)': 'bg-teal-700/80 border-teal-500',
  SocEnt: 'bg-purple-600/80 border-purple-500',
  'Team 1': 'bg-blue-600/80 border-blue-500',
  'Team 2': 'bg-violet-600/80 border-violet-500',
  'Team 3': 'bg-rose-600/80 border-rose-500',
}

const defaultColor = 'bg-slate-600/80 border-slate-500'

export default function ProgramCard({
  program,
  semesterId,
  accordionOpen,
  onAccordionToggle,
}) {
  const [localAccordionOpen, setLocalAccordionOpen] = useState(false)
  const isControlled = typeof accordionOpen === 'boolean'
  const isAccordionOpen = isControlled ? accordionOpen : localAccordionOpen
  const colors = colorMap[program.name] || defaultColor
  const isStaffCard = Array.isArray(program.members)
  const people = isStaffCard ? program.members : (program.interns ?? [])

  function handleAccordionToggle(isOpen) {
    if (!isControlled) {
      setLocalAccordionOpen(isOpen)
    }

    onAccordionToggle?.(isOpen)
  }

  return (
    <div className={`${isAccordionOpen ? 'min-h-80' : 'min-h-40'} rounded-xl border p-4 ${colors} backdrop-blur-sm`}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">{program.name}</h3>
        <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-semibold text-white">
          {people.length}
        </span>
      </div>

      <div className="mb-3 space-y-0.5 text-sm text-slate-200">
        {program.location && (
          <p>
            <span className="text-slate-400">Location:</span> {program.location}
          </p>
        )}
        {!isStaffCard && (
          <>
            <p
              className={program.fellow ? undefined : 'invisible'}
              aria-hidden={!program.fellow}
            >
              <span className="text-slate-400">Fellow:</span> {program.fellow}
            </p>
            <p
              data-semester-id={semesterId}
              data-team-lead={program.teamLead ?? undefined}
            >
              <span className="text-slate-400">TL:</span> {program.teamLead}
            </p>
          </>
        )}
      </div>

      <InternsAccordion
        people={people}
        label={isStaffCard ? 'Staff' : 'Interns'}
        linkable={!isStaffCard}
        semesterId={semesterId}
        open={isAccordionOpen}
        onToggle={handleAccordionToggle}
      />
    </div>
  )
}
