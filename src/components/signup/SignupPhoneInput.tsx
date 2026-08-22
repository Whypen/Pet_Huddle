import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

type SignupPhoneInputProps = {
  defaultCountry: string;
  value: string;
  onChange: (value: string) => void;
};

const SignupPhoneInput = ({ defaultCountry, value, onChange }: SignupPhoneInputProps) => (
  <PhoneInput
    defaultCountry={defaultCountry as never}
    international
    value={value}
    onChange={(nextValue) => onChange(nextValue || "")}
    // `inputStyle` is not part of react-phone-number-input's API — it was passed
    // straight through to the DOM input, which React logs as an unrecognised
    // prop on every render. The same rules are expressed as descendant classes
    // on .PhoneInputInput instead, so the appearance is unchanged and the
    // console stays clean.
    className="w-full pl-10 [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:w-full [&_.PhoneInputInput]:h-full [&_.PhoneInputInput]:text-[15px] [&_.PhoneInputInput]:p-0 [&_.PhoneInputInput]:text-[var(--text-primary,#424965)] [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none"
  />
);

export default SignupPhoneInput;
