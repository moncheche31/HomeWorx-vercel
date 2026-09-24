import { z } from "zod";

/** Spoken/typed measurement text captured for one specific estimate line. */
export const captureLineMeasurementSchema = z.object({
  estimateId: z.string().uuid(),
  lineId: z.string().uuid(),
  /** Verbatim dictation or typed wording ("eight by six"). */
  text: z.string().trim().min(1).max(2000).optional(),
  /** Direct numeric fallback in the line's own unit, for noisy job sites. */
  quantity: z.number().finite().positive().max(1_000_000).optional(),
  source: z.enum(["spoken", "typed"]),
});

export type CaptureLineMeasurementInput = z.infer<typeof captureLineMeasurementSchema>;
