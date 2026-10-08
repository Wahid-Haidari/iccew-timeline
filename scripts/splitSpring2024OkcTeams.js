import dotenv from 'dotenv'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.import' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.import')
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)
const applyChanges = process.argv.includes('--apply')
const teamDefinitions = [
  { name: 'OKC (Fizit)', projectName: 'Fizit' },
  { name: 'OKC (SummoxOne)', projectName: 'SummoxOne' },
]

function assertNoError(error, description) {
  if (error) {
    throw new Error(`${description}: ${error.message}`)
  }
}

const { data: semesters, error: semesterError } = await supabase
  .from('semesters')
  .select('id')
  .eq('year', 2024)
  .eq('term', 'Spring')

assertNoError(semesterError, 'Could not load Spring 2024')

if (semesters.length !== 1) {
  throw new Error(`Expected one Spring 2024 semester, found ${semesters.length}`)
}

const semesterId = semesters[0].id
const { data: semesterGroups, error: groupError } = await supabase
  .from('groups')
  .select('id, name, location, group_type, display_order')
  .eq('semester_id', semesterId)

assertNoError(groupError, 'Could not load Spring 2024 teams')

const originalGroup = semesterGroups.find((group) => group.name === 'OKC')
const existingNewTeams = teamDefinitions.filter((team) => (
  semesterGroups.some((group) => group.name === team.name)
))

if (!originalGroup) {
  const detail = existingNewTeams.length === teamDefinitions.length
    ? 'The Spring 2024 OKC teams are already split.'
    : 'The original Spring 2024 OKC team was not found.'
  throw new Error(detail)
}

if (existingNewTeams.length > 0) {
  throw new Error(`Found existing split team(s): ${existingNewTeams.map((team) => team.name).join(', ')}`)
}

const { data: originalProjects, error: projectError } = await supabase
  .from('projects')
  .select('id, name')
  .eq('group_id', originalGroup.id)

assertNoError(projectError, 'Could not load the OKC projects')

const projectNameById = new Map(originalProjects.map((project) => [project.id, project.name]))
const { data: originalMemberships, error: membershipError } = await supabase
  .from('memberships')
  .select('id, person_id, project_id, role, location')
  .eq('group_id', originalGroup.id)

assertNoError(membershipError, 'Could not load the OKC roster')

const membersByProject = new Map(teamDefinitions.map((team) => [team.projectName, []]))

for (const membership of originalMemberships) {
  const projectName = projectNameById.get(membership.project_id)

  if (!membersByProject.has(projectName)) {
    throw new Error(`Found an OKC member without a Fizit or SummoxOne project assignment.`)
  }

  membersByProject.get(projectName).push(membership)
}

for (const team of teamDefinitions) {
  if (membersByProject.get(team.projectName).length === 0) {
    throw new Error(`${team.projectName} has no members to move.`)
  }
}

console.log('Spring 2024 OKC split preview:')
for (const team of teamDefinitions) {
  console.log(`${team.name}: ${membersByProject.get(team.projectName).length} members`)
}

if (!applyChanges) {
  console.log('Dry run only. Re-run with --apply to make this split.')
  process.exit(0)
}

const originalDisplayOrder = originalGroup.display_order
const hasDisplayOrder = originalDisplayOrder !== null && originalDisplayOrder !== undefined

if (hasDisplayOrder) {
  const laterGroups = semesterGroups.filter((group) => (
    group.id !== originalGroup.id
    && group.display_order !== null
    && group.display_order !== undefined
    && group.display_order > originalDisplayOrder
  ))

  for (const group of laterGroups) {
    const { error } = await supabase
      .from('groups')
      .update({ display_order: group.display_order + 1 })
      .eq('id', group.id)

    assertNoError(error, `Could not make room in the Spring 2024 team order for ${group.name}`)
  }
}

const groupsToCreate = teamDefinitions.map((team, index) => ({
  semester_id: semesterId,
  name: team.name,
  location: originalGroup.location,
  group_type: originalGroup.group_type,
  is_staff: false,
  display_order: hasDisplayOrder ? originalDisplayOrder + index : null,
}))

const { data: createdGroups, error: createGroupsError } = await supabase
  .from('groups')
  .insert(groupsToCreate)
  .select('id, name')

assertNoError(createGroupsError, 'Could not create the split OKC teams')

const groupIdByName = new Map(createdGroups.map((group) => [group.name, group.id]))
const projectsToCreate = teamDefinitions.map((team) => ({
  group_id: groupIdByName.get(team.name),
  name: team.projectName,
}))
const { data: createdProjects, error: createProjectsError } = await supabase
  .from('projects')
  .insert(projectsToCreate)
  .select('id, group_id, name')

assertNoError(createProjectsError, 'Could not create the split OKC projects')

const projectIdByGroupAndName = new Map(
  createdProjects.map((project) => [`${project.group_id}:${project.name}`, project.id]),
)
const membershipsToCreate = teamDefinitions.flatMap((team) => {
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

console.log('Created OKC (Fizit) and OKC (SummoxOne), then removed the original OKC card.')
