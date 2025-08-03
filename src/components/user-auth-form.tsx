// components/user-auth-form.tsx
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  signInWithPopup,
  type UserCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { auth, db, googleAuthProvider } from '@/lib/firebase';
import { handleNewUserSetup, resendVerificationEmail } from '@/lib/actions';
import type { UserProfile } from '@/lib/types';

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  mode: 'login' | 'signup';
}

const formSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

type UserFormValue = z.infer<typeof formSchema>;

export function UserAuthForm({ className, mode, ...props }: UserAuthFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const router = useRouter();

  const { register, handleSubmit, formState: { errors } } = useForm<UserFormValue>({
    resolver: zodResolver(formSchema),
  });

  const handleGoogleSignInSuccess = async (userCredential: UserCredential) => {
    try {
      const username = userCredential.user.displayName || userCredential.user.email?.split('@')[0];
      await setDoc(doc(db, "users", userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          username: username,
          username_lowercase: username?.toLowerCase(), // Add lowercase username
          photoURL: userCredential.user.photoURL,
      }, { merge: true });
      await handleNewUserSetup(userCredential.user.uid);
      router.push('/dashboard');
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Google Sign-In Error',
            description: 'Could not save user profile. Please try again.',
        });
    } finally {
        setIsLoading(false);
    }
  }

  const onGoogleSignIn = () => {
    // DO NOT set loading state here, as it can cause popup blockers.
    // The popup must be initiated directly from the user's click event.
    signInWithPopup(auth, googleAuthProvider)
      .then((result) => {
        setIsLoading(true); // Set loading state only after popup is successful.
        handleGoogleSignInSuccess(result);
      })
      .catch((error: any) => {
        if (error.code !== 'auth/popup-closed-by-user') {
          toast({
            variant: 'destructive',
            title: 'Google Sign-In Error',
            description: error.message || 'Could not sign in with Google. Please try again.',
          });
        }
      });
  };
  
  const onSubmit = async (data: UserFormValue) => {
    setIsLoading(true);
    try {
      let userCredential;
      if (mode === 'login') {
        userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          await auth.signOut();
          throw new Error("Email not verified. Please check your inbox for a verification link.");
        }

        const userProfileDoc = await getDoc(doc(db, 'users', user.uid));
        if (userProfileDoc.exists() && (userProfileDoc.data() as UserProfile).isBanned) {
            await auth.signOut();
            throw new Error("This account has been suspended by an administrator.");
        }
        router.push('/dashboard');
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;
        
        await sendEmailVerification(user);

        const username = user.email?.split('@')[0] || `user_${Date.now()}`;
        // Create a user profile document in Firestore for new users.
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          username: username,
          username_lowercase: username.toLowerCase(),
          photoURL: user.photoURL,
        });

        // Server action to handle admin auto-follow logic
        await handleNewUserSetup(user.uid);

        router.push('/verify-email');
      }
    } catch (error: any) {
      let message = 'An unknown error occurred.';
      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/invalid-credential':
          case 'auth/wrong-password':
            message = 'Incorrect email or password. Please try again.';
            break;
          case 'auth/email-already-in-use':
            message = 'This email is already registered. If you haven\'t verified your email, a new confirmation link has been sent to your inbox.';
            // Resend verification email as a helpful action.
            resendVerificationEmail(data.email);
            break;
          case 'auth/user-disabled':
            message = 'This account has been suspended by an administrator.';
            break;
          default:
            message = error.message;
        }
      } else {
        message = error.message;
      }
      toast({ variant: 'destructive', title: 'Authentication Error', description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('grid gap-6', className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={isLoading}
              {...register('email')}
            />
            {errors?.email && <p className="px-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor="password">Password</Label>
            <Input
              id="password"
              placeholder="Password"
              type="password"
              autoCapitalize={mode === 'login' ? "current-password" : "new-password"}
              autoCorrect="off"
              disabled={isLoading}
              {...register('password')}
            />
            {errors?.password && <p className="px-1 text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Sign Up'} with Email
          </Button>
        </div>
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or continue with</span></div>
      </div>
      <Button variant="outline" type="button" disabled={isLoading} onClick={onGoogleSignIn}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.75 8.36,4.73 12.19,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.19,2C6.42,2 2.03,6.8 2.03,12C2.03,17.2 6.42,22 12.19,22C17.6,22 21.54,18.33 21.54,12.81C21.54,11.76 21.45,11.43 21.35,11.1Z"></path></svg>
        )}{' '}
        Google
      </Button>
    </div>
  );
}
