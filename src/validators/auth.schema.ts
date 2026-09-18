import { z } from 'zod';
import { trimmedString } from './common';

/**
 * Passwords: at least 8 characters with a letter and a digit. Note that `role` is
 * deliberately absent from every public schema — it can never be set by a client.
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

const email = z.string().trim().toLowerCase().email('A valid email address is required').max(200);
const phone = z.string().trim().min(5).max(30).optional();

export const registerSchema = z
  .object({
    name: trimmedString(2, 120),
    email,
    phone,
    password,
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(10) }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();

export const bootstrapAdminSchema = z
  .object({
    name: trimmedString(2, 120),
    email,
    phone,
    password,
    setupToken: z.string().min(1),
  })
  .strict();
