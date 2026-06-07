export interface HandoutSection {
  title: string;
  body: string;
  pageBreakBefore?: boolean;
}

interface PrintableHandoutProps {
  title: string;
  studentName?: string;
  subtitle?: string;
  sections: HandoutSection[];
  footerNote?: string;
}

const splitLines = (body: string) => body
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean);

const isChecklistLine = (line: string) => line.startsWith('□') || line.startsWith('[ ]');

export function PrintableHandout({
  title,
  studentName,
  subtitle,
  sections,
  footerNote
}: PrintableHandoutProps) {
  const dateLabel = new Date().toLocaleDateString();

  return (
    <article className="hfs-printable" aria-label={title}>
      <div className="hfs-print-card">
        <header className="hfs-print-header">
          <div>
            <p className="hfs-print-kicker">Hear for Speech</p>
            <h1>{title}</h1>
            {subtitle && <p className="hfs-print-subtitle">{subtitle}</p>}
          </div>
          <div className="hfs-print-meta">
            <strong>{studentName || 'Student'}</strong>
            <span>{dateLabel}</span>
          </div>
        </header>

        <div className="hfs-print-sections">
          {sections.map(section => (
            <section
              key={section.title}
              className={section.pageBreakBefore ? 'hfs-print-section-page-break' : undefined}
            >
              <h2>{section.title}</h2>
              {splitLines(section.body).map(line => (
                <p key={line} className={isChecklistLine(line) ? 'hfs-print-checkline' : undefined}>
                  {line}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="hfs-print-footer">
          {footerNote || 'Use this handout as clinician-reviewed practice guidance. Keep practice short, calm, and encouraging.'}
        </footer>
      </div>
    </article>
  );
}
