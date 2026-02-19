import { z } from "zod";

export const loginSecretsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const nandosSecretsSchema = loginSecretsSchema.extend({
  firstName: z.string().min(1),
  expectedAddress: z.string().min(1),
  savedCardSuffix: z.string().min(1),
});

export type LoginSecrets = z.infer<typeof loginSecretsSchema>;
export type NandosSecrets = z.infer<typeof nandosSecretsSchema>;
