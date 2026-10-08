import { supabase } from "../lib/supabase";

const termOrder = {
  Spring: 1,
  Summer: 2,
  Fall: 3,
};

const specialProgramIds = {
  Staff: "staff",
  APD: "apd",
  "Agile Product Design": "apd",
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

    fetchAllRows("groups", "id, semester_id, name, location, is_staff, group_type, display_order"),

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
          projectId: membership.project_id,
          project: project?.name ?? null,
        };
      });

      const isStaff = group.is_staff || group.name.toLowerCase() === "staff";

      if (isStaff) {
        return {
          id: makeProgramId(group.name),
          groupId: group.id,
          displayOrder: group.display_order,
          name: group.name,
          location: group.location,
          members: peopleInGroup.map((person) => ({
            name: person.name,
            role: person.role,
          })),
          membershipDetails: peopleInGroup,
        };
      }

      const interns = peopleInGroup.filter((person) => person.role.toLowerCase() === "intern").map((person) => person.name);

      const participants = peopleInGroup.filter((person) => person.role.toLowerCase() === "participant").map((person) => person.name);

      const teamLeads = peopleInGroup.filter((person) => person.role.toLowerCase() === "team lead").map((person) => person.name);

      const fellows = peopleInGroup.filter((person) => person.role.toLowerCase() === "fellow").map((person) => person.name);

      const projectNames = [...new Set(
        peopleInGroup
          .map((person) => person.project)
          .filter(Boolean),
      )];

      return {
        id: makeProgramId(group.name),
        groupId: group.id,
        groupType: group.group_type,
        displayOrder: group.display_order,
        name: group.name,
        location: group.location,

        project: projectNames.join(", ") || null,

        peopleLabel: participants.length > 0 ? "Participants" : "Interns",
        peopleRole: participants.length > 0 ? "Participant" : "Intern",

        fellow: fellows[0] ?? null,

        teamLead: teamLeads[0] ?? null,

        interns: [...interns, ...participants],
        lineageInterns: interns,

        // Keep these too so we can support
        // multiple Fellows/TLs later.
        fellows,
        teamLeads,
        membershipDetails: peopleInGroup,
      };
    });

    return {
      id: `${semester.term.toLowerCase()}-${semester.year}`,
      // Keep the database id as well as the display id. The display id is
      // convenient for the UI, while new groups must use the UUID stored in
      // groups.semester_id.
      databaseId: semester.id,
      label: `${semester.term} ${semester.year}`,
      programs,
    };
  });
}

export async function saveProgramToSupabase(program, changes) {
  if (!program.groupId) {
    throw new Error("This card is missing its group record.");
  }

  const { data: updatedGroups, error: groupError } = await supabase
    .from("groups")
    .update({
      name: changes.name,
      location: changes.location || null,
    })
    .eq("id", program.groupId)
    .select("id");

  if (groupError) {
    throw new Error(`Could not save the card: ${groupError.message}`);
  }

  if (!updatedGroups?.length) {
    throw new Error(
      "The card was not updated. Supabase does not currently allow this browser to update group records.",
    );
  }

  // A card-name or location edit does not need to rewrite the roster. This
  // avoids requiring people and membership write access for simple card edits.
  if (!changes.membersChanged) {
    return;
  }

  const members = changes.members;
  const memberNames = [...new Set(members.map((member) => member.name))];

  const { error: deleteError } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", program.groupId);

  if (deleteError) {
    throw new Error(`Could not update the card members: ${deleteError.message}`);
  }

  if (memberNames.length === 0) {
    return;
  }

  const { data: savedPeople, error: peopleError } = await supabase
    .from("people")
    .upsert(
      memberNames.map((full_name) => ({ full_name })),
      { onConflict: "full_name" },
    )
    .select("id, full_name");

  if (peopleError) {
    throw new Error(`Could not save the people on this card: ${peopleError.message}`);
  }

  const peopleByName = new Map(
    savedPeople.map((person) => [person.full_name, person.id]),
  );
  const previousMemberships = program.membershipDetails ?? [];
  const memberships = members.map((member) => {
    const existingMembership = previousMemberships.find(
      (previous) => previous.name === member.name && previous.role === member.role,
    );

    return {
      group_id: program.groupId,
      person_id: peopleByName.get(member.name),
      role: member.role,
      project_id: existingMembership?.projectId ?? null,
      location: existingMembership?.location ?? null,
    };
  });

  const { error: membershipError } = await supabase
    .from("memberships")
    .insert(memberships);

  if (membershipError) {
    throw new Error(`Could not save the card members: ${membershipError.message}`);
  }
}

