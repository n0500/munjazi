import AdminNotes from '../components/AdminNotes.jsx';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { listClasses, linkTeacherToClass, listTeacherAssignments, removeAssignment, updateAssignmentSubject } from '../lib/classesApi.js';
import { listActionsForTeacher } from '../lib/actionEngine.js';
import { updateTeacherDisplayName } from '../lib/teachersApi.js';
import { dedupeAssignmentsForDisplay } from '../lib/dataLogic.js';
import ClassWeeks from './ClassWeeks.js';
import TeacherOverview from './TeacherOverview.js';
import LegacyWeekReview from './LegacyWeekReview.js';
import { colors, font, radius, spacing } from '../lib/theme.js';
const RecommendationsLibrary = lazy(() => import('./RecommendationsLibrary.js'));
const RemediationPlans = lazy(() => import('./RemediationPlans.js'));
const AckTracking = lazy(() => import('./AckTracking.js'));
const ParentReviewTracking = lazy(() => import('./ParentReviewTracking.js'));
const TeacherReports = lazy(() => import('./TeacherReports.js'));
function SectionLoading() { return _jsx("p", { style: { textAlign: 'center', marginTop: 24, color: colors.textMuted }, children: "جارٍ فتح القسم..." }); }
const SECTIONS = [
    { key: 'home', label: 'الرئيسية' },
    { key: 'assessment', label: 'الرصد' },
    { key: 'reports', label: 'التقارير' },
    { key: 'plans', label: 'الخطط العلاجية' },
    { key: 'ack', label: 'متابعة الاطلاع' },
    { key: 'library', label: 'مكتبة التوصيات' },
];
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(fetchFn, { maxAttempts = 4, delayMs = 900 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // eslint-disable-next-line no-await-in-loop
            return await fetchFn();
        }
        catch (err) {
            lastErr = err;
            const isPermissionIssue = err?.code === 'permission-denied' || /insufficient permissions/i.test(err?.message || '');
            if (!isPermissionIssue || attempt === maxAttempts)
                throw err;
            // eslint-disable-next-line no-await-in-loop
            await wait(delayMs);
        }
    }
    throw lastErr;
}
export default function TeacherDashboard({ schoolId, teacherUid, teacherName }) {
    const [activeSection, setActiveSection] = useState('home');
    const [menuOpen, setMenuOpen] = useState(false);
    const [compactNav, setCompactNav] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
    const [allClasses, setAllClasses] = useState([]);
    const [rawAssignments, setRawAssignments] = useState([]);
    const [teacherActions, setTeacherActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pickClassId, setPickClassId] = useState('');
    const [subject, setSubject] = useState('');
    const [linking, setLinking] = useState(false);
    const [unlinkingId, setUnlinkingId] = useState(null);
    const [editingSubjectId, setEditingSubjectId] = useState(null);
    const [assessmentAssignmentId, setAssessmentAssignmentId] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(teacherName || '');
    const [savingName, setSavingName] = useState(false);
    const assignments = useMemo(() => dedupeAssignmentsForDisplay(rawAssignments), [rawAssignments]);
    const classNameFor = (classId) => allClasses.find((c) => c.id === classId)?.name || '؟';
    const availableClasses = allClasses.filter((c) => !c.archived);
    const activeAssessmentAssignment = assignments.find((a) => a.id === assessmentAssignmentId) || assignments[0] || null;
    async function refresh() {
        setLoading(true);
        setError('');
        try {
            // البيانات الأساسية أولًا حتى تفتح لوحة المعلمة بسرعة.
            // الإجراءات العلاجية ليست شرطًا لعرض الواجهة وتُحمّل بعدها في الخلفية.
            const [classRows, assignRows] = await Promise.all([
                fetchWithRetry(() => listClasses(schoolId)),
                fetchWithRetry(() => listTeacherAssignments(schoolId, teacherUid, { includeInactive: true })),
            ]);
            setAllClasses(classRows);
            setRawAssignments(assignRows);
            const grouped = dedupeAssignmentsForDisplay(assignRows);
            setAssessmentAssignmentId((current) => grouped.some((a) => a.id === current) ? current : grouped[0]?.id || '');
            setLoading(false);
            listActionsForTeacher(schoolId, teacherUid)
                .then((actionRows) => setTeacherActions(actionRows.filter((a) => a.status === 'active')))
                .catch(() => setTeacherActions([]));
        }
        catch (err) {
            setError(err.message || 'تعذّر تحميل البيانات.');
            setLoading(false);
        }
    }
    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId, teacherUid]);
    useEffect(() => { setNameDraft(teacherName || ''); }, [teacherName]);
    useEffect(() => {
        function updateNavigationMode() {
            setCompactNav(window.innerWidth < 720);
        }
        window.addEventListener('resize', updateNavigationMode);
        return () => window.removeEventListener('resize', updateNavigationMode);
    }, []);
    async function handleLink(e) {
        e.preventDefault();
        setError('');
        if (!pickClassId || !subject.trim() || linking)
            return;
        setLinking(true);
        try {
            await linkTeacherToClass(schoolId, pickClassId, teacherUid, teacherName, subject);
            setPickClassId('');
            setSubject('');
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر ربط الفصل الدراسي.');
        }
        finally {
            setLinking(false);
        }
    }
    async function handleUnlink(assignment) {
        const ids = assignment.assignmentIds || [assignment.id];
        if (!window.confirm(`سيتم إلغاء إسناد ${assignment.subject} — ${classNameFor(assignment.classId)}. تبقى جميع البيانات السابقة محفوظة، ويمكن إعادة الإسناد لاحقًا بنفس السجل. هل الرغبة في المتابعة مؤكدة؟`))
            return;
        setUnlinkingId(assignment.id);
        setError('');
        try {
            for (const id of ids) {
                // eslint-disable-next-line no-await-in-loop
                await removeAssignment(schoolId, id);
            }
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر إلغاء الإسناد.');
        }
        finally {
            setUnlinkingId(null);
        }
    }
    async function handleEditSubject(assignment) {
        if (editingSubjectId)
            return;
        const current = (assignment.subject || '').trim();
        const next = window.prompt(
            'اكتبي اسم المادة الصحيح.\n\nهذا الخيار لتعديل اسم نفس المادة فقط. إذا أصبحتِ تدرسين مادة مختلفة، ألغِي الإسناد الحالي ثم أضيفي إسنادًا جديدًا للمادة الجديدة.',
            current
        );
        if (next === null)
            return;
        const cleaned = next.trim();
        if (!cleaned || cleaned === current)
            return;
        setEditingSubjectId(assignment.id);
        setError('');
        try {
            const ids = assignment.assignmentIds || [assignment.id];
            for (const id of ids) {
                // eslint-disable-next-line no-await-in-loop
                await updateAssignmentSubject(schoolId, id, cleaned);
            }
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر تعديل اسم المادة.');
        }
        finally {
            setEditingSubjectId(null);
        }
    }

    async function handleSaveName() {
        setError('');
        if (!nameDraft.trim() || savingName)
            return;
        setSavingName(true);
        try {
            await updateTeacherDisplayName(schoolId, teacherUid, nameDraft);
            setEditingName(false);
            await refresh();
        }
        catch (err) {
            setError(err.message || 'تعذّر حفظ الاسم.');
        }
        finally {
            setSavingName(false);
        }
    }
    function changeSection(key) {
        setActiveSection(key);
        setMenuOpen(false);
    }
    if (loading)
        return _jsx("p", { style: { textAlign: 'center', marginTop: 60 }, children: "...\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644" });
    const remedialActions = teacherActions.filter((a) => a.type === 'remedial' && a.status === 'active' && a.planId);
    const pendingAckCount = remedialActions.filter((a) => !a.parentAcknowledgment?.viewedAt).length;
    return (_jsxs("div", { className: "mobile-page-shell", style: { width: compactNav ? '100%' : '96%', maxWidth: activeSection === 'assessment' ? 1500 : 1280, margin: '20px auto', padding: compactNav ? 10 : spacing.lg, boxSizing: 'border-box' }, dir: "rtl", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md }, children: [_jsx("h1", { style: { fontFamily: font.family, color: colors.ink, margin: 0 }, children: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0629" }), compactNav && (_jsxs("div", { style: { position: 'relative' }, children: [_jsxs("button", { onClick: () => setMenuOpen((v) => !v), style: { padding: '9px 14px', background: colors.ink, color: '#fff', border: 'none', borderRadius: radius.button }, children: "☰ الأقسام" }), menuOpen && (_jsx("div", { style: { position: 'absolute', top: '110%', left: 0, zIndex: 20, width: 220, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: '0 8px 20px rgba(0,0,0,.12)', overflow: 'hidden' }, children: SECTIONS.map((s) => (_jsx("button", { onClick: () => changeSection(s.key), style: { width: '100%', textAlign: 'right', padding: '11px 14px', background: activeSection === s.key ? colors.primaryTint : '#fff', color: activeSection === s.key ? '#0b5c33' : colors.ink, border: 'none', borderBottom: `1px solid ${colors.border}`, fontFamily: font.family, fontSize: 16, fontWeight: activeSection === s.key ? font.weightMedium : font.weightRegular }, children: s.label }, s.key))) }))] }))] }), !compactNav && (_jsx("div", { style: { display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${colors.border}`, marginBottom: spacing.lg }, children: SECTIONS.map((s) => (_jsx("button", { onClick: () => changeSection(s.key), style: {
                        padding: '10px 13px', background: 'none', border: 'none',
                        borderBottom: activeSection === s.key ? `2px solid ${colors.primary}` : '2px solid transparent',
                        color: activeSection === s.key ? colors.primary : colors.textMuted,
                        fontFamily: font.family, fontWeight: activeSection === s.key ? font.weightMedium : font.weightRegular,
                        fontSize: 16, whiteSpace: 'nowrap', cursor: 'pointer',
                    }, children: s.label }, s.key))) })), error && _jsx("div", { style: { background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }, children: error }), _jsx(AdminNotes, { schoolId }), activeSection === 'home' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: colors.textMuted }, children: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0629" }), _jsx("strong", { children: teacherName })] }), _jsx("button", { onClick: () => setEditingName((v) => !v), style: { padding: '6px 10px', background: '#f2f2f2', border: 'none', borderRadius: radius.button }, children: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u0633\u0645" })] }), editingName && (_jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 8 }, children: [_jsx("input", { value: nameDraft, onChange: (e) => setNameDraft(e.target.value), style: { flex: 1, padding: 8 } }), _jsx("button", { onClick: handleSaveName, disabled: savingName, style: { padding: '7px 12px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: savingName ? '...' : 'حفظ' })] }))] }), remedialActions.length > 0 && (_jsxs("div", { style: { background: colors.amberTint, borderRight: `3px solid ${colors.amberBorder}`, borderRadius: radius.button, padding: spacing.md, marginBottom: spacing.lg }, children: [_jsxs("div", { style: { fontWeight: 'bold', fontSize: 13, color: colors.amber }, children: ["\u26A0 ", remedialActions.length, " \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0639\u0644\u0627\u062C\u064A\u0629 \u0646\u0634\u0637\u0629 ", pendingAckCount > 0 && `· ${pendingAckCount} لم يطلع عليها ولي الأمر بعد`] }), _jsx("button", { onClick: () => changeSection('ack'), style: { background: 'none', border: 'none', color: colors.amber, fontSize: 12, textDecoration: 'underline', padding: 0, marginTop: 4 }, children: "\u0639\u0631\u0636 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644" })] })), _jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }, children: [_jsx("h3", { style: { marginTop: 0, fontFamily: font.family }, children: "\u0631\u0628\u0637 \u0641\u0635\u0644 \u0648\u0645\u0627\u062F\u0629" }), _jsxs("form", { onSubmit: handleLink, style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsxs("select", { value: pickClassId, onChange: (e) => setPickClassId(e.target.value), style: { flex: 1, padding: 10, minWidth: 140 }, required: true, children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0641\u0635\u0644" }), availableClasses.map((c) => _jsx("option", { value: c.id, children: c.name }, c.id))] }), _jsx("input", { type: "text", placeholder: "\u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629", value: subject, onChange: (e) => setSubject(e.target.value), style: { flex: 1, padding: 10, minWidth: 160 }, required: true }), _jsx("button", { type: "submit", disabled: linking, style: { padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }, children: linking ? '...' : 'ربط' })] })] }), _jsxs("h3", { style: { fontFamily: font.family }, children: ["\u0627\u0644\u0625\u0633\u0646\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629 (", assignments.length, ")"] }), assignments.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0645 \u064A\u062A\u0645 \u0631\u0628\u0637 \u0623\u064A \u0641\u0635\u0644 \u062F\u0631\u0627\u0633\u064A \u0628\u0639\u062F." }) : assignments.map((a) => (_jsxs("div", { style: { border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: 8, padding: spacing.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, children: [_jsxs("button", { onClick: () => { setAssessmentAssignmentId(a.id); changeSection('assessment'); }, style: { background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', textAlign: 'right' }, children: [a.subject || 'بدون مادة', " \u2014 ", classNameFor(a.classId)] }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }, children: [
                    _jsx("button", { onClick: () => handleEditSubject(a), disabled: editingSubjectId === a.id, style: { padding: '4px 9px', background: '#f2f2f2', color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 11 }, children: editingSubjectId === a.id ? '...' : 'تعديل الاسم' }),
                    _jsx("button", { onClick: () => handleUnlink(a), disabled: unlinkingId === a.id || editingSubjectId === a.id, style: { padding: '4px 9px', background: colors.redTint, color: colors.red, border: `1px solid ${colors.redBorder}`, borderRadius: 6, fontSize: 11 }, children: unlinkingId === a.id ? '...' : 'إلغاء الإسناد' })
                ] })] }, a.id))), assignments.length > 0 && (_jsxs("div", { style: { marginTop: spacing.xl }, children: [_jsx("h3", { style: { fontFamily: font.family }, children: "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629" }), _jsx(TeacherOverview, { schoolId: schoolId, assignments: assignments, classNameFor: classNameFor, compact: true })] }))] })), activeSection === 'assessment' && (_jsxs(_Fragment, { children: [_jsx(LegacyWeekReview, { schoolId: schoolId, teacherUid: teacherUid, classNameFor: classNameFor, onChanged: refresh }), assignments.length === 0 ? _jsx("p", { style: { color: colors.textMuted }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0633\u0646\u0627\u062F\u0627\u062A \u0646\u0634\u0637\u0629 \u0644\u0644\u0631\u0635\u062F." }) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { fontSize: 13 }, children: "\u0627\u0644\u0645\u0627\u062F\u0629 \u0648\u0627\u0644\u0641\u0635\u0644" }), _jsx("select", { value: activeAssessmentAssignment?.id || '', onChange: (e) => setAssessmentAssignmentId(e.target.value), style: { width: '100%', padding: 9, marginTop: 4 }, children: assignments.map((a) => _jsxs("option", { value: a.id, children: [a.subject || 'بدون مادة', " \u2014 ", classNameFor(a.classId)] }, a.id)) })] }), activeAssessmentAssignment && _jsx(ClassWeeks, { schoolId: schoolId, assignment: activeAssessmentAssignment, allAssignments: assignments, historicalAssignments: rawAssignments, classNameFor: classNameFor })] }))] })), activeSection === 'reports' && _jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(TeacherReports, { schoolId: schoolId, teacherUid: teacherUid, teacherName: teacherName, assignments: assignments, classNameFor: classNameFor }) }), activeSection === 'plans' && _jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(RemediationPlans, { schoolId: schoolId, teacherUid: teacherUid, teacherName: teacherName }) }), activeSection === 'ack' && _jsxs(_Fragment, { children: [_jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(ParentReviewTracking, { schoolId: schoolId, teacherUid: teacherUid, title: "اطلاع أولياء الأمور على الرصد" }) }), _jsx("div", { style: { borderTop: `1px solid ${colors.border}`, margin: `${spacing.xl}px 0 ${spacing.lg}px` } }), _jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(AckTracking, { schoolId: schoolId, teacherUid: teacherUid }) })] }), activeSection === 'library' && _jsx(Suspense, { fallback: _jsx(SectionLoading, {}), children: _jsx(RecommendationsLibrary, { schoolId: schoolId, teacherUid: teacherUid }) })] }));
}
