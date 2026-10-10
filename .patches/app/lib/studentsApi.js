import { collection, doc, getDoc, getDocs, writeBatch, query, where, orderBy, serverTimestamp, } from 'firebase/firestore';
import { db } from './firebase.js';

async function sha256Hex(text) {
    const data = new TextEncoder().encode(text.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toWesternDigits(value) {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    return String(value || '').replace(/[٠-٩۰-۹]/g, (ch) => {
        const a = arabic.indexOf(ch);
        if (a >= 0)
            return String(a);
        const p = persian.indexOf(ch);
        return p >= 0 ? String(p) : ch;
    });
}

function normalizeStudentName(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه');
}

function parsePastedRows(rawText) {
    return String(rawText || '').split(/\r?\n/).map((rawLine, index) => {
        const line = toWesternDigits(rawLine).trim();
        if (!line)
            return null;
        if (/الاسم/.test(line) && /السجل/.test(line))
            return null;
        let match = line.match(/^(.*?)[\t,;،]\s*([0-9]{10})\s*$/);
        if (!match)
            match = line.match(/^(.*?)\s+([0-9]{10})\s*$/);
        if (!match) {
            const parts = line.split(/[\t,;،]/).map((p) => p.trim()).filter(Boolean);
            return {
                lineNo: index + 1,
                raw: rawLine,
                name: parts[0] || '',
                nationalId: parts[1] || '',
                parseError: 'تعذّر قراءة السطر. استخدمي: الاسم، السجل المدني.',
            };
        }
        return {
            lineNo: index + 1,
            raw: rawLine,
            name: match[1].trim(),
            nationalId: match[2].trim(),
            parseError: '',
        };
    }).filter(Boolean);
}

export async function listAllStudents(schoolId) {
    const q = query(collection(db, 'schools', schoolId, 'students'), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listClassStudents(schoolId, classId) {
    // جلب طالبات الفصل المطلوب فقط، بدلا من قراءة جميع طالبات المدرسة في كل مرة.
    const snap = await getDocs(query(collection(db, 'schools', schoolId, 'students'), where('currentClassId', '==', classId)));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.archived);
    return rows.sort((a, b) => (a.name || '') < (b.name || '') ? -1 : (a.name || '') > (b.name || '') ? 1 : 0);
}

async function loadNationalIdOwners(schoolId) {
    const snap = await getDocs(collection(db, 'schools', schoolId, 'studentPrivate'));
    const owners = new Map();
    snap.docs.forEach((d) => {
        const nationalId = toWesternDigits((d.data().nationalId || '').trim());
        if (nationalId)
            owners.set(nationalId, d.id);
    });
    return owners;
}

async function assertNationalIdAvailable(schoolId, nationalId, exceptStudentId = null, owners = null) {
    const currentOwners = owners || await loadNationalIdOwners(schoolId);
    const ownerStudentId = currentOwners.get(nationalId);
    if (ownerStudentId && ownerStudentId !== exceptStudentId) {
        const err = new Error('رقم السجل المدني مستخدم مسبقًا لطالبة أخرى.');
        err.code = 'duplicate-national-id';
        throw err;
    }
    return sha256Hex(nationalId);
}

async function createOneStudent(schoolId, classId, name, nationalId, owners = null) {
    const trimmedName = (name || '').trim();
    const trimmedId = toWesternDigits((nationalId || '').trim());
    if (!trimmedName)
        throw new Error('اسم الطالبة مطلوب.');
    if (!/^[0-9]{10}$/.test(trimmedId))
        throw new Error('يجب أن يتكوّن رقم السجل المدني من عشرة أرقام.');
    const hash = await assertNationalIdAvailable(schoolId, trimmedId, null, owners);
    const studentRef = doc(collection(db, 'schools', schoolId, 'students'));
    const batch = writeBatch(db);
    batch.set(studentRef, {
        name: trimmedName,
        currentClassId: classId,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'schools', schoolId, 'studentPrivate', studentRef.id), {
        nationalId: trimmedId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'studentsByNationalId', hash), { schoolId, studentId: studentRef.id });
    await batch.commit();
    if (owners)
        owners.set(trimmedId, studentRef.id);
    return studentRef.id;
}

export async function addSingleStudent(schoolId, classId, name, nationalId) {
    return createOneStudent(schoolId, classId, name, nationalId);
}

export async function bulkImportStudents(schoolId, classId, rawText) {
    const rows = parsePastedRows(rawText);
    const owners = await loadNationalIdOwners(schoolId);
    let success = 0;
    const failed = [];
    for (const row of rows) {
        try {
            if (row.parseError)
                throw new Error(row.parseError);
            // eslint-disable-next-line no-await-in-loop
            await createOneStudent(schoolId, classId, row.name, row.nationalId, owners);
            success += 1;
        }
        catch (err) {
            failed.push({ ...row, reason: err.message });
        }
    }
    return { success, failed, total: rows.length };
}

export async function updateStudent(schoolId, studentId, { name, nationalId }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName)
        throw new Error('اسم الطالبة مطلوب.');
    const privateRef = doc(db, 'schools', schoolId, 'studentPrivate', studentId);
    const privateSnap = await getDoc(privateRef);
    const oldNationalId = privateSnap.exists() ? toWesternDigits((privateSnap.data().nationalId || '').trim()) : '';
    const trimmedId = toWesternDigits((nationalId || oldNationalId).trim());
    if (trimmedId && !/^[0-9]{10}$/.test(trimmedId)) {
        throw new Error('يجب أن يتكوّن رقم السجل المدني من عشرة أرقام.');
    }
    const owners = await loadNationalIdOwners(schoolId);
    const newHash = trimmedId ? await assertNationalIdAvailable(schoolId, trimmedId, studentId, owners) : null;
    const oldHash = oldNationalId ? await sha256Hex(oldNationalId) : null;
    const batch = writeBatch(db);
    batch.update(doc(db, 'schools', schoolId, 'students', studentId), {
        name: trimmedName,
        updatedAt: serverTimestamp(),
    });
    if (trimmedId) {
        batch.set(privateRef, { nationalId: trimmedId, updatedAt: serverTimestamp() }, { merge: true });
        batch.set(doc(db, 'studentsByNationalId', newHash), { schoolId, studentId });
    }
    if (oldHash && oldHash !== newHash) {
        batch.delete(doc(db, 'studentsByNationalId', oldHash));
    }
    await batch.commit();
}

export async function deleteStudent(schoolId, studentId) {
    const privateRef = doc(db, 'schools', schoolId, 'studentPrivate', studentId);
    const privateSnap = await getDoc(privateRef);
    const nationalId = privateSnap.exists() ? toWesternDigits((privateSnap.data().nationalId || '').trim()) : '';
    const batch = writeBatch(db);
    batch.delete(doc(db, 'schools', schoolId, 'students', studentId));
    batch.delete(privateRef);
    if (nationalId) {
        const hash = await sha256Hex(nationalId);
        batch.delete(doc(db, 'studentsByNationalId', hash));
    }
    await batch.commit();
}

export async function moveStudent(schoolId, studentId, newClassId) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'schools', schoolId, 'students', studentId), {
        currentClassId: newClassId,
        updatedAt: serverTimestamp(),
    });
    await batch.commit();
}

