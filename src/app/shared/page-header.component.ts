import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <div class="ph-wrap">
      <div class="ph-left">
        @if (backLink()) {
          <a class="ph-back" [routerLink]="backLink()">
            <span class="material-symbols-outlined">arrow_back_ios</span>
            {{ backLabel() || 'Retour' }}
          </a>
        }
        <h1 class="ph-title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="ph-sub">{{ subtitle() }}</p>
        }
      </div>
      <div class="ph-actions">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  title    = input.required<string>();
  subtitle = input<string | null>(null);
  backLink = input<string | null>(null);
  backLabel= input<string>('Retour');
}
