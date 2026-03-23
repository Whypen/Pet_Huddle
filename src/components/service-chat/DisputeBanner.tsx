type Props = {
  role: "requester" | "provider";
};

export const DisputeBanner = ({ role }: Props) => {
  return (
    <div className="rounded-2xl border border-[#ef6450]/25 bg-[#ef6450]/10 p-3 text-[#ef6450] text-sm font-medium">
      <p>Payment on hold</p>
      <p className="text-xs mt-1">
        {role === "requester" ? "Huddle is reviewing this case." : "A complaint has been filed."}
      </p>
    </div>
  );
};

