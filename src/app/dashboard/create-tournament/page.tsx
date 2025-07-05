
"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { createTournament } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { addDays, format, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, Sparkles, Trophy, StepForward, Info, Gamepad2, Users, CalendarDays, Settings, Award, Send } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TournamentFormat } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const formatOptions: Record<TournamentFormat, number[]> = {
    league: [4, 6, 8, 10, 12, 14, 16, 18, 20],
    cup: [8, 12, 16, 24, 32],
    'champions-league': [16, 32],
};

type SchedulingPreset = 'custom' | '1-day-cup' | 'weekend-knockout' | 'week-long-league' | '1-day-league-blitz';

const tournamentSchema = z.object({
  name: z.string().min(3, { message: "Tournament name must be at least 3 characters." }),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }),
  game: z.string().min(1, { message: "Please specify the game." }),
  platform: z.string().min(1, { message: "Please select a platform." }),
  format: z.enum(['league', 'cup', 'champions-league']),
  registrationDates: z.object({
    from: z.date({ required_error: "Registration start date is required." }),
    to: z.date({ required_error: "Registration end date is required." }),
  }),
  tournamentDates: z.object({
    from: z.date({ required_error: "Tournament start date is required." }),
    to: z.date({ required_error: "Tournament end date is required." }),
  }),
  maxTeams: z.coerce.number().int().min(4, { message: "Maximum teams must be at least 4." }),
  rules: z.string().optional(),
  
  isPublic: z.boolean().default(true),
  matchLength: z.coerce.number().int().min(1, "Match length must be at least 1 minute."),
  substitutions: z.coerce.number().int().min(0, "Number of substitutions cannot be negative."),
  extraTime: z.boolean().default(false),
  penalties: z.boolean().default(false),
  injuries: z.boolean().default(false),
  homeAndAway: z.boolean().default(false),
  squadRestrictions: z.string().optional(),
  
  rewardType: z.enum(['virtual', 'money']).default('virtual'),
  prizePool: z.coerce.number().optional().default(0),

}).refine(data => {
    return data.rewardType !== 'money' || (data.prizePool !== undefined && data.prizePool > 0);
  }, {
    message: "A prize pool greater than 0 is required for money tournaments.",
    path: ['prizePool']
  }).refine(data => {
    const regEnd = startOfDay(data.registrationDates.to);
    const tourneyStart = startOfDay(data.tournamentDates.from);
    return regEnd.getTime() <= tourneyStart.getTime();
  }, {
    message: "Registration must close on or before the tournament start date.",
    path: ['tournamentDates', 'from']
  });

type TournamentFormValues = z.infer<typeof tournamentSchema> & {
    schedulingPreset: SchedulingPreset;
    duration: number;
};

