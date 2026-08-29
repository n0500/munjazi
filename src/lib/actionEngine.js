import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const REMEDIAL_STATUSES = ["غير متقنة"];
const ENRICHMENT_STATUSES = ["متقنة"];
const CONSECUTIVE_WEEKS_THRESHOLD = 2;

export function detectRepeatedSkills(currentSkills, previousSkills) {
  if (!previousSkills) return [];

  const candidates = [];

  for (const [skillId, current] of Object.entries(currentSkills)) {
    const previous = previousSkills[skillId];
    if (!previous) continue;
    if (current.status !== previous.status) continue;

    let type = null;
    if (REMEDIAL_STATUSES.includes(current.status)) type = "remedial";
    else if (ENRICHMENT_STATUSES.includes(current.status)) type = "enrichment";
    if (!type) continue;

    candidates.push({
      skillId,
      skillName: current.name,
      status: current.status,
      type,
    });
  }

  return candidates;
}

export function pickTemplateText(templates, type, skillCategory, teacherId) {
  const matches = (t, requireSkill, requireOwn) => {
    if (t.type !== type) return false;
    if (requireSkill && t.skillCategory !== skillCategory) return false;
    if (!requireSkill && t.skillCategory !== null) return false;
    if (requireOwn && t.createdBy !== teacherId) return false;
    if (!requireOwn && t.createdBy !== null) return false;
    return true;
  };

  const priorityOrder = [
    { requireSkill: true, requireOwn: true },
    { requireSkill: false, requireOwn: true },
    { requireSkill: true, requireOwn: false },
    { requireSkill: false, requireOwn: false },
  ];

  for (const rule of priorityOrder) {
    const found = templates.find((t) =>
      matches(t, rule.requireSkill, rule.requireOwn)
    );
    if (found) return found.text;
  }

  return type === "remedial"
    ? "إحالة لجلسة معالجة فردية"
    : "ترشيح لنشاط إثرائي إضافي";
}

export function buildActionDraft(candidates, templates, teacherId) {
  const byType = { remedial: [], enrichment: [] };
  for (const c of candidates) byType[c.type].push(c);

  const drafts = [];
  for (const type of ["remedial", "enrichment"]) {
    const skills = byType[type];
    if (skills.length === 0) continue;

    const skillCategory = skills.length === 1 ? skills[0].skillId : null;
    const text = pickTemplateText(templates, type, skillCategory, teacherId);

    drafts.push({
      type,
      affectedSkills: skills.map((s) => ({
        skillId: s.skillId,
        skillName: s.skillName,
      })),
      suggestedText: text,
    });
  }

  return drafts;
}

export async function checkAndSuggestActions(
  db,
  { schoolId, classId, studentId, studentName, weekId, currentSkills, previousSkills, teacherId }
) {
  const candidates = detectRepeatedSkills(currentSkills, previousSkills);
  if (candidates.length === 0) return [];

  const templatesSnap = await getDocs(
    collection(db, "schools", schoolId, "actionTemplates")
  );
  const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const drafts = buildActionDraft(candidates, templates, teacherId);
  const actionsRef = collection(db, "schools", schoolId, "classes", classId, "actions");
  const created = [];

  for (const draft of drafts) {
    const existingQ = query(
      actionsRef,
      where("studentId", "==", studentId),
      where("type", "==", draft.type),
      where("status", "in", ["suggested", "active"])
    );
    const existingSnap = await getDocs(existingQ);

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      await updateDoc(existingDoc.ref, {
        affectedSkills: draft.affectedSkills,
        followUpLog: [
          ...(existingDoc.data().followUpLog || []),
          { weekId, note: "استمرار التكرار", date: Timestamp.now() },
        ],
      });
      created.push({ id: existingDoc.id, updated: true });
      continue;
    }

    const docRef = await addDoc(actionsRef, {
      studentId,
      studentName,
      affectedSkills: draft.affectedSkills,
      type: draft.type,
      suggestedText: draft.suggestedText,
      finalText: draft.suggestedText,
      status: "suggested",
      deferCount: 0,
      triggerWeeks: [weekId],
      activatedAt: null,
      activatedBy: null,
      reviewDate: null,
      followUpLog: [],
      parentAcknowledgment: { viewedAt: null, viewedByParentId: null },
      createdAt: serverTimestamp(),
    });
    created.push({ id: docRef.id, updated: false });
  }

  return created;
}

export async function activateAction(
  db,
  { schoolId, classId, actionId, teacherId, finalText, reviewDate }
) {
  const ref = doc(db, "schools", schoolId, "classes", classId, "actions", actionId);
  await updateDoc(ref, {
    status: "active",
    finalText,
    activatedAt: serverTimestamp(),
    activatedBy: teacherId,
    reviewDate: reviewDate ? Timestamp.fromDate(new Date(reviewDate)) : null,
  });
}

export async function deferAction(db, { schoolId, classId, actionId }) {
  const ref = doc(db, "schools", schoolId, "classes", classId, "actions", actionId);
  const snap = await getDoc(ref);
  const currentDeferCount = snap.data()?.deferCount || 0;
  await updateDoc(ref, { deferCount: currentDeferCount + 1 });
}

export async function logParentAcknowledgment(
  db,
  { schoolId, classId, actionId, parentId }
) {
  const ref = doc(db, "schools", schoolId, "classes", classId, "actions", actionId);
  const snap = await getDoc(ref);
  if (snap.data()?.parentAcknowledgment?.viewedAt) return;

  await updateDoc(ref, {
    parentAcknowledgment: {
      viewedAt: serverTimestamp(),
      viewedByParentId: parentId,
    },
  });
}

export async function logWeeklyReportView(
  db,
  { schoolId, classId, weekId, studentId, parentId }
) {
  const ref = doc(
    db,
    "schools",
    schoolId,
    "classes",
    classId,
    "weeklyRecords",
    weekId,
    "students",
    studentId
  );
  const snap = await getDoc(ref);
  if (snap.data()?.parentViewedAt) return;

  await updateDoc(ref, {
    parentViewedAt: serverTimestamp(),
    parentViewedBy: parentId,
  });
}

export async function getPendingActions(db, { schoolId, classId }) {
  const actionsRef = collection(db, "schools", schoolId, "classes", classId, "actions");
  const q = query(actionsRef, where("status", "==", "suggested"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
