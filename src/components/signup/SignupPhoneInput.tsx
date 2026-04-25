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
    className="w-full pl-10 [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none"
    inputStyle={{
      width: "100%",
      height: "100%",
      fontSize: "15px",
      border: "none",
      boxShadow: "none",
      padding: 0,
      background: "transparent",
      color: "var(--text-primary,#424965)",
      outline: "none",
    }}
  />
);

export default SignupPhoneInput;
