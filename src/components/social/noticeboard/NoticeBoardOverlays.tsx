import { memo } from "react";

import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import { ShareSheet } from "@/components/social/ShareSheet";
import { ReportModal } from "@/components/moderation/ReportModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ShareModel } from "@/lib/shareModel";

type NoticeBoardOverlaysProps = {
  confirmBlockId: string | null;
  confirmBlockName: string;
  onBlockConfirm: () => void;
  onBlockDialogChange: (open: boolean) => void;
  onProfileClose: () => void;
  onReportClose: () => void;
  onRestrictionClose: () => void;
  onShareAction: () => void;
  onShareClose: () => void;
  profileFallbackName: string;
  profileOpen: boolean;
  profileUserId: string | null;
  reportOpen: boolean;
  reportTargetName: string;
  reportTargetUserId: string | null;
  shareOpen: boolean;
  sharePayload: ShareModel | null;
  socialRestrictionModalOpen: boolean;
};

export const NoticeBoardOverlays = memo(({
  confirmBlockId,
  confirmBlockName,
  onBlockConfirm,
  onBlockDialogChange,
  onProfileClose,
  onReportClose,
  onRestrictionClose,
  onShareAction,
  onShareClose,
  profileFallbackName,
  profileOpen,
  profileUserId,
  reportOpen,
  reportTargetName,
  reportTargetUserId,
  shareOpen,
  sharePayload,
  socialRestrictionModalOpen,
}: NoticeBoardOverlaysProps) => {
  return (
    <>
      <PublicProfileSheet
        isOpen={profileOpen}
        onClose={onProfileClose}
        loading={false}
        fallbackName={profileFallbackName}
        viewedUserId={profileUserId}
        data={null}
      />

      {sharePayload ? (
        <ShareSheet
          open={shareOpen}
          onClose={onShareClose}
          share={sharePayload}
          onShareAction={onShareAction}
        />
      ) : null}

      <ReportModal
        open={reportOpen}
        onClose={onReportClose}
        targetUserId={reportTargetUserId}
        targetName={reportTargetName}
        source="Social"
      />

      <Dialog open={socialRestrictionModalOpen} onOpenChange={(open) => !open && onRestrictionClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Posting Access Limited</DialogTitle>
            <DialogDescription>
              Your ability to post or reply has been limited due to recent account activity that does not meet our community safety standards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="h-10 rounded-full bg-brandBlue px-4 text-sm font-semibold text-white"
              onClick={onRestrictionClose}
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmBlockId} onOpenChange={onBlockDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {confirmBlockName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer see their posts or alerts, and they won't be able to interact with you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onBlockDialogChange(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBlockConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

NoticeBoardOverlays.displayName = "NoticeBoardOverlays";
