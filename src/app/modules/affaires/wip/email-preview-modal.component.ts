import { Component, TemplateRef, ViewChild, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, ModalRef, ModalService } from '@khalilrebhiitec/daf360';
import { EmailPreviewDto } from './wip.model';

/**
 * « Email à envoyer au client » — même construction `ModalService` que app-payment-modal
 * (monté une fois, sans `@if` : `<app-email-preview-modal #emailPreviewModal />`, piloté via
 * `.open(...)`). Partagé par les 3 modes WIP (Forfaitaire/Régie/Livrable) de
 * affaire-wip-tab.component.ts : lecture seule, l'appelant fournit le texte déjà calculé par
 * le backend (previewTauxEmail/previewValidateTmEmail/previewLivrablesEmail) et une callback
 * `onConfirm` qui déclenche le VRAI envoi (inchangé) — ce composant ne sait rien de ce qui se
 * passe une fois "Envoyer" cliqué, exactement comme app-payment-modal ne sait rien de
 * recordPayment au-delà de l'appeler.
 */
@Component({
  selector: 'app-email-preview-modal',
  standalone: true,
  imports: [TranslatePipe, ButtonComponent],
  template: `
    <ng-template #tpl>
      <div class="flex flex-col gap-4">
        <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.EMAIL_PREVIEW_INTRO' | translate }}</p>

        <!-- Même traitement « rappel en lecture seule » que app-payment-modal (bloc
             rounded-xl bg-surface-container) — l'icône reprend forward_to_inbox, déjà
             utilisée pour le même contexte (email client) sur la carte Livrable
             "En attente de réponse client". -->
        <div class="flex flex-col gap-3 rounded-xl bg-surface-container p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
              forward_to_inbox
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
                {{ 'AFFAIRES.WIP.EMAIL_PREVIEW_SUBJECT' | translate }}
              </span>
              <span class="text-body-md font-bold text-on-surface">{{ subject() }}</span>
            </div>
          </div>

          <div class="h-px bg-outline-variant/60"></div>

          <div class="flex flex-col gap-1">
            <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
              {{ 'AFFAIRES.WIP.EMAIL_PREVIEW_BODY' | translate }}
            </span>
            <p class="max-h-80 overflow-y-auto whitespace-pre-wrap text-body-sm text-on-surface">{{ body() }}</p>
          </div>
        </div>

        @if (error()) {
          <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">{{ error() }}</div>
        }

        <div class="flex justify-end gap-2.5 pt-1">
          <daf-button
            [label]="'AFFAIRES.WIP.EMAIL_PREVIEW_CANCEL' | translate"
            variant="secondary"
            [options]="{ disabled: sending() }"
            (onClick)="cancel()" />
          <daf-button
            [label]="'AFFAIRES.WIP.EMAIL_PREVIEW_SEND' | translate"
            variant="primary"
            [options]="{ iconStart: 'send', loading: sending(), disabled: sending() }"
            (onClick)="send()" />
        </div>
      </div>
    </ng-template>
  `,
})
export class EmailPreviewModalComponent {
  @ViewChild('tpl', { static: true }) private tpl!: TemplateRef<unknown>;

  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);

  protected modalRef?: ModalRef;

  readonly subject = signal('');
  readonly body    = signal('');
  readonly sending = signal(false);
  readonly error   = signal<string | null>(null);

  /** Called on "Envoyer" — must invoke `done()` on success, or `done(message)` on failure
   * (the modal then shows `message` and stays open, same as a form submit error elsewhere in
   * this codebase). Never called on "Annuler": cancelling does nothing, as the user asked. */
  private onConfirm?: (done: (errorMessage?: string) => void) => void;

  open(preview: EmailPreviewDto, onConfirm: (done: (errorMessage?: string) => void) => void): void {
    this.subject.set(preview.subject);
    this.body.set(preview.body);
    this.sending.set(false);
    this.error.set(null);
    this.onConfirm = onConfirm;

    this.modalRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.WIP.EMAIL_PREVIEW_TITLE'),
      icon:  'mail',
      body:  this.tpl,
      size:  'md',
      closeOnBackdrop: false,
    });
  }

  send(): void {
    if (this.sending() || !this.onConfirm) return;
    this.sending.set(true);
    this.error.set(null);
    this.onConfirm(errorMessage => {
      this.sending.set(false);
      if (errorMessage) {
        this.error.set(errorMessage);
        return;
      }
      this.modalRef?.close();
    });
  }

  cancel(): void {
    this.modalRef?.close();
  }
}
