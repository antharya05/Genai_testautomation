export function Skeleton({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <div
      className="skeleton"
      style={{ borderRadius: 6, height: 16, ...style }}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", opacity: 1 - i * 0.12 }}>
          <Skeleton style={{ width: 20, height: 20, borderRadius: "50%" }} />
          <Skeleton style={{ width: 64, height: 14 }} />
          <Skeleton style={{ width: 90, height: 14 }} />
          <Skeleton style={{ flex: 1, height: 14 }} />
          <Skeleton style={{ width: 80, height: 20, borderRadius: 99 }} />
          <Skeleton style={{ width: 56, height: 20, borderRadius: 99 }} />
          <Skeleton style={{ width: 28, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card" style={{ padding: "14px 18px" }}>
      <Skeleton style={{ height: 28, width: 40, marginBottom: 8 }} />
      <Skeleton style={{ height: 11, width: 80 }} />
    </div>
  );
}
