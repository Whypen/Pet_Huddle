export type SocialShareLinks = {
  whatsapp: string;
  facebook: string;
  messenger: string;
  instagram: string;
  twitter: string;
};

export const buildSocialShareLinks = (url: string, text: string): SocialShareLinks => {
  const encodedText = encodeURIComponent(`${text} ${url}`.trim());
  const encodedUrl = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodedText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    messenger: `fb-messenger://share?link=${encodedUrl}`,
    instagram: "https://www.instagram.com/reels/create/",
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodedUrl}`,
  };
};
