
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { sendPasswordResetEmail } from '@/lib/actions/user';
import Link from 'next/link';

const formSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
});

type ForgotPasswordFormValue = z.infer<typeof formSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [submitted, setSubmitted] = React.useState<boolean>(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordFormValue>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormValue) => {
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(data.email);
      setSubmitted(true);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-headline">Check Your Email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for the email you entered, you will receive a password reset link shortly.
        </p>
        <Link href="/login">
            <Button variant="outline">Back to Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-headline">Forgot Password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email address and we will send you a link to reset your password.
        </p>
      </div>
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
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Reset Link
          </Button>
        </div>
      </form>
      <p className="px-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4 hover:text-primary">
            Remembered your password? Login
        </Link>
      </p>
    </>
  );
}
