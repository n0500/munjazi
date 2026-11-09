// Automatic notes are complete only when their linked assessment evidence is verified.
// Existing manual notes preserve their original read/reply/completion workflow.
const isTracked = note => /\[MONJAZI_AUTO:(completion|remediation|reassessment):[a-zA-Z0-9_-]{1,120}\]\s*$/.test(String(note.context || ''));
export function needsFollowUp(note) {
  if (!note.readAt) return true;
  if (note.kind !== 'action') return false;
  return isTracked(note) ? note.autoState !== 'complete' : !note.completedAt;
}
export function isFinished(note) {
  if (note.kind !== 'action') return !!note.readAt;
  return isTracked(note) ? note.autoState === 'complete' && !!note.readAt : !!note.completedAt;
}
