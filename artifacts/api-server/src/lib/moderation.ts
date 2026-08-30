import { openai } from "@workspace/integrations-openai-ai-server";

/**
 * Checks an image (as a data URL or fetchable URL) for NSFW / inappropriate
 * content using a vision model. Fails CLOSED: if the check errors, the image
 * is treated as unsafe so nothing unmoderated slips through.
 */
export async function isImageSafe(imageDataUrl: string): Promise<boolean> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "You are a strict content moderator for a kids' game. " +
                "Is this image safe for all ages? It must contain NO nudity, " +
                "sexual content, gore, graphic violence, drugs, hate symbols, " +
                "or slurs/profanity in text. Answer with exactly one word: " +
                "SAFE or UNSAFE.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim().toUpperCase();
    return answer === "SAFE";
  } catch {
    return false;
  }
}
