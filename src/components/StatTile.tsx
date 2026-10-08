export function StatTile({ icon, value, label, note }: { icon: string; value: string; label: string; note?: string }) {
  return (
    <section className="card tile">
      <div className="tile-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="tile-value">{value}</p>
      <p>{label}</p>
      {note && <p className="tile-note">{note}</p>}
    </section>
  );
}
