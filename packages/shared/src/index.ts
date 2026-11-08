import { z } from "zod";

export const platformSchema = z.enum(["FACEBOOK", "INSTAGRAM"]);
export type Platform = z.infer<typeof platformSchema>;

export const postStatusSchema = z.enum([
  "DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED",
]);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const createPostSchema = z.object({
  caption: z.string().max(2_200).default(""),
  platforms: z.array(platformSchema).min(1),
  scheduledAt: z.string().datetime().optional(),
}).strict();
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const DEFAULT_TIME_ZONE = "Africa/Cairo";

export const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "فيسبوك",
  INSTAGRAM: "إنستجرام",
};