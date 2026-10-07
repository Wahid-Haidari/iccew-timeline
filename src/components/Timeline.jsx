import { useLayoutEffect, useRef, useState } from 'react'
import CreateTeamModal from './CreateTeamModal'
import ProgramCard from './ProgramCard'

const pinnedProgramIds = ['apd', 'energy', 'ofa', 'okc', 'soba-biz', 'soba-dev']
const staffThenTeamSemesterIds = new Set([
  'spring-2013',
  'fall-2013',
  'spring-2014',
  'fall-2014',
  'spring-2015',
  'fall-2015',
])

function isStaffProgram(program) {
  return (
    Array.isArray(program?.members)
    || program?.id === 'staff'
    || program?.name?.trim().toLowerCase() === 'staff'
  )
}

function withStaffFirst(programs) {
  const staffPrograms = programs.filter(isStaffProgram)

  return staffPrograms.length > 0
    ? [...staffPrograms, ...programs.filter((program) => !isStaffProgram(program))]
    : programs
}

function staffThenTeams(semester) {
  const teamIds = ['team-1', 'team-2', 'team-3']
  const teams = teamIds
    .map((id) => semester.programs.find((program) => program.id === id))
    .filter(Boolean)
  const remainingPrograms = semester.programs.filter(
    (program) => !teamIds.includes(program.id),
  )

  return withStaffFirst([...teams, ...remainingPrograms])
}

function programsForSemester(semester) {
  const hasSavedOrder = semester.programs.some(
    (program) => program.displayOrder !== null && program.displayOrder !== undefined,
  )

  if (hasSavedOrder) {
    return [...semester.programs].sort(
      (first, second) => (
        (first.displayOrder ?? Number.MAX_SAFE_INTEGER)
        - (second.displayOrder ?? Number.MAX_SAFE_INTEGER)
      ),
    )
  }

  if (staffThenTeamSemesterIds.has(semester.id)) {
    return staffThenTeams(semester)
  }

  if (semester.id.startsWith('summer-')) {
    return withStaffFirst(semester.programs)
  }

  if (semester.id === 'spring-2023') {
    const socEnt = semester.programs.find((program) => program.id === 'soc-ent')
    const orderedPrograms = socEnt
      ? [socEnt, ...semester.programs.filter((program) => program.id !== 'soc-ent')]
      : semester.programs

    return withStaffFirst(orderedPrograms)
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

    const selectedPrograms = spring2022Order
      .map((id) => semester.programs.find((program) => program.id === id))
      .filter(Boolean)

    // This semester has a custom program order, so add Staff separately before
    // applying the shared placement rule.
    return withStaffFirst([
      ...selectedPrograms,
      ...semester.programs.filter(
        (program) => isStaffProgram(program) && !selectedPrograms.includes(program),
      ),
    ])
  }

  const pinnedPrograms = pinnedProgramIds.map(
    (id) => semester.programs.find((program) => program.id === id),
  ).filter(Boolean)
  const otherPrograms = semester.programs.filter(
    (program) => !pinnedProgramIds.includes(program.id),
  )

  const orderedPrograms = pinnedPrograms.length > 0
    ? [...pinnedPrograms, ...otherPrograms]
    : otherPrograms

  return withStaffFirst(orderedPrograms)
}

function peopleForProgram(program) {
  if (program.membershipDetails?.length) {
    return program.membershipDetails.map(({ name, role }) => ({ name, role }))
  }

  if (Array.isArray(program.members)) {
    return program.members
  }

  const fellows = program.fellows ?? (program.fellow ? [program.fellow] : [])
  const teamLeads = program.teamLeads ?? (program.teamLead ? [program.teamLead] : [])

  return [
    ...fellows.map((name) => ({ name, role: 'Fellow' })),
    ...teamLeads.map((name) => ({ name, role: 'Team Lead' })),
    ...(program.interns ?? []).map((name) => ({ name, role: 'Intern' })),
  ]
}

function findPeople(semesters, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) {
    return []
  }

  return semesters.flatMap((semester) => (
    programsForSemester(semester).flatMap((program) => (
      peopleForProgram(program)
        .filter((person) => person.name.toLocaleLowerCase().includes(normalizedQuery))
        .map((person) => ({
          ...person,
          program,
          semester,
        }))
    ))
  ))
}

