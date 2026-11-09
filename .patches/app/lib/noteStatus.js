// A note stays in the follow-up queue until the teacher reads it, and, for action notes, completes it.
export function needsFollowUp(note) {
  return !note.readAt || (note.kind === 'action' && !note.completedAt);
}
export function isFinished(note) {
  return note.kind === 'action' ? !!note.completedAt : !!note.readAt;
}
