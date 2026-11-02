import {
  Component, DestroyRef, TemplateRef, effect, inject, input, output, untracked, viewChild,
} from '@angular/core';
import { ModalConfig, ModalRef, ModalService } from '@khalilrebhiitec/daf360';

/**
 * Pop-up faite main → daf modal (ModalService), redimensionnable et agrandissable, sans
 * réécrire son contenu : le contenu projeté est enveloppé dans un <ng-template> passé comme
 * `body` à ModalService.
 *
 *   @if (open()) {
 *     <app-daf-modal [title]="…" icon="history" [visible]="true" (closed)="open.set(false)">
 *       …contenu…
 *     </app-daf-modal>
 *   }
 *
 * ✕, clic sur le fond et sortie de la page ferment la modale ; `(closed)` prévient l'appelant.
 */
@Component({
  selector: 'app-daf-modal',
  standalone: true,
  template: `
    <ng-template #bodyTpl>
      <ng-content />
    </ng-template>
  `,
  // Global (::ng-deep) : le contenu est rendu dans le daf-modal-host sous <body>, pas sous
  // cet élément. `daf-modal-fill` sur le conteneur du contenu → il prend toute la hauteur de
  // la fenêtre, le daf-data-table s'étire et ce qui le suit (pagination) reste en bas,
  // y compris après redimensionnement ou plein écran.
  styles: [`
    ::ng-deep .daf-modal-fill {
      display: flex; flex-direction: column; gap: 12px;
      min-height: 100%;
    }
    ::ng-deep .daf-modal-fill > daf-data-table {
      flex: 1 1 auto;
      display: flex; flex-direction: column;
    }
    ::ng-deep .daf-modal-fill > daf-data-table > div:last-of-type {
      flex: 1 1 auto;
    }
    /* \`daf-modal-grow\` sur un composant de l'app qui enveloppe un daf-data-table : il
       prend la hauteur restante et le tableau qu'il contient s'étire avec lui. */
    ::ng-deep .daf-modal-grow {
      flex: 1 1 auto;
      display: flex; flex-direction: column;
    }
    ::ng-deep .daf-modal-grow > div:only-child {
      flex: 1 1 auto;
    }
    ::ng-deep .daf-modal-grow daf-data-table {
      flex: 1 1 auto;
      display: flex; flex-direction: column;
    }
    ::ng-deep .daf-modal-grow daf-data-table > div:last-of-type {
      flex: 1 1 auto;
    }
  `],
})
export class DafModalComponent {
  title    = input('');
  subtitle = input('');
  icon     = input<string | undefined>(undefined);
  visible  = input(false);
  /**
   * Taille à l'ouverture, toute longueur CSS. Plus petite que le plein écran de la daf modal
   * (100vw − 120px × 90vh), sinon le bouton agrandir / réduire n'aurait rien à changer.
   * `height` vide : la fenêtre suit son contenu (plafonnée à 90vh).
   */
  width    = input('min(1200px, 80vw)');
  height   = input('75vh');

  closed = output<void>();

  private readonly modalService = inject(ModalService);
  private readonly bodyTpl = viewChild<TemplateRef<unknown>>('bodyTpl');
  private modalRef: ModalRef | null = null;

  constructor() {
    // bodyTpl lu ici, pas dans open() : créée déjà visible, la modale attend que la requête
    // de vue soit résolue au lieu de ne jamais s'ouvrir.
    effect(() => {
      const show = this.visible();
      const tpl  = this.bodyTpl();
      untracked(() => {
        if (show && tpl) this.open(tpl);
        else if (!show) this.modalRef?.close();
      });
    });
    // La modale vit sous <body> : quitter la page ne doit pas la laisser derrière.
    inject(DestroyRef).onDestroy(() => this.modalRef?.close());
  }

  private open(tpl: TemplateRef<unknown>): void {
    if (this.modalRef) return;

    // Getters : titre et sous-titre suivent l'état de l'appelant (TS sélectionné, étape…).
    const self = this;
    const config: ModalConfig = {
      get title()    { return self.title(); },
      get subtitle() { return self.subtitle() || undefined; },
      icon:        this.icon(),
      body:        tpl,
      width:       this.width(),
      height:      this.height() || undefined,
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
    };
    const ref = this.modalService.open(config);

    // ✕, fond et close() aboutissent tous à _destroy() : on y prévient l'appelant, sinon
    // son signal resterait à « ouvert » sur une modale disparue.
    const destroy = ref._destroy.bind(ref);
    ref._destroy = () => {
      destroy();
      this.modalRef = null;
      if (this.visible()) this.closed.emit();
    };
    this.modalRef = ref;
  }
}
