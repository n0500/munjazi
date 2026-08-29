import { useEffect, useState } from "react";
import { getPendingActions, activateAction, deferAction } from "../lib/actionEngine";

const TYPE_LABEL = {
  remedial: { icon: "⚠", text: "علاجي" },
  enrichment: { icon: "⭐", text: "إثرائي" },
};

export default function QuickReview({ db, schoolId, classId, teacherId }) {
  const [pending, setPending] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    const actions = await getPendingActions(db, { schoolId, classId });
    setPending(actions);
  }

  useEffect(() => {
    load();
  }, [schoolId, classId]);

  if (pending === null) {
    return <p className="text-sm text-gray-400 p-4">جاري التحميل...</p>;
  }

  if (pending.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10 text-sm">
        لا توجد اقتراحات إجراءات بانتظار المراجعة حالياً.
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-lg mx-auto flex flex-col gap-3 p-4">
      <h2 className="font-semibold text-gray-900 mb-1">
        مراجعة الاقتراحات ({pending.length})
      </h2>

      {pending.map((action) => (
        <ReviewCard
          key={action.id}
          db={db}
          schoolId={schoolId}
          classId={classId}
          teacherId={teacherId}
          action={action}
          expanded={expandedId === action.id}
          onToggle={() => setExpandedId(expandedId === action.id ? null : action.id)}
          onDone={load}
        />
      ))}
    </div>
  );
}

function ReviewCard({ db, schoolId, classId, teacherId, action, expanded, onToggle, onDone }) {
  const [text, setText] = useState(action.finalText || action.suggestedText);
  const [saving, setSaving] = useState(false);
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
      await deferAction(db, { schoolId, classId, actionId: action.id });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">
            {label.icon} {action.studentName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {action.affectedSkills.map((s) => s.skillName).join("، ")}
            {action.deferCount > 0 && (
              <span className="text-amber-600"> · مؤجَّل {action.deferCount} مرة</span>
            )}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
        >
          {expanded ? "إخفاء التعديل" : "تعديل النص ▾"}
        </button>
      </div>

      {expanded ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full mt-2 border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      ) : (
        <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-lg p-2">{text}</p>
      )}

      <div className="flex gap-2 justify-end mt-2">
        <button
          onClick={handleDefer}
          disabled={saving}
          className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          تأجيل ⏭
        </button>
        <button
          onClick={handleActivate}
          disabled={saving}
          className="px-3 py-1 text-xs text-white bg-amber-600 rounded-lg hover:bg-amber-700"
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
