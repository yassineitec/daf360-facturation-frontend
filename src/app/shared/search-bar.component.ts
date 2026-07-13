import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Same markup/palette as clients/client-list's search bar (/finance/clients),
// so search inputs look and behave identically across the finance app.
@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="search-wrap">
      <span class="material-symbols-outlined search-icon">search</span>
      <input
        class="search-input"
        type="search"
        [placeholder]="placeholder"
        [ngModel]="value"
        (ngModelChange)="onValueChange($event)"
        maxlength="100"
        autocomplete="off" />
    </div>
  `,
  styles: [`
    .search-wrap {
      position: relative;
      width: 100%;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 20px;
      color: #3e4945;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 9px 14px 9px 40px;
      border: 1px solid #bdc9c4;
      border-radius: 999px;
      font-size: 0.875rem;
      font-family: inherit;
      background: rgba(239,244,255,.6);
      color: #0b1c30;
      box-sizing: border-box;
      transition: border-color 0.15s, box-shadow 0.15s;

      &:focus {
        outline: none;
        border-color: #006b58;
        box-shadow: 0 0 0 3px rgba(0,107,88,.12);
        background: #fff;
      }

      &::placeholder { color: #64748B; }
    }
  `],
})
export class SearchBarComponent {
  @Input() placeholder = 'Rechercher...';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  onValueChange(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }
}
