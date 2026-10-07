import { supabase } from "../lib/supabase";

const termOrder = {
  Spring: 1,
  Summer: 2,
  Fall: 3,
};

const specialProgramIds = {
  Staff: "staff",
  APD: "apd",
  Energy: "energy",
  OFA: "ofa",
  OKC: "okc",

  "SoBA (Biz)": "soba-biz",
  "SoBA (Business)": "soba-biz",

  "SoBA (Dev)": "soba-dev",
  "SoBA (Developer)": "soba-dev",

  SocEnt: "soc-ent",
  "Social Entrepreneurship": "soc-ent",

  "OKC Talento": "okc-talento",
  "OKC - Talento": "okc-talento",

  "OKC OU Med": "okc-ou-med",
  "OKC - OU Med": "okc-ou-med",
};

function makeProgramId(name) {
  if (specialProgramIds[name]) {
    return specialProgramIds[name];
  }

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Supabase commonly limits a request to 1000 rows.
// Memberships has more than 1000 rows, so fetch them in pages.
async function fetchAllRows(table, columns = "*") {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed loading ${table}: ${error.message}`);
    }

    allRows = [...allRows, ...data];

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

export async function loadTimelineFromSupabase() {
  const [semesters, groups, people, projects, memberships] = await Promise.all([
    fetchAllRows("semesters", "id, year, term"),

    fetchAllRows("groups", "id, semester_id, name, location, is_staff, group_type"),

    fetchAllRows("people", "id, full_name"),

    fetchAllRows("projects", "id, group_id, name"),

    fetchAllRows("memberships", "id, group_id, project_id, person_id, role, location"),
  ]);

  const peopleById = new Map(people.map((person) => [person.id, person]));

  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const membershipsByGroup = new Map();

  for (const membership of memberships) {
    if (!membershipsByGroup.has(membership.group_id)) {
      membershipsByGroup.set(membership.group_id, []);
    }

    membershipsByGroup.get(membership.group_id).push(membership);
  }

  const groupsBySemester = new Map();

  for (const group of groups) {
    if (!groupsBySemester.has(group.semester_id)) {
      groupsBySemester.set(group.semester_id, []);
    }

    groupsBySemester.get(group.semester_id).push(group);
  }

  const sortedSemesters = [...semesters].sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }

    return termOrder[a.term] - termOrder[b.term];
  });

  return sortedSemesters.map((semester) => {
    const semesterGroups = groupsBySemester.get(semester.id) ?? [];

    const programs = semesterGroups.map((group) => {
      const groupMemberships = membershipsByGroup.get(group.id) ?? [];

      const peopleInGroup = groupMemberships.map((membership) => {
        const person = peopleById.get(membership.person_id);

        const project = membership.project_id ? projectsById.get(membership.project_id) : null;

        return {
          name: person?.full_name ?? "Unknown",
          role: membership.role,
          location: membership.location,
          project: project?.name ?? null,
        };
      });

      const isStaff = group.is_staff || group.name.toLowerCase() === "staff";

      if (isStaff) {
        return {
          id: makeProgramId(group.name),
          name: group.name,
          location: group.location,
          members: peopleInGroup.map((person) => ({
            name: person.name,
            role: person.role,
          })),
        };
      }

      const interns = peopleInGroup.filter((person) => person.role.toLowerCase() === "intern").map((person) => person.name);

      const teamLeads = peopleInGroup.filter((person) => person.role.toLowerCase() === "team lead").map((person) => person.name);

      const fellows = peopleInGroup.filter((person) => person.role.toLowerCase() === "fellow").map((person) => person.name);

      return {
        id: makeProgramId(group.name),
        name: group.name,
        location: group.location,

        fellow: fellows[0] ?? null,

        teamLead: teamLeads[0] ?? null,

        interns,

        // Keep these too so we can support
        // multiple Fellows/TLs later.
        fellows,
        teamLeads,
      };
    });

    return {
      id: `${semester.term.toLowerCase()}-${semester.year}`,
      label: `${semester.term} ${semester.year}`,
      programs,
    };
  });
}
