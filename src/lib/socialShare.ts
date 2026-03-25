export type SocialShareLinks = {
  whatsapp: string;
  facebook: string;
  instagram: string;
  threads: string;
};

export const buildSocialShareLinks = (url: string): SocialShareLinks => {
  const encodedUrl = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    instagram: `https://www.instagram.com/?url=${encodedUrl}`,
    threads: `https://www.threads.net/intent/post?text=${encodedUrl}`,
  };
};
