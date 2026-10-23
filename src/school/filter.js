export function filterTerm(data, term) {
  if (!data || term === "all") return data;
  const result = { ...data },
    sections = new Set(
      data.sections
        .filter((s) => String(s.term_id) === term)
        .map((s) => String(s.id)),
    );
  result.sections = data.sections.filter((s) => sections.has(String(s.id)));
  for (const key of [
    "enrollments",
    "meetings",
    "class_sessions",
    "attendance",
    "assessments",
    "assignments",
    "submissions",
    "scores",
    "exams",
    "materials",
    "assessment_categories",
    "final_grades",
  ])
    result[key] = data[key].filter((r) => sections.has(String(r.section_id)));
  for (const key of ["announcements", "schedule_exceptions", "files"])
    result[key] = data[key].filter(
      (r) => !r.section_id || sections.has(String(r.section_id)),
    );
  const submissions = new Set(result.submissions.map((s) => String(s.id))),
    assignments = new Set(result.assignments.map((a) => String(a.id))),
    assessments = new Set(result.assessments.map((a) => String(a.id)));
  result.submission_versions = data.submission_versions.filter((v) =>
    submissions.has(String(v.submission_id)),
  );
  result.rubrics = data.rubrics.filter((r) =>
    assignments.has(String(r.assignment_id)),
  );
  result.rubric_scores = data.rubric_scores.filter((r) =>
    submissions.has(String(r.submission_id)),
  );
  result.grade_history = data.grade_history.filter((h) =>
    assessments.has(String(h.assessment_id)),
  );
  return result;
}
