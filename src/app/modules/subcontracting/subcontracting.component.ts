import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
import { AffaireService } from '../affaires/affaire.service';
import { PaysRefDto } from '../affaires/affaire.model';
import { SousTraitantsTabComponent } from './tabs/sous-traitants-tab.component';
import { OrdresStTabComponent } from './tabs/ordres-st-tab.component';
import { CoutsAnalyseTabComponent } from './tabs/couts-analyse-tab.component';

@Component({
  selector: 'app-subcontracting',
  imports: [TranslatePipe, SelectComponent, SousTraitantsTabComponent, OrdresStTabComponent, CoutsAnalyseTabComponent],
  templateUrl: './subcontracting.component.html',
  styleUrl: './subcontracting.component.scss',
})
export class SubcontractingComponent implements OnInit {
  private readonly affaireSvc = inject(AffaireService);

  activeTab      = signal<'st' | 'ordres' | 'analyse'>('st');
  pays           = signal<PaysRefDto[]>([]);
  selectedPaysId = signal<number | null>(null);

  readonly paysOptions = computed<SelectOption[]>(() =>
    this.pays().map(p => ({ value: String(p.id), label: p.frenchLabel })));

  ngOnInit(): void {
    this.affaireSvc.getPays().subscribe(p => {
      this.pays.set(p);
      if (p.length > 0) this.selectedPaysId.set(p[0].id);
    });
  }

  onPaysSelect(values: string[]): void {
    const val = values[0];
    this.selectedPaysId.set(val ? +val : null);
  }
}