async function loadRosterDirectory(schoolId) {
    const [studentSnap, privateSnap] = await Promise.all([
        getDocs(collection(db, 'schools', schoolId, 'students')),
        getDocs(collection(db, 'schools', schoolId, 'studentPrivate')),
    ]);
    const students = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const studentsById = new Map(students.map((s) => [s.id, s]));
    const privateByStudentId = new Map();
    const ownersByNationalId = new Map();
    privateSnap.docs.forEach((d) => {
        const row = { id: d.id, ...d.data() };
        const nationalId = toWesternDigits((row.nationalId || '').trim());
        privateByStudentId.set(d.id, { ...row, nationalId });
        if (nationalId) {
            const list = ownersByNationalId.get(nationalId) || [];
            list.push(d.id);
            ownersByNationalId.set(nationalId, list);
        }
    });
    return { students, studentsById, privateByStudentId, ownersByNationalId };
}

async function loadNationalIndexForRows(rows) {
    const pairs = await Promise.all(rows.map(async (row) => {
        const hash = await sha256Hex(row.nationalId);
        const snap = await getDoc(doc(db, 'studentsByNationalId', hash));
        return [row.nationalId, { hash, exists: snap.exists(), data: snap.exists() ? snap.data() : null }];
    }));
    return new Map(pairs);
}

