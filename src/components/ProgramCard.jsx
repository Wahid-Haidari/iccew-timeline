import { useState } from 'react'
import InternsAccordion from './InternsAccordion'

const colorMap = {
  apd: 'border-sky-500 bg-sky-50',
  'agile-product-design': 'border-sky-500 bg-sky-50',
  energy: 'border-emerald-600 bg-emerald-50',
  ofa: 'border-amber-500 bg-amber-50',
  okc: 'border-orange-500 bg-orange-50',
  'okc-fizit': 'border-orange-500 bg-orange-50',
  'okc-summoxone': 'border-orange-500 bg-orange-50',
  'okc-talento': 'border-orange-500 bg-orange-50',
  'okc-ou-med': 'border-orange-500 bg-orange-50',
  'soba-biz': 'border-indigo-500 bg-indigo-50',
  'soba-dev': 'border-cyan-600 bg-cyan-50',
  'soc-ent': 'border-purple-500 bg-purple-50',
  'tech-comm': 'border-pink-500 bg-pink-50',
  'tech-commercialization': 'border-pink-500 bg-pink-50',
  vc: 'border-lime-600 bg-lime-50',
  'team-1': 'border-blue-500 bg-blue-50',
  'team-2': 'border-violet-500 bg-violet-50',
  'team-3': 'border-rose-500 bg-rose-50',
}

const accordionColorMap = {
  apd: 'bg-sky-100 hover:bg-sky-200',
  'agile-product-design': 'bg-sky-100 hover:bg-sky-200',
  energy: 'bg-emerald-100 hover:bg-emerald-200',
  ofa: 'bg-amber-100 hover:bg-amber-200',
  okc: 'bg-orange-100 hover:bg-orange-200',
  'okc-fizit': 'bg-orange-100 hover:bg-orange-200',
  'okc-summoxone': 'bg-orange-100 hover:bg-orange-200',
  'okc-talento': 'bg-orange-100 hover:bg-orange-200',
  'okc-ou-med': 'bg-orange-100 hover:bg-orange-200',
  'soba-biz': 'bg-indigo-100 hover:bg-indigo-200',
  'soba-dev': 'bg-cyan-100 hover:bg-cyan-200',
  'soc-ent': 'bg-purple-100 hover:bg-purple-200',
  'tech-comm': 'bg-pink-100 hover:bg-pink-200',
  'tech-commercialization': 'bg-pink-100 hover:bg-pink-200',
  vc: 'bg-lime-100 hover:bg-lime-200',
  'team-1': 'bg-blue-100 hover:bg-blue-200',
  'team-2': 'bg-violet-100 hover:bg-violet-200',
  'team-3': 'bg-rose-100 hover:bg-rose-200',
}

const defaultColor = 'border-[#841617] bg-white'
const defaultAccordionColor = 'bg-[#f6e9cf] hover:bg-[#ead9b0]'
const theMineColor = 'border-fuchsia-600 bg-fuchsia-50'
const theMineAccordionColor = 'bg-fuchsia-100 hover:bg-fuchsia-200'
const summerColors = [
  { card: 'border-teal-500 bg-teal-50', accordion: 'bg-teal-100 hover:bg-teal-200' },
  { card: 'border-violet-500 bg-violet-50', accordion: 'bg-violet-100 hover:bg-violet-200' },
  { card: 'border-rose-500 bg-rose-50', accordion: 'bg-rose-100 hover:bg-rose-200' },
  { card: 'border-lime-600 bg-lime-50', accordion: 'bg-lime-100 hover:bg-lime-200' },
]

function summerColorFor(program) {
  const displayOrder = Number.isInteger(program.displayOrder)
    ? program.displayOrder
    : [...program.id].reduce((total, character) => total + character.charCodeAt(0), 0)

  return summerColors[displayOrder % summerColors.length]
}

function createEditForm(program, isStaffCard) {
  return {
    name: program.name ?? '',
    location: program.location ?? '',
    fellow: program.fellow ?? '',
    teamLead: (program.teamLeads ?? (program.teamLead ? [program.teamLead] : [])).join('\n'),
    interns: (program.interns ?? []).join('\n'),
    staff: isStaffCard
      ? program.members
        .map((member) => `${member.name}${member.role ? ` | ${member.role}` : ''}`)
        .join('\n')
      : '',
  }
}

