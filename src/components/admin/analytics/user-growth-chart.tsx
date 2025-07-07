
"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface UserGrowthChartProps {
    data: { date: string; count: number }[];
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
    return (
        <ChartContainer config={{ count: { label: "New Users", color: "hsl(var(--chart-1))" } }} className="min-h-[200px] w-full">
            <ResponsiveContainer width="100%" height={300}>
                <LineChart
                    data={data}
                    margin={{
                        top: 5,
                        right: 20,
                        left: -10,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                        dataKey="date" 
                        tickLine={false} 
                        axisLine={false} 
                        tickMargin={8} 
                        fontSize={12} 
                    />
                    <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false}/>
                    <Tooltip content={<ChartTooltipContent />} />
                    <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--color-count)"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
}
