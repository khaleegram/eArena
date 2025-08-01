
import admin from 'firebase-admin';

const hasRequiredEnvVars = 
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

// This logic prevents re-initializing the app on every hot-reload in development
// and resolves the EventEmitter memory leak warning.
if (!admin.apps.length) {
  if (hasRequiredEnvVars) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    } catch (error) {
      console.error('Firebase admin initialization error:', error);
    }
  } else {
    console.warn(
        'Firebase admin initialization skipped. Missing one or more required environment variables: ' +
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. ' +
        'Please check your .env file.'
    );
  }
}

// Now that we're sure an app is initialized (or an error was logged),
// we can safely export the services.
const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };
