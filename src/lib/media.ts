// Limits for the optional preview pictures and videos (shared by the forms and the server).
export const MEDIA_LIMITS = {
  fileImages: 6,
  fileVideos: 2,
  experienceImages: 1,
  imageInputBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  videoSeconds: 5 * 60,
} as const;

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const VIDEO_ACCEPT = "video/mp4,video/webm";

export interface MediaRef {
  id: string;
  kind: "image" | "video";
}