function createLine(source, target, containerRect, id) {
  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const startX = sourceRect.right - containerRect.left
  const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top
  // The arrowhead is 14px wide at the current 2px stroke width. Leave a
  // small gap so its point finishes immediately before the target text.
  const endX = targetRect.left - containerRect.left - 18
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
    const previousLeadershipSemester = getMostRecentSemester(
      semesters,
      semesterIndex,
      (program) => program.teamLead === teamLead.dataset.teamLead,
    )

    // Once someone has been a team lead, their later roles connect to that
    // previous leadership position instead of directly back to their internship.
    if (previousLeadershipSemester) {
      return []
    }

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

export default function Timeline({
  semesters,
  onProgramSave,
  onProgramDelete,
  onProgramReorder,
  onProgramCreate,
}) {
  const timelineRef = useRef(null)
  const [openAccordions, setOpenAccordions] = useState({})
  const [familyTreeVisible, setFamilyTreeVisible] = useState(false)
  const [lineData, setLineData] = useState({ width: 0, height: 0, lines: [] })
  const [searchQuery, setSearchQuery] = useState('')
  const draggedCardRef = useRef(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [reorderError, setReorderError] = useState(null)
  const [creatingTeam, setCreatingTeam] = useState(false)
  const searchResults = findPeople(semesters, searchQuery)
  const semesterGridStyle = {
    gridTemplateColumns: semesters.length > 0
      ? `repeat(${semesters.length}, minmax(320px, max-content))`
      : 'minmax(320px, max-content)',
  }

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

  function toggleFamilyTree() {
    if (familyTreeVisible) {
      setFamilyTreeVisible(false)
      setOpenAccordions({})
      return
    }

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

  function openSearchResult(result) {
    setOpenAccordions((current) => ({
      ...current,
      [`${result.semester.id}-${result.program.id}`]: true,
    }))

    requestAnimationFrame(() => {
      const card = [...(timelineRef.current?.querySelectorAll('[data-program-card]') ?? [])]
        .find((element) => (
          element.dataset.programCard === `${result.semester.id}:${result.program.id}`
        ))

      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }

  function handleCardDragStart(event, semesterId, groupId) {
    const cardRect = event.currentTarget.getBoundingClientRect()

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${semesterId}:${groupId}`)
    setReorderError(null)
    const card = {
      semesterId,
      groupId,
      pointerOffsetY: event.clientY - cardRect.top,
    }

    // Native drag events can fire before React has committed state updates.
    // Keep a synchronous copy for drag-over feedback and use dataTransfer on drop.
    draggedCardRef.current = card
    setDropIndicator(null)
  }

  function getDropPosition(event, forceBefore = false) {
    if (forceBefore) {
      return 'before'
    }

    const targetRect = event.currentTarget.getBoundingClientRect()
    const draggedCardTop = event.clientY - (draggedCardRef.current?.pointerOffsetY ?? 0)

    return draggedCardTop < targetRect.top
      ? 'before'
      : 'after'
  }

  function handleCardDragOver(event, semester, targetProgram, forceBefore = false) {
    const activeDraggedCard = draggedCardRef.current

    if (!activeDraggedCard || activeDraggedCard.semesterId !== semester.id) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const position = getDropPosition(event, forceBefore)

    setDropIndicator((current) => (
      current?.semesterId === semester.id
      && current?.groupId === targetProgram.groupId
      && current?.position === position
        ? current
        : { semesterId: semester.id, groupId: targetProgram.groupId, position }
    ))
  }

  function handleDropSlotDragOver(event, semester, targetProgram, position) {
    const activeDraggedCard = draggedCardRef.current

    if (!activeDraggedCard || activeDraggedCard.semesterId !== semester.id) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndicator({
      semesterId: semester.id,
      groupId: targetProgram.groupId,
      position,
    })
  }

  async function handleCardDrop(event, semester, targetProgram, position) {
    const [sourceSemesterId, sourceGroupId] = event.dataTransfer
      .getData('text/plain')
      .split(':')

    if (!sourceGroupId || sourceSemesterId !== semester.id) {
      return
    }

    const orderedPrograms = programsForSemester(semester)
    const movedProgram = orderedPrograms.find(
      (program) => program.groupId === sourceGroupId,
    )
    const remainingPrograms = orderedPrograms.filter(
      (program) => program.groupId !== sourceGroupId,
    )
    const targetIndex = remainingPrograms.findIndex(
      (program) => program.groupId === targetProgram.groupId,
    )

    if (!movedProgram || targetIndex < 0) {
      return
    }

    const reorderedPrograms = [...remainingPrograms]
    reorderedPrograms.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, movedProgram)

    try {
      await onProgramReorder(semester.id, reorderedPrograms)
      setReorderError(null)
    } catch (error) {
      setReorderError(error.message || 'Could not save the card order.')
    } finally {
      draggedCardRef.current = null
      setDropIndicator(null)
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-max px-8 py-6">
        {/* Sticky timeline controls */}
        <div className="sticky left-8 z-20 mb-8 flex w-[calc(100vw-4rem)] min-w-[58rem] items-start justify-between gap-8 bg-white">
          <h1
            className="shrink-0 font-serif text-[#841617]"
            aria-label="Ronnie K. Irani Center for the Creation of Economic Wealth"
          >
            <span className="block text-xl leading-none tracking-[0.045em]">
              RONNIE K. IRANI
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-[2.35rem] leading-[0.88] tracking-[0.035em]">
              CENTER FOR THE CREATION
            </span>
            <span className="block whitespace-nowrap text-[2.35rem] leading-[0.88] tracking-[0.035em]">
              OF ECONOMIC WEALTH
            </span>
            <span className="mt-3 block font-sans text-2xl font-bold tracking-normal underline decoration-2 underline-offset-4">
              Timeline
            </span>
          </h1>
          <div className="w-80 shrink-0">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={toggleFamilyTree}
                className="rounded-lg border border-[#841617] bg-[#841617] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#681112]"
              >
                {familyTreeVisible ? 'Hide family tree' : 'Show family tree'}
              </button>
              <button
                type="button"
                onClick={() => setCreatingTeam(true)}
                className="rounded-lg border border-[#841617] bg-white px-4 py-2 text-sm font-semibold text-[#841617] transition-colors hover:bg-[#f6e9cf]"
              >
                Add team
              </button>
            </div>
            <div className="mt-4">
              <label htmlFor="people-search" className="sr-only">Search people</label>
              <input
                id="people-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults[0]) {
                    event.preventDefault()
                    openSearchResult(searchResults[0])
                  }
                }}
                placeholder="Search people"
                className="w-full rounded-lg border border-[#841617] bg-white px-3 py-2 text-sm text-[#323232] placeholder:text-[#5a5a5a]"
              />
              {searchQuery.trim() && (
                <div className="mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-[#841617]/30 bg-white shadow-xl">
                  {searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <button
                        key={`${result.semester.id}-${result.program.id}-${result.name}-${result.role}`}
                        type="button"
                        onClick={() => openSearchResult(result)}
                        className="block w-full border-b border-[#841617]/15 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#f6e9cf]"
                      >
                        <span className="block font-semibold text-[#323232]">{result.name}</span>
                        <span className="block text-[#5a5a5a]">
                          {result.semester.label} · {result.program.name} · {result.role}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-[#5a5a5a]">No people found.</p>
                  )}
                </div>
              )}
            </div>
            <p className="mt-4 text-sm text-[#5a5a5a]">Drag cards within a semester to reorder them.</p>
            {reorderError && <p className="mt-2 text-sm font-medium text-[#841617]">{reorderError}</p>}
          </div>
        </div>

        {/* Semester labels + dashed lines + horizontal track + cards */}
        <div ref={timelineRef} className="relative grid" style={semesterGridStyle}>
          {lineData.lines.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 overflow-visible"
              viewBox={`0 0 ${lineData.width} ${lineData.height}`}
            >
              <defs>
                <marker
                  id="promotion-arrow"
                  className="text-[#841617]"
                  markerWidth="7"
                  markerHeight="7"
                  refX="0"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="currentColor" />
                </marker>
              </defs>
              {lineData.lines.map((line) => (
                <g key={line.id} className="text-[#841617]">
                  <path
                    d={line.path}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                    markerEnd="url(#promotion-arrow)"
                  />
                  <circle cx={line.startX} cy={line.startY} fill="currentColor" r="3" />
                </g>
              ))}
            </svg>
          )}

          {/* Labels row */}
          {semesters.map((sem, index) => (
            <div
              key={sem.id}
              className="flex flex-col items-center"
              style={{ gridColumn: index + 1, gridRow: 1 }}
            >
                <span className="text-sm font-semibold text-[#841617]">
                {sem.label}
              </span>
              <div className="mt-1 h-8 border-l-2 border-dashed border-[#841617]/45" />
            </div>
          ))}

          {/* Horizontal line with dots */}
          <div className="relative col-span-full row-start-2 flex h-3 items-center">
            {/* The line */}
            <div className="absolute inset-x-0 h-0.5 bg-linear-to-r from-[#841617] via-[#841617]/35 to-[#841617]" />

            {/* Arrow at end */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-6 text-[#841617]" fill="currentColor" viewBox="0 0 24 16">
                <path d="M24 8L14 0v5H0v6h14v5z" />
              </svg>
            </div>
          </div>

          {/* Dots per semester */}
          {semesters.map((sem, index) => (
            <div
              key={sem.id}
              className="z-10 flex h-3 items-center justify-center"
              style={{ gridColumn: index + 1, gridRow: 2 }}
            >
              <div className="h-3 w-3 rounded-full border-2 border-[#841617] bg-white" />
            </div>
          ))}

          {/* Cards row */}
          {semesters.map((sem, semesterIndex) => (
            <div
              key={sem.id}
              className="mt-4 flex min-w-80 flex-col gap-4 px-4"
              style={{ gridColumn: semesterIndex + 1, gridRow: 3 }}
            >
              {programsForSemester(sem).map((program, programIndex) => (
                <div key={program.groupId} className="relative">
                  <div
                    className="absolute -top-4 left-0 right-0 z-20 flex h-4 items-center"
                    onDragOver={(event) => (
                      handleDropSlotDragOver(event, sem, program, 'before')
                    )}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleCardDrop(event, sem, program, 'before')
                    }}
                  >
                    {dropIndicator?.semesterId === sem.id
                      && dropIndicator.groupId === program.groupId
                      && dropIndicator.position === 'before' && (
                        <div aria-hidden="true" className="h-1 w-full rounded-full bg-[#841617]" />
                      )}
                  </div>
                  <ProgramCard
                    program={program}
                    semesterId={sem.id}
                    accordionOpen={openAccordions[`${sem.id}-${program.id}`] ?? false}
                    onAccordionToggle={(isOpen) => (
                      handleAccordionToggle(sem.id, program.id, isOpen)
                    )}
                    onSave={onProgramSave}
                    onDelete={onProgramDelete}
                    draggable
                    onDragStart={(event) => handleCardDragStart(event, sem.id, program.groupId)}
                    onDragOver={(event) => (
                      handleCardDragOver(event, sem, program, programIndex === 0)
                    )}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleCardDrop(
                        event,
                        sem,
                        program,
                        getDropPosition(event, programIndex === 0),
                      )
                    }}
                    onDragEnd={() => {
                      draggedCardRef.current = null
                      setDropIndicator(null)
                    }}
                  />
                  {dropIndicator?.semesterId === sem.id
                    && dropIndicator.groupId === program.groupId
                    && dropIndicator.position === 'after' && (
                      <div
                        className="absolute -bottom-4 left-0 right-0 z-20 flex h-4 items-center"
                        onDragOver={(event) => (
                          handleDropSlotDragOver(event, sem, program, 'after')
                        )}
                        onDrop={(event) => {
                          event.preventDefault()
                          handleCardDrop(event, sem, program, 'after')
                        }}
                      >
                        <div aria-hidden="true" className="h-1 w-full rounded-full bg-[#841617]" />
                      </div>
                    )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {creatingTeam && (
        <CreateTeamModal
          semesters={semesters}
          onClose={() => setCreatingTeam(false)}
          onCreate={onProgramCreate}
        />
      )}
    </div>
  )
}
