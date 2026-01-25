'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Trophy, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const onboardingSteps = [
  {
    icon: <Sparkles className="h-10 w-10 text-primary" />,
    title: 'Welcome to eArena!',
    description: "We're excited to have you. Here are a couple of quick steps to get you ready for your first competition.",
    action: null,
  },
  {
    icon: <User className="h-10 w-10 text-primary" />,
    title: 'Set Up Your Profile',
    description: 'Your username and avatar are your identity. Make sure they match your in-game details for easy match verification.',
    action: {
      href: '/profile',
      text: 'Go to Profile',
    },
  },
  {
    icon: <Trophy className="h-10 w-10 text-primary" />,
    title: 'Find or Create a Tournament',
    description: "The arena awaits! You can join an existing public tournament or start your own and invite friends.",
    action: {
      href: '/tournaments',
      text: 'Browse Tournaments',
    },
  },
];


export function OnboardingFlow() {
  const [step, setStep] = React.useState(0);
  const [isVisible, setIsVisible] = React.useState(true);

  const handleNext = () => {
    if (step < onboardingSteps.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('hasCompletedOnboarding', 'true');
    setIsVisible(false);
  };
  
  if (!isVisible) {
    return null;
  }

  const currentStep = onboardingSteps[step];
  const isLastStep = step === onboardingSteps.length - 1;
  const isFirstStep = step === 0;

  return (
    <Card className="mb-8 bg-gradient-to-br from-card to-muted/30 border-primary/20 shadow-lg animate-in fade-in-50 slide-in-from-bottom-10">
        <div className="relative p-6">
            <button onClick={handleFinish} className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Dismiss</span>
            </button>
            <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                {currentStep.icon}
                <div className="flex-grow">
                    <h2 className="text-xl font-bold font-headline">{currentStep.title}</h2>
                    <p className="text-muted-foreground mt-1">{currentStep.description}</p>
                </div>
                 <div className="flex-shrink-0 flex items-center gap-2">
                    {!isFirstStep && (
                       <Button variant="ghost" onClick={handleBack}>Back</Button>
                    )}
                    {isLastStep ? (
                        <Button onClick={handleFinish}>
                            Get Started <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : currentStep.action ? (
                         <Link href={currentStep.action.href} passHref>
                            <Button onClick={handleNext}>{currentStep.action.text}</Button>
                         </Link>
                    ) : (
                        <Button onClick={handleNext}>
                            Next <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
             <div className="flex justify-center gap-2 mt-4">
                {onboardingSteps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setStep(index)}
                        className={cn(
                            "h-1.5 w-8 rounded-full transition-colors",
                            index === step ? "bg-primary" : "bg-muted hover:bg-muted-foreground/50"
                        )}
                        aria-label={`Go to step ${index + 1}`}
                    />
                ))}
            </div>
        </div>
    </Card>
  );
}
