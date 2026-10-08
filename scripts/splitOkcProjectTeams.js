import dotenv from 'dotenv'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.import' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.import')
}

const configurations = {
  'spring-2022': {
    year: 2022,
    term: 'Spring',
    teams: [
      { name: 'OKC (Talento)', projectName: 'Talento' },
      { name: 'OKC (OU Med)', projectName: 'OU Med' },
    ],
  },
}
const configurationKey = process.argv.find((argument) => argument.startsWith('--semester='))
  ?.slice('--semester='.length)
const configuration = configurations[configurationKey]
const applyChanges = process.argv.includes('--apply')

if (!configuration) {
  throw new Error(`Choose one of: ${Object.keys(configurations).map((key) => `--semester=${key}`).join(', ')}`)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)
const { year, term, teams } = configuration
const semesterLabel = `${term} ${year}`

function assertNoError(error, description) {
  if (error) {
    throw new Error(`${description}: ${error.message}`)
  }
}

const { data: semesters, error: semesterError } = await supabase
  .from('semesters')
  .select('id')
  .eq('year', year)
  .eq('term', term)

assertNoError(semesterError, `Could not load ${semesterLabel}`)

if (semesters.length !== 1) {
  throw new Error(`Expected one ${semesterLabel} semester, found ${semesters.length}`)
}

const semesterId = semesters[0].id
const { data: semesterGroups, error: groupError } = await supabase
  .from('groups')
  .select('id, name, location, group_type, display_order')
  .eq('semester_id', semesterId)

assertNoError(groupError, `Could not load ${semesterLabel} teams`)

const originalGroup = semesterGroups.find((group) => group.name === 'OKC')
const existingSplitTeams = teams.filter((team) => (
  semesterGroups.some((group) => group.name === team.name)
))

if (!originalGroup) {
  const detail = existingSplitTeams.length === teams.length
    ? `${semesterLabel} OKC is already split.`
    : `The original ${semesterLabel} OKC team was not found.`
  throw new Error(detail)
}

if (existingSplitTeams.length > 0) {
  throw new Error(`Found existing split team(s): ${existingSplitTeams.map((team) => team.name).join(', ')}`)
}

const { data: originalProjects, error: projectError } = await supabase
  .from('projects')
  .select('id, name')
  .eq('group_id', originalGroup.id)

assertNoError(projectError, 'Could not load the original OKC projects')

const projectNameById = new Map(originalProjects.map((project) => [project.id, project.name]))
const { data: originalMemberships, error: membershipError } = await supabase
  .from('memberships')
  .select('person_id, project_id, role, location')
  .eq('group_id', originalGroup.id)

assertNoError(membershipError, 'Could not load the original OKC roster')

const membersByProject = new Map(teams.map((team) => [team.projectName, []]))

for (const membership of originalMemberships) {
  const projectName = projectNameById.get(membership.project_id)

  if (!membersByProject.has(projectName)) {
    throw new Error('Found an OKC member without an expected project assignment.')
  }

  membersByProject.get(projectName).push(membership)
}

for (const team of teams) {
  if (membersByProject.get(team.projectName).length === 0) {
    throw new Error(`${team.projectName} has no members to move.`)
  }
}

console.log(`${semesterLabel} OKC split preview:`)
for (const team of teams) {
  console.log(`${team.name}: ${membersByProject.get(team.projectName).length} members`)
}

if (!applyChanges) {
  console.log('Dry run only. Re-run with --apply to make this split.')
  process.exit(0)
}

const hasDisplayOrder = originalGroup.display_order !== null
  && originalGroup.display_order !== undefined

if (hasDisplayOrder) {
  const laterGroups = semesterGroups.filter((group) => (
    group.id !== originalGroup.id
    && group.display_order !== null
    && group.display_order !== undefined
    && group.display_order > originalGroup.display_order
  ))

  for (const group of laterGroups) {
    const { error } = await supabase
      .from('groups')
      .update({ display_order: group.display_order + teams.length - 1 })
      .eq('id', group.id)

    assertNoError(error, `Could not make room in the team order for ${group.name}`)
  }
}

const { data: createdGroups, error: createGroupsError } = await supabase
  .from('groups')
  .insert(teams.map((team, index) => ({
    semester_id: semesterId,
    name: team.name,
    location: originalGroup.location,
    group_type: originalGroup.group_type,
    is_staff: false,
    display_order: hasDisplayOrder ? originalGroup.display_order + index : null,
  })))
  .select('id, name')

assertNoError(createGroupsError, 'Could not create the split OKC teams')

const groupIdByName = new Map(createdGroups.map((group) => [group.name, group.id]))
const { data: createdProjects, error: createProjectsError } = await supabase
  .from('projects')
  .insert(teams.map((team) => ({
    group_id: groupIdByName.get(team.name),
    name: team.projectName,
  })))
  .select('id, group_id, name')

assertNoError(createProjectsError, 'Could not create the split OKC projects')

const projectIdByGroupAndName = new Map(
  createdProjects.map((project) => [`${project.group_id}:${project.name}`, project.id]),
)
const membershipsToCreate = teams.flatMap((team) => {
  const groupId = groupIdByName.get(team.name)
  const projectId = projectIdByGroupAndName.get(`${groupId}:${team.projectName}`)

  return membersByProject.get(team.projectName).map((membership) => ({
    group_id: groupId,
    location: membership.location,
    person_id: membership.person_id,
    project_id: projectId,
    role: membership.role,
  }))
})
const { error: createMembershipsError } = await supabase
  .from('memberships')
  .insert(membershipsToCreate)

assertNoError(createMembershipsError, 'Could not move the OKC roster')

const { error: deleteMembershipsError } = await supabase
  .from('memberships')
  .delete()
  .eq('group_id', originalGroup.id)

assertNoError(deleteMembershipsError, 'Could not clear the original OKC roster')

const { error: deleteProjectsError } = await supabase
  .from('projects')
  .delete()
  .eq('group_id', originalGroup.id)

assertNoError(deleteProjectsError, 'Could not remove the original OKC projects')

const { error: deleteGroupError } = await supabase
  .from('groups')
  .delete()
  .eq('id', originalGroup.id)

assertNoError(deleteGroupError, 'Could not remove the original OKC team')

console.log(`Created ${teams.map((team) => team.name).join(' and ')}, then removed the original OKC card.`)
