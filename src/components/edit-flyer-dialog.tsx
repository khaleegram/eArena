
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import type { Tournament } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { updateTournamentFlyer } from '@/lib/actions/tournament';

interface EditFlyerDialogProps {
  tournament: Tournament;
}

export function EditFlyerDialog({ tournament }: EditFlyerDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newFlyerFile, setNewFlyerFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(tournament.flyerUrl || null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewFlyerFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!user || !newFlyerFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('flyer', newFlyerFile);

    try {
      await updateTournamentFlyer(tournament.id, user.uid, formData);
      toast({ title: "Success!", description: "Tournament flyer has been updated." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
        // Reset preview when dialog is closed
        setNewFlyerFile(null);
        setPreview(tournament.flyerUrl || null);
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="absolute top-2 right-2 z-20 bg-black/50 text-white hover:bg-black/80 hover:text-white">
          <ImagePlus className="h-5 w-5" />
          <span className="sr-only">Change Flyer</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Tournament Flyer</DialogTitle>
          <DialogDescription>Choose a new image for your tournament banner.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="relative aspect-[16/9] w-full bg-muted rounded-md overflow-hidden">
            {preview ? (
              <Image src={preview} alt="Flyer preview" fill style={{ objectFit: 'contain' }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ImagePlus className="h-10 w-10 mb-2" />
                <span>Image Preview</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="flyer-upload">Select Image</Label>
            <Input id="flyer-upload" type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileSelect} />
            <p className="text-xs text-muted-foreground">Recommended aspect ratio: 16:9. Max 5MB.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleUpload} disabled={isUploading || !newFlyerFile}>
            {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
