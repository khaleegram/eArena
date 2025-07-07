
"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface TournamentActivityChartProps {
  data: { month: string; count: number }[];
}

export function TournamentActivityChart({ data }: TournamentActivityChartProps) {
  return (
    <ChartContainer config={{ count: { label: "Tournaments", color: "hsl(var(--chart-2))" } }} className="min-h-[200px] w-full">
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false}/>
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false}/>
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    </ChartContainer>
  )
}
