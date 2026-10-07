import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

dotenv.config({ path: ".env.import" });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.import");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

// Test Supabase connection
const { data, error } = await supabase.from("semesters").select("*").limit(1);

if (error) {
  console.error("Supabase connection failed:", error.message);
  process.exit(1);
}

console.log("Connected to Supabase successfully.");

// Read Excel workbook
const excelPath = "src/data/I-CCEW Combined Family Tree 2006-2026.xlsx";

const workbook = XLSX.readFile(excelPath);

// Use only this sheet
const sheetName = "complete 06-26";
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
  throw new Error(`Could not find sheet: ${sheetName}`);
}

// Read raw rows
const rawRows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: null,
});

// We only want Excel rows 1 through 1543
const rowsToImport = rawRows.slice(1, 1449);

// Convert rows into clean objects
const parsedRows = rowsToImport
  .map((row, index) => {
    const [cohort, group, fullName, role, project, location] = row;

    return {
      excelRow: index + 2,
      cohort: cohort !== null ? String(cohort).trim() : null,
      group: group !== null ? String(group).trim() : null,
      fullName: fullName !== null ? String(fullName).trim() : null,
      role: role !== null ? String(role).trim() : null,
      project: project !== null ? String(project).trim() : null,
      location: location !== null ? String(location).trim() : null,
    };
  })
  .filter((row) => {
    return row.cohort && row.group && row.fullName && row.role;
  });

function parseCohort(cohort) {
  const parts = cohort.trim().split(/\s+/);

  let year;
  let term;

  // Example: "2006 Fall"
  if (/^\d{4}$/.test(parts[0])) {
    year = Number(parts[0]);
    term = parts[1];
  }
  // Example: "Fall 2026"
  else if (/^\d{4}$/.test(parts[1])) {
    term = parts[0];
    year = Number(parts[1]);
  } else {
    throw new Error(`Could not understand cohort: ${cohort}`);
  }

  return { year, term };
}

const semesters = [
  ...new Map(
    parsedRows.map((row) => {
      const semester = parseCohort(row.cohort);

      return [`${semester.year}-${semester.term}`, semester];
    }),
  ).values(),
];

console.log("\nSemesters found:");
console.log(semesters);

// Insert semesters into Supabase
const { data: insertedSemesters, error: semesterError } = await supabase
  .from("semesters")
  .upsert(semesters, {
    onConflict: "year,term",
  })
  .select();

if (semesterError) {
  console.error("Error inserting semesters:", semesterError.message);
  process.exit(1);
}

console.log("\nSemesters successfully saved to Supabase:", insertedSemesters.length);

// Create a lookup from semester -> Supabase semester ID
const semesterIdMap = new Map(insertedSemesters.map((semester) => [`${semester.year}-${semester.term}`, semester.id]));

// Build unique groups for each semester
const groupMap = new Map();

for (const row of parsedRows) {
  const { year, term } = parseCohort(row.cohort);

  const semesterId = semesterIdMap.get(`${year}-${term}`);

  if (!semesterId) {
    throw new Error(`Could not find semester ID for ${row.cohort}`);
  }

  const key = `${semesterId}|||${row.group}`;

  if (!groupMap.has(key)) {
    groupMap.set(key, {
      semester_id: semesterId,
      name: row.group,
      locations: new Set(),
      is_staff: row.group.toLowerCase() === "staff",
    });
  }

  if (row.location) {
    groupMap.get(key).locations.add(row.location);
  }
}

// Prepare groups for Supabase
const groups = [...groupMap.values()].map((group) => {
  const locations = [...group.locations];

  return {
    semester_id: group.semester_id,
    name: group.name,

    // If everyone in the group has the same location,
    // store that location at the group level.
    // If locations differ, keep group location null.
    location: locations.length === 1 ? locations[0] : null,

    is_staff: group.is_staff,

    group_type: group.is_staff ? "Staff" : null,
  };
});

console.log("\nUnique groups found:", groups.length);

// Insert groups into Supabase
const { data: insertedGroups, error: groupError } = await supabase
  .from("groups")
  .upsert(groups, {
    onConflict: "semester_id,name",
  })
  .select();