function summarizeSyncItems(items, extras, invalidRows, duplicateIds, conflicts) {
    return {
        official: items.length + invalidRows.length + duplicateIds.length + conflicts.length,
        unchanged: items.filter((x) => x.status === 'unchanged').length,
        add: items.filter((x) => x.status === 'add').length,
        recover: items.filter((x) => x.status === 'recover').length,
        move: items.filter((x) => x.flags?.move).length,
        rename: items.filter((x) => x.flags?.rename).length,
        reactivate: items.filter((x) => x.flags?.reactivate).length,
        linkNationalId: items.filter((x) => x.flags?.linkNationalId).length,
        repairIndex: items.filter((x) => x.flags?.repairIndex).length,
        extras: extras.length,
        invalid: invalidRows.length,
        duplicateIds: duplicateIds.length,
        conflicts: conflicts.length,
    };
}

export async function previewStudentRosterSync(schoolId, classId, rawText) {
    const parsed = parsePastedRows(rawText);
    const invalidRows = [];
    const duplicateIds = [];
    const validRows = [];
    const seenOfficialIds = new Map();

    parsed.forEach((row) => {
        if (row.parseError || !row.name || !/^[0-9]{10}$/.test(row.nationalId)) {
            invalidRows.push({ ...row, reason: row.parseError || 'تحققي من الاسم وأن السجل المدني 10 أرقام.' });
            return;
        }
        if (seenOfficialIds.has(row.nationalId)) {
            duplicateIds.push({ ...row, reason: `السجل المدني مكرر أيضًا في السطر ${seenOfficialIds.get(row.nationalId)}.` });
            return;
        }
        seenOfficialIds.set(row.nationalId, row.lineNo);
        validRows.push(row);
    });

    const directory = await loadRosterDirectory(schoolId);
    const indexByNationalId = await loadNationalIndexForRows(validRows);
    const nameCandidates = new Map();
    directory.students.forEach((student) => {
        const key = normalizeStudentName(student.name);
        const list = nameCandidates.get(key) || [];
        list.push(student);
        nameCandidates.set(key, list);
    });

    const items = [];
    const conflicts = [];
    const matchedStudentIds = new Set();

    for (const row of validRows) {
        const owners = directory.ownersByNationalId.get(row.nationalId) || [];
        const index = indexByNationalId.get(row.nationalId);
        const indexData = index?.data || null;

        if (owners.length > 1) {
            conflicts.push({ ...row, reason: 'السجل المدني مرتبط بأكثر من سجل طالبة داخل المدرسة.' });
            continue;
        }
        if (indexData && indexData.schoolId && indexData.schoolId !== schoolId) {
            conflicts.push({ ...row, reason: 'السجل المدني مرتبط بمدرسة أخرى في منجزي.' });
            continue;
        }

        const ownerId = owners[0] || null;
        const indexStudentId = indexData?.studentId || null;
        if (ownerId && indexStudentId && ownerId !== indexStudentId) {
            conflicts.push({ ...row, reason: 'يوجد تعارض بين بيانات السجل المدني وفهرس ولي الأمر. لم يتم التعديل.' });
            continue;
        }

        let studentId = ownerId || indexStudentId || null;
        let matchedByName = false;

        if (!studentId) {
            const candidates = (nameCandidates.get(normalizeStudentName(row.name)) || [])
                .filter((student) => !directory.privateByStudentId.get(student.id)?.nationalId);
            if (candidates.length === 1) {
                studentId = candidates[0].id;
                matchedByName = true;
            }
            else if (candidates.length > 1) {
                conflicts.push({ ...row, reason: 'وجد أكثر من سجل بالاسم نفسه بدون سجل مدني؛ يحتاج مراجعة يدوية.' });
                continue;
            }
        }

        if (!studentId) {
            items.push({
                ...row,
                status: 'add',
                studentId: null,
                fromClassId: null,
                flags: { add: true },
            });
            continue;
        }

        if (matchedStudentIds.has(studentId)) {
            conflicts.push({ ...row, reason: 'أكثر من سطر في القائمة الرسمية يطابق سجل الطالبة نفسه.' });
            continue;
        }
        matchedStudentIds.add(studentId);

        const student = directory.studentsById.get(studentId) || null;
        const privateRow = directory.privateByStudentId.get(studentId) || null;
        if (privateRow?.nationalId && privateRow.nationalId !== row.nationalId) {
            conflicts.push({ ...row, reason: 'الاسم يطابق طالبة لديها سجل مدني مختلف؛ لم يتم الربط تلقائيًا.' });
            continue;
        }

        if (!student) {
            items.push({
                ...row,
                status: 'recover',
                studentId,
                fromClassId: null,
                flags: {
                    recover: true,
                    linkNationalId: !privateRow?.nationalId,
                    repairIndex: !index?.exists || indexStudentId !== studentId || indexData?.schoolId !== schoolId,
                },
            });
            continue;
        }

        const flags = {
            move: student.currentClassId !== classId,
            rename: String(student.name || '').trim() !== row.name.trim(),
            reactivate: student.archived === true,
            linkNationalId: matchedByName || !privateRow?.nationalId,
            repairIndex: !index?.exists || indexStudentId !== studentId || indexData?.schoolId !== schoolId,
        };
        const hasChange = Object.values(flags).some(Boolean);
        items.push({
            ...row,
            status: hasChange ? 'update' : 'unchanged',
            studentId,
            currentName: student.name || '',
            fromClassId: student.currentClassId || null,
            flags,
        });
    }

    const currentStudents = directory.students.filter((s) => s.currentClassId === classId && !s.archived);
    const officialMatchedIds = new Set(items.filter((x) => x.studentId).map((x) => x.studentId));
    const extras = currentStudents
        .filter((student) => !officialMatchedIds.has(student.id))
        .map((student) => ({ id: student.id, name: student.name || 'طالبة', currentClassId: student.currentClassId }));

    const summary = summarizeSyncItems(items, extras, invalidRows, duplicateIds, conflicts);
    return {
        classId,
        currentCount: currentStudents.length,
        officialCount: validRows.length + invalidRows.length + duplicateIds.length,
        items,
        extras,
        invalidRows,
        duplicateIds,
        conflicts,
        summary,
        canApply: invalidRows.length === 0 && duplicateIds.length === 0 && conflicts.length === 0 && validRows.length > 0,
    };
}

