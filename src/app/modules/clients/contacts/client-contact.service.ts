import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AffaireContactDto, ClientContactDto, ConfigureContactsRequest, ContactDraft,
  SaveClientContactRequest,
} from './client-contact.model';

@Injectable({ providedIn: 'root' })
export class ClientContactService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /**
   * Par défaut les contacts ACTIFS seulement : c'est ce qu'on peut rattacher à une
   * affaire. `includeInactive` sert à la fiche client, qui doit montrer les
   * désactivés pour permettre de les réactiver.
   */
  getContacts(clientId: number, includeInactive = false): Observable<ClientContactDto[]> {
    const params = new HttpParams().set('includeInactive', String(includeInactive));
    return this.http
      .get<ClientContactDto[]>(`${this.base}/clients/${clientId}/contacts`, { params })
      .pipe(catchError(() => of([] as ClientContactDto[])));
  }

  createContact(clientId: number, dto: SaveClientContactRequest): Observable<ClientContactDto> {
    return this.http.post<ClientContactDto>(`${this.base}/clients/${clientId}/contacts`, dto);
  }

  updateContact(clientId: number, contactId: number,
                dto: SaveClientContactRequest): Observable<ClientContactDto> {
    return this.http.put<ClientContactDto>(
      `${this.base}/clients/${clientId}/contacts/${contactId}`, dto);
  }

  /** Désactivation côté serveur — jamais une suppression. */
  deactivateContact(clientId: number, contactId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/clients/${clientId}/contacts/${contactId}`);
  }

  reactivateContact(clientId: number, contactId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/clients/${clientId}/contacts/${contactId}/reactivate`, {});
  }

  /**
   * Rejoue une liste éditée sur le serveur : les nouveaux en POST, les modifiés en PUT,
   * les disparus de l'écran en désactivation. Partagé par l'assistant client et la
   * fiche client — deux copies de ce diff auraient divergé.
   *
   * `initial` est la photo de la liste au chargement : c'est la comparaison avec `rows`
   * qui dit lesquels ont été retirés. Sans elle, une ligne supprimée à l'écran
   * resterait en base.
   *
   * Les lignes NON principales envoient `isPrimary: null` — « ne touche pas à ce
   * drapeau » — et jamais `false`. C'est ce qui rend les appels indépendants, donc
   * parallélisables : un PUT portant `false` sur le principal en place est refusé par
   * le serveur (on désigne un remplaçant, on ne retire pas tout le monde). Promouvoir
   * le nouveau suffit, le serveur déclasse l'ancien lui-même.
   */
  syncContacts(clientId: number, rows: ContactDraft[],
               initial: ContactDraft[]): Observable<unknown> {
    const kept    = rows.filter(c => c.fullName.trim());
    const keptIds = new Set(kept.map(c => c.id).filter((id): id is number => id != null));

    const payload = (c: ContactDraft, primary: boolean | null): SaveClientContactRequest => ({
      fullName:  c.fullName.trim(),
      fonction:  c.fonction.trim() || null,
      email:     c.email.trim()    || null,
      phone:     c.phone.trim()    || null,
      isPrimary: primary,
      notes:     null,
    });

    const calls: Observable<unknown>[] = [
      ...kept.filter(c => c.id != null && c.isPrimary)
             .map(c => this.updateContact(clientId, c.id!, payload(c, true))),
      ...kept.filter(c => c.id != null && !c.isPrimary)
             .map(c => this.updateContact(clientId, c.id!, payload(c, null))),
      ...kept.filter(c => c.id == null)
             .map(c => this.createContact(clientId, payload(c, c.isPrimary))),
      ...initial.filter(c => c.id != null && !keptIds.has(c.id))
                .map(c => this.deactivateContact(clientId, c.id!)),
    ];

    // `forkJoin` sur un tableau vide n'émet JAMAIS : sans ce court-circuit, enregistrer
    // une liste inchangée laisserait le bouton bloqué sur « … ».
    return calls.length ? forkJoin(calls) : of([]);
  }

  // ── Rattachement aux affaires ─────────────────────────────────────────────

  getAffaireContacts(affaireId: number): Observable<AffaireContactDto[]> {
    return this.http
      .get<AffaireContactDto[]>(`${this.base}/affaires/${affaireId}/contacts`)
      .pipe(catchError(() => of([] as AffaireContactDto[])));
  }

  /** Remplacement COMPLET : ce qui n'est pas dans la liste est détaché. */
  configureAffaireContacts(affaireId: number,
                           dto: ConfigureContactsRequest): Observable<AffaireContactDto[]> {
    return this.http.patch<AffaireContactDto[]>(
      `${this.base}/affaires/${affaireId}/config/contacts`, dto);
  }
}
