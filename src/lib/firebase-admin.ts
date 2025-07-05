
import admin from 'firebase-admin';

// This logic prevents re-initializing the app on every hot-reload in development
// and resolves the EventEmitter memory leak warning.
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    // Catching the error if the environment variables are not set.
    // This is better than a simple console.warn, as it prevents crashes on initialization.
    console.error('Firebase admin initialization error. Check your environment variables.', error);
  }
}

// Now that we're sure an app is initialized (or an error was logged),
// we can safely export the services.
const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };
