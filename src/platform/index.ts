import { createMockPlatform } from "./mock";
import { createOwlbearPlatform, isInOwlbear } from "./owlbear";
import type { Platform } from "./types";

export type { AppTheme, Host, NotifyVariant, Platform, Role } from "./types";

/** Picks the real Owlbear platform when embedded, otherwise the mock. */
export function createPlatform(): Platform {
  return isInOwlbear() ? createOwlbearPlatform() : createMockPlatform();
}
