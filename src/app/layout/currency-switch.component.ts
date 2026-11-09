import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CurrencyDisplayService, SUPPORTED_CURRENCIES } from '../core/currency-display.service';

/** 1–3 characters drawn in the badge — same glyphs as the mobile currency bubble. */
export const CURRENCY_GLYPHS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  TND: 'DT',
  EGP: 'E£',
  SAR: 'SR',
  AED: 'AED',
};

/**
 * Display-currency picker of the sidebar, desktop: a « Devise  EUR ▾ » row at the bottom of
 * the rail, above « Aide & guides » (projected into `app-help-center`'s footer). A click
 * opens the list of currencies UPWARDS — the row sits at the bottom of the screen.
 *
 * The display currency is a global, rarely changed setting: it belongs with the navigation,
 * always visible, rather than in a floating bubble competing with the assistant's. On
 * mobile the rail becomes the bottom bar, which has no room for it: the shell keeps the
 * `daf-radial-menu` bubble there (hidden from `sm` up).
 *
 * `CurrencyDisplayService` stays the single writer, as with the bubble.
 */
@Component({
  selector: 'app-currency-switch',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    @if (open()) {
      <div role="listbox" [attr.aria-label]="'COMMON.CURRENCY.TITLE' | translate"
           class="absolute inset-x-0 bottom-full z-[42] mb-2 flex flex-col rounded-xl border border-surface-container py-1 shadow-lg"
           style="background: var(--color-surface, #fff)">
        @for (c of options(); track c.code) {
          <button type="button" role="option" [attr.aria-selected]="c.code === current()"
                  (click)="pick(c.code)"
                  class="flex items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-surface-container/60 cursor-pointer"
                  [class]="c.code === current() ? 'text-teal font-semibold' : 'text-on-surface'">
            <span class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                  [class]="c.code === current() ? 'bg-teal text-white' : 'bg-surface-container text-on-surface-variant'">{{ c.glyph }}</span>
            <span class="min-w-0 flex-1 truncate text-[13px]">{{ c.name }}</span>
            <span class="text-[12px] text-outline">{{ c.code }}</span>
            @if (c.code === current()) {
              <span class="material-symbols-outlined text-[18px]">check</span>
            }
          </button>
        }
      </div>
    }

    <!-- Same markup and classes as a top-level daf-side-nav entry, like « Aide & guides ». -->
    <button type="button" data-guide="currency-switch" [class]="itemClasses()"
            aria-haspopup="listbox" [attr.aria-expanded]="open()"
            [attr.aria-label]="('COMMON.CURRENCY.TITLE' | translate) + ' : ' + current()"
            (click)="open.set(!open())" (mouseenter)="hovered.set(true)" (mouseleave)="hovered.set(false)">
      <span class="material-symbols-outlined shrink-0 transition-all duration-150"
            [style.font-variation-settings]="iconVariation()">currency_exchange</span>
      <span class="flex-1 text-left truncate text-label-md font-semibold">{{ 'COMMON.CURRENCY.SHORT' | translate }}</span>
      <span class="rounded-full bg-teal/10 px-2 py-0.5 text-[12px] font-bold text-teal">{{ current() }}</span>
      <span class="material-symbols-outlined text-[18px] text-outline">{{ open() ? 'expand_more' : 'expand_less' }}</span>
    </button>
  `,
})
export class CurrencySwitchComponent {
  private readonly currencySvc = inject(CurrencyDisplayService);
  private readonly translate   = inject(TranslateService);
  private readonly host        = inject(ElementRef<HTMLElement>);

  readonly open    = signal(false);
  readonly hovered = signal(false);
  readonly current = this.currencySvc.selectedCurrency;

  /** `currentLang()` is read so the names re-translate on a language switch. */
  readonly options = computed(() => {
    this.translate.currentLang();
    return SUPPORTED_CURRENCIES.map(code => {
      const key = `COMMON.CURRENCY.NAMES.${code}`;
      const name = this.translate.instant(key) as string;
      return { code, glyph: CURRENCY_GLYPHS[code] ?? code, name: name === key ? code : name };
    });
  });

  /** daf-side-nav's `itemClasses` for a top-level entry; « active » while the list is open. */
  readonly itemClasses = computed(() => {
    const base = 'w-full flex items-center gap-3 rounded-md transition-all duration-150 cursor-pointer active:scale-95 px-3 py-3';
    if (this.open()) return `${base} bg-tertiary/50 text-teal`;
    return `${base} ${this.hovered() ? 'bg-surface-container/60 text-on-surface' : 'bg-transparent text-on-surface-variant'}`;
  });

  readonly iconVariation = computed(() =>
    `'FILL' ${this.open() || this.hovered() ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`);

  pick(code: string): void {
    this.currencySvc.setCurrency(code);
    this.open.set(false);
  }

  /** A click anywhere else closes the list. */
  onDocumentClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
