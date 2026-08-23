import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import {
  AppBottomSheet,
  AppBottomSheetFooter,
  AppBottomSheetHeader,
  AppBottomSheetScroll,
  AppConfirmModal,
  AppModalButton,
  AppModalCloseButton,
  AppModalError,
  AppModalToggleRow,
} from "./nativeModalPrimitives";
import { nativeModalStyles } from "./nativeModalPrimitives.styles";
import { fetchNativeCareMarket, removeNativeCareInterest, saveNativeCareInterest } from "../lib/nativeCareMarket";
import serviceImage from "../../assets/Notifications/Service.jpg";

const SUCCESS_COPY = "Thanks for expressing your interest. You can update your preference in Account Settings. We’ll notify you when Care opens in your city.";

export function NativeCareInterestSheet({ accessToken, onClose, onSaved, onSkip, onSuccessDismissed, open, optional = false }: {
  accessToken?: string | null;
  onClose: () => void;
  onSaved?: () => void;
  onSkip?: () => void;
  onSuccessDismissed?: () => void;
  open: boolean;
  optional?: boolean;
}) {
  const [carer, setCarer] = useState(false);
  const [booker, setBooker] = useState(false);
  const [hasInterest, setHasInterest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!open) return;
    const generation = ++loadGeneration.current;
    setLoading(true); setError("");
    void fetchNativeCareMarket(accessToken).then((snapshot) => {
      if (loadGeneration.current !== generation) return;
      setCarer(snapshot.wants_to_be_carer); setBooker(snapshot.wants_to_book_care); setHasInterest(snapshot.has_interest);
    }).catch(() => { if (loadGeneration.current === generation) setError("We couldn’t load your Care preference. Please try again."); })
      .finally(() => { if (loadGeneration.current === generation) setLoading(false); });
    return () => { loadGeneration.current += 1; };
  }, [accessToken, open]);

  const close = useCallback(() => {
    if (saving) return;
    if (optional) { (onSkip ?? onClose)(); return; }
    onClose();
  }, [onClose, onSkip, optional, saving]);
  const dismissSuccess = useCallback(() => { setSuccessOpen(false); onSuccessDismissed?.(); }, [onSuccessDismissed]);
  const save = useCallback(async () => {
    if (saving || (!carer && !booker && !hasInterest)) return;
    setSaving(true); setError("");
    try {
      if (carer || booker) await saveNativeCareInterest({ wantsToBeCarer: carer, wantsToBookCare: booker, accessToken });
      else await removeNativeCareInterest(accessToken);
      setHasInterest(carer || booker); onSaved?.(); onClose(); setSuccessOpen(true);
    } catch { setError("We couldn’t save your Care preference. Your choices are still here—please try again."); }
    finally { setSaving(false); }
  }, [accessToken, booker, carer, hasInterest, onClose, onSaved, saving]);

  return (
    <>
      <Modal animationType="fade" onRequestClose={close} presentationStyle="overFullScreen" transparent visible={open}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
          <Pressable accessibilityLabel="Close Care interest" accessibilityRole="button" disabled={saving} onPress={close} style={nativeModalStyles.appBottomSheetEventBoundary} />
          <AppBottomSheet disableSwipeToClose={saving} mode="autoMax" onClose={close}>
            <AppBottomSheetHeader>
              <Text style={nativeModalStyles.appModalSheetTitle}>Interested in Pet Care?</Text>
              <AppModalCloseButton onPress={close} />
            </AppBottomSheetHeader>
            <AppBottomSheetScroll>
              <Text style={nativeModalStyles.appModalBody}>Tell us how you’d like to use Care in huddle.</Text>
              <Image accessibilityIgnoresInvertColors resizeMode="contain" source={serviceImage} style={nativeModalStyles.appModalCareIllustration} />
              <View style={nativeModalStyles.appModalToggleList}>
                <AppModalToggleRow disabled={loading || saving} label="I’m interested in providing or volunteering pet care" onChange={setCarer} value={carer} />
                <AppModalToggleRow disabled={loading || saving} label="I’m interested in booking pet care services" onChange={setBooker} value={booker} />
              </View>
              {error ? <AppModalError>{error}</AppModalError> : null}
            </AppBottomSheetScroll>
            <AppBottomSheetFooter>
              <AppModalButton disabled={loading || (!hasInterest && !carer && !booker)} loading={saving} onPress={() => void save()}>Save preference</AppModalButton>
            </AppBottomSheetFooter>
          </AppBottomSheet>
        </View>
      </Modal>
      <AppConfirmModal body={SUCCESS_COPY} cancelLabel={null} confirmLabel="Done" onCancel={dismissSuccess} onConfirm={dismissSuccess} open={successOpen} title="Interest saved" />
    </>
  );
}
