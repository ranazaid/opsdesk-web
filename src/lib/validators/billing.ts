import { z } from "zod";

/** Plans that can be bought through Stripe Checkout. */
export const checkoutSchema = z.object({ plan: z.enum(["pro", "business"]) });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
