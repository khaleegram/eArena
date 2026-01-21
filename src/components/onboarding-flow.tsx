'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Trophy, Sparkles } from 'lucide-react';
import Link from 'next/link';

const onboardingSteps = [
  {
    icon: <Sparkles className="h-12 w-12 text-primary" />,
    title: 'Welcome to eArena!',
    description: "We're excited to have you. Let's quickly get you set up for your first competition.",
    action: null,
  },
  {
    icon: <User className="h-12 w-12 text-primary" />,
    title: 'Set Up Your Profile',
    description: 'Your username and avatar are your identity on the platform. Make sure they match your in-game details for easy match reporting and verification.',
    action: {
      href: '/profile',
      text: 'Go to Profile',
    },
  },
  {
    icon: <Trophy className="h-12 w-12 text-primary" />,
    title: 'Find or Create a Tournament',
    description: "The arena awaits! You can join an existing public tournament or start your own and invite friends.",
    action: {
      href: '/tournaments',
      text: 'Browse Tournaments',
    },
  },
  {
    icon: <Sparkles className="h-12 w-12 text-primary" />,
    title: "You're All Set!",
    description: 'You now have everything you need to start competing. Good luck, and have fun!',
    action: null,
  },
];

export function OnboardingFlow() {
  const [step, setStep] = React.useState(0);
  const [isOpen, setIsOpen] = React.useState(true);

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
    setIsOpen(false);
  };

  const currentStep = onboardingSteps[step];
  const isLastStep = step === onboardingSteps.length - 1;

  if (!currentStep) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleFinish()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="text-center items-center pt-4">
          {currentStep.icon}
          <DialogTitle className="text-2xl font-headline">{currentStep.title}</DialogTitle>
          <DialogDescription className="px-4">
            {currentStep.description}
          </DialogDescription>
        </DialogHeader>

        {currentStep.action && (
          <div className="py-4 text-center">
            <Link href={currentStep.action.href}>
                <Button variant="outline">{currentStep.action.text}</Button>
            </Link>
          </div>
        )}

        <DialogFooter className="flex-row justify-between w-full pt-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          ) : <div /> /* Placeholder to keep alignment */}
          
          {isLastStep ? (
            <Button onClick={handleFinish}>
              Start Competing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
