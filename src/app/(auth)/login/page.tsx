import { UserAuthForm } from '@/components/user-auth-form'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-headline">Login to eArena</h1>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to access your account
        </p>
      </div>
      <UserAuthForm mode="login" />
      <div className="flex flex-col gap-4 text-center text-sm">
        <p className="text-muted-foreground">
            <Link href="/forgot-password" className="underline underline-offset-4 hover:text-primary">
                Forgot your password?
            </Link>
        </p>
        <p className="text-muted-foreground">
            <Link href="/signup" className="underline underline-offset-4 hover:text-primary">
            Don&apos;t have an account? Sign Up
            </Link>
        </p>
      </div>
    </>
  )
}
