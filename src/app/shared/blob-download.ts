/**
 * Helpers des exports générés par le backend (`responseType: 'blob'`) — même logique que
 * downloadBlob()/readBlobError() de report-detail.component.ts, mise en commun pour les
 * exports qui quittent la librairie `xlsx` côté navigateur.
 */

/** Déclenche le téléchargement du fichier reçu sous le nom donné. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Avec `responseType: 'blob'`, le corps d'une réponse d'erreur arrive AUSSI en Blob :
 * on le relit pour remonter le `detail` du ProblemDetail plutôt qu'un message générique. */
export async function readBlobError(err: unknown, fallback: string): Promise<string> {
  const body = (err as { error?: unknown } | null)?.error;
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text());
      return parsed?.detail ?? parsed?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
