export default function SkeletonCard({ lines = 4 }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-300/12 bg-[#07110d]/90 p-6 animate-pulse backdrop-blur">
      <div className="h-4 bg-emerald-300/10 rounded-full w-1/3 mb-5" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 bg-emerald-300/8 rounded-full mb-3 ${
            i === lines - 1 ? 'w-2/3' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}
