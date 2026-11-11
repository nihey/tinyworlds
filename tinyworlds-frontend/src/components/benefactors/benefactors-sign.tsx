"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { BenefactorsPanel, type CityRef } from "./benefactors-panel";

interface BenefactorsSignProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  by: CityRef;
  /** the button at the bottom: the opener takes it to the donate sign */
  onBecome: (cityName: string) => void;
}

/** A city's benefactors on a sign, like the donate sign. The panel is mounted only while open, so each opening fetches afresh. */
export function BenefactorsSign({ open, onOpenChange, by, onBecome }: BenefactorsSignProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        className="sign max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-x-hidden overflow-y-auto p-0 ring-0 sm:max-w-md"
      >
        <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
        <DialogTitle className="sr-only">{t.benefactors.benefactors}</DialogTitle>
        <div className="px-5 pt-4 pb-5">
          <BenefactorsPanel by={by} onBecome={onBecome} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
