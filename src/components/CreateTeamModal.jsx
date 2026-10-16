import { useState } from 'react'

function createInitialForm() {
  return {
    semesterId: '',
    name: '',
    location: '',
    fellow: '',
    teamLead: '',
    interns: '',
  }
}

function peopleFromLines(value, defaultRole) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, role: defaultRole }))
}

function semesterOptions(semesters) {
  const options = semesters.map((semester) => ({
    id: semester.id,
    label: semester.label,
  }))
  const years = new Set(
    semesters
      .map((semester) => Number(semester.id.match(/-(\d{4})$/)?.[1]))
      .filter(Number.isInteger),
  )

  for (const year of years) {
    const summerId = `summer-${year}`

    if (!options.some((option) => option.id === summerId)) {
      options.push({
        id: `new:Summer:${year}`,
        label: `Summer ${year}`,
      })
    }
  }

  const termOrder = { Spring: 1, Summer: 2, Fall: 3 }

  return options.sort((a, b) => {
    const [, aTerm, aYear] = a.id.match(/^(?:new:)?(Spring|Summer|Fall)[:-](\d{4})$/i) ?? []
    const [, bTerm, bYear] = b.id.match(/^(?:new:)?(Spring|Summer|Fall)[:-](\d{4})$/i) ?? []

    return Number(aYear) - Number(bYear)
      || termOrder[aTerm?.[0].toUpperCase() + aTerm?.slice(1).toLowerCase()]
        - termOrder[bTerm?.[0].toUpperCase() + bTerm?.slice(1).toLowerCase()]
  })
}

export default function CreateTeamModal({ semesters, onClose, onCreate }) {
  const [form, setForm] = useState(createInitialForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const options = semesterOptions(semesters)

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const name = form.name.trim()

    if (!form.semesterId) {
      setSaveError('Choose a semester for this team.')
      return
    }

    if (!name) {
      setSaveError('Enter a team name.')
      return
    }

    const isStaff = name.toLocaleLowerCase() === 'staff'
    const selectedSemester = semesters.find((semester) => semester.id === form.semesterId)
    const hasStaffCard = selectedSemester?.programs.some(
      (program) => program.name.toLocaleLowerCase() === 'staff',
    )

    if (isStaff && hasStaffCard) {
      setSaveError('This semester already has a Staff card.')
      return
    }

    const members = [
      ...(form.fellow.trim()
        ? [{ name: form.fellow.trim(), role: 'Fellow' }]
        : []),
      ...(form.teamLead.trim()
        ? [{ name: form.teamLead.trim(), role: 'Team Lead' }]
        : []),
      ...peopleFromLines(form.interns, 'Intern'),
    ]

    try {
      setSaving(true)
      setSaveError(null)
      await onCreate({
        semesterId: form.semesterId,
        name,
        isStaff,
        location: form.location.trim(),
        members,
      })
      onClose()
    } catch (error) {
      setSaveError(error.message || 'Could not create this team.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#323232]/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-team-title"
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-xl border-2 border-[#841617] bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 id="create-team-title" className="text-xl font-bold text-[#841617]">
              Add team
            </h2>
            <p className="mt-1 text-sm text-[#5a5a5a]">
              Add a team to any semester and include its starting roster.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm font-semibold text-[#5a5a5a] hover:text-[#841617] disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Semester
          <select
            required
            value={form.semesterId}
            onChange={(event) => updateField('semesterId', event.target.value)}
            disabled={saving || options.length === 0}
            className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          >
            <option value="" disabled>
              {options.length === 0 ? 'No semesters available' : 'Select a semester'}
            </option>
            {options.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Team name
          <input
            required
            autoFocus
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Location
          <input
            value={form.location}
            onChange={(event) => updateField('location', event.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Fellow
          <input
            value={form.fellow}
            onChange={(event) => updateField('fellow', event.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Team lead
          <input
            value={form.teamLead}
            onChange={(event) => updateField('teamLead', event.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-[#323232]">
          Interns
          <span className="mt-1 block text-xs font-normal text-[#5a5a5a]">
            One person per line.
          </span>
          <textarea
            rows={8}
            value={form.interns}
            onChange={(event) => updateField('interns', event.target.value)}
            disabled={saving}
            className="mt-2 w-full rounded border border-[#323232]/40 bg-white px-3 py-2 text-[#323232] disabled:cursor-not-allowed disabled:bg-[#f0f0f0]"
          />
        </label>

        {saveError && <p className="mb-4 text-sm text-[#841617]">{saveError}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded px-4 py-2 text-sm font-semibold text-[#323232] hover:bg-[#f0f0f0] disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || options.length === 0}
            className="rounded bg-[#841617] px-4 py-2 text-sm font-semibold text-white hover:bg-[#681112] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create team'}
          </button>
        </div>
      </form>
    </div>
  )
}
