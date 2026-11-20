// Profile pictures players can choose (served by the web app from web/public/avatars/): old
// portraits in sunglasses and headphones. A player's `image` is one of these paths.

export const AVATARS = [
  { src: "/avatars/1.webp", alt: "A Renaissance man in a ruff collar, wearing silver wraparound sunglasses" },
  { src: "/avatars/2.webp", alt: "A figure in a grey head wrap and a pleated ruff collar" },
  { src: "/avatars/3.webp", alt: "A bald, bearded man in a blue coat, wearing white sunglasses" },
  { src: "/avatars/4.webp", alt: "A woman in a fur shawl, wearing dark sunglasses and pink headphones" },
  { src: "/avatars/5.webp", alt: "A woman in pink with her chin on her hand, wearing silver sunglasses" },
  { src: "/avatars/6.webp", alt: "A gentleman in a high white collar, wearing white sunglasses" },
  { src: "/avatars/7.webp", alt: "A Renaissance woman in an ermine collar, wearing pink headphones" },
  { src: "/avatars/8.webp", alt: "A girl in a grey shawl, holding a plate of fruit" },
] as const;

export const isAvatar = (image: string) => AVATARS.some((a) => a.src === image);
