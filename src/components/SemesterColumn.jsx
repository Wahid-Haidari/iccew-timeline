import ProgramCard from './ProgramCard'

export default function SemesterColumn({ semester }) {
  return (
    <div className="flex shrink-0 flex-col items-center" style={{ minWidth: 220 }}>
      {/* Label */}
      <span className="mb-2 text-sm font-semibold text-[#841617]">
        {semester.label}
      </span>

      {/* Dashed connector */}
      <div className="h-6 border-l-2 border-dashed border-[#841617]/45" />

      {/* Dot on the timeline (positioned by parent) */}

      {/* Program cards */}
      <div className="mt-4 flex flex-col gap-4 w-full px-2">
        {semester.programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>
    </div>
  )
}
