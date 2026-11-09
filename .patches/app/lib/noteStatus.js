// Tracked notes use verified assessment evidence; manual notes retain their original workflow.
const isTracked = note => /\[MONJAZI_AUTO:(completion|remediation|reassessment):[a-zA-Z0-9_-]{1,120}\]\s*$/.test(String(note.context || ''));
export function needsFollowUp(note) {
  if (note.kind === 'action' && isTracked(note)) return note.autoState !== 'complete';
  return !note.readAt || (note.kind === 'action' && !note.completedAt);
}
export function isFinished(note) {
  if (note.kind === 'action' && isTracked(note)) return note.autoState === 'complete';
  return note.kind === 'action' ? !!note.completedAt : !!note.readAt;
}
