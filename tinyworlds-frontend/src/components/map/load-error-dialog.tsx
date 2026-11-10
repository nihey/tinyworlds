"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";

interface LoadErrorDialogProps {
  message: string | null;
  onDismiss: () => void;
  onRetry: () => void;
}

export function LoadErrorDialog({ message, onDismiss, onRetry }: LoadErrorDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={!!message} onOpenChange={onDismiss}>
      <DialogContent className="sign gap-0 overflow-hidden p-0 ring-0 sm:max-w-sm">
        <div aria-hidden className="h-[3px] bg-taxi" />
        <DialogHeader className="gap-2 px-5 pt-5 text-left">
          <DialogTitle className="text-base font-semibold">{t.loadError.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-paper-dim">
            {t.loadError.body}
            {message && <span className="mt-2 block text-xs opacity-70">{message}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end px-5 pt-4 pb-5">
          <Button onClick={onRetry} className="h-9 gap-2 rounded-full px-4 font-semibold">
            <RotateCw className="size-4" strokeWidth={2.5} />
            {t.loadError.retry}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
