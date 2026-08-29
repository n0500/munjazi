import { useEffect, useState } from 'react';
import { updateActionText, listActionTemplatesForType, addActionTemplate } from '../lib/actionEngine';

const TYPE_LABEL = {
  remedial: { icon: '⚠', text: 'علاجي' },
  enrichment: { icon: '⭐', text: 'إثرائي' },
};

const NEW_TEMPLATE_VALUE = '__new__';

export default function ActionColumn({ schoolId, teacherUid, studentName, actions, onChanged }) {
  const [openAction, setOpenAction] = useState(null);

  if (!actions || actions.length === 0) {
    return <span style={{ color: '#ccc' }}>—</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {actions.map((action) => {
        const label = TYPE_LABEL[action.type];
        const bg = action.type === 'remedial' ? '#fdf3e2' : '#eaf6ee';
        const border = action.type === 'remedial' ? '#e0b25c' : '#0b7a4b';
        const textColor = action.type === 'remedial' ? '#8a5a00' : '#0b5c33';
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
            <span style={{ fontSize: 10, opacity: 0.7, marginRight: 4 }}>(نشط)</span>
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
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const label = TYPE_LABEL[action.type];

  useEffect(() => {
    listActionTemplatesForType(schoolId, action.type).then(setTemplates);
  }, [schoolId, action.type]);

  async function handleTemplateSelect(value) {
    if (value === NEW_TEMPLATE_VALUE) {
      const newText = window.prompt('اكتبي نص الإجراء الجديد:');
      if (!newText || !newText.trim()) return;
      try {
        await addActionTemplate(schoolId, { type: action.type, text: newText, teacherUid });
        setText(newText.trim());
        const updated = await listActionTemplatesForType(schoolId, action.type);
        setTemplates(updated);
      } catch (err) {
        window.alert(err.message || 'تعذّر إضافة النص.');
      }
      return;
    }
    setText(value);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateActionText(schoolId, { actionId: action.id, finalText: text });
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
        </p>

        {templates.length > 0 && (
          <select
            value=""
            onChange={(e) => handleTemplateSelect(e.target.value)}
            style={{ width: '100%', padding: 6, fontSize: 12, marginBottom: 8 }}
          >
            <option value="">اختيار نص جاهز</option>
            {templates.map((t) => (
              <option key={t.id} value={t.text}>{t.text}</option>
            ))}
            <option value={NEW_TEMPLATE_VALUE}>+ إضافة نص جديد</option>
          </select>
        )}
        {templates.length === 0 && (
          <button
            onClick={() => handleTemplateSelect(NEW_TEMPLATE_VALUE)}
            style={{ fontSize: 12, color: '#0b7a4b', background: 'none', border: 'none', marginBottom: 8, padding: 0 }}
          >
            + إضافة أول نص لهذا النوع
          </button>
        )}

        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>نص الإجراء</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={{ width: '100%', border: '1px solid #ccc', borderRadius: 8, padding: 8, fontSize: 13, marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 12px', fontSize: 13, color: '#777', background: 'none', border: 'none', borderRadius: 8 }}>
            إغلاق
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '6px 12px', fontSize: 13, color: '#fff', background: '#0b7a4b', border: 'none', borderRadius: 8 }}
          >
            {saving ? '...' : 'حفظ التعديل'}
          </button>
        </div>
      </div>
    </div>
  );
}