if (groupError) {
  console.error("Error inserting groups:", groupError.message);
  process.exit(1);
}

console.log("Groups successfully saved to Supabase:", insertedGroups.length);

// Build unique people list
const people = [
  ...new Map(
    parsedRows.map((row) => [
      row.fullName,
      {
        full_name: row.fullName,
      },
    ]),
  ).values(),
];

console.log("\nUnique people found:", people.length);

// Insert people into Supabase
const { data: insertedPeople, error: peopleError } = await supabase
  .from("people")
  .upsert(people, {
    onConflict: "full_name",
  })
  .select();

if (peopleError) {
  console.error("Error inserting people:", peopleError.message);
  process.exit(1);
}

console.log("People successfully saved to Supabase:", insertedPeople.length);

// Create lookup from semester + group name -> group ID
const groupIdMap = new Map();

for (const group of insertedGroups) {
  groupIdMap.set(`${group.semester_id}|||${group.name}`, group.id);
}

// Build unique projects
const projectMap = new Map();

for (const row of parsedRows) {
  if (!row.project) {
    continue;
  }

  const { year, term } = parseCohort(row.cohort);

  const semesterId = semesterIdMap.get(`${year}-${term}`);

  const groupId = groupIdMap.get(`${semesterId}|||${row.group}`);

  if (!groupId) {
    throw new Error(`Could not find group for Excel row ${row.excelRow}`);
  }

  const key = `${groupId}|||${row.project}`;

  if (!projectMap.has(key)) {
    projectMap.set(key, {
      group_id: groupId,
      name: row.project,
    });
  }
}

const projects = [...projectMap.values()];

console.log("\nUnique projects found:", projects.length);

// Insert projects into Supabase
const { data: insertedProjects, error: projectError } = await supabase
  .from("projects")
  .upsert(projects, {
    onConflict: "group_id,name",
  })
  .select();

if (projectError) {
  console.error("Error inserting projects:", projectError.message);
  process.exit(1);
}

console.log("Projects successfully saved to Supabase:", insertedProjects.length);

// Create lookup from person name -> person ID
const personIdMap = new Map(insertedPeople.map((person) => [person.full_name, person.id]));

// Create lookup from group + project name -> project ID
const projectIdMap = new Map(insertedProjects.map((project) => [`${project.group_id}|||${project.name}`, project.id]));

// Build memberships
const membershipMap = new Map();

for (const row of parsedRows) {
  const { year, term } = parseCohort(row.cohort);

  const semesterId = semesterIdMap.get(`${year}-${term}`);

  const groupId = groupIdMap.get(`${semesterId}|||${row.group}`);

  const personId = personIdMap.get(row.fullName);

  if (!groupId) {
    throw new Error(`Could not find group for Excel row ${row.excelRow}`);
  }

  if (!personId) {
    throw new Error(`Could not find person for Excel row ${row.excelRow}`);
  }

  let projectId = null;

  if (row.project) {
    projectId = projectIdMap.get(`${groupId}|||${row.project}`);

    if (!projectId) {
      throw new Error(`Could not find project for Excel row ${row.excelRow}: ${row.project}`);
    }
  }

  const key = [groupId, projectId ?? "NO_PROJECT", personId, row.role].join("|||");

  if (!membershipMap.has(key)) {
    membershipMap.set(key, {
      group_id: groupId,
      project_id: projectId,
      person_id: personId,
      role: row.role,
      location: row.location,
    });
  }
}

const memberships = [...membershipMap.values()];

console.log("\nUnique memberships found:", memberships.length);

// Insert memberships into Supabase
const { data: insertedMemberships, error: membershipError } = await supabase
  .from("memberships")
  .upsert(memberships, {
    onConflict: "group_id,project_id,person_id,role",
  })
  .select();

if (membershipError) {
  console.error("Error inserting memberships:", membershipError.message);
  process.exit(1);
}

console.log("Memberships successfully saved to Supabase:", insertedMemberships.length);

console.log("Rows prepared for import:", parsedRows.length);

console.log("\nFirst 5 parsed rows:");
console.log(parsedRows.slice(0, 5));

console.log("\nLast 5 parsed rows:");
console.log(parsedRows.slice(-5));
