import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, OnDestroy,
  afterNextRender, inject, input, output, signal, viewChild,
} from '@angular/core';

export interface TsRowMenuItem {
  id:      string;
  icon:    string;
  label:   string;
  danger?: boolean;
}

/**
 * Bouton « ⋮ » d'une ligne du tableau TS, qui déroule une courte liste d'actions.
 *
 * Composant applicatif, pas de la lib : `daf-radial-menu` est un bouton flottant pensé
 * pour un coin d'écran, et la lib n'a pas de menu déroulant de ligne. Le panneau est en
 * `position: fixed`, calé sur le bouton : `daf-card` est `overflow-hidden`, un panneau
 * `absolute` y serait coupé. Il s'ouvre à gauche du bouton, centré sur lui, et reste
 * dans l'écran (voir `place()`).
 *
 * Styles géométriques en inline : le CSS d'un remote ne contient que les classes que
 * Tailwind a déjà vues ailleurs dans l'app.
 */
@Component({
  selector: 'app-ts-row-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex' },
  template: `
    <button #trigger type="button"
      class="flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      style="width:32px; height:32px"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="toggle($event)">
      <span class="material-symbols-outlined" style="font-size:20px">more_vert</span>
    </button>

    @if (open()) {
      <div #panel role="menu"
        class="flex flex-col rounded-xl bg-surface py-1"
        style="position:fixed; z-index:1000; min-width:180px;
               box-shadow:0 8px 24px rgba(0,0,0,.14); border:1px solid rgba(0,0,0,.06)"
        [style.top.px]="top()"
        [style.bottom.px]="bottom()"
        [style.right.px]="right()">
        @for (item of items(); track item.id) {
          <button type="button" role="menuitem"
            class="flex items-center text-body-md hover:bg-surface-container"
            [class.text-danger]="item.danger"
            [class.text-on-surface]="!item.danger"
            style="gap:.75rem; padding:.5rem 1rem; text-align:left; width:100%"
            (click)="pick(item.id)">
            <span class="material-symbols-outlined" style="font-size:18px">{{ item.icon }}</span>
            {{ item.label }}
          </button>
        }
      </div>
    }
  `,
})
export class TsRowMenuComponent implements OnDestroy {
  items = input.required<TsRowMenuItem[]>();
  label = input('Actions');

  select = output<string>();

  private readonly host    = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger  = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel    = viewChild<ElementRef<HTMLElement>>('panel');

  readonly open   = signal(false);
  readonly top    = signal<number | null>(null);
  readonly bottom = signal<number | null>(null);
  readonly right  = signal(0);

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) { this.open.set(false); return; }

    // Première position approximative, corrigée par `place()` une fois la liste rendue.
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    this.bottom.set(null);
    this.top.set(rect.top);
    this.right.set(window.innerWidth - rect.left + 4);
    this.open.set(true);
    afterNextRender(() => this.place(), { injector: this.injector });
    // Capture : un défilement dans n'importe quel conteneur (pas seulement la fenêtre)
    // décale le bouton, et le panneau `fixed` ne le suivrait pas.
    document.addEventListener('scroll', this.closeOnScroll, true);
  }

  /**
   * Place la liste à gauche du bouton (il est au bord droit du tableau), centrée sur lui
   * verticalement, d'après sa taille RÉELLE — 2 ou 5 entrées, elle reste en face du « ⋮ ».
   *
   * La correction se fait par écart entre la position voulue et la position obtenue : un
   * parent animé (`transform`) fait d'un `position: fixed` un positionnement relatif à ce
   * parent, et des coordonnées d'écran posées telles quelles tomberaient à côté.
   */
  private place(): void {
    const panel = this.panel()?.nativeElement;
    if (!panel || !this.open()) return;

    const btn  = this.trigger().nativeElement.getBoundingClientRect();
    const box  = panel.getBoundingClientRect();
    const gap  = 4;
    const edge = 8;

    let wantTop = btn.top + btn.height / 2 - box.height / 2;
    wantTop = Math.min(Math.max(wantTop, edge), window.innerHeight - box.height - edge);
    const wantRight = btn.left - gap; // bord droit de la liste

    this.top.set((this.top() ?? 0) + (wantTop - box.top));
    this.right.set(this.right() - (wantRight - box.right));
  }

  pick(id: string): void {
    this.close();
    this.select.emit(id);
  }

  private readonly closeOnScroll = () => this.close();

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open()) return;
    this.close();
    this.trigger().nativeElement.focus();
  }

  // Le panneau est `fixed` : au redimensionnement il ne suivrait plus le bouton, on le
  // referme plutôt que de le laisser flotter ailleurs.
  @HostListener('window:resize')
  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }
}
