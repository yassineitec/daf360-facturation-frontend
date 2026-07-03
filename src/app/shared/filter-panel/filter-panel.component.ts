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

  title       = input('Filter by');
  applyLabel  = input('Appliquer');
  cancelLabel = input('Annuler');

  readonly apply  = output<void>();
  readonly cancel = output<void>();

  readonly isOpen = signal(false);

  toggle(): void { this.isOpen.update(v => !v); }

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
    if (!this.isOpen()) return;
    if (!this.host.nativeElement.contains(e.target as Node)) this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.isOpen.set(false); }
}
