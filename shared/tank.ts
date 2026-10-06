export function tankChecklistComplete(
  questions: { id: number }[],
  answers: { questionId: number; answer?: string | null }[],
) {
  const byId = new Map(answers.map(a => [a.questionId, a.answer]));
  return questions.length > 0 && questions.every(q => ["yes", "no"].includes(byId.get(q.id) ?? ""));
}
