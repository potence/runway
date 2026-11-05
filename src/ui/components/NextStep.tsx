/** The one obvious "what now" button at the bottom of each spine screen. */
export function NextStep({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <div className="next-step">
      <button type="button" className="btn btn-primary btn-lg" data-testid={testId} onClick={onClick}>{label}</button>
    </div>
  );
}
