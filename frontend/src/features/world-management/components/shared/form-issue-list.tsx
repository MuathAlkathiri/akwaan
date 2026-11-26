interface FormIssueListProps {
  error?: string;
  issues?: string[];
}

/**
 * Domain validation returns every failing rule at once, so a form shows the full
 * list rather than making the admin discover them one save at a time.
 */
export function FormIssueList({ error, issues = [] }: FormIssueListProps) {
  if (!error && !issues.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-brand-navy bg-destructive-subtle p-3">
      {error && <p className="text-sm font-medium text-foreground">{error}</p>}
      {issues.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 text-sm text-foreground">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
