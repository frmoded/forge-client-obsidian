export async function resolveWidgetFile(): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  return { ok: true, html: (globalThis as any).__WIDGET_HTML as string };
}
