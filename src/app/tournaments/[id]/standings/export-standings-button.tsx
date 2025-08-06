
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { exportStandingsToCSV } from '@/lib/actions';
import { Loader2, Download } from 'lucide-react';

export function ExportStandingsButton({ tournamentId }: { tournamentId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleExport = async () => {
        setIsLoading(true);
        try {
            const { csv, filename } = await exportStandingsToCSV(tournamentId);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            toast({ title: "Success", description: "Standings have been exported." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Export Failed", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
        </Button>
    );
}
