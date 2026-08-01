export type AdminFeedback =
  | { kind: 'success' | 'error'; message: string }
  | null;

export function AdminFeedbackMessage({ feedback }: { feedback: AdminFeedback }) {
  if (!feedback) return null;

  return (
    <p className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
      {feedback.message}
    </p>
  );
}
