import { useEffect, useState } from 'react';
import { getPendingActions, activateAction, deferAction } from '../lib/actionEngine';

const TYPE_LABEL = {
  remedial: { icon: '⚠', text: 'علاجي' },
  enrichment: { icon: '⭐', text: 'إثرائي' },
};

export default function QuickReview({ schoolId, classId, teacherUid }) {
  const [pending, setPending] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    const actions = await getPendingActions(schoolId, classId);
    setPending(actions);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, classId]);

  if (pending === null) {
    return <p style={{ fontSize: 13, color: '#999', padding: 16 }}>...جارٍ التحميل</p>;
  }

  if (pending.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#999', padding: '40px 0', fontSize: 13 }}>
        لا توجد اقتراحات إجراءات بانتظار المراجعة حالياً.
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 4 }}>مراجعة الاقتراحات ({pending.length})</h2>

      {pending.map((action) => (
        <ReviewCard
          key={action.id}
          schoolId={schoolId}
          teacherUid={teacherUid}
          action={action}
          expanded={expandedId === action.id}
          onToggle={() => setExpandedId(expandedId === action.id ? null : action.id)}
          onDone={load}
        />
      ))}
    </div>
  );
}

function ReviewCard({ schoolId, teacherUid, action, expanded, onToggle, onDone }) {
  const [text, setText] = useState(action.finalText || action.suggestedText);
  const [saving, setSaving] = useState(false);
  const label = TYPE_LABEL[action.type];

  async function handleActivate() {
    setSaving(true);
    try {
      await activateAction(schoolId, {
        actionId: action.id,
        teacherUid,
        finalText: text,
        reviewDate: defaultReviewDate(),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  async function handleDefer() {
    setSaving(true);
    try {
      await deferAction(schoolId, { actionId: action.id });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 500, fontSize: 13, margin: 0 }}>
            {label.icon} {action.studentName}
          </p>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {action.affectedSkillTitles.join('، ')}
            {action.deferCount > 0 && (
              <span style={{ color: '#b8860b' }}> · مؤجَّل {action.deferCount} مرة</span>
            )}
          </p>
        </div>
        <button onClick={onToggle} style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', flexShrink: 0 }}>
          {expanded ? 'إخفاء التعديل' : 'تعديل النص ▾'}
        </button>
      </div>

      {expanded ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          style={{ width: '100%', marginTop: 8, border: '1px solid #ccc', borderRadius: 8, padding: 8, fontSize: 13 }}
        />
      ) : (
        <p style={{ fontSize: 13, color: '#333', marginTop: 8, background: '#fafafa', borderRadius: 8, padding: 8 }}>{text}</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={handleDefer}
          disabled={saving}
          style={{ padding: '4px 12px', fontSize: 12, color: '#555', border: '1px solid #ccc', background: '#fff', borderRadius: 8 }}
        >
          تأجيل ⏭
        </button>
        <button
          onClick={handleActivate}
          disabled={saving}
          style={{ padding: '4px 12px', fontSize: 12, color: '#fff', background: '#b8860b', border: 'none', borderRadius: 8 }}
        >
          تفعيل ✓
        </button>
      </div>
    </div>
  );
}

function defaultReviewDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}