export default function CreateTournamentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
      description: '',
      game: 'eFootball 2024',
      platform: 'PS5',
      format: 'league',
      schedulingPreset: 'custom',
      registrationDates: {
        from: new Date(),
        to: addDays(new Date(), 6),
      },
      tournamentDates: {
        from: addDays(new Date(), 7),
        to: addDays(new Date(), 13),
      },
      duration: 7,
      maxTeams: 16,
      rules: 'Standard eFootball rules apply. Show good sportsmanship.',
      isPublic: true,
      matchLength: 6,
      substitutions: 5,
      extraTime: false,
      penalties: false,
      injuries: false,
      homeAndAway: false,
      squadRestrictions: 'No specific squad restrictions.',
      rewardType: 'virtual',
      prizePool: 0,
    },
  });

  const selectedFormat = form.watch("format");
  const teamCountOptions = React.useMemo(() => {
      return formatOptions[selectedFormat] || [];
  }, [selectedFormat]);

  React.useEffect(() => {
      const currentMaxTeams = form.getValues("maxTeams");
      if (teamCountOptions.length > 0 && !teamCountOptions.includes(currentMaxTeams)) {
          form.setValue("maxTeams", teamCountOptions[0]);
      }
  }, [teamCountOptions, form]);

  const preset = form.watch('schedulingPreset');
  const tournamentStartDate = form.watch('tournamentDates.from');
  const duration = form.watch('duration');

  React.useEffect(() => {
    const today = startOfDay(new Date());
    switch(preset) {
        case '1-day-cup':
            form.setValue('registrationDates', { from: today, to: addDays(today, 2) });
            form.setValue('tournamentDates.from', addDays(today, 3));
            form.setValue('duration', 1);
            break;
        case 'weekend-knockout':
            form.setValue('registrationDates', { from: today, to: addDays(today, 5) });
            form.setValue('tournamentDates.from', addDays(today, 6));
            form.setValue('duration', 3);
            break;
        case 'week-long-league':
            form.setValue('registrationDates', { from: today, to: addDays(today, 7) });
            form.setValue('tournamentDates.from', addDays(today, 8));
            form.setValue('duration', 7);
            break;
        case '1-day-league-blitz':
            form.setValue('format', 'league');
            form.setValue('registrationDates', { from: today, to: today });
            form.setValue('tournamentDates.from', today);
            form.setValue('duration', 1);
            break;
        case 'custom':
        default:
            // Do nothing, let user control manually
            break;
    }
  }, [preset, form]);

  React.useEffect(() => {
    if (tournamentStartDate && duration > 0) {
        const endDate = addDays(new Date(tournamentStartDate), duration - 1);
        form.setValue('tournamentDates.to', endDate);
    }
  }, [tournamentStartDate, duration, form]);


  async function onSubmit(values: TournamentFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to create a tournament." });
      return;
    }
    setIsLoading(true);
    try {
      const { schedulingPreset, duration, ...rest } = values;
      const tournamentData = {
        ...rest,
        organizerId: user.uid,
        registrationStartDate: rest.registrationDates.from,
        registrationEndDate: rest.registrationDates.to,
        tournamentStartDate: rest.tournamentDates.from,
        tournamentEndDate: rest.tournamentDates.to,
      };

      const result = await createTournament(tournamentData as any);
      
      if (result.paymentUrl) {
          toast({ title: "Tournament Created!", description: "Redirecting to payment..." });
          router.push(result.paymentUrl);
      } else {
          toast({ title: "Success!", description: "Your tournament has been created." });
          router.push(`/tournaments/${result.tournamentId}`);
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error creating tournament", description: error.message || "An unexpected error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }
  
  const rewardType = form.watch('rewardType');

  return (
    <div className="space-y-8">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="font-headline text-3xl">Create Tournament</h1>
                <p className="text-muted-foreground">Follow the steps below to set up your next competition.</p>
            </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5"/> Step 1: Basic Information</CardTitle>
                    <CardDescription>Define the core identity and structure of your tournament.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Tournament Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Sunday Night League" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                            <Textarea placeholder="A brief description of your tournament." {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                     <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="game"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Game</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormDescription>e.g., eFootball 2025</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                        <FormField
                            control={form.control}
                            name="platform"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Platform</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a platform" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                    <SelectItem value="PS5">PlayStation 5</SelectItem>
                                    <SelectItem value="PS4">PlayStation 4</SelectItem>
                                    <SelectItem value="XBOX">Xbox</SelectItem>
                                    <SelectItem value="PC">PC (Steam)</SelectItem>
                                    <SelectItem value="Mobile">Mobile</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                     </div>
                     <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="format"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tournament Format</FormLabel>
                                <Select onValueChange={field.onChange as any} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder="Select a format" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="league">League (Round-Robin)</SelectItem>
                                    <SelectItem value="cup">Cup (Groups + Knockout)</SelectItem>
                                    <SelectItem value="champions-league">UCL Style (Groups + Knockout)</SelectItem>
                                </SelectContent>
                                </Select>
                                <FormDescription>Choose the structure of your competition.</FormDescription>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="maxTeams"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Maximum Teams</FormLabel>
                                <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value)}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select team count" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {teamCountOptions.map(count => (
                                            <SelectItem key={count} value={String(count)}>{count} Teams</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>The number of teams must match the format.</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5"/> Step 2: Scheduling</CardTitle>
                    <CardDescription>Set the timeline for registration and tournament play. Use a preset for quick setup.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <FormField
                        control={form.control}
                        name="schedulingPreset"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Scheduling Preset</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="custom">Custom</SelectItem>
                                    <SelectItem value="1-day-cup">1-Day Cup Blitz</SelectItem>
                                    <SelectItem value="1-day-league-blitz">1-Day League Blitz</SelectItem>
                                    <SelectItem value="weekend-knockout">Weekend Knockout</SelectItem>
                                    <SelectItem value="week-long-league">Week-Long League</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormDescription>Select a template to auto-fill dates or choose "Custom" for manual entry.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="registrationDates"
                            render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Registration Period</FormLabel>
                                <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !field.value.from && "text-muted-foreground")}
                                        disabled={preset !== 'custom'}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value?.from && field.value.to ? `${format(field.value.from, "LLL dd, y")} - ${format(field.value.to, "LLL dd, y")}`: <span>Pick a date range</span>}
                                    </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={field.value.from}
                                        selected={{ from: field.value.from, to: field.value.to }}
                                        onSelect={(range) => field.onChange(range || { from: new Date(), to: addDays(new Date(), 3) })}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="tournamentDates.from"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Start Date</FormLabel>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                            disabled={preset !== 'custom'}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                                    </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            <FormField
                                control={form.control}
                                name="duration"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Duration</FormLabel>
                                        <Input type="number" min={1} {...field} className="h-10" disabled={preset !== 'custom'} onChange={e => field.onChange(Number(e.target.value))} />
                                        <FormDescription className="text-xs">In days</FormDescription>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5"/> Step 3: Rules &amp; Rewards</CardTitle>
                    <CardDescription>Configure match settings, custom rules, and prize information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="font-medium">Match Settings</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                            <FormField name="matchLength" render={({ field }) => (<FormItem><FormLabel>Match Length (min)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="substitutions" render={({ field }) => (<FormItem><FormLabel>Substitutions</FormLabel><Select onValueChange={(v) => field.onChange(Number(v))} defaultValue={String(field.value)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem><SelectItem value="7">7</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                            <FormField name="extraTime" render={({ field }) => (<FormItem className="flex items-center justify-between rounded-lg border p-3"><FormLabel>Extra Time</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                            <FormField name="penalties" render={({ field }) => (<FormItem className="flex items-center justify-between rounded-lg border p-3"><FormLabel>Penalties</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                            <FormField name="injuries" render={({ field }) => (<FormItem className="flex items-center justify-between rounded-lg border p-3"><FormLabel>Injuries</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                            <FormField name="homeAndAway" render={({ field }) => (<FormItem className="flex items-center justify-between rounded-lg border p-3"><FormLabel>Home/Away</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                        </div>
                    </div>
                    <FormField name="squadRestrictions" render={({ field }) => (<FormItem><FormLabel>Squad Restrictions</FormLabel><FormControl><Textarea placeholder="e.g., Max 3 legendary players, only silver ball players allowed." {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField name="rules" render={({ field }) => (<FormItem><FormLabel>General Rules / Code of Conduct</FormLabel><FormControl><Textarea placeholder="Detail any other general rules for your tournament." {...field} /></FormControl><FormMessage /></FormItem>)} />
                    
                    <div className="space-y-4">
                        <h3 className="font-medium flex items-center gap-2"><Award/> Rewards &amp; Prizes</h3>
                        <FormField
                            control={form.control}
                            name="rewardType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col sm:flex-row gap-4">
                                        <FormItem className="flex-1">
                                            <FormControl><RadioGroupItem value="virtual" className="sr-only" /></FormControl>
                                            <FormLabel className={cn("flex flex-col items-center justify-center rounded-md border-2 p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer", field.value === 'virtual' && "border-primary")}>
                                                <Sparkles className="mb-3 h-6 w-6" /> Virtual Rewards
                                                <span className="font-normal text-xs text-muted-foreground mt-1">Free entry. Winners get badges &amp; recognition.</span>
                                            </FormLabel>
                                        </FormItem>
                                        <FormItem className="flex-1">
                                            <FormControl><RadioGroupItem value="money" className="sr-only" /></FormControl>
                                            <FormLabel className={cn("flex flex-col items-center justify-center rounded-md border-2 p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer", field.value === 'money' && "border-primary")}>
                                                <Trophy className="mb-3 h-6 w-6" /> Real Money
                                                <span className="font-normal text-xs text-muted-foreground mt-1">Organizer-funded prize pool. Free for players.</span>
                                            </FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        {rewardType === 'money' && (
                             <FormField
                                control={form.control}
                                name="prizePool"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Prize Pool (NGN)</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g., 100000" {...field} /></FormControl>
                                    <FormDescription>The total amount to be distributed. You, the organizer, are responsible for funding this prize pool.</FormDescription>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={isLoading} className="shadow-lg shadow-primary/20">
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                Publish Tournament
                </Button>
            </div>
          </form>
        </Form>
    </div>
  );
}
