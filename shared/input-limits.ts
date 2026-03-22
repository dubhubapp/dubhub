/** Shared max lengths for user-generated text (client + server). */
export const INPUT_LIMITS = {
  /** Post / track title */
  postTitle: 80,
  /** Post description */
  postDescription: 300,
  postLocation: 80,
  postDjName: 60,
  /** Stored genre label (enum values are short) */
  postGenre: 64,
  /** Comments */
  commentBody: 500,
  /** Release name */
  releaseTitle: 100,
} as const;

export type InputLimitKey = keyof typeof INPUT_LIMITS;
