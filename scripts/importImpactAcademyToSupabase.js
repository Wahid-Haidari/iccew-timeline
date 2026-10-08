import dotenv from 'dotenv'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

dotenv.config({ path: '.env.import' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.import')
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)
const workbook = XLSX.readFile('src/data/I-CCEW Combined Family Tree 2006-2026.xlsx')
const impactAcademySheet = workbook.Sheets['Impact Academy']
const unassignedProject = '__unassigned__'

if (!impactAcademySheet) {
  throw new Error('Could not find the Impact Academy sheet')
}

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim() || null
}

function parseSummerCohort(cohort) {
  const match = cohort.match(/^Summer\s+(\d{4})$/i)

  if (!match) {
    throw new Error(`Could not understand Impact Academy cohort: ${cohort}`)
  }

  return { year: Number(match[1]), term: 'Summer' }
}

function splitProjects(project) {
  return project ? project.split(',').map((item) => item.trim()).filter(Boolean) : [unassignedProject]
}

function normalizeProject(project) {
  return project.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function resolveProject(project, semester, excelRow) {
  if (semester.projectSet.has(project)) {
    return project
  }

  const normalizedProject = normalizeProject(project)
  const matches = semester.projectOrder.filter((candidate) => {
    const normalizedCandidate = normalizeProject(candidate)

    return normalizedCandidate.startsWith(normalizedProject)
      || normalizedProject.startsWith(normalizedCandidate)
  })

  if (matches.length === 1) {
    return matches[0]
  }

  throw new Error(
    `Impact Academy row ${excelRow} references an unknown or ambiguous project: ${project}`,
  )
}

const sheetRows = XLSX.utils.sheet_to_json(impactAcademySheet, {
  header: 1,
  defval: null,
})

const rows = sheetRows.slice(1).map((row, index) => {
  const [cohort, team, fullName, role, project, location] = row

  return {
    cohort: clean(cohort),
    excelRow: index + 2,
    fullName: clean(fullName),
    location: clean(location),
    project: clean(project),
    role: clean(role),
    team: clean(team),
  }
}).filter((row) => row.cohort && row.fullName && row.role)

const semestersByKey = new Map()

for (const row of rows) {
  const { year, term } = parseSummerCohort(row.cohort)
  const key = `${year}-${term}`

  if (!semestersByKey.has(key)) {
    semestersByKey.set(key, {
      groups: new Map(),
      projectOrder: [],
      projectSet: new Set(),
      term,
      year,
    })
  }

  const semester = semestersByKey.get(key)

  // The intern rows establish the numbered project order. Team leads can
  // cover multiple projects and are assigned to each matching team below.
  if (row.role.toLowerCase() === 'intern' && row.project && !semester.projectSet.has(row.project)) {
    semester.projectSet.add(row.project)
    semester.projectOrder.push(row.project)
  }
}

for (const row of rows) {
  const { year, term } = parseSummerCohort(row.cohort)
  const semester = semestersByKey.get(`${year}-${term}`)
  const projectKeys = splitProjects(row.project)

  for (const projectReference of projectKeys) {
    const project = projectReference === unassignedProject
      ? unassignedProject
      : resolveProject(projectReference, semester, row.excelRow)

    if (!semester.groups.has(project)) {
      semester.groups.set(project, {
        locations: new Set(),
        members: [],
        project,
      })
    }

    const group = semester.groups.get(project)

    group.members.push({
      fullName: row.fullName,
      location: row.location,
      role: row.role,
    })

    if (row.location) {
      group.locations.add(row.location)
    }
  }
}

const semesterPayload = [...semestersByKey.values()]
  .sort((first, second) => first.year - second.year)
  .map(({ term, year }) => ({ term, year }))

const { data: savedSemesters, error: semesterError } = await supabase
  .from('semesters')
  .upsert(semesterPayload, { onConflict: 'year,term' })
  .select('id,year,term')

if (semesterError) {
  throw new Error(`Could not save Impact Academy semesters: ${semesterError.message}`)
}

const semesterIds = new Map(
  savedSemesters.map((semester) => [`${semester.year}-${semester.term}`, semester.id]),
)
const groupsToSave = []
const groupDefinitions = []

for (const [semesterKey, semester] of semestersByKey) {
  const semesterId = semesterIds.get(semesterKey)

  if (!semesterId) {
    throw new Error(`Could not find the saved semester for ${semesterKey}`)
  }

  const orderedProjects = [
    ...semester.projectOrder,
    ...(semester.groups.has(unassignedProject) ? [unassignedProject] : []),
  ]

  for (const [index, project] of orderedProjects.entries()) {
    const group = semester.groups.get(project)
    const name = `Impact Academy ${index + 1}`

    groupsToSave.push({
      display_order: index,
      group_type: 'Impact Academy',
      is_staff: false,
      location: group.locations.size === 1 ? [...group.locations][0] : null,
      name,
      semester_id: semesterId,
    })
    groupDefinitions.push({ group, name, project, semesterId })
  }
}

const { data: savedGroups, error: groupError } = await supabase
  .from('groups')
  .upsert(groupsToSave, { onConflict: 'semester_id,name' })
  .select('id,semester_id,name')

if (groupError) {
  throw new Error(`Could not save Impact Academy teams: ${groupError.message}`)
}

const groupIds = new Map(
  savedGroups.map((group) => [`${group.semester_id}:${group.name}`, group.id]),
)
const peopleToSave = new Map()

for (const { group } of groupDefinitions) {
  for (const member of group.members) {
    peopleToSave.set(member.fullName, { full_name: member.fullName })
  }
}

const { data: savedPeople, error: peopleError } = await supabase
  .from('people')
  .upsert([...peopleToSave.values()], { onConflict: 'full_name' })
  .select('id,full_name')

if (peopleError) {
  throw new Error(`Could not save Impact Academy people: ${peopleError.message}`)
}

const peopleIds = new Map(savedPeople.map((person) => [person.full_name, person.id]))
const projectsToSave = []

for (const definition of groupDefinitions) {
  if (definition.project === unassignedProject) {
    continue
  }

  const groupId = groupIds.get(`${definition.semesterId}:${definition.name}`)

  projectsToSave.push({ group_id: groupId, name: definition.project })
}

const { data: savedProjects, error: projectError } = projectsToSave.length > 0
  ? await supabase
    .from('projects')
    .upsert(projectsToSave, { onConflict: 'group_id,name' })
    .select('id,group_id,name')
  : { data: [], error: null }

if (projectError) {
  throw new Error(`Could not save Impact Academy projects: ${projectError.message}`)
}

const projectIds = new Map(
  savedProjects.map((project) => [`${project.group_id}:${project.name}`, project.id]),
)
const membershipsToSave = []

for (const definition of groupDefinitions) {
  const groupId = groupIds.get(`${definition.semesterId}:${definition.name}`)
  const projectId = definition.project === unassignedProject
    ? null
    : projectIds.get(`${groupId}:${definition.project}`)

  for (const member of definition.group.members) {
    const personId = peopleIds.get(member.fullName)

    if (!personId) {
      throw new Error(`Could not find the saved person for ${member.fullName}`)
    }

    membershipsToSave.push({
      group_id: groupId,
      location: member.location,
      person_id: personId,
      project_id: projectId,
      role: member.role,
    })
  }
}

const { error: membershipError } = await supabase
  .from('memberships')
  .upsert(membershipsToSave, { onConflict: 'group_id,project_id,person_id,role' })

if (membershipError) {
  throw new Error(`Could not save Impact Academy memberships: ${membershipError.message}`)
}

console.log(`Imported ${groupsToSave.length} Impact Academy teams across ${semesterPayload.length} summer semesters.`)
for (const definition of groupDefinitions) {
  console.log(`${definition.name}: ${definition.project === unassignedProject ? 'no project listed' : definition.project}`)
}
