import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { ActionMenuItem, ButtonComponent } from '@khalilrebhiitec/daf360';

/** A menu entry; `separatorBefore` draws a divider above it (action vs. settings groups). */
export interface PlActionsMenuItem extends ActionMenuItem {
  separatorBefore?: boolean;
}

/**
 * Header "Actions ▾" menu of the P&L list — one labelled button instead of three.
 *
 * Not `daf-action-menu`: that one is an icon-only ⋮ trigger made for table rows, opening
 * beside it. A page header wants a labelled button whose list drops below it, which is
 * what `PaysFlagSelectComponent` already does right next to it — same panel styling, same
 * close-on-outside-click / Escape handling, anchored `right-0` for the same reason (the
 * button sits at the top-right edge of the page).
 */
@Component({
  selector: 'app-pl-actions-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  host: { class: 'relative inline-block' },
  template: `
    <daf-button
      [options]="{ variant: 'teal', label: label(), iconStart: 'add', iconEnd: 'expand_more',
                   ariaLabel: label() }"
      (onClick)="toggle()" />

    @if (open()) {
      <div role="menu"
           class="absolute right-0 z-9999 mt-1 min-w-full w-max max-w-[min(20rem,90vw)]
                  bg-surface-container-lowest rounded-lg border border-outline-variant
                  shadow-xl overflow-hidden py-1">
        @for (item of items(); track item.id) {
          @if (item.separatorBefore) {
            <div class="my-1 border-t border-outline-variant" role="separator"></div>
          }
          <button type="button" role="menuitem"
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-body-md leading-5 text-left
                         text-on-surface hover:bg-tertiary/10 transition-colors duration-150
                         disabled:opacity-40 disabled:cursor-not-allowed"
                  [disabled]="item.disabled"
                  (click)="pick(item)">
            @if (item.icon) {
              <span class="material-symbols-outlined text-[18px] text-on-surface-variant">{{ item.icon }}</span>
            }
            <span class="flex-1 truncate">{{ item.label }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class PlActionsMenuComponent {
  private readonly el = inject(ElementRef<HTMLElement>);

  label = input.required<string>();
  items = input.required<PlActionsMenuItem[]>();

  /** Fires with the picked entry, after the menu has closed. */
  readonly itemClick = output<PlActionsMenuItem>();

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update(o => !o);
  }

  protected pick(item: PlActionsMenuItem): void {
    if (item.disabled) return;
    this.open.set(false);
    this.itemClick.emit(item);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.el.nativeElement.contains(target)) return;
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
