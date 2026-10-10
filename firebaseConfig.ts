import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBQLibNGLsgyIdGM_vghHiL4Dtf5Pro9u8',
  authDomain: 'isdapp-251fc.firebaseapp.com',
  databaseURL: 'https://isdapp-251fc-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'isdapp-251fc',
  storageBucket: 'isdapp-251fc.firebasestorage.app',
  messagingSenderId: '714289445225',
  appId: '1:714289445225:web:6b4dd89cfa0806a7ba25f8',
  measurementId: 'G-2FTRFMZH49',
};

export const GOOGLE_WEB_CLIENT_ID =
  '714289445225-k2uktpb9kcvsqisvnf2lcv5ma7a88op4.apps.googleusercontent.com';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
