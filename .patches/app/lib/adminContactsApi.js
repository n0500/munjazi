import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { normalizePhone } from './noteWhatsApp.js';

// Local cache remains usable while the school activates the admin-only Firestore rule.
// Keys are partitioned by school; phone numbers never enter student or report records.
const cacheKey = (schoolId) => 'munjazi:admin-contacts:v1:' + schoolId;

export function cachedContactNumbers(schoolId) {
  try {
    const data = JSON.parse(window.localStorage.getItem(cacheKey(schoolId)) || '{}');
    if (!data || Array.isArray(data) || typeof data !== 'object') return {};
    return Object.fromEntries(Object.entries(data).filter(([uid, phone]) =>
      uid && typeof phone === 'string' && /^\d{8,15}$/.test(phone)
    ));
  } catch { return {}; }
}
function cacheNumbers(schoolId, entries) {
  try { window.localStorage.setItem(cacheKey(schoolId), JSON.stringify(entries)); }
  catch { /* Private browsing or disabled storage: cloud write still proceeds. */ }
}
export function watchContactNumbers(schoolId, onNext, onStatus) {
  onNext(cachedContactNumbers(schoolId));
  return onSnapshot(collection(db, 'schools', schoolId, 'adminContacts'), snap => {
    const numbers = Object.fromEntries(snap.docs.map(d => [d.id, d.data().phone]).filter(([, phone]) =>
      typeof phone === 'string' && /^\d{8,15}$/.test(phone)
    ));
    cacheNumbers(schoolId, numbers);
    onNext(numbers);
    onStatus('shared');
  }, err => onStatus(err?.code === 'permission-denied' ? 'local' : 'offline'));
}
export async function saveContactNumber(schoolId, teacherUid, input, adminUid) {
  if (!schoolId || !teacherUid || !adminUid) throw new Error('بيانات المدرسة أو المعلمة غير مكتملة.');
  const phone = normalizePhone(input);
  cacheNumbers(schoolId, { ...cachedContactNumbers(schoolId), [teacherUid]: phone });
  try {
    await setDoc(doc(db, 'schools', schoolId, 'adminContacts', teacherUid), {
      phone, updatedAt: serverTimestamp(), updatedBy: adminUid,
    });
    return { phone, shared: true };
  } catch (error) {
    // Do not claim cross-device persistence if security rules are not yet published.
    return { phone, shared: false, reason: error?.code || 'unavailable' };
  }
}
