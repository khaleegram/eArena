import { vi } from 'vitest';

// Mock Firebase Auth
export const mockAuth = {
  currentUser: null,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  onAuthStateChanged: vi.fn((callback) => {
    callback(null);
    return vi.fn(); // Return unsubscribe function
  }),
};

// Mock Firestore
export const mockFirestore = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      collection: vi.fn(),
    })),
    where: vi.fn(() => ({
      get: vi.fn(),
      limit: vi.fn(),
      orderBy: vi.fn(),
    })),
    add: vi.fn(),
    get: vi.fn(),
  })),
  doc: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
};

// Mock Firebase Storage
export const mockStorage = {
  ref: vi.fn(() => ({
    put: vi.fn(),
    getDownloadURL: vi.fn(),
    delete: vi.fn(),
  })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
};

// Mock Firebase Admin
export const mockAdminDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      collection: vi.fn(),
    })),
    where: vi.fn(() => ({
      get: vi.fn(),
      limit: vi.fn(),
      orderBy: vi.fn(),
    })),
    add: vi.fn(),
    get: vi.fn(),
  })),
  batch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
};

export const mockAdminAuth = {
  getUser: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  generatePasswordResetLink: vi.fn(),
  generateEmailVerificationLink: vi.fn(),
};

// Mock Firebase module
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => mockAuth,
  GoogleAuthProvider: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => mockFirestore,
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ seconds: Date.now() / 1000, nanoseconds: 0 })),
    fromDate: vi.fn(),
  },
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => mockStorage,
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: mockAdminDb,
  adminAuth: mockAdminAuth,
}));
