import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { reportsFor } from '@/lib/reports';

export const dynamic = 'force-dynamic';

const DOWNLOADABLE = new Set(['mark-schedule', 'consultation-register']);

export default async function Reports() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const available = reportsFor(principal.roles as readonly string[]);

  return (
    <>
      <h1 className="page">Reports you can run</h1>
      <p className="lede">
        {available.length} of the {14} defined reports are open to your roles. Every figure comes
        from a computed snapshot — nothing is recalculated at export, so a report and the mark a
        student sees cannot disagree.
      </p>

      <table className="list">
        <thead>
          <tr>
            <th style={{ width: '42%' }}>Report</th>
            <th style={{ width: '14%' }}>Formats</th>
            <th style={{ width: '20%' }}>Covers</th>
            <th style={{ width: '24%' }}></th>
          </tr>
        </thead>
        <tbody>
          {available.map((r) => (
            <tr key={r.key}>
              <td>
                <strong>{r.title}</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{r.purpose}</div>
                {r.evidentiary && <span className="chip" style={{ marginTop: 5 }}>evidentiary — archived as PDF/A</span>}
                {!r.containsPersonalData && <span className="chip ok" style={{ marginTop: 5 }}>no personal data</span>}
              </td>
              <td className="mono" style={{ fontSize: 11 }}>{r.formats.join(' ')}</td>
              <td className="muted" style={{ fontSize: 11.5 }}>{r.scope.replaceAll('_', ' ').toLowerCase()}</td>
              <td>
                {DOWNLOADABLE.has(r.key)
                  ? <a href={`/api/reports/${r.key}`} download>Download CSV</a>
                  : <span className="muted" style={{ fontSize: 12 }}>generator not implemented</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="box" style={{ marginTop: 16 }}>
        <strong>Every extraction is logged.</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Exports move personal data out of the system, so who ran what, over which students and
          when is recorded alongside a SHA-256 of the exact bytes issued. Download the mark schedule
          twice and the two files are byte-identical — that is what makes the hash worth having.
        </p>
      </div>
    </>
  );
}
