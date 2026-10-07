import { useEffect, useState } from "react";
import Timeline from "./components/Timeline";
import {
  createProgramInSupabase,
  deleteProgramFromSupabase,
  loadTimelineFromSupabase,
  saveProgramOrder,
  saveProgramToSupabase,
} from "./data/loadTimelineFromSupabase";

function App() {
  // Timeline data loaded from Supabase
  const [timeline, setTimeline] = useState([]);

  // Simple loading state while Supabase responds
  const [loading, setLoading] = useState(true);

  // Store any loading error so we can display it
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTimeline() {
      try {
        const data = await loadTimelineFromSupabase();

        setTimeline(data);

        console.log("Timeline loaded from Supabase:", data);
      } catch (err) {
        console.error("Failed to load timeline:", err);

        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadTimeline();
  }, []);

  async function handleProgramSave(program, changes) {
    await saveProgramToSupabase(program, changes);
    const updatedTimeline = await loadTimelineFromSupabase();

    setTimeline(updatedTimeline);
  }

  async function handleProgramDelete(program) {
    await deleteProgramFromSupabase(program);

    setTimeline((currentTimeline) => currentTimeline.map((semester) => ({
      ...semester,
      programs: semester.programs.filter(
        (timelineProgram) => timelineProgram.groupId !== program.groupId,
      ),
    })));
  }

  async function handleProgramReorder(semesterId, programs) {
    await saveProgramOrder(programs);

    setTimeline((currentTimeline) => currentTimeline.map((semester) => (
      semester.id === semesterId
        ? {
          ...semester,
          programs: programs.map((program, displayOrder) => ({
            ...program,
            displayOrder,
          })),
        }
        : semester
    )));
  }

  async function handleProgramCreate(changes) {
    const semester = timeline.find((timelineSemester) => (
      timelineSemester.id === changes.semesterId
    ));

    if (!semester?.databaseId) {
      throw new Error("The selected semester could not be found.");
    }

    const savedOrders = semester.programs
      .map((program) => program.displayOrder)
      .filter((displayOrder) => displayOrder !== null && displayOrder !== undefined);
    const displayOrder = savedOrders.length > 0
      ? Math.max(...savedOrders) + 1
      : null;

    await createProgramInSupabase(semester.databaseId, {
      ...changes,
      displayOrder,
    });

    const updatedTimeline = await loadTimelineFromSupabase();
    setTimeline(updatedTimeline);
  }

  // Show a message while the database is loading
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-[#323232]">Loading timeline...</div>;
  }

  // Show the error if Supabase failed
  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-[#841617]">Failed to load timeline: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <Timeline
        semesters={timeline}
        onProgramSave={handleProgramSave}
        onProgramDelete={handleProgramDelete}
        onProgramReorder={handleProgramReorder}
        onProgramCreate={handleProgramCreate}
      />
    </div>
  );
}

export default App;