async function countAssessmentsForStudentIds(schoolId, ids) {
    if (!ids.size)
        return 0;
    const snap = await getDocs(collection(db, 'schools', schoolId, 'assessments'));
    let count = 0;
    snap.docs.forEach((d) => {
        if (ids.has(d.data().studentId))
            count += 1;
    });
    return count;
}

async function syncActiveWeekSnapshots(schoolId, classId, officialStudents) {
    if (!officialStudents.length)
        return 0;
    const snap = await getDocs(collection(db, 'schools', schoolId, 'weeks'));
    const weeks = snap.docs.filter((d) => {
        const row = d.data();
        return row.classId === classId && row.archived !== true && row.deleted !== true;
    });
    let updated = 0;
    for (let i = 0; i < weeks.length; i += 100) {
        const batch = writeBatch(db);
        let hasWrites = false;
        weeks.slice(i, i + 100).forEach((weekDoc) => {
            const data = weekDoc.data();
            const snapshot = Array.isArray(data.studentSnapshot) ? data.studentSnapshot : [];
            const map = new Map(snapshot.filter((x) => x?.id).map((x) => [x.id, { id: x.id, name: x.name || '' }]));
            let changed = false;
            officialStudents.forEach((student) => {
                const existing = map.get(student.id);
                if (!existing || existing.name !== student.name) {
                    map.set(student.id, { id: student.id, name: student.name });
                    changed = true;
                }
            });
            if (changed) {
                batch.set(weekDoc.ref, { studentSnapshot: [...map.values()] }, { merge: true });
                hasWrites = true;
                updated += 1;
            }
        });
        if (hasWrites) {
            // eslint-disable-next-line no-await-in-loop
            await batch.commit();
        }
    }
    return updated;
}

