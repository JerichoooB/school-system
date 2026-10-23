// Percentages use assessment weights; categories, when present, weight their own assessments.
export function weightedGrade(
  assessments,
  scores,
  categories = [],
  { complete = false, missingAsZero = false } = {},
) {
  const applicable = assessments.filter(
    (a) => !a.archived && (a.published || complete),
  );
  const scoreMap = new Map(scores.map((s) => [String(s.assessment_id), s]));
  const calculate = (items) => {
    let total = 0,
      weight = 0;
    for (const a of items) {
      const s = scoreMap.get(String(a.id));
      if (s?.exempt) continue;
      if (!s && !missingAsZero) {
        if (complete)
          throw new Error(
            "Every assessment needs a score or exemption before finalization.",
          );
        continue;
      }
      const w = Number(a.weight);
      total += (s ? Number(s.points) / Number(a.points) : 0) * w;
      weight += w;
    }
    return weight ? (total / weight) * 100 : null;
  };
  if (complete && !applicable.length)
    throw new Error("Create assessments before finalizing grades.");
  if (categories.length) {
    if (
      complete &&
      Math.abs(categories.reduce((n, c) => n + Number(c.weight), 0) - 100) >
        0.001
    )
      throw new Error("Category weights must total 100%.");
    if (complete && applicable.some((a) => !a.category_id))
      throw new Error("Assign every assessment to a grading category.");
    let total = 0,
      weight = 0;
    for (const c of categories) {
      const items = applicable.filter(
        (a) => String(a.category_id) === String(c.id),
      );
      if (
        complete &&
        Math.abs(items.reduce((n, a) => n + Number(a.weight), 0) - 100) > 0.001
      )
        throw new Error(
          "Assessment weights within each category must total 100%.",
        );
      const value = calculate(items);
      if (value != null) {
        total += value * Number(c.weight);
        weight += Number(c.weight);
      }
    }
    return weight ? total / weight : null;
  }
  if (
    complete &&
    Math.abs(applicable.reduce((n, a) => n + Number(a.weight), 0) - 100) > 0.001
  )
    throw new Error("Assessment weights must total 100%.");
  return calculate(applicable);
}
