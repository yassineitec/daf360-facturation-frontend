import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CheckboxComponent, FormFieldComponent,
} from '@khalilrebhiitec/daf360';
import { ContactDraft, emptyContactDraft } from './client-contact.model';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Éditeur de la liste des contacts d'un client — les mêmes lignes dans l'assistant
 * de création, dans l'assistant de modification et dans la fiche client. Un seul
 * composant : trois copies de ces quatre champs auraient divergé au premier ajout.
 *
 * Ne parle PAS au serveur. Il édite un tableau de {@link ContactDraft} et le renvoie
 * par `contactsChange` ; c'est l'écran qui l'héberge qui décide quand et comment
 * enregistrer — la création envoie tout avec le client, la modification envoie
 * contact par contact.
 *
 * `fonction` est un champ de TEXTE : « Contact finance », « Ingénierie »,
 * « Administratif » sont des libellés saisis, pas une liste fermée.
 */
@Component({
  selector: 'app-contact-editor',
  imports: [FormFieldComponent, CheckboxComponent, ButtonComponent, TranslatePipe],
  templateUrl: './contact-editor.component.html',
  styleUrl: './contact-editor.component.scss',
})
export class ContactEditorComponent {
  readonly contacts = input<ContactDraft[]>([]);
  /** Affiche l'astérisque et le rappel « au moins un contact ». */
  readonly required = input<boolean>(false);
  /** Signale les erreurs de saisie même sur les champs jamais touchés. */
  readonly touched  = input<boolean>(false);

  readonly contactsChange = output<ContactDraft[]>();

  private readonly translate = inject(TranslateService);

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Une ligne entamée doit au moins porter un nom : c'est la seule colonne NOT NULL
   * de `client_contacts`, et une ligne anonyme part en 400 au moment d'enregistrer.
   */
  rowNameError(row: ContactDraft): string {
    if (!this.touched()) return '';
    this.translate.currentLang();
    return row.fullName.trim() ? '' : this.translate.instant('CLIENTS.CONTACTS.NAME_REQUIRED');
  }

  rowEmailError(row: ContactDraft): string {
    if (!this.touched()) return '';
    this.translate.currentLang();
    const v = row.email.trim();
    if (v && !EMAIL_RE.test(v)) return this.translate.instant('CLIENTS.FORM.EMAIL_INVALID');
    return '';
  }

  /** Doublon d'adresse : refusé côté serveur par un index unique, autant le dire ici. */
  rowDuplicateEmail(index: number): boolean {
    const email = this.contacts()[index]?.email.trim().toLowerCase();
    if (!email) return false;
    return this.contacts().some((c, i) => i !== index && c.email.trim().toLowerCase() === email);
  }

  /**
   * Aucun contact sans adresse ne peut recevoir de facture. Ce n'est pas bloquant —
   * un contact « ingénierie » n'a pas forcément à être facturé — mais l'absence
   * TOTALE d'adresse chez tous les contacts mérite d'être signalée avant de valider.
   */
  readonly noEmailAtAll = computed(() =>
    this.contacts().length > 0 && this.contacts().every(c => !c.email.trim()));

  // ── Mutations ─────────────────────────────────────────────────────────────

  addRow(): void {
    // Premier contact : principal d'office, comme le fait le serveur. Le cocher
    // d'emblée évite un client dont aucun contact n'est désigné.
    const first = this.contacts().length === 0;
    this.contactsChange.emit([...this.contacts(), emptyContactDraft(first)]);
  }

  removeRow(index: number): void {
    const next = this.contacts().filter((_, i) => i !== index);
    // Retirer le principal laisserait la liste sans désigné : le premier restant
    // reprend le rôle.
    if (next.length > 0 && !next.some(c => c.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    this.contactsChange.emit(next);
  }

  patch(index: number, patch: Partial<ContactDraft>): void {
    this.contactsChange.emit(
      this.contacts().map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  /**
   * Exclusif : désigner un principal déclasse l'autre. Le décochage n'est pas
   * proposé — il faut désigner quelqu'un, pas retirer tout le monde (c'est aussi ce
   * que refuse le serveur).
   */
  setPrimary(index: number): void {
    this.contactsChange.emit(
      this.contacts().map((c, i) => ({ ...c, isPrimary: i === index })));
  }

  asStr(v: string | number | null): string { return v != null ? String(v) : ''; }
}
