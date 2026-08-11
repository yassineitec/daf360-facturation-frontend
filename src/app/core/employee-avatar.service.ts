import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map, catchError } from 'rxjs';
import { environment } from '../../environments/environment';

/** One row of `GET /api/hr/profiles/avatars` (rh-service `EmployeeAvatarDto`). */
export interface EmployeeAvatar {
  userId:    number;
  /** RH profile id — the photo URL is built from THIS, never from `userId`. */
  profileId: number | null;
  /** Raw `employee_profiles.photo_url`. Presence flag only; may point at a missing file. */
  photoUrl:  string | null;
  /** `updated_at` in epoch millis — the cache-buster. See `photoUrl()` below. */
  photoVersion: number | null;
  fullName:  string | null;
  gender:    string | null;
}

/**
 * Resolves a **user** id to an RH avatar.
 *
 * The finance module stores people as user ids (`affaires.responsable_user_id`), while the
 * photo hangs off the RH profile and is served by profile id — so this asks rh-service to
 * do the mapping, in one batched call, rather than searching profiles by name.
 *
 * The auth interceptor already attaches the `rhToken` to any `hrApiUrl` request, exactly
 * like `hiring-cost-approval.service.ts` does.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeAvatarService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.hrApiUrl}/api/hr/profiles`;

  /**
   * Session cache keyed by user id. An avatar is stable for the length of a session, and
   * the same manager appears on many affaires — without this, every navigation re-asks.
   * `null` is cached too: it records "RH has no photo for this user", which is the answer
   * we must not re-request on every render.
   */
  private readonly cache = new Map<number, EmployeeAvatar | null>();

  /**
   * Never rejects. A missing avatar must degrade to initials, so an RH outage cannot break
   * the page that merely wanted to draw a face — hence `catchError` → empty list.
   */
  resolve(userIds: readonly number[]): Observable<EmployeeAvatar[]> {
    const wanted  = [...new Set(userIds.filter(id => !!id))];
    const missing = wanted.filter(id => !this.cache.has(id));

    if (missing.length === 0) {
      return of(wanted.map(id => this.cache.get(id)).filter((a): a is EmployeeAvatar => !!a));
    }

    const params = new HttpParams().set('userIds', missing.join(','));

    return this.http.get<EmployeeAvatar[]>(`${this.base}/avatars`, { params }).pipe(
      map(rows => {
        for (const row of rows) this.cache.set(row.userId, row);
        // Ids the backend did not answer for (unknown or soft-deleted) are cached as
        // `null`, otherwise they are "missing" forever and re-fetched on every call.
        for (const id of missing) if (!this.cache.has(id)) this.cache.set(id, null);
        return wanted.map(id => this.cache.get(id)).filter((a): a is EmployeeAvatar => !!a);
      }),
      catchError(err => {
        // On dégrade en silence côté UI (les initiales s'affichent), mais on trace :
        // sans ça, « pas de photo », « endpoint absent », « 401 » et « aucune photo en
        // base » sont indistinguables à l'écran, et c'est exactement ce qui rend ce
        // chemin impossible à diagnostiquer. Les ids ne sont PAS mis en cache ici, donc
        // la navigation suivante réessaie.
        console.warn(
          `[avatars] ${this.base}/avatars a échoué (HTTP ${err?.status ?? '?'}) — `
          + 'les initiales seront affichées.', err?.error ?? err?.message ?? '');
        return of([] as EmployeeAvatar[]);
      }),
    );
  }

  /**
   * `<img>`-ready URL, or null when there is no photo on file.
   *
   * **Absolute**, unlike rh-frontend's helper which builds a relative path: that app is
   * served from the same origin as its API through a proxy, this one is not (finance runs
   * inside the shell and neither project declares a dev proxy for `/api/hr`). Cross-origin
   * is fine here because `GET /api/hr/profiles/{id}/photo` is `permitAll` in rh-service's
   * SecurityConfig — written with `{id}` and not a wildcard on purpose: a `*` followed by a
   * slash ends this comment block. An `<img>` needs no CORS headers to render, and it sends
   * no Authorization header either, which is precisely why that endpoint is public.
   *
   * `?v=` carries `photoVersion` (the profile's `updated_at`) so a re-upload busts the
   * endpoint's 7-day `Cache-Control`. It cannot be derived from `photoUrl`: rh-service
   * stores the **constant** `/api/hr/profiles/{id}/photo` there and rewrites it to the same
   * value on every upload, so any version taken from it never changes.
   */
  photoUrl(avatar: EmployeeAvatar | null | undefined): string | null {
    if (!avatar?.photoUrl || !avatar.profileId) return null;
    const url = `${this.base}/${avatar.profileId}/photo`;
    return avatar.photoVersion ? `${url}?v=${avatar.photoVersion}` : url;
  }
}