export async function syncStudentRoster(schoolId, classId, rawText) {
    const preview = await previewStudentRosterSync(schoolId, classId, rawText);
    if (!preview.canApply) {
        const err = new Error('لا يمكن اعتماد التحديث قبل معالجة الأخطاء أو التعارضات الظاهرة في المعاينة.');
        err.code = 'roster-sync-blocked';
        err.preview = preview;
        throw err;
    }

    const existingIds = new Set(preview.items.filter((x) => x.studentId).map((x) => x.studentId));
    const finalIdByNationalId = new Map(preview.items.filter((x) => x.studentId).map((x) => [x.nationalId, x.studentId]));
    const assessmentsBefore = await countAssessmentsForStudentIds(schoolId, existingIds);
    const chunks = [];
    for (let i = 0; i < preview.items.length; i += 120)
        chunks.push(preview.items.slice(i, i + 120));

    for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const item of chunk) {
            const hash = await sha256Hex(item.nationalId);
            if (item.status === 'add') {
                const studentRef = doc(collection(db, 'schools', schoolId, 'students'));
                finalIdByNationalId.set(item.nationalId, studentRef.id);
                batch.set(studentRef, {
                    name: item.name.trim(),
                    currentClassId: classId,
                    archived: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                batch.set(doc(db, 'schools', schoolId, 'studentPrivate', studentRef.id), {
                    nationalId: item.nationalId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                batch.set(doc(db, 'studentsByNationalId', hash), { schoolId, studentId: studentRef.id });
                continue;
            }

            const studentRef = doc(db, 'schools', schoolId, 'students', item.studentId);
            if (item.status === 'recover') {
                batch.set(studentRef, {
                    name: item.name.trim(),
                    currentClassId: classId,
                    archived: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            else if (item.status === 'update') {
                batch.set(studentRef, {
                    name: item.name.trim(),
                    currentClassId: classId,
                    archived: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            if (item.flags?.linkNationalId || item.status === 'recover') {
                batch.set(doc(db, 'schools', schoolId, 'studentPrivate', item.studentId), {
                    nationalId: item.nationalId,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            if (item.flags?.repairIndex || item.flags?.linkNationalId || item.status === 'recover') {
                batch.set(doc(db, 'studentsByNationalId', hash), { schoolId, studentId: item.studentId });
            }
        }
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
    }

    const officialStudents = preview.items.map((item) => ({
        id: finalIdByNationalId.get(item.nationalId),
        name: item.name.trim(),
    })).filter((x) => x.id);
    const activeWeeksUpdated = await syncActiveWeekSnapshots(schoolId, classId, officialStudents);

    const assessmentsAfter = await countAssessmentsForStudentIds(schoolId, existingIds);
    const verificationPreview = await previewStudentRosterSync(schoolId, classId, rawText);
    const pendingChanges = verificationPreview.summary.add
        + verificationPreview.summary.recover
        + verificationPreview.summary.move
        + verificationPreview.summary.rename
        + verificationPreview.summary.reactivate
        + verificationPreview.summary.linkNationalId
        + verificationPreview.summary.repairIndex;
    const verified = verificationPreview.invalidRows.length === 0
        && verificationPreview.duplicateIds.length === 0
        && verificationPreview.conflicts.length === 0
        && pendingChanges === 0
        && assessmentsBefore === assessmentsAfter;

    return {
        applied: true,
        previewBefore: preview,
        verification: {
            verified,
            officialCount: verificationPreview.officialCount,
            classCountAfter: verificationPreview.currentCount,
            extraCurrentCount: verificationPreview.extras.length,
            assessmentsBefore,
            assessmentsAfter,
            priorAssessmentDataPreserved: assessmentsBefore === assessmentsAfter,
            activeWeeksUpdated,
            remaining: verificationPreview.summary,
        },
    };
}

export async function exportStudentRosterSafetyBackupBlob(schoolId, classId) {
    const [studentSnap, privateSnap] = await Promise.all([
        getDocs(collection(db, 'schools', schoolId, 'students')),
        getDocs(collection(db, 'schools', schoolId, 'studentPrivate')),
    ]);
    const payload = {
        kind: 'munjazi-student-roster-safety-backup',
        exportedAt: new Date().toISOString(),
        schoolId,
        targetClassId: classId,
        students: studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        studentPrivate: privateSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
    const json = JSON.stringify(payload, (key, value) => {
        if (value && typeof value === 'object' && typeof value.toDate === 'function')
            return { __munjaziTimestamp: value.toDate().toISOString() };
        return value;
    }, 2);
    return new Blob([json], { type: 'application/json;charset=utf-8' });
}
