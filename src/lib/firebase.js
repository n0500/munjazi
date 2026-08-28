import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBJiTBMOvD3mMe0UJEk2wAwsqYvfg4FMss',
  authDomain: 'munjazi-13631.firebaseapp.com',
  projectId: 'munjazi-13631',
  storageBucket: 'munjazi-13631.firebasestorage.app',
  messagingSenderId: '802865164268',
  appId: '1:802865164268:web:d232a5cc32965b1b055ac9',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
