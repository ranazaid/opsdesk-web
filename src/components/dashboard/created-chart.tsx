/**
 * Tickets created per day: a single-series bar chart, so one hue and no legend
 * (the card title names it). Each bar has a hover tooltip and the same numbers
 * are available to screen readers as a table.
 */
export function CreatedPerDayChart({ data }: { data: { day: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const label = (day: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day));

  return (
    <figure>
      <div className="relative h-64" aria-hidden>
        {/* recessive gridlines at 0, 50% and 100% */}
        {[0, 50, 100].map((pct) => (
          <div key={pct} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${pct}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {data.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-7 rounded-t bg-brand-500 transition-colors group-hover:bg-brand-700"
                style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total > 0 ? 4 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow group-hover:block">
                {label(d.day)}: <span className="font-semibold">{d.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400" aria-hidden>
        <span>{label(data[0]?.day ?? "")}</span>
        <span>Max {max} / day</span>
        <span>{label(data.at(-1)?.day ?? "")}</span>
      </div>
      <table className="sr-only">
        <caption>Tickets created per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
