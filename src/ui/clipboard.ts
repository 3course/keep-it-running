/** Copy text to the clipboard; falls back to execCommand where the async API isn't allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

declare const __BUILD_COMMIT__: string | undefined;
/** The version and the commit it was built from (vite.config's define; 'dev' outside a git checkout). */
export const BUILD_TAG = `v0.2 · ${typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev'}`;
