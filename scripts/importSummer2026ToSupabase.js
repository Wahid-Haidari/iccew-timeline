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
const sheet = workbook.Sheets['complete 06-26']

if (!sheet) {
  throw new Error('Could not find the complete 06-26 sheet')
}

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim() || null
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  .slice(1)
  .map((row, index) => {
    const [cohort, team, fullName, role, project, location] = row

    return {
      excelRow: index + 2,
      fullName: clean(fullName),
      location: clean(location),
      project: clean(project),
      role: clean(role),
      team: clean(team),
      cohort: clean(cohort),
    }
  })
  .filter((row) => row.cohort === 'Summer 2026' && row.fullName && row.role)

if (rows.length === 0) {
  throw new Error('No Summer 2026 rows were found')
}

const staffRows = rows.filter((row) => row.team?.toLocaleLowerCase() === 'staff')
const teamRows = rows.filter((row) => row.team?.toLocaleLowerCase() !== 'staff')
const sourceTeamNames = [...new Set(teamRows.map((row) => row.team))]

if (sourceTeamNames.length !== 1) {
  throw new Error('Expected one non-staff Summer 2026 team name')
}

const sourceTeamName = sourceTeamNames[0]
const projectOrder = []
const membersByProject = new Map()

for (const row of teamRows) {
  if (!row.project) {
    throw new Error(`Summer 2026 row ${row.excelRow} is missing a project`)
  }

  if (!membersByProject.has(row.project)) {
    membersByProject.set(row.project, [])
    projectOrder.push(row.project)
  }

  membersByProject.get(row.project).push(row)
}

const groupDefinitions = [
  ...(staffRows.length > 0 ? [{
    displayOrder: 0,
    isStaff: true,
    members: staffRows,
    name: 'Staff',
    project: null,
  }] : []),
  ...projectOrder.map((project, index) => ({
    displayOrder: index + (staffRows.length > 0 ? 1 : 0),
    isStaff: false,
    members: membersByProject.get(project),
    name: `${sourceTeamName} ${index + 1}`,
    project,
  })),
]

const { data: savedSemesters, error: semesterError } = await supabase
  .from('semesters')
  .upsert({ term: 'Summer', year: 2026 }, { onConflict: 'year,term' })
  .select('id')

if (semesterError) {
  throw new Error(`Could not save Summer 2026: ${semesterError.message}`)
}

const semesterId = savedSemesters[0]?.id

if (!semesterId) {
  throw new Error('Could not find the saved Summer 2026 semester')
}

const { data: savedGroups, error: groupError } = await supabase
  .from('groups')
  .upsert(
    groupDefinitions.map((group) => ({
      display_order: group.displayOrder,
      group_type: group.isStaff ? 'Staff' : 'Summer Non-Profit',
      is_staff: group.isStaff,
      location: [...new Set(group.members.map((member) => member.location).filter(Boolean))].length === 1
        ? group.members[0].location
        : null,
      name: group.name,
      semester_id: semesterId,
    })),
    { onConflict: 'semester_id,name' },
  )
  .select('id,name')

if (groupError) {
  throw new Error(`Could not save Summer 2026 teams: ${groupError.message}`)
}

const groupIds = new Map(savedGroups.map((group) => [group.name, group.id]))
const people = [...new Map(
  groupDefinitions.flatMap((group) => group.members).map((member) => [
    member.fullName,
    { full_name: member.fullName },
  ]),
).values()]

const { data: savedPeople, error: peopleError } = await supabase
  .from('people')
  .upsert(people, { onConflict: 'full_name' })
  .select('id,full_name')

if (peopleError) {
  throw new Error(`Could not save Summer 2026 people: ${peopleError.message}`)
}

const personIds = new Map(savedPeople.map((person) => [person.full_name, person.id]))
const projectsToSave = groupDefinitions
  .filter((group) => group.project)
  .map((group) => ({ group_id: groupIds.get(group.name), name: group.project }))

const { data: savedProjects, error: projectError } = await supabase
  .from('projects')
  .upsert(projectsToSave, { onConflict: 'group_id,name' })
  .select('id,group_id,name')

if (projectError) {
  throw new Error(`Could not save Summer 2026 projects: ${projectError.message}`)
}

const projectIds = new Map(
  savedProjects.map((project) => [`${project.group_id}:${project.name}`, project.id]),
)
const memberships = groupDefinitions.flatMap((group) => {
  const groupId = groupIds.get(group.name)
  const projectId = group.project ? projectIds.get(`${groupId}:${group.project}`) : null

  return group.members.map((member) => ({
    group_id: groupId,
    location: member.location,
    person_id: personIds.get(member.fullName),
    project_id: projectId,
    role: member.role,
  }))
})

const groupIdsToCheck = [...groupIds.values()]
const { data: existingMemberships, error: existingMembershipError } = await supabase
  .from('memberships')
  .select('group_id,project_id,person_id,role')
  .in('group_id', groupIdsToCheck)

if (existingMembershipError) {
  throw new Error(`Could not check existing Summer 2026 memberships: ${existingMembershipError.message}`)
}

const existingMembershipKeys = new Set(
  existingMemberships.map((membership) => (
    `${membership.group_id}:${membership.project_id ?? 'none'}:${membership.person_id}:${membership.role}`
  )),
)
const newMemberships = memberships.filter((membership) => !existingMembershipKeys.has(
  `${membership.group_id}:${membership.project_id ?? 'none'}:${membership.person_id}:${membership.role}`,
))

if (newMemberships.length > 0) {
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert(newMemberships)

  if (membershipError) {
    throw new Error(`Could not save Summer 2026 memberships: ${membershipError.message}`)
  }
}

console.log(`Imported ${groupDefinitions.length} Summer 2026 cards.`)
for (const group of groupDefinitions) {
  console.log(`${group.name}: ${group.project ?? 'staff roster'}`)
}
