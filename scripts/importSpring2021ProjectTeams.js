import dotenv from 'dotenv'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.import' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.import')
}

const teams = [
  {
    name: 'Babel Analytics',
    location: 'Norman',
    members: [
      { name: 'Rijutha Garimella', role: 'Team Lead' },
      { name: 'Harsh Patel', role: 'Intern' },
      { name: 'Dilina Abudurexiti', role: 'Intern' },
    ],
  },
  {
    name: 'Food Business Connector',
    location: 'Norman',
    members: [
      { name: 'Drew Yamashita', role: 'Fellow' },
      { name: 'Richard Papenfus', role: 'Team Lead' },
      { name: 'Emma Biskup', role: 'Intern' },
      { name: 'Joy Nath', role: 'Intern' },
      { name: 'Kate Wheeler', role: 'Intern' },
      { name: 'Haydn Hoffman', role: 'Intern' },
    ],
  },
]
const applyChanges = process.argv.includes('--apply')
const supabase = createClient(supabaseUrl, supabaseSecretKey)

function assertNoError(error, description) {
  if (error) {
    throw new Error(`${description}: ${error.message}`)
  }
}

const { data: semesters, error: semesterError } = await supabase
  .from('semesters')
  .select('id')
  .eq('year', 2021)
  .eq('term', 'Spring')

assertNoError(semesterError, 'Could not load Spring 2021')

if (semesters.length !== 1) {
  throw new Error(`Expected one Spring 2021 semester, found ${semesters.length}`)
}

const semesterId = semesters[0].id
const { data: existingGroups, error: groupError } = await supabase
  .from('groups')
  .select('name')
  .eq('semester_id', semesterId)

assertNoError(groupError, 'Could not load Spring 2021 teams')

const existingTeamNames = teams
  .filter((team) => existingGroups.some((group) => group.name === team.name))
  .map((team) => team.name)

if (existingTeamNames.length > 0) {
  throw new Error(`These Spring 2021 cards already exist: ${existingTeamNames.join(', ')}`)
}

console.log('Spring 2021 project team preview:')
for (const team of teams) {
  console.log(`${team.name}: ${team.members.length} members`)
}

if (!applyChanges) {
  console.log('Dry run only. Re-run with --apply to add these cards.')
  process.exit(0)
}

const { data: createdGroups, error: createGroupsError } = await supabase
  .from('groups')
  .insert(teams.map((team) => ({
    semester_id: semesterId,
    name: team.name,
    location: team.location,
    is_staff: false,
    group_type: 'Project Team',
    display_order: null,
  })))
  .select('id, name')

assertNoError(createGroupsError, 'Could not create the Spring 2021 project teams')

const groupIdByName = new Map(createdGroups.map((group) => [group.name, group.id]))
const people = [...new Map(
  teams.flatMap((team) => team.members).map((member) => [
    member.name,
    { full_name: member.name },
  ]),
).values()]
const { data: savedPeople, error: peopleError } = await supabase
  .from('people')
  .upsert(people, { onConflict: 'full_name' })
  .select('id, full_name')

assertNoError(peopleError, 'Could not save the Spring 2021 project team members')

const personIdByName = new Map(savedPeople.map((person) => [person.full_name, person.id]))
const memberships = teams.flatMap((team) => team.members.map((member) => ({
  group_id: groupIdByName.get(team.name),
  location: team.location,
  person_id: personIdByName.get(member.name),
  project_id: null,
  role: member.role,
})))
const { error: membershipError } = await supabase
  .from('memberships')
  .insert(memberships)

assertNoError(membershipError, 'Could not add the Spring 2021 project team rosters')

console.log(`Added ${teams.map((team) => team.name).join(' and ')} to Spring 2021.`)
