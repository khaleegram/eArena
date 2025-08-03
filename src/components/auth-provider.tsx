
"use client";

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserProfile, PlatformSettings } from '@/lib/types';
import Cookies from 'js-cookie';
import { HardHat } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  settings: PlatformSettings | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children, settings }: { children: ReactNode, settings: PlatformSettings }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase());
      
      if (currentUser && currentUser.email) {
        const userIsAdmin = adminEmails.includes(currentUser.email.toLowerCase());
        setIsAdmin(userIsAdmin);
        if (userIsAdmin) {
            Cookies.set('isAdmin', 'true', { path: '/' });
        } else {
            Cookies.remove('isAdmin');
        }
      } else {
        setIsAdmin(false);
        Cookies.remove('isAdmin');
      }
      
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    if (user) {
      const docRef = doc(db, 'users', user.uid);
      unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        } else {
          setUserProfile(null);
        }
      });
    } else {
      setUserProfile(null);
    }

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [user]);

  const MaintenancePage = () => (
    <div className="flex flex-col items-center justify-center h-screen text-center bg-background text-foreground">
        <HardHat className="w-20 h-20 mb-6 text-primary" />
        <h1 className="text-4xl font-bold font-headline">Under Maintenance</h1>
        <p className="mt-2 text-lg text-muted-foreground">eArena is currently down for scheduled maintenance.</p>
        <p className="text-muted-foreground">Please check back soon.</p>
    </div>
  );

  // Client-side real-time maintenance check
  if (settings && settings.isMaintenanceMode && !isAdmin) {
      const publicPaths = [
          '/',
          '/login',
          '/signup',
          '/forgot-password',
          '/verify-email',
          '/terms',
          '/privacy'
      ];
      
      const isPublicPath = publicPaths.includes(pathname) || 
                           pathname.startsWith('/community') || 
                           pathname.startsWith('/api');

      if (!isPublicPath) {
          return <MaintenancePage />;
      }
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAdmin, settings }}>
      {children}
    </AuthContext.Provider>
  );
};
