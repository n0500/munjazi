import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,serverTimestamp,deleteField } from 'firebase/firestore';
import fs from 'node:fs';
const fragment=fs.readFileSync(new URL('../firebase/admin-notes.rules.fragment', import.meta.url),'utf8');
const helpers=`function isSignedIn(){return request.auth != null;}
function hasUserDoc(){return isSignedIn() && exists(/databases/$(database)/documents/users/$(request.auth.uid));}
function userDoc(){return get(/databases/$(database)/documents/users/$(request.auth.uid));}
function isEnabledUser(){return hasUserDoc() && userDoc().data.get('disabled',false) != true;}
function isAdminOf(s){return isEnabledUser() && userDoc().data.role == 'admin' && userDoc().data.schoolId == s;}
function isTeacherOf(s){return isEnabledUser() && userDoc().data.role == 'teacher' && userDoc().data.schoolId == s;}
function schoolIsActive(s){return exists(/databases/$(database)/documents/schools/$(s)) && get(/databases/$(database)/documents/schools/$(s)).data.get('active',false) == true;}`;
const env=await initializeTestEnvironment({projectId:'demo-munjazi-notes',firestore:{host:'127.0.0.1',port:8089,rules:`rules_version = '2'; service cloud.firestore {match /databases/{database}/documents {${helpers}\n${fragment}}}`}});
try {
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  for(const [uid,role,schoolId,disabled] of [['admin','admin','s',false],['teacher','teacher','s',false],['other','teacher','s',false],['parent','parent','s',false],['outsider','admin','x',false],['blocked','teacher','s',true]]) await setDoc(doc(db,'users',uid),{role,schoolId,disabled,displayName:uid});
  await setDoc(doc(db,'schools','s'),{active:true});
 });
 const db=id=>id?env.authenticatedContext(id).firestore():env.unauthenticatedContext().firestore();
 const ref=id=>doc(db(id),'schools/s/adminNotes/n');
 const data=()=>({teacherUid:'teacher',teacherName:'teacher',adminUid:'admin',adminName:'admin',assignmentId:'',context:'',kind:'action',text:'ملاحظة',createdAt:serverTimestamp(),readAt:null,completedAt:null,reply:'',repliedAt:null});
 await assertSucceeds(setDoc(ref('admin'),data()));
 for(const id of [null,'other','parent','outsider','blocked']) {await assertFails(getDoc(ref(id))); await assertFails(updateDoc(ref(id),{readAt:serverTimestamp()}));}
 for(const id of ['admin','teacher']) await assertSucceeds(getDoc(ref(id)));
 await assertSucceeds(getDocs(collection(db('admin'),'schools/s/adminNotes')));
 await assertSucceeds(getDocs(query(collection(db('teacher'),'schools/s/adminNotes'),where('teacherUid','==','teacher'))));
 await assertFails(getDocs(collection(db('teacher'),'schools/s/adminNotes')));
 for (const id of ['teacher','parent','outsider',null]) await assertFails(setDoc(doc(db(id),'schools/s/adminNotes/new'),data()));
 for(const changes of [{adminUid:'other'},{teacherUid:'other'},{text:'changed'},{createdAt:serverTimestamp()},{reply:'x'.repeat(2001),repliedAt:serverTimestamp()},{readAt:'today'},{reply:deleteField()},{extra:'x'}]) await assertFails(updateDoc(ref('teacher'),changes));
 for(const changes of [{adminUid:'other'},{teacherName:'fake'},{text:''},{kind:'bad'},{extra:'x'},{assignmentId:'missing'},{teacherUid:'blocked',teacherName:'blocked'}]) await assertFails(setDoc(doc(db('admin'),'schools/s/adminNotes/invalid'),{...data(),...changes}));
 await assertSucceeds(updateDoc(ref('teacher'),{readAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(ref('teacher'),{reply:'تمت المتابعة',repliedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(ref('teacher'),{completedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref('teacher'),{readAt:null}));
 await assertFails(updateDoc(ref('teacher'),{completedAt:null}));
 await assertFails(deleteDoc(ref('admin')));
 console.log('PASS: note lifecycle, queries, school/recipient isolation, schema, immutable identity, timestamps and size limits.');
} finally {await env.cleanup();}
