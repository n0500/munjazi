import { useState } from 'react';
import { activateAction, deferAction } from '../lib/actionEngine';

const TYPE_LABEL = {
  remedial: { icon: '⚠', text: 'علاجي' },
  enrichment: { icon: '⭐', text: 'إثرائي' },
};

export default function ActionColumn({ schoolId, teacherUid, studentName, actions, onChanged }) {
  const [openAction, setOpenAction] = useState(null);

  if (!actions || actions.length === 0) {
    return <span style={{ color: '#ccc' }}>—</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {actions.map((action) => {
        const label = TYPE_LABEL[action.type];
        const isActive = action.status === 'active';
        const bg = isActive
          ? (action.type === 'remedial' ? '#fdf3e2' : '#eaf6ee')
          : '#f5f5f5';
        const border = isActive
          ? (action.type === 'remedial' ? '#e0b25c' : '#0b7a4b')
          : '#ccc';
        const textColor = isActive
          ? (action.type === 'remedial' ? '#8a5a00' : '#0b5c33')
          : '#555';
        return (
          <button
            key={action.id}
            onClick={() => setOpenAction(action)}
            style={{
              fontSize: 12,
              textAlign: 'right',
              padding: '4px 8px',
              borderRadius: 6,
              background: bg,
              border: `1px solid ${border}`,
              color: textColor,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: 'bold' }}>{label.icon}</span>{' '}
            {action.affectedSkillTitles.join('، ')}
            <span style={{ fontSize: 10, opacity: 0.7, marginRight: 4 }}>
              {isActive ? '(نشط)' : '(مقترح)'}
            </span>
          </button>
        );
      })}

      {openAction && (
        <ActionModal
          schoolId={schoolId}
          teacherUid={teacherUid}
          studentName={studentName}
          action={openAction}
          onClose={() => setOpenAction(null)}
          onChanged={() => {
            setOpenAction(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function ActionModal({ schoolId, teacherUid, studentName, action, onClose, onChanged }) {
  const [text, setText] = useState(action.finalText || action.suggestedText);
  const [reviewDate, setReviewDate] = useState(defaultReviewDate());
  const [saving, setSaving] = useState(false);

  const isPending = action.status === 'suggested';
  const label = TYPE_LABEL[action.type];

  async function handleActivate() {
    setSaving(true);
    try {
      await activateAction(schoolId, {
        actionId: action.id,
        teacherUid,
        finalText: text,
        reviewDate,
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDefer() {
    setSaving(true);
    try {
      await deferAction(schoolId, { actionId: action.id });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
      }}
      dir="rtl"
    >
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', width: '100%', maxWidth: 420, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>{label.icon}</span>
          <h3 style={{ margin: 0, fontWeight: 600 }}>إجراء {label.text} — {studentName}</h3>
        </div>

        <p style={{ fontSize: 12, color: '#777', marginBottom: 16 }}>
          المهارات المتأثرة: {action.affectedSkillTitles.join('، ')}
          {action.deferCount > 0 && (
            <span style={{ color: '#b8860b' }}> · تم تأجيله {action.deferCount} مرة</span>
          )}
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>نص الإجراء</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={{ width: '100%', border: '1px solid #ccc', borderRadius: 8, padding: 8, fontSize: 13, marginBottom: 16 }}
        />

        {isPending && (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>تاريخ المراجعة المتوقع</label>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              style={{ width: '100%', border: '1px solid #ccc', borderRadius: 8, padding: 8, fontSize: 13, marginBottom: 16 }}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 12px', fontSize: 13, color: '#777', background: 'none', border: 'none', borderRadius: 8 }}>
            إغلاق
          </button>
          {isPending && (
            <>
              <button
                onClick={handleDefer}
                disabled={saving}
                style={{ padding: '6px 12px', fontSize: 13, color: '#333', border: '1px solid #ccc', background: '#fff', borderRadius: 8 }}
              >
                تأجيل هذا الأسبوع
              </button>
              <button
                onClick={handleActivate}
                disabled={saving}
                style={{ padding: '6px 12px', fontSize: 13, color: '#fff', background: '#b8860b', border: 'none', borderRadius: 8 }}
              >
                تفعيل الإجراء
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function defaultReviewDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}
