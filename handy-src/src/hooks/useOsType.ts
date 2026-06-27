import { type } from "@tauri-apps/plugin-os";
import { type OSType } from "../lib/utils/keyboard";

/**
 * Get the current OS type for keyboard handling.
 * This is a simple wrapper - type() is synchronous.
 */
export function useOsType(): OSType {
  try {
    const osType = type();
    if (osType === "macos" || osType === "windows" || osType === "linux") {
      return osType;
    }
  } catch {
    return "windows";
  }
  return "unknown";
}
