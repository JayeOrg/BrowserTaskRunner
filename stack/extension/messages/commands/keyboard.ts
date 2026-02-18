import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId } from "../../tabs.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const keyboardSchema = z
  .object({
    action: z.enum(["type", "press", "down", "up"]),
    text: z.string().optional(),
    key: z.string().optional(),
    selector: z.string().optional(),
    frameId: z.number().optional(),
  })
  .refine((data) => data.action !== "type" || typeof data.text === "string", {
    message: "keyboard 'type' action requires 'text'",
    path: ["text"],
  })
  .refine((data) => data.action === "type" || typeof data.key === "string", {
    message: "keyboard action requires 'key' when action is not 'type'",
    path: ["key"],
  });

export type KeyboardCommand = z.infer<typeof keyboardSchema> & { type: "keyboard" };

export interface KeyboardResponse extends BaseResponse {
  type: "keyboard";
}

export async function handleKeyboard(
  input: z.infer<typeof keyboardSchema>,
): Promise<KeyboardResponse> {
  const key = input.key ?? "";
  const tabId = await getActiveTabId();

  if (input.selector) {
    const target = await getScriptTarget(input.frameId);
    const results = await chrome.scripting.executeScript({
      target,
      func: (sel: string) => {
        const element = document.querySelector(sel);
        if (!element) {
          return { error: `Element not found: ${sel}` };
        }
        if (element instanceof HTMLElement) {
          element.focus();
        }
        return {};
      },
      args: [input.selector],
    });
    const extracted = extractResult(results);
    if (!extracted.ok) {
      return { type: "keyboard", error: extracted.error };
    }
  }

  // Validate key before attaching debugger
  let keyCode: number | null = null;
  if (input.action !== "type") {
    keyCode = charToKeyCode(key);
    if (keyCode === null) {
      return { type: "keyboard", error: `Unsupported key: ${key}` };
    }
  }

  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch {
    return { type: "keyboard", error: "Failed to attach debugger for keyboard input" };
  }

  try {
    if (input.action === "type") {
      await chrome.debugger.sendCommand(debuggee, "Input.insertText", {
        text: input.text,
      });
    } else if (input.action === "press") {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key,
        windowsVirtualKeyCode: keyCode,
      });
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        windowsVirtualKeyCode: keyCode,
      });
    } else if (input.action === "down") {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key,
        windowsVirtualKeyCode: keyCode,
      });
    } else {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        windowsVirtualKeyCode: keyCode,
      });
    }
  } catch {
    return { type: "keyboard", error: `Failed to dispatch keyboard event: ${input.action}` };
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => undefined);
  }

  return { type: "keyboard" };
}

const KEY_CODES: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Delete: 46,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  Space: 32,
  " ": 32,
};

function charToKeyCode(key: string): number | null {
  if (KEY_CODES[key] !== undefined) return KEY_CODES[key];
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return null;
}
