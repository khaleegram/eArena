import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container relative flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
        <div className="relative hidden h-full flex-col p-10 text-white lg:flex">
            <div className="absolute inset-0 z-[-1]">
              <Image 
                src="/images/MainBackground.png"
                alt="Authentication background"
                fill
                sizes="50vw"
                style={{objectFit: 'cover'}}
                data-ai-hint="esports gaming"
              />
              <div className="absolute inset-0 bg-zinc-950/80" />
            </div>
            <div className="relative z-20 flex items-center text-lg font-medium font-headline">
                eArena
            </div>
            <div className="relative z-20 mt-auto">
                <blockquote className="space-y-2">
                <p className="text-lg">
                    &ldquo;The future of competition is here. eArena has redefined our leagues.&rdquo;
                </p>
                <footer className="text-sm">Pro Player</footer>
                </blockquote>
            </div>
        </div>
        <div className="lg:p-8">
            <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                {children}
            </div>
        </div>
    </div>
  )
}
