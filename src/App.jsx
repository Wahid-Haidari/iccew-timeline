import { useEffect, useState } from "react";
import Timeline from "./components/Timeline";
import { loadTimelineFromSupabase } from "./data/loadTimelineFromSupabase";

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

  // Show a message while the database is loading
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">Loading timeline...</div>;
  }

  // Show the error if Supabase failed
  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-red-400">Failed to load timeline: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Timeline semesters={timeline} />
    </div>
  );
}

export default App;
