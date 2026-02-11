import { z } from "zod";

export const loginContextSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const nandosContextSchema = loginContextSchema.extend({
  firstName: z.string().min(1),
  expectedAddress: z.string().min(1),
  savedCardSuffix: z.string().min(1),
});
