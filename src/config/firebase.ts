import * as admin from 'firebase-admin';
import { env } from './env';

let initialized = false;

export function getFirebaseAdmin(): typeof admin | null {
  if (initialized) return admin;
  if (admin.apps.length > 0) {
    initialized = true;
    return admin;
  }
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY === '...' || env.FIREBASE_PRIVATE_KEY.length < 20) {
    console.warn('[firebase] Missing Firebase credentials – Auth/FCM will be mocked');
    return null;
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });
    initialized = true;
    console.log('[firebase] Admin initialized');
    return admin;
  } catch (e: any) {
    console.warn('[firebase] Failed to init', e.message);
    return null;
  }
}

export function getMessaging(): admin.messaging.Messaging | null {
  const fb = getFirebaseAdmin();
  if (!fb) return null;
  try {
    return fb.messaging();
  } catch {
    return null;
  }
}

export function getAuth(): admin.auth.Auth | null {
  const fb = getFirebaseAdmin();
  if (!fb) return null;
  try {
    return fb.auth();
  } catch {
    return null;
  }
}
