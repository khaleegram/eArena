import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CircleCheckBig, Gamepad2, Trophy, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative w-full py-12 md:py-24 lg:py-32 xl:py-48 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background/80 to-blue-950/50 z-0"></div>
          <Image
            src="https://placehold.co/1920x1080.png"
            alt="background"
            fill
            sizes="100vw"
            style={{objectFit: 'cover'}}
            className="absolute inset-0 z-[-1] opacity-20"
            data-ai-hint="esports gaming"
            priority
          />
          <div className="container px-4 md:px-6 z-10 relative">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:gap-24 items-center">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="font-headline text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none text-primary-foreground">
                    Welcome to eArena
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    The next-gen platform for eFootball. Create, manage, and dominate tournaments with seamless organization and real-time stats.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Link href="/signup">
                    <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">Join the Arena</Button>
                  </Link>
                  <Link href="/tournaments">
                    <Button size="lg" variant="outline">
                      Browse Tournaments
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="relative">
                <Image
                  src="https://placehold.co/600x600.png"
                  width="600"
                  height="600"
                  alt="Hero"
                  className="mx-auto aspect-square overflow-hidden rounded-xl object-cover sm:w-full lg:order-last border-4 border-primary/20 shadow-2xl shadow-primary/30"
                  data-ai-hint="gaming controller"
                />
                 <div className="absolute -inset-2 bg-primary/20 blur-2xl rounded-full z-[-1]"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-background">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-primary">Key Features</div>
                <h2 className="font-headline text-3xl font-bold tracking-tighter sm:text-5xl">Everything You Need to Compete</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  eArena provides a comprehensive suite of tools for both organizers and players to enjoy a professional-grade tournament experience.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 lg:max-w-none mt-12">
              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 shadow-lg hover:shadow-primary/20 hover:border-primary/30 transition-all duration-300">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-headline text-xl">Tournament Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">Easily create and customize tournaments with your own rules, schedules, and team limits.</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 shadow-lg hover:shadow-primary/20 hover:border-primary/30 transition-all duration-300">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <Gamepad2 className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-headline text-xl">Automated Standings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">Live, automated standings and stats. Focus on the game, we'll handle the numbers.</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-primary/10 shadow-lg hover:shadow-primary/20 hover:border-primary/30 transition-all duration-300">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-headline text-xl">Player Profiles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">Build your legacy. Customize your profile and show off your competitive history.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/30">
          <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
            <div className="space-y-3">
              <h2 className="font-headline text-3xl font-bold tracking-tighter md:text-4xl/tight">Ready to Crown a Champion?</h2>
              <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Join thousands of players and organizers. Sign up today and start your eFootball journey.
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm space-y-2">
              <Link href="/signup">
                <Button size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                  <CircleCheckBig className="mr-2 h-4 w-4" /> Sign Up for Free
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