function peopleFromLines(value, defaultRole) {
  return value
    .split('\n')
    .map((line) => {
      const [name, ...roleParts] = line.split('|')

      return {
        name: name.trim(),
        role: roleParts.join('|').trim() || defaultRole,
      }
    })
    .filter((person) => person.name)
}

export default function ProgramCard({
  program,
  semesterId,
  highlighted = false,
  accordionOpen,
  onAccordionToggle,
  onSave,
  onDelete,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const [localAccordionOpen, setLocalAccordionOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const isControlled = typeof accordionOpen === 'boolean'
  const isAccordionOpen = isControlled ? accordionOpen : localAccordionOpen
  const isStaffCard = Array.isArray(program.members)
  const isSummerSemester = semesterId?.startsWith('summer-')
  const isTheMineProgram = program.groupType?.startsWith('The Mine')
    || program.name?.startsWith('The Mine')
  const showsProject = isSummerSemester || program.groupType === 'The Mine Project'
  const summerColor = isSummerSemester && !isStaffCard && !isTheMineProgram
    ? summerColorFor(program)
    : null
  const colors = isTheMineProgram
    ? theMineColor
    : summerColor?.card || colorMap[program.id] || defaultColor
  const accordionColors = isTheMineProgram
    ? theMineAccordionColor
    : summerColor?.accordion || accordionColorMap[program.id] || defaultAccordionColor
  const people = isStaffCard ? program.members : (program.interns ?? [])
  const teamLeads = program.teamLeads ?? (program.teamLead ? [program.teamLead] : [])
  const [editForm, setEditForm] = useState(() => createEditForm(program, isStaffCard))

  function handleAccordionToggle(isOpen) {
    if (!isControlled) {
      setLocalAccordionOpen(isOpen)
    }

    onAccordionToggle?.(isOpen)
  }

  function openEditor() {
    setEditForm(createEditForm(program, isStaffCard))
    setSaveError(null)
    setEditing(true)
  }

  function updateField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()

    const originalForm = createEditForm(program, isStaffCard)
    const membersChanged = isStaffCard
      ? editForm.staff.trim() !== originalForm.staff.trim()
      : editForm.fellow.trim() !== originalForm.fellow.trim()
        || editForm.teamLead.trim() !== originalForm.teamLead.trim()
        || editForm.interns.trim() !== originalForm.interns.trim()
    const members = isStaffCard
      ? peopleFromLines(editForm.staff, 'Staff')
      : [
        ...(editForm.fellow.trim()
          ? [{ name: editForm.fellow.trim(), role: 'Fellow' }]
          : []),
        ...peopleFromLines(editForm.teamLead, 'Team Lead'),
        ...peopleFromLines(editForm.interns, program.peopleRole ?? 'Intern'),
      ]

    try {
      setSaving(true)
      setSaveError(null)
      await onSave(program, {
        name: editForm.name.trim(),
        location: editForm.location.trim(),
        members,
        membersChanged,
      })
      setEditing(false)
    } catch (error) {
      setSaveError(error.message || 'Could not save this card.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete the ${program.name} card? This cannot be undone.`,
    )

    if (!confirmed) {
      return
    }

    try {
      setSaving(true)
      setSaveError(null)
      await onDelete(program)
      setEditing(false)
    } catch (error) {
      setSaveError(error.message || 'Could not delete this card.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        data-program-card={`${semesterId}:${program.id}`}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`${isAccordionOpen ? 'min-h-80' : 'min-h-40'} rounded-xl border-2 p-4 text-[#323232] shadow-[0_3px_10px_rgba(50,50,50,0.12)] ${colors} ${highlighted ? 'ring-4 ring-[#841617] ring-offset-4' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-[#841617]">{program.name}</h3>
            <span className="rounded bg-[#f0f0f0] px-1.5 py-0.5 text-xs font-semibold text-[#841617]">
              {people.length}
            </span>
          </div>
          <button
            type="button"
            onClick={openEditor}
            className="ml-auto rounded border border-[#841617] px-2 py-1 text-xs font-semibold text-[#841617] transition-colors hover:bg-[#841617] hover:text-white"
          >
            Edit
          </button>
        </div>

        <div className="mb-3 space-y-0.5 text-sm text-[#323232]">
          {program.location && (
            <p>
              <span className="text-[#5a5a5a]">Location:</span> {program.location}
            </p>
          )}
          {showsProject && program.project && (
            <p>
              <span className="text-[#5a5a5a]">Project:</span> {program.project}
            </p>
          )}
          {!isStaffCard && (
            <>
              <p
                className={program.fellow ? undefined : 'invisible'}
                aria-hidden={!program.fellow}
              >
                <span className="text-[#5a5a5a]">Fellow:</span> {program.fellow}
              </p>
              {teamLeads.length > 0 ? teamLeads.map((teamLead) => (
                <p
                  key={teamLead}
                  data-semester-id={semesterId}
                  data-team-lead={teamLead}
                >
                  <span className="text-[#5a5a5a]">Team Lead:</span> {teamLead}
                </p>
              )) : (
                <p>
                  <span className="text-[#5a5a5a]">Team Lead:</span>
                </p>
              )}
            </>
          )}
        </div>

        <InternsAccordion
          people={people}
          label={isStaffCard ? 'Staff' : program.peopleLabel ?? 'Interns'}
          linkable={!isStaffCard}
          semesterId={semesterId}
          open={isAccordionOpen}
          onToggle={handleAccordionToggle}
          buttonColor={accordionColors}
        />
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#323232]/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-${program.groupId}-title`}
        >
          <form
            onSubmit={handleSave}
            className="max-h-full w-full max-w-xl overflow-y-auto rounded-xl border-2 border-[#841617] bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id={`edit-${program.groupId}-title`} className="text-xl font-bold text-[#841617]">
                Edit card
              </h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-sm font-semibold text-[#5a5a5a] hover:text-[#841617] disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>

            <label className="mb-4 block text-sm font-medium text-[#323232]">
              Card name
              <input
                required
                value={editForm.name}
                onChange={(event) => updateField('name', event.target.value)}
                className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
              />
            </label>

            <label className="mb-4 block text-sm font-medium text-[#323232]">
              Location
              <input
                value={editForm.location}
                onChange={(event) => updateField('location', event.target.value)}
                className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
              />
            </label>

            {isStaffCard ? (
              <label className="mb-4 block text-sm font-medium text-[#323232]">
                Staff members
                <span className="mt-1 block text-xs font-normal text-[#5a5a5a]">
                  One person per line. Add an optional role after a vertical bar, for example: Jane Doe | Director.
                </span>
                <textarea
                  rows={8}
                  value={editForm.staff}
                  onChange={(event) => updateField('staff', event.target.value)}
                  className="mt-2 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
                />
              </label>
            ) : (
              <>
                <label className="mb-4 block text-sm font-medium text-[#323232]">
                  Fellow
                  <input
                    value={editForm.fellow}
                    onChange={(event) => updateField('fellow', event.target.value)}
                    className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
                  />
                </label>

                <label className="mb-4 block text-sm font-medium text-[#323232]">
                  Team leads
                  <span className="mt-1 block text-xs font-normal text-[#5a5a5a]">One person per line.</span>
                  <textarea
                    rows={3}
                    value={editForm.teamLead}
                    onChange={(event) => updateField('teamLead', event.target.value)}
                    className="mt-2 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
                  />
                </label>

                <label className="mb-4 block text-sm font-medium text-[#323232]">
                  Interns
                  <span className="mt-1 block text-xs font-normal text-[#5a5a5a]">One person per line.</span>
                  <textarea
                    rows={8}
                    value={editForm.interns}
                    onChange={(event) => updateField('interns', event.target.value)}
                    className="mt-2 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232]"
                  />
                </label>
              </>
            )}

            {saveError && <p className="mb-4 text-sm text-[#841617]">{saveError}</p>}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded px-4 py-2 text-sm font-semibold text-[#841617] hover:bg-[#f6e9cf] disabled:cursor-not-allowed"
              >
                Delete card
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded px-4 py-2 text-sm font-semibold text-[#323232] hover:bg-[#f0f0f0] disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-[#841617] px-4 py-2 text-sm font-semibold text-white hover:bg-[#681112] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
