import type { YearBar } from "../domain/presence";

export function YearBars({ bars }: { bars: YearBar[] }) {
  return (
    <section className="card row-card">
      <span className="row-icon" aria-hidden="true">
        📅
      </span>
      <div style={{ flex: 1 }}>
        <h3>Days in USA by Year</h3>
        {bars.map((b) => (
          <div key={b.year} className="year-row">
            <span className="muted">{b.year}</span>
            <div className="year-bar">
              <div className="year-fill" style={{ width: `${(b.present / b.elapsed) * 100}%` }} />
              <span className="year-label">
                {b.present}/{b.elapsed}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
