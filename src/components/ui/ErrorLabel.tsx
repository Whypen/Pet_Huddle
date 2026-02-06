interface ErrorLabelProps {
  message?: string | null;
}

export const ErrorLabel = ({ message }: ErrorLabelProps) => {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
};
