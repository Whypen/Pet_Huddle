/**
 * ChatHeader — B.8 / C.2 / C.2b
 * DM variant:    Avatar40 + Name + SocialRole + verified badge
 * Group variant: GroupAvatar40 + name + member list with ellipsis
 */

import React from "react";
import { ArrowLeft, BadgeCheck, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SocialRole = "Pet Lover" | "Pet Parent" | "Pet Nanny";

export interface DMHeaderProps {
  type: "dm";
  avatarSrc?: string;
  name: string;
  /** Must be one of the 3 canonical values — no custom strings */
  socialRole: SocialRole;
  isVerified?: boolean;
  onBack?: () => void;
  onMore?: () => void;
}

export interface GroupHeaderProps {
  type: "group";
  groupImageSrc?: string;
  groupInitials?: string;
  groupName: string;
  /** e.g. ["Marco", "Sarah", "Lena", "+3 more"] */
  memberNames: string[];
  onBack?: () => void;
  onMore?: () => void;
}

export type ChatHeaderProps = DMHeaderProps | GroupHeaderProps;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Avatar40: React.FC<{ src?: string; name: string }> = ({ src, name }) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-[40px] h-[40px] rounded-full object-cover flex-shrink-0"
      />
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <span className="w-[40px] h-[40px] rounded-full bg-[rgba(33,69,207,0.10)] flex items-center justify-center text-[#2145CF] text-[15px] font-[600] flex-shrink-0">
      {initials}
    </span>
  );
};

const BackButton: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={onBack ?? (() => navigate(-1))}
      className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)] flex-shrink-0"
      aria-label="Back"
    >
      <ArrowLeft size={24} strokeWidth={1.5} />
    </button>
  );
};

// ─── ChatHeader ───────────────────────────────────────────────────────────────

export const ChatHeader: React.FC<ChatHeaderProps> = (props) => {
  if (props.type === "dm") {
    const { avatarSrc, name, socialRole, isVerified, onBack, onMore } = props;
    return (
      <header className="glass-bar h-[56px] fixed top-0 inset-x-0 z-[20] flex items-center px-[16px] gap-[12px]">
        <BackButton onBack={onBack} />

        <Avatar40 src={avatarSrc} name={name} />

        {/* Name + Meta */}
        <div className="flex flex-col gap-[2px] flex-1 min-w-0">
          <span className="text-[16px] font-[600] leading-[1.25] text-[#424965] truncate">
            {name}
          </span>
          <span className="text-[11px] font-[400] leading-[1.45] text-[rgba(74,73,101,0.55)] truncate">
            {socialRole}
          </span>
        </div>

        {/* Verified badge — AFTER Name+Meta block, not inline */}
        {isVerified && (
          <BadgeCheck
            size={16}
            strokeWidth={1.5}
            className="text-[#2145CF] flex-shrink-0"
            aria-label="Verified"
          />
        )}

        {/* More button */}
        <button
          type="button"
          onClick={onMore}
          className="absolute right-[16px] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
          aria-label="More options"
        >
          <MoreVertical size={24} strokeWidth={1.5} />
        </button>
      </header>
    );
  }

  // Group variant
  const { groupImageSrc, groupInitials, groupName, memberNames, onBack, onMore } = props;
  const memberListStr = memberNames.join(", ");

  return (
    <header className="glass-bar h-[56px] fixed top-0 inset-x-0 z-[20] flex items-center px-[16px] gap-[12px]">
      <BackButton onBack={onBack} />

      {/* Group avatar */}
      {groupImageSrc ? (
        <img
          src={groupImageSrc}
          alt={groupName}
          className="w-[40px] h-[40px] rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <span className="w-[40px] h-[40px] rounded-full bg-[rgba(33,69,207,0.10)] flex items-center justify-center text-[#2145CF] text-[15px] font-[600] flex-shrink-0">
          {groupInitials ?? groupName.slice(0, 2).toUpperCase()}
        </span>
      )}

      {/* Name + Member list */}
      <div className="flex flex-col gap-[2px] flex-1 min-w-0">
        <span className="text-[16px] font-[600] leading-[1.25] text-[#424965] truncate max-w-[160px]">
          {groupName}
        </span>
        {/* Member list: max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap */}
        <span
          className="text-[11px] font-[400] leading-[1.45] text-[rgba(74,73,101,0.55)] overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
          title={memberListStr}
        >
          {memberListStr}
        </span>
      </div>

      {/* More button */}
      <button
        type="button"
        onClick={onMore}
        className="absolute right-[16px] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
        aria-label="More options"
      >
        <MoreVertical size={24} strokeWidth={1.5} />
      </button>
    </header>
  );
};

export default ChatHeader;
