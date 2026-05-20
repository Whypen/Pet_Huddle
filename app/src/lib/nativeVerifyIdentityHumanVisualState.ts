export type NativeHumanVisualStep = "center" | "left" | "right" | "done";
export type NativeHumanScanColor = "active" | "done" | "hidden";

export type NativeHumanScanVisualStateInput = {
  confirmationDwellStep?: Exclude<NativeHumanVisualStep, "done"> | null;
  currentStep: NativeHumanVisualStep;
  failed: boolean;
  settleTarget?: Exclude<NativeHumanVisualStep, "done"> | "submit" | null;
};

export type NativeHumanScanVisualState = {
  centerColor: NativeHumanScanColor;
  centerConfirmed: boolean;
  leftColor: NativeHumanScanColor;
  leftConfirmed: boolean;
  rightColor: NativeHumanScanColor;
  rightConfirmed: boolean;
  showCenterRing: boolean;
  showLeftArc: boolean;
  showRightArc: boolean;
  visualActiveStep: Exclude<NativeHumanVisualStep, "done"> | "checking" | "settle" | null;
};

export const getNativeHumanScanVisualState = ({
  confirmationDwellStep,
  currentStep,
  failed,
  settleTarget,
}: NativeHumanScanVisualStateInput): NativeHumanScanVisualState => {
  const centerConfirmed = confirmationDwellStep === "center";
  const leftConfirmed = confirmationDwellStep === "left";
  const rightConfirmed = confirmationDwellStep === "right";

  if (failed) {
    return {
      centerColor: "hidden",
      centerConfirmed,
      leftColor: "hidden",
      leftConfirmed,
      rightColor: "hidden",
      rightConfirmed,
      showCenterRing: false,
      showLeftArc: false,
      showRightArc: false,
      visualActiveStep: null,
    };
  }

  if (confirmationDwellStep) {
    return {
      centerColor: centerConfirmed ? "done" : "hidden",
      centerConfirmed,
      leftColor: leftConfirmed ? "done" : "hidden",
      leftConfirmed,
      rightColor: rightConfirmed ? "done" : "hidden",
      rightConfirmed,
      showCenterRing: centerConfirmed,
      showLeftArc: leftConfirmed,
      showRightArc: rightConfirmed,
      visualActiveStep: confirmationDwellStep,
    };
  }

  if (settleTarget) {
    return {
      centerColor: "hidden",
      centerConfirmed,
      leftColor: "hidden",
      leftConfirmed,
      rightColor: "hidden",
      rightConfirmed,
      showCenterRing: false,
      showLeftArc: false,
      showRightArc: false,
      visualActiveStep: settleTarget === "submit" ? "checking" : "settle",
    };
  }

  return {
    centerColor: currentStep === "center" ? "active" : "hidden",
    centerConfirmed,
    leftColor: currentStep === "left" ? "active" : "hidden",
    leftConfirmed,
    rightColor: currentStep === "right" ? "active" : "hidden",
    rightConfirmed,
    showCenterRing: currentStep === "center",
    showLeftArc: currentStep === "left",
    showRightArc: currentStep === "right",
    visualActiveStep: currentStep === "done" ? "checking" : currentStep,
  };
};
