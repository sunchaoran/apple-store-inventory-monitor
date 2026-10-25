import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 外观偏好：浅色、深色或跟随系统（默认）。
 *
 * 只是本机界面偏好，存在 localStorage 里，不进设置文件；存储不可用时退回跟随系统。
 * 选了浅色或深色时同时设置原生窗口的外观，标题栏和窗口边框才会跟界面一致。
 */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "apw.theme";
const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

let preference: ThemePreference = readStored();
const listeners = new Set<() => void>();

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.find((item) => item === value) ?? "system";
  } catch {
    return "system";
  }
}

function applyClass(): void {
  const dark = preference === "system" ? systemDark.matches : preference === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

function syncNativeWindow(): void {
  try {
    // null 表示交还给系统决定。
    void getCurrentWindow().setTheme(preference === "system" ? null : preference).catch(() => undefined);
  } catch {
    // 在普通浏览器里预览界面时没有 Tauri 窗口，只切换页面配色即可。
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** 在渲染之前调用一次，避免启动时先闪一下错误的配色。 */
export function initTheme(): void {
  applyClass();
  if (preference !== "system") syncNativeWindow();
  // 固定了浅色或深色时，原生窗口的外观也会被固定，这里的变化事件只对跟随系统有意义。
  systemDark.addEventListener("change", () => {
    if (preference === "system") applyClass();
  });
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 私密窗口或存储被禁用时只影响记忆，不影响这次切换。
  }
  applyClass();
  syncNativeWindow();
  notify();
}

export const themeStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): ThemePreference {
    return preference;
  },
};
