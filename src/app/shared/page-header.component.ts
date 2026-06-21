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
  styles: [`
    @import 'design-tokens';

    :host { display: block; }

    .ph-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 24px 28px 0;
    }

    .ph-left { display: flex; flex-direction: column; gap: 2px; }

    .ph-back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8125rem;
      color: $text-muted;
      text-decoration: none;
      margin-bottom: 2px;

      &:hover { color: $brand-slate; }
      .material-symbols-outlined { font-size: 14px; }
    }

    .ph-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: $text-dark;
      margin: 0;
      letter-spacing: -0.3px;
    }

    .ph-sub {
      font-size: 0.875rem;
      color: $text-muted;
      margin: 0;
    }

    .ph-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    @media (max-width: 640px) {
      .ph-wrap { padding: 16px 16px 0; }
      .ph-title { font-size: 1.25rem; }
    }
  `],
})
export class PageHeaderComponent {
  title    = input.required<string>();
  subtitle = input<string | null>(null);
  backLink = input<string | null>(null);
  backLabel= input<string>('Retour');
}
