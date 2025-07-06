// components/auth-provider.tsx
"use client";

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import Cookies from 'js-cookie';
import { PushNotificationManager } from './push-notification-manager';

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Represents initial auth state check
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase());
      
      if (currentUser && currentUser.email) {
        const userIsAdmin = adminEmails.includes(currentUser.email.toLowerCase());
        setIsAdmin(userIsAdmin);
        // Set a cookie for server components to check maintenance mode
        if (userIsAdmin) {
            Cookies.set('isAdmin', 'true', { path: '/' });
        } else {
            Cookies.remove('isAdmin');
        }
      } else {
        setIsAdmin(false);
        Cookies.remove('isAdmin');
      }
      
      setLoading(false); // Auth state is now known
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    if (user) {
      // Profile fetching starts, but doesn't set global `loading` to true
      const docRef = doc(db, 'users', user.uid);
      unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        } else {
          setUserProfile(null);
        }
      });
    } else {
      // No user, so no profile
      setUserProfile(null);
    }

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAdmin }}>
      {children}
      {user && <PushNotificationManager />}
    </AuthContext.Provider>
  );
};
