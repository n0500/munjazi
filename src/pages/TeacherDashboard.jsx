import { useEffect, useState } from 'react';
import { listClasses, linkTeacherToClass, listTeacherAssignments, removeAssignment } from '../lib/classesApi';
import { listActionsForTeacher } from '../lib/actionEngine';
import ClassWeeks from './ClassWeeks';
import RecommendationsLibrary from './RecommendationsLibrary';
import TeacherOverview from './TeacherOverview';
import RemediationPlans from './RemediationPlans';
import AckTracking from './AckTracking';
import { colors, font, radius, spacing } from '../lib/theme';

const TABS = [
  { key: 'home', label: 'الرئيسية' },
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'plans', label: 'الخطط العلاجية' },
  { key: 'ack', label: 'متابعة الاطلاع' },
  { key: 'library', label: 'مكتبة التوصيات' },
];

export default function TeacherDashboard({ schoolId, teacherUid, teacherName }) {
  const [activeTab, setActiveTab] = useState('home');
  const [allClasses, setAllClasses] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [teacherActions, setTeacherActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pickClassId, setPickClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState(null);

  const [openClassId, setOpenClassId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [classRows, assignRows, actionRows] = await Promise.all([
        listClasses(schoolId),
        listTeacherAssignments(schoolId, teacherUid),
        listActionsForTeacher(schoolId, teacherUid),
      ]);
      setAllClasses(classRows);
      setMyAssignments(assignRows);
      setTeacherActions(actionRows.filter((a) => a.status === 'active'));
    } catch (err) {
      setError(err.message || 'تعذّر تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, teacherUid]);

  async function handleLink(e) {
    e.preventDefault();
    setError('');
    if (!pickClassId || linking) return;
    setLinking(true);
    try {
      await linkTeacherToClass(schoolId, pickClassId, teacherUid, teacherName, subject);
      setPickClassId('');
      setSubject('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر ربط الفصل الدراسي.');
    } finally {
      setLinking(false);
    }
  }

  // إلغاء إسناد فصل من المعلمة نفسها — يحذف علاقة الإسناد فقط، والبيانات التاريخية
  // (الأسابيع، المهارات، التقييمات) تبقى محفوظة بالكامل كما هي، غير متأثرة إطلاقًا
  async function handleUnlink(assignment) {
    const confirmed = window.confirm(
      `سيتم إلغاء إسناد فصل "${classNameFor(assignment.classId)}"${assignment.subject ? ` (${assignment.subject})` : ''}، ولن يظهر هذا الفصل باللوحة بعد الآن. تبقى كل التقييمات والبيانات السابقة محفوظة بالنظام، ويمكن ربط الفصل من جديد لاحقًا عند الحاجة. هل الرغبة في المتابعة مؤكدة؟`,
    );
    if (!confirmed) return;
    setError('');
    setUnlinkingId(assignment.id);
    try {
      await removeAssignment(schoolId, assignment.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إزالة الربط.');
    } finally {
      setUnlinkingId(null);
    }
  }

  const classNameFor = (classId) => allClasses.find((c) => c.id === classId)?.name || '؟';
  const availableClasses = allClasses.filter((c) => !c.archived);

  const remedialActions = teacherActions.filter((a) => a.type === 'remedial');
  const pendingAckCount = remedialActions.filter((a) => !a.parentAcknowledgment?.viewedAt).length;

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (openClassId) {
    const assignment = myAssignments.find((a) => a.classId === openClassId);
    return (
      <ClassWeeks
        schoolId={schoolId}
        classId={openClassId}
        teacherUid={teacherUid}
        teacherName={teacherName}
        className={classNameFor(openClassId)}
        subject={assignment?.subject || ''}
        onBack={() => setOpenClassId(null)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '20px auto', padding: 16 }} dir="rtl">
      <h1 style={{ fontFamily: font.family }}>لوحة المعلّمة</h1>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${colors.border}`, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${colors.primary}` : '2px solid transparent',
              color: activeTab === t.key ? colors.primary : colors.textMuted,
              fontFamily: font.family,
              fontWeight: activeTab === t.key ? font.weightMedium : font.weightRegular,
              fontSize: 14,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: 16 }}>{error}</div>}

      {activeTab === 'overview' && <TeacherOverview schoolId={schoolId} teacherUid={teacherUid} onBack={() => setActiveTab('home')} />}
      {activeTab === 'plans' && <RemediationPlans schoolId={schoolId} teacherUid={teacherUid} teacherName={teacherName} onBack={() => setActiveTab('home')} />}
      {activeTab === 'ack' && <AckTracking schoolId={schoolId} teacherUid={teacherUid} onBack={() => setActiveTab('home')} />}
      {activeTab === 'library' && <RecommendationsLibrary schoolId={schoolId} teacherUid={teacherUid} onBack={() => setActiveTab('home')} />}

      {activeTab === 'home' && (
        <>
          {remedialActions.length > 0 && (
            <div
              style={{
                background: colors.amberTint,
                borderRight: `3px solid ${colors.amberBorder}`,
                borderRadius: radius.button,
                padding: spacing.md,
                marginBottom: spacing.xl,
                fontFamily: font.family,
              }}
            >
              <div style={{ fontWeight: font.weightMedium, fontSize: 13, color: colors.amber, marginBottom: 4 }}>
                ⚠ {remedialActions.length} إجراءات علاجية نشطة {pendingAckCount > 0 && `· ${pendingAckCount} لم يُطّلع عليها بعد`}
              </div>
              <button
                onClick={() => setActiveTab('ack')}
                style={{ background: 'none', border: 'none', color: colors.amber, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
              >
                عرض التفاصيل
              </button>
            </div>
          )}

          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.xl }}>
            <h3 style={{ marginTop: 0, fontFamily: font.family }}>ربط فصل دراسي جديد</h3>
            <form onSubmit={handleLink} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={pickClassId} onChange={(e) => setPickClassId(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} required>
                <option value="">اختيار فصل</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input type="text" placeholder="المادة الدراسية (مثال: اللغة الإنجليزية)" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ flex: 1, padding: 10, minWidth: 140 }} />
              <button type="submit" disabled={linking} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
                {linking ? '...' : 'ربط'}
              </button>
            </form>
          </div>

          <h3 style={{ fontFamily: font.family }}>الفصول الدراسية ({myAssignments.length})</h3>
          {myAssignments.length === 0 ? (
            <p style={{ color: colors.textMuted }}>لم يتم ربط أي فصل دراسي بعد.</p>
          ) : (
            myAssignments.map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.card,
                  marginBottom: 10,
                  padding: spacing.md,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <button onClick={() => setOpenClassId(a.classId)} style={{ background: 'none', border: 'none', color: colors.ink, fontWeight: font.weightBold, fontSize: 16, cursor: 'pointer', fontFamily: font.family }}>
                  {classNameFor(a.classId)} — {a.subject || 'دون تحديد مادة'}
                </button>
                <button
                  onClick={() => handleUnlink(a)}
                  disabled={unlinkingId === a.id}
                  style={{ padding: '4px 10px', background: colors.red, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}
                >
                  {unlinkingId === a.id ? '...' : 'إلغاء الإسناد'}
                </button>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
