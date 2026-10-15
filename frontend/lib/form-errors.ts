import { ApiError } from "./api";

export interface FieldErrorResult {
  fieldErrors: Record<string, string>;
  general: string | null;
}

// Maps a failed apiFetch() call to per-field messages where possible, falling
// back to a general form error for anything that can't be attributed to a
// known field (e.g. NestJS ValidationPipe messages are "<field> must be ...",
// while other exceptions like ConflictException are a single plain string).
export function mapApiFieldErrors(
  err: unknown,
  fieldKeys: string[],
): FieldErrorResult {
  if (!(err instanceof ApiError)) {
    return {
      fieldErrors: {},
      general: err instanceof Error ? err.message : "Something went wrong.",
    };
  }

  const rawMessage = err.body?.message;

  // The backend named the field outright (e.g. login's "Incorrect password")
  // — show its message as-is under that input.
  const field = err.body?.field;
  if (field && fieldKeys.includes(field) && typeof rawMessage === "string") {
    return { fieldErrors: { [field]: rawMessage }, general: null };
  }

  const messages = Array.isArray(rawMessage)
    ? rawMessage
    : [rawMessage ?? err.message];

  const fieldErrors: Record<string, string> = {};
  const leftover: string[] = [];

  for (const message of messages) {
    const key = fieldKeys.find((k) => message.startsWith(`${k} `));
    if (key) {
      fieldErrors[key] ??= capitalize(message);
    } else {
      leftover.push(message);
    }
  }

  if (leftover.length && !fieldErrors.work_email && !fieldErrors.email) {
    const emailKey = fieldKeys.find((k) => k === "work_email" || k === "email");
    const emailMsgIndex = leftover.findIndex((m) => /email/i.test(m));
    if (emailKey && emailMsgIndex !== -1) {
      fieldErrors[emailKey] = capitalize(leftover[emailMsgIndex]);
      leftover.splice(emailMsgIndex, 1);
    }
  }

  // Same heuristic as email, for messages like "This phone number is
  // already registered" (ConflictException — a plain string, not a
  // per-field ValidationPipe message, so it doesn't start with the field
  // key and needs the same pattern-match fallback).
  if (leftover.length && !fieldErrors.phone_number) {
    const phoneKey = fieldKeys.find((k) => k === "phone_number");
    const phoneMsgIndex = leftover.findIndex((m) => /phone/i.test(m));
    if (phoneKey && phoneMsgIndex !== -1) {
      fieldErrors[phoneKey] = capitalize(leftover[phoneMsgIndex]);
      leftover.splice(phoneMsgIndex, 1);
    }
  }

  return { fieldErrors, general: leftover.length ? leftover.join(" ") : null };
}

function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}
