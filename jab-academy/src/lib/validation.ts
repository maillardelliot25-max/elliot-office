import { z } from "zod";

export const enrollmentSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(120),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().min(5, "Enter a valid phone number").max(30),
  country: z.string().min(2, "Country is required").max(80),
  discipline: z.string().min(2).max(80),
  cohortMonth: z.string().min(2).max(40),
  experienceLevel: z.string().min(2).max(40),
  waiverSignedName: z.string().min(2, "Type your full legal name to sign").max(120),
  waiverAccepted: z.literal(true, {
    message: "You must accept the liability waiver to enroll",
  }),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;

export const bookingSchema = z.object({
  organization: z.string().min(2, "Organization / production name is required").max(160),
  contactName: z.string().min(2, "Contact name is required").max(120),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().max(30).optional().or(z.literal("")),
  eventType: z.string().min(2).max(80),
  eventDate: z.string().optional().or(z.literal("")),
  location: z.string().min(2, "Event location is required").max(160),
  talentRequested: z.string().min(2).max(120),
  performerCount: z.coerce.number().int().min(1).max(200),
  budgetRange: z.string().max(80).optional().or(z.literal("")),
  message: z.string().min(10, "Tell us a bit more about the engagement").max(2000),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export const checkoutSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  items: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        priceUsd: z.number().nonnegative(),
        quantity: z.number().int().positive().max(50),
      })
    )
    .min(1, "Your cart is empty"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