export async function deleteProgramFromSupabase(program) {
  if (!program.groupId) {
    throw new Error("This card is missing its group record.");
  }

  const deleteGroup = () => supabase
    .from("groups")
    .delete()
    .eq("id", program.groupId)
    .select("id");

  let { data: deletedGroups, error: groupError } = await deleteGroup();

  if (!groupError && !deletedGroups?.length) {
    throw new Error(
      "The card was not deleted. Supabase does not currently allow this browser to delete group records.",
    );
  }

  // If the database requires memberships and projects to be removed first,
  // clear those dependent records and retry the group deletion.
  if (groupError?.code === "23503") {
    const { error: membershipError } = await supabase
      .from("memberships")
      .delete()
      .eq("group_id", program.groupId);

    if (membershipError) {
      throw new Error(`Could not remove the card members: ${membershipError.message}`);
    }

    const { error: projectError } = await supabase
      .from("projects")
      .delete()
      .eq("group_id", program.groupId);

    if (projectError) {
      throw new Error(`Could not remove the card projects: ${projectError.message}`);
    }

    ({ data: deletedGroups, error: groupError } = await deleteGroup());
  }

  if (groupError) {
    throw new Error(`Could not remove the card: ${groupError.message}`);
  }

  if (!deletedGroups?.length) {
    throw new Error("The card could not be found to delete.");
  }

  // Most schemas cascade these records when the group is deleted. If this
  // project uses non-cascading foreign keys, they were removed before retrying.
  await supabase
    .from("memberships")
    .delete()
    .eq("group_id", program.groupId);
  await supabase.from("projects").delete().eq("group_id", program.groupId);
}

export async function saveProgramOrder(programs) {
  const results = await Promise.all(programs.map(async (program, displayOrder) => {
    if (!program.groupId) {
      throw new Error("A reordered card is missing its group record.");
    }

    const { data, error } = await supabase
      .from("groups")
      .update({ display_order: displayOrder })
      .eq("id", program.groupId)
      .select("id");

    if (error) {
      throw new Error(`Could not save the card order: ${error.message}`);
    }

    if (!data?.length) {
      throw new Error(
        "The card order was not saved. Supabase does not currently allow this browser to update group records.",
      );
    }

    return data[0];
  }));

  return results;
}

export async function createProgramInSupabase(semesterId, changes) {
  if (!semesterId) {
    throw new Error("Please choose a semester for the new team.");
  }

  const name = changes.name?.trim();

  if (!name) {
    throw new Error("Please enter a team name.");
  }

  const { data: createdGroups, error: groupError } = await supabase
    .from("groups")
    .insert({
      semester_id: semesterId,
      name,
      location: changes.location?.trim() || null,
      is_staff: false,
      group_type: null,
      // Keep this null for semesters that have never been manually ordered.
      // For ordered semesters, App supplies the next position so the new card
      // appears at the end until it is dragged elsewhere.
      display_order: changes.displayOrder ?? null,
    })
    .select("id");

  if (groupError) {
    if (groupError.code === "23505") {
      throw new Error("A team with this name already exists in that semester.");
    }

    throw new Error(`Could not create the team: ${groupError.message}`);
  }

  const group = createdGroups?.[0];

  if (!group) {
    throw new Error(
      "The team was not created. Supabase does not currently allow this browser to add group records.",
    );
  }

  const members = (changes.members ?? []).filter((member) => member.name?.trim());

  if (members.length === 0) {
    return group;
  }

  const memberNames = [...new Set(members.map((member) => member.name.trim()))];
  const { data: savedPeople, error: peopleError } = await supabase
    .from("people")
    .upsert(
      memberNames.map((full_name) => ({ full_name })),
      { onConflict: "full_name" },
    )
    .select("id, full_name");

  if (peopleError) {
    throw new Error(`Could not save the people on this team: ${peopleError.message}`);
  }

  const peopleByName = new Map(
    savedPeople.map((person) => [person.full_name, person.id]),
  );
  const memberships = members.map((member) => ({
    group_id: group.id,
    person_id: peopleByName.get(member.name.trim()),
    role: member.role,
    project_id: null,
    location: null,
  }));

  const { error: membershipError } = await supabase
    .from("memberships")
    .insert(memberships);

  if (membershipError) {
    throw new Error(`Could not save the team members: ${membershipError.message}`);
  }

  return group;
}
