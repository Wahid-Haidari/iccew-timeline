import { useLayoutEffect, useRef, useState } from 'react'
import ProgramCard from './ProgramCard'

const pinnedProgramIds = ['apd', 'energy', 'ofa', 'okc', 'soba-biz', 'soba-dev']

function programsForSemester(semester) {
  if (semester.id.startsWith('summer-')) {
    return semester.programs
  }

  if (semester.id === 'spring-2023') {
    const socEnt = semester.programs.find((program) => program.id === 'soc-ent')

    return socEnt
      ? [socEnt, ...semester.programs.filter((program) => program.id !== 'soc-ent')]
      : semester.programs
  }

  if (semester.id === 'spring-2022') {
    const spring2022Order = [
      'apd',
      'energy',
      'okc-talento',
      'okc-ou-med',
      'soba-biz',
      'soba-dev',
    ]

    return spring2022Order
      .map((id) => semester.programs.find((program) => program.id === id))
      .filter(Boolean)
  }

  const pinnedPrograms = pinnedProgramIds.map(
    (id) => semester.programs.find((program) => program.id === id) ?? null,
  )
  const otherPrograms = semester.programs.filter(
    (program) => !pinnedProgramIds.includes(program.id),
  )

  return pinnedPrograms.some(Boolean)
    ? [...pinnedPrograms, ...otherPrograms]
    : otherPrograms
}

function createLine(source, target, containerRect, id) {
  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const startX = sourceRect.right - containerRect.left
  const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top
  const endX = targetRect.left - containerRect.left
  const endY = targetRect.top + targetRect.height / 2 - containerRect.top
  const bend = Math.max((endX - startX) / 2, 24)

  return {
    id,
    endX,
    endY,
    path: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
    startX,
    startY,
  }
}

function getMostRecentSemester(semesters, semesterIndex, matches) {
  for (let index = semesterIndex - 1; index >= 0; index -= 1) {
    if (semesters[index].programs.some(matches)) {
      return semesters[index]
    }
  }

  return null
}

function getPromotionLines(container, semesters, includeLeadershipLines) {
  const containerRect = container.getBoundingClientRect()
  const semesterIndexes = new Map(semesters.map((semester, index) => [semester.id, index]))
  const interns = new Map(
    [...container.querySelectorAll('[data-intern-name]')].map((element) => [
      `${element.dataset.semesterId}:${element.dataset.internName}`,
      element,
    ]),
  )
  const teamLeads = [...container.querySelectorAll('[data-team-lead]')]
  const teamLeadElements = new Map(
    teamLeads.map((element) => [
      `${element.dataset.semesterId}:${element.dataset.teamLead}`,
      element,
    ]),
  )

  const internToLeadLines = teamLeads.flatMap((teamLead) => {
    const semesterIndex = semesterIndexes.get(teamLead.dataset.semesterId)
    const sourceSemester = getMostRecentSemester(
      semesters,
      semesterIndex,
      (program) => program.interns?.includes(teamLead.dataset.teamLead),
    )

    if (!sourceSemester) {
      return []
    }

    const intern = interns.get(
      `${sourceSemester.id}:${teamLead.dataset.teamLead}`,
    )

    if (!intern) {
      return []
    }

    return [createLine(
      intern,
      teamLead,
      containerRect,
      `intern-${sourceSemester.id}-${teamLead.dataset.teamLead}-${teamLead.dataset.semesterId}`,
    )]
  })

  if (!includeLeadershipLines) {
    return internToLeadLines
  }

  const leadToLeadLines = teamLeads.flatMap((teamLead) => {
    const semesterIndex = semesterIndexes.get(teamLead.dataset.semesterId)
    const sourceSemester = getMostRecentSemester(
      semesters,
      semesterIndex,
      (program) => program.teamLead === teamLead.dataset.teamLead,
    )
    const previousTeamLead = sourceSemester && teamLeadElements.get(
      `${sourceSemester.id}:${teamLead.dataset.teamLead}`,
    )

    return previousTeamLead
      ? [createLine(
        previousTeamLead,
        teamLead,
        containerRect,
        `lead-${sourceSemester.id}-${teamLead.dataset.teamLead}-${teamLead.dataset.semesterId}`,
      )]
      : []
  })

  return [...internToLeadLines, ...leadToLeadLines]
}

