import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { ButtonComponent } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-filter-panel',
  imports: [ButtonComponent],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.scss',
})
export class FilterPanelComponent {
  private readonly host = inject(ElementRef);

  title        = input('Filter by');
  applyLabel   = input('Appliquer');
  cancelLabel  = input('Annuler');
  showTrigger  = input(true);

  readonly apply  = output<void>();
  readonly cancel = output<void>();

  readonly isOpen = signal(false);

  // Position du panel (position:fixed, calculée à l'ouverture)
  panelTop   = 0;
  panelRight = 0;

  // Bloque le document:click du même clic qui a déclenché l'ouverture
  private _justOpened = false;

  toggle(): void {
    if (!this.isOpen()) {
      const rect = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
      this.panelTop   = rect.bottom + 8;
      this.panelRight = window.innerWidth - rect.right;
      this._scheduleOpen();
    } else {
      this.isOpen.set(false);
    }
  }

  /** Utilisé par un parent externe (ex. toolbar) qui passe ses propres coordonnées. */
  openAt(anchorRect: DOMRect): void {
    if (this.isOpen()) { this.isOpen.set(false); return; }
    this.panelTop   = anchorRect.bottom + 8;
    this.panelRight = window.innerWidth - anchorRect.right;
    this._scheduleOpen();
  }

  private _scheduleOpen(): void {
    this._justOpened = true;
    this.isOpen.set(true);
    Promise.resolve().then(() => { this._justOpened = false; });
  }

  onApply(): void {
    this.apply.emit();
    this.isOpen.set(false);
  }

  onCancel(): void {
    this.cancel.emit();
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.isOpen() || this._justOpened) return;
    if (!this.host.nativeElement.contains(e.target as Node)) this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.isOpen.set(false); }
}
