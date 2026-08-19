import { api } from "../api";
import { getErrorMessage } from "./getErrorMessage";

/**
 * Downloads a CSV from a backend endpoint and saves it via the browser.
 * On failure, tries to recover the backend's JSON error message even
 * though the request was made with responseType "blob".
 */
export const downloadCsv = async (
  url: string,
  params: Record<string, unknown>,
  fallbackFilename: string
): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    const res = await api.get(url, { params, responseType: "blob" });

    const disposition = res.headers["content-disposition"] as string | undefined;
    const match = disposition && /filename="([^"]+)"/.exec(disposition);
    const filename = match ? match[1] : fallbackFilename;

    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);

    return { ok: true };
  } catch (err: any) {
    const blob = err?.response?.data;

    if (blob instanceof Blob && blob.type.includes("json")) {
      try {
        const parsed = JSON.parse(await blob.text());
        if (parsed?.message) return { ok: false, message: parsed.message };
      } catch {
        // fall through to generic handling below
      }
    }

    return { ok: false, message: getErrorMessage(err, "Failed to download attendance report") };
  }
};
