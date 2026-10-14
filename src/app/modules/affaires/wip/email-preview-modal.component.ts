import { Component, TemplateRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, ModalRef, ModalService } from '@khalilrebhiitec/daf360';
import { EmailPreviewDto } from './wip.model';

/**
 * « Email à envoyer au client » — monté une fois, sans `@if`, piloté via `.open(...)`.
 * Partagé par les 3 modes WIP (Forfaitaire/Régie/Livrable).
 *
 * L'utilisateur peut modifier le sujet et le corps avant d'envoyer. La callback `onConfirm`
 * reçoit le texte (potentiellement édité) et un `done()` comme avant.
 */
@Component({
  selector: 'app-email-preview-modal',
  standalone: true,
  imports: [TranslatePipe, FormsModule, ButtonComponent],
  template: `
    <ng-template #tpl>
      <div class="flex flex-col gap-4">
        <p class="text-body-sm text-on-surface-variant">{{ 'AFFAIRES.WIP.EMAIL_PREVIEW_INTRO' | translate }}</p>

        <div class="flex flex-col gap-3 rounded-xl bg-surface-container p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
              forward_to_inbox
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
                {{ 'AFFAIRES.WIP.EMAIL_PREVIEW_SUBJECT' | translate }}
              </span>
              <input
                class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-body-md font-bold text-on-surface outline-none focus:border-primary"
                [value]="subject()"
                (input)="subject.set($any($event.target).value)"
                [disabled]="sending()" />
            </div>
          </div>

          <div class="h-px bg-outline-variant/60"></div>

          <div class="flex flex-col gap-1">
            <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
              {{ 'AFFAIRES.WIP.EMAIL_PREVIEW_BODY' | translate }}
            </span>
            <textarea
              class="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary"
              rows="10"
              style="resize: vertical; font-family: inherit;"
              [value]="body()"
              (input)="body.set($any($event.target).value)"
              [disabled]="sending()"></textarea>
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

  /**
   * Called on "Envoyer" — receives the (potentially edited) subject and body, plus a `done()`
   * callback. Call `done()` on success (closes the modal) or `done(message)` on failure
   * (shows `message` and keeps modal open). Never called on "Annuler".
   */
  private onConfirm?: (subject: string, body: string, done: (errorMessage?: string) => void) => void;

  open(preview: EmailPreviewDto, onConfirm: (subject: string, body: string, done: (errorMessage?: string) => void) => void): void {
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
    this.onConfirm(this.subject(), this.body(), errorMessage => {
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
