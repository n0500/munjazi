import { useState } from "react";
import { activateAction, deferAction } from "../lib/actionEngine";

const TYPE_LABEL = {
  remedial: { icon: "⚠", text: "علاجي" },
  enrichment: { icon: "⭐", text: "إثرائي" },
};

export default function ActionColumn({ db, schoolId, classId, teacherId, studentName, actions, onChanged }) {
  const [openAction, setOpenAction] = useState(null);

  if (!actions || actions.length === 0) {
    return <span className="text-gray-300 select-none">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => setOpenAction(action)}
          className={
            "text-xs rounded-md px-2 py-1 text-right transition-colors " +
            (action.status === "active"
              ? action.type === "remedial"
                ? "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-dashed border-gray-300")
          }
        >
          <span className="font-medium">{TYPE_LABEL[action.type].icon}</span>{" "}
          {action.affectedSkills.map((s) => s.skillName).join("، ")}
          <span className="text-[10px] mx-1 opacity-70">
            {action.status === "active" ? "(نشط)" : "(مقترح)"}
          </span>
        </button>
      ))}

      {openAction && (
        <ActionModal
          db={db}
          schoolId={schoolId}
          classId={classId}
          teacherId={teacherId}
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

function ActionModal({ db, schoolId, classId, teacherId, studentName, action, onClose, onChanged }) {
  const [text, setText] = useState(action.finalText || action.suggestedText);
  const [reviewDate, setReviewDate] = useState(defaultReviewDate());
  const [saving, setSaving] = useState(false);

  const isPending = action.status === "suggested";
  const label = TYPE_LABEL[action.type];

  async function handleActivate() {
    setSaving(true);
    try {
      await activateAction(db, {
        schoolId,
        classId,
        actionId: action.id,
        teacherId,
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
      await deferAction(db, { schoolId, classId, actionId: action.id });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{label.icon}</span>
          <h3 className="font-semibold text-gray-900">
            إجراء {label.text} — {studentName}
          </h3>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          المهارات المتأثرة: {action.affectedSkills.map((s) => s.skillName).join("، ")}
          {action.deferCount > 0 && (
            <span className="text-amber-600"> · تم تأجيله {action.deferCount} مرة</span>
          )}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">نص الإجراء</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg p-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />

        {isPending && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ المراجعة المتوقع</label>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm mb-4"
            />
          </>
        )}

        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            إغلاق
          </button>
          {isPending && (
            <>
              <button
                onClick={handleDefer}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                تأجيل هذا الأسبوع
              </button>
              <button
                onClick={handleActivate}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700"
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
