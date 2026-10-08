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
const sheet = workbook.Sheets['The Mine']

if (!sheet) {
  throw new Error('Could not find the The Mine sheet')
}

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim() || null
}

function parseCohort(cohort) {
  const legacyMatch = cohort.match(/^(\d{4})-(\d{4})$/)

  if (legacyMatch) {
    return { legacy: true, year: Number(legacyMatch[1]) }
  }

  if (/^\d{4}$/.test(cohort)) {
    return { legacy: false, year: Number(cohort) }
  }

  throw new Error(`Could not understand The Mine cohort: ${cohort}`)
}

function membershipRole(role, legacy) {
  if (!legacy) {
    return 'Participant'
  }

  return role.toLocaleLowerCase().includes('team lead') || role.toLocaleLowerCase().includes('staff/tl')
    ? 'Team Lead'
    : 'Intern'
}

function legacyProjectName(project) {
  return project.replace(/\s*\([^)]*\)\s*$/, '')
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  .slice(1)
  .map((row, index) => {
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
  })
  .filter((row) => row.cohort && row.fullName && row.role && row.project)

const semestersByYear = new Map()

for (const row of rows) {
  const { legacy, year } = parseCohort(row.cohort)
  const project = legacy ? legacyProjectName(row.project) : row.project

  if (!semestersByYear.has(year)) {
    semestersByYear.set(year, {
      groups: new Map(),
      legacy,
      projectOrder: [],
      year,
    })
  }

  const semester = semestersByYear.get(year)

  if (semester.legacy !== legacy) {
    throw new Error(`The Mine Fall ${year} mixes legacy and entrepreneur records`)
  }

  if (!semester.groups.has(project)) {
    semester.groups.set(project, {
      locations: new Set(),
      members: [],
      project,
    })
    semester.projectOrder.push(project)
  }

  const group = semester.groups.get(project)

  group.members.push({
    fullName: row.fullName,
    location: row.location,
    role: membershipRole(row.role, legacy),
  })

  if (row.location) {
    group.locations.add(row.location)
  }
}

const semesterPayload = [...semestersByYear.values()]
  .sort((first, second) => first.year - second.year)
  .map(({ year }) => ({ term: 'Fall', year }))

const { data: savedSemesters, error: semesterError } = await supabase
  .from('semesters')
  .upsert(semesterPayload, { onConflict: 'year,term' })
  .select('id,year,term')

if (semesterError) {
  throw new Error(`Could not save The Mine semesters: ${semesterError.message}`)
}

const semesterIds = new Map(
  savedSemesters.map((semester) => [`${semester.year}-${semester.term}`, semester.id]),
)
const groupDefinitions = []
const groupsToSave = []

for (const semester of semestersByYear.values()) {
  const semesterId = semesterIds.get(`${semester.year}-Fall`)

  if (!semesterId) {
    throw new Error(`Could not find Fall ${semester.year} after saving semesters`)
  }

  for (const [index, project] of semester.projectOrder.entries()) {
    const group = semester.groups.get(project)
    const name = semester.legacy
      ? `The Mine ${index + 1}`
      : `The Mine — ${project}`

    groupsToSave.push({
      group_type: semester.legacy ? 'The Mine Project' : 'The Mine Entrepreneur',
      is_staff: false,
      location: group.locations.size === 1 ? [...group.locations][0] : null,
      name,
      semester_id: semesterId,
    })
    groupDefinitions.push({
      group,
      isLegacy: semester.legacy,
      name,
      semesterId,
    })
  }
}

const { data: savedGroups, error: groupError } = await supabase
  .from('groups')
  .upsert(groupsToSave, { onConflict: 'semester_id,name' })
  .select('id,name,semester_id')

if (groupError) {
  throw new Error(`Could not save The Mine teams: ${groupError.message}`)
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
  throw new Error(`Could not save The Mine people: ${peopleError.message}`)
}

const personIds = new Map(savedPeople.map((person) => [person.full_name, person.id]))
const projectsToSave = groupDefinitions
  .filter((definition) => definition.isLegacy)
  .map((definition) => ({
    group_id: groupIds.get(`${definition.semesterId}:${definition.name}`),
    name: definition.group.project,
  }))

const { data: savedProjects, error: projectError } = projectsToSave.length > 0
  ? await supabase
    .from('projects')
    .upsert(projectsToSave, { onConflict: 'group_id,name' })
    .select('id,group_id,name')
  : { data: [], error: null }

if (projectError) {
  throw new Error(`Could not save The Mine projects: ${projectError.message}`)
}

const projectIds = new Map(
  savedProjects.map((project) => [`${project.group_id}:${project.name}`, project.id]),
)
const memberships = groupDefinitions.flatMap((definition) => {
  const groupId = groupIds.get(`${definition.semesterId}:${definition.name}`)
  const projectId = definition.isLegacy
    ? projectIds.get(`${groupId}:${definition.group.project}`)
    : null

  return definition.group.members.map((member) => ({
    group_id: groupId,
    location: member.location,
    person_id: personIds.get(member.fullName),
    project_id: projectId,
    role: member.role,
  }))
})

const { data: existingMemberships, error: existingMembershipError } = await supabase
  .from('memberships')
  .select('group_id,project_id,person_id,role')
  .in('group_id', [...new Set(memberships.map((membership) => membership.group_id))])

if (existingMembershipError) {
  throw new Error(`Could not check existing The Mine memberships: ${existingMembershipError.message}`)
}

const membershipKey = (membership) => (
  `${membership.group_id}:${membership.project_id ?? 'none'}:${membership.person_id}:${membership.role}`
)
const existingMembershipKeys = new Set(existingMemberships.map(membershipKey))
const newMemberships = memberships.filter(
  (membership) => !existingMembershipKeys.has(membershipKey(membership)),
)

if (newMemberships.length > 0) {
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert(newMemberships)

  if (membershipError) {
    throw new Error(`Could not save The Mine memberships: ${membershipError.message}`)
  }
}

const legacyTeamCount = groupDefinitions.filter((definition) => definition.isLegacy).length
const entrepreneurTeamCount = groupDefinitions.length - legacyTeamCount

console.log(
  `Imported ${legacyTeamCount} legacy project teams and ${entrepreneurTeamCount} entrepreneur teams from The Mine.`,
)
