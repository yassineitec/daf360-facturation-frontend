import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CurrencyDisplayService, SUPPORTED_CURRENCIES } from '../../core/currency-display.service';

/**
 * Display-currency switcher — a sticky FAB pinned to the bottom-right of the viewport.
 *
 * It shows the currency every amount in the module is currently converted to
 * (`DisplayCurrencyPipe` reads the same service) and reveals the alternatives on
 * hover. It replaces the full-width sticky "Devise" chip bar that used to sit above
 * every finance page and cost a row of vertical space on all of them.
 *
 * ## ⚠️ Why this is component CSS and not Tailwind utilities
 * Deliberate. A remote's Tailwind output lives in its `styles.css`, which the shell
 * fetches separately (`ensureRemoteStyles`) and which is missing whenever a build
 * fails or is served incompletely. Component styles are compiled into the component's
 * own JS chunk instead, so they apply unconditionally — which is exactly why the
 * hand-rolled `.curr-chip` bar this replaces always rendered.
 *
 * A control that is `position: fixed` cannot afford that dependency: without the
 * `fixed` utility it collapses into normal flow at the very end of the document,
 * below the full-height `.shell-content` box, i.e. off-screen and unreachable — it
 * looks like the component never rendered at all.
 *
 * Colours are `var(--color-*, #hex)`: the lib token when `tokens.css` is loaded, the
 * literal brand value when it isn't. Never a bare `var(--color-primary)` here, or the
 * button loses its background in the same failure mode.
 *
 * ## Why the options render *after* the button in the DOM
 * The container is `column-reverse`, so the button paints at the bottom and the
 * options stack upward — but in source order the button comes first. That is what
 * makes Tab move from the button *into* the list: the list only exists while open
 * (rendering it hidden would leave tabbable buttons behind an invisible panel), so
 * it has to open on `focusin` and be the next thing in tab order.
 *
 * ## Placement
 * `z-index: 45` — above page content and the lib's mobile bottom nav (40), below
 * `daf-drawer` (60/70), `daf-modal` (1000) and the portaled `daf-select` panels
 * (9999), so none of those can end up underneath it. Below 640px it lifts to 88px to
 * clear that bottom nav rather than overlap it.
 */
@Component({
  selector: 'app-currency-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div
      class="cs-root"
      (mouseenter)="open.set(true)"
      (mouseleave)="open.set(false)"
      (focusin)="open.set(true)"
      (focusout)="onFocusOut($event)"
      (keydown.escape)="open.set(false)">

      <!-- Trigger — always visible, shows the currency in force -->
      <button
        type="button"
        class="cs-fab"
        [title]="'COMMON.CURRENCY.TITLE' | translate"
        [attr.aria-label]="('COMMON.CURRENCY.TITLE' | translate) + ' : ' + current()"
        [attr.aria-expanded]="open()"
        (click)="toggle()">
        <span class="material-symbols-outlined cs-fab__icon">currency_exchange</span>
        {{ current() }}
      </button>

      <!-- Alternatives — mounted only while open, so they are never tabbable behind
           an invisible panel. Reversed by the container, so they stack upward. -->
      @if (open()) {
        <div class="cs-list" role="listbox"
             [attr.aria-label]="'COMMON.CURRENCY.TITLE' | translate">
          @for (code of others(); track code) {
            <button
              type="button"
              role="option"
              class="cs-option"
              [attr.aria-selected]="false"
              (click)="select(code)">
              {{ code }}
            </button>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: contents; }

    .cs-root {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 45;
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 8px;
    }

    /* Clear the lib's mobile bottom nav (fixed, z-40) instead of sitting on top of it. */
    @media (max-width: 640px) {
      .cs-root { right: 16px; bottom: 88px; }
    }

    .cs-fab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px 12px 16px;
      border: none;
      border-radius: 999px;
      background: var(--color-primary, #006b58);
      color: #fff;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.04em;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(0, 107, 88, 0.32);
      transition: background 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .cs-fab:hover  { background: var(--color-tertiary, #00c1ad); transform: scale(1.05); }
    .cs-fab:active { transform: scale(0.95); }
    .cs-fab:focus-visible {
      outline: none;
      box-shadow: 0 6px 20px rgba(0, 107, 88, 0.32),
                  0 0 0 4px color-mix(in srgb, var(--color-tertiary, #00c1ad) 35%, transparent);
    }

    .cs-fab__icon { font-size: 20px; }

    .cs-list {
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 8px;
    }

    .cs-option {
      min-width: 68px;
      padding: 8px 16px;
      border: 1px solid var(--color-outline-variant, #bdc9c4);
      border-radius: 999px;
      background: var(--color-surface-container-lowest, #fff);
      color: var(--color-on-surface-variant, #3e4945);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.10);
      transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
    }

    .cs-option:hover {
      border-color: var(--color-tertiary, #00c1ad);
      color: var(--color-primary, #006b58);
    }

    .cs-option:focus-visible {
      outline: none;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-tertiary, #00c1ad) 35%, transparent);
    }
  `],
})
export class CurrencySwitcherComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly svc  = inject(CurrencyDisplayService);

  protected readonly open = signal(false);

  protected readonly current = this.svc.selectedCurrency;

  protected readonly others = computed(() =>
    SUPPORTED_CURRENCIES.filter(c => c !== this.svc.selectedCurrency()),
  );

  /**
   * A method rather than `open.update(v => !v)` in the template: Angular's template
   * expression language has no arrow functions, so the inline form fails to parse.
   * Click matters on touch, where there is no hover to reveal the list.
   */
  protected toggle(): void {
    this.open.update(v => !v);
  }

  protected select(code: string): void {
    this.svc.setCurrency(code);
    this.open.set(false);
  }

  /**
   * `focusout` fires before focus lands, so the check is against `relatedTarget` —
   * without it, tabbing from the trigger to the first option closes the list and
   * destroys the element that was about to receive focus.
   */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(this.host.nativeElement as HTMLElement).contains(next)) {
      this.open.set(false);
    }
  }
}
