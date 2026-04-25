import { isValidPhoneNumber } from "react-phone-number-input";

export const isValidSignupPhoneNumber = (value: string) => {
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
};
