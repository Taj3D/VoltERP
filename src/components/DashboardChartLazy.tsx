"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardChartLazyProps {
  chartData: Array<{
    name: string;
    Sales: number;
    Purchase: number;
  }>;
}

export default function DashboardChartLazy({ chartData }: DashboardChartLazyProps) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <RechartsTooltip
            formatter={(value: number) => [`Tk. ${new Intl.NumberFormat('en-US').format(value)}`, ""]}
            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Purchase" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