export default function Timeline({ semesters }) {
  const timelineRef = useRef(null)
  const [openAccordions, setOpenAccordions] = useState({})
  const [familyTreeVisible, setFamilyTreeVisible] = useState(false)
  const [lineData, setLineData] = useState({ width: 0, height: 0, lines: [] })

  useLayoutEffect(() => {
    const timeline = timelineRef.current

    if (!timeline) {
      return undefined
    }

    function updateLines() {
      const rect = timeline.getBoundingClientRect()

      setLineData({
        width: rect.width,
        height: rect.height,
        lines: getPromotionLines(timeline, semesters, familyTreeVisible),
      })
    }

    updateLines()

    const observer = new ResizeObserver(updateLines)
    observer.observe(timeline)
    window.addEventListener('resize', updateLines)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateLines)
    }
  }, [familyTreeVisible, openAccordions, semesters])

  function handleAccordionToggle(semesterId, programId, isOpen) {
    setOpenAccordions((current) => ({
      ...current,
      [`${semesterId}-${programId}`]: isOpen,
    }))
  }

  function showFamilyTree() {
    setFamilyTreeVisible(true)
    setOpenAccordions(
      Object.fromEntries(
        semesters.flatMap((semester) => (
          programsForSemester(semester)
            .filter(Boolean)
            .map((program) => [`${semester.id}-${program.id}`, true])
        )),
      ),
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-max px-8 py-6">
        {/* Title */}
        <div className="mb-8 flex flex-col items-start gap-4">
          <button
            onClick={showFamilyTree}
            className="rounded-lg border border-emerald-400/60 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20"
          >
            Show family tree
          </button>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
            <span className="h-8 w-1 rounded bg-emerald-400" />
            Timeline
          </h1>
        </div>

        {/* Semester labels + dashed lines + horizontal track + cards */}
        <div ref={timelineRef} className="relative">
          {lineData.lines.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 overflow-visible"
              viewBox={`0 0 ${lineData.width} ${lineData.height}`}
            >
              {lineData.lines.map((line) => (
                <g key={line.id} className="text-emerald-300">
                  <path
                    d={line.path}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                  <circle cx={line.startX} cy={line.startY} fill="currentColor" r="3" />
                  <circle cx={line.endX} cy={line.endY} fill="currentColor" r="3" />
                </g>
              ))}
            </svg>
          )}

          {/* Labels row */}
          <div className="flex">
            {semesters.map((sem) => (
              <div
                key={sem.id}
                className="flex shrink-0 flex-col items-center"
                style={{ minWidth: 320 }}
              >
                <span className="text-sm font-semibold text-emerald-400">
                  {sem.label}
                </span>
                <div className="mt-1 h-8 border-l-2 border-dashed border-slate-500" />
              </div>
            ))}
          </div>

          {/* Horizontal line with dots */}
          <div className="relative flex items-center">
            {/* The line */}
            <div className="absolute inset-x-0 h-0.5 bg-linear-to-r from-slate-500 via-white to-slate-500" />

            {/* Dots per semester */}
            <div className="relative flex w-full">
              {semesters.map((sem) => (
                <div
                  key={sem.id}
                  className="flex shrink-0 items-center justify-center"
                  style={{ minWidth: 320 }}
                >
                  <div className="z-10 h-3 w-3 rounded-full border-2 border-white bg-slate-800" />
                </div>
              ))}
              {/* Arrow at end */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <svg className="h-4 w-6 text-emerald-400" fill="currentColor" viewBox="0 0 24 16">
                  <path d="M24 8L14 0v5H0v6h14v5z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Cards row */}
          <div className="mt-4 flex">
            {semesters.map((sem) => (
              <div
                key={sem.id}
                className="flex shrink-0 flex-col gap-4 px-4"
                style={{ minWidth: 320 }}
              >
                {programsForSemester(sem).map((program, index) => (
                  program ? (
                    <ProgramCard
                      key={program.id}
                      program={program}
                      semesterId={sem.id}
                      accordionOpen={openAccordions[`${sem.id}-${program.id}`] ?? false}
                      onAccordionToggle={(isOpen) => (
                        handleAccordionToggle(sem.id, program.id, isOpen)
                      )}
                    />
                  ) : (
                    <div
                      key={`${sem.id}-program-placeholder-${index}`}
                      aria-hidden="true"
                      className="h-40"
                    />
                  )
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
