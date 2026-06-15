import { Component, OnInit, inject, signal } from '@angular/core';
import { AffaireService } from '../affaires/affaire.service';
import { PaysRefDto } from '../affaires/affaire.model';
import { SousTraitantsTabComponent } from './tabs/sous-traitants-tab.component';
import { OrdresStTabComponent } from './tabs/ordres-st-tab.component';
import { CoutsAnalyseTabComponent } from './tabs/couts-analyse-tab.component';

@Component({
  selector: 'app-subcontracting',
  imports: [SousTraitantsTabComponent, OrdresStTabComponent, CoutsAnalyseTabComponent],
  templateUrl: './subcontracting.component.html',
  styleUrl: './subcontracting.component.scss',
})
export class SubcontractingComponent implements OnInit {
  private readonly affaireSvc = inject(AffaireService);

  activeTab      = signal<'st' | 'ordres' | 'analyse'>('st');
  pays           = signal<PaysRefDto[]>([]);
  selectedPaysId = signal<number | null>(null);

  ngOnInit(): void {
    this.affaireSvc.getPays().subscribe(p => {
      this.pays.set(p);
      if (p.length > 0) this.selectedPaysId.set(p[0].id);
    });
  }

  onPaysChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedPaysId.set(val ? +val : null);
  }
}
