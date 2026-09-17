import {
  Component, ElementRef, HostListener, computed, inject, input, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flagDataUri } from '../country-flags';

export interface PaysFlagOption {
  value:    string;
  label:    string;
  isoCode:  string;
}

/**
 * A `daf-select`-styled trigger + dropdown, but with a country flag swatch on the
 * trigger and every option — restoring what a hand-rolled pays picker used to draw
 * before it was replaced by `daf-select` (see the removal note in
 * admin-list.component.scss): `daf-select`'s `SelectOption` only renders a Material
 * Symbol icon or plain text, no room for an image per option.
 *
 * Single-select only, and simpler than `daf-select`'s own dropdown (plain
 * `position: absolute` instead of a `position: fixed` body-portal, no outside-panel
 * registry): this widget is used once, at the top of a page that itself removed
 * `overflow: hidden` from its header specifically to give a dropdown here room —
 * see the same SCSS note.
 */
@Component({
  selector: 'app-pays-flag-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './pays-flag-select.component.html',
  styleUrl: './pays-flag-select.component.scss',
})
export class PaysFlagSelectComponent {
  private readonly el = inject(ElementRef<HTMLElement>);

  options     = input<PaysFlagOption[]>([]);
  selected    = input<string[]>([]);
  label       = input<string>();
  placeholder = input<string>('Sélectionner...');
  searchable  = input<boolean>(true);

  selectedChange = output<string[]>();

  open        = signal(false);
  searchQuery = signal('');

  protected readonly flagDataUri = flagDataUri;

  readonly selectedOption = computed(() =>
    this.options().find(o => o.value === this.selected()[0]));

  readonly filteredOptions = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.options();
    return this.options().filter(o => o.label.toLowerCase().includes(q));
  });

  protected readonly triggerClasses = computed(() => {
    const base = [
      'flex items-center gap-2 h-11 px-3 rounded-md',
      'border transition-all duration-200 cursor-pointer select-none',
    ];
    const state = this.open()
      ? 'bg-surface border-tertiary ring-2 ring-tertiary/20 shadow-sm'
      : 'bg-surface-container-low border-outline-variant hover:border-outline';
    return [...base, state].join(' ');
  });

  protected optionClasses(opt: PaysFlagOption): string {
    const selected = opt.value === this.selected()[0];
    return [
      'flex items-center gap-2 px-2.5 py-1.5 text-body-md leading-5',
      'cursor-pointer transition-colors duration-150',
      selected ? 'bg-tertiary/10 text-teal font-medium' : 'text-on-surface hover:bg-tertiary/10',
    ].join(' ');
  }

  protected toggleOpen(): void {
    this.open.update(o => !o);
    if (!this.open()) this.searchQuery.set('');
  }

  protected selectOption(opt: PaysFlagOption): void {
    this.selectedChange.emit([opt.value]);
    this.close();
  }

  private close(): void {
    this.open.set(false);
    this.searchQuery.set('');
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.el.nativeElement.contains(target)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close();
  }
}
