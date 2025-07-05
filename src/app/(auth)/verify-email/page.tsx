
import { Button } from '@/components/ui/button';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmailPage() {
    return (
        <div className="flex flex-col items-center space-y-4 text-center">
            <MailCheck className="h-16 w-16 text-green-500" />
            <h1 className="text-2xl font-semibold tracking-tight font-headline">Verify Your Email</h1>
            <p className="text-sm text-muted-foreground max-w-sm">
                We've sent a verification link to your email address. Please click the link to continue.
            </p>
            <p className="text-xs text-muted-foreground">
                (You can close this tab)
            </p>
            <Link href="/login">
                <Button variant="outline">Back to Login</Button>
            </Link>
        </div>
    );
}
