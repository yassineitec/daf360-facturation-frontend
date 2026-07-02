import { Component, OnInit, inject, signal, computed, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ClientService } from '../client.service';
import { ClientDetailDto } from '../client.model';
import { ClientFormComponent } from '../client-form.component';
import { CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';

const STEPS = [
  { title: 'Identification',          icon: 'badge'         },
  { title: 'Contact & Coordonnées',   icon: 'contacts'      },
  { title: 'Conditions commerciales', icon: 'receipt_long'  },
];

const STEP_TIPS = [
  'Renseignez la raison sociale officielle. Un code client sera généré automatiquement si vous laissez ce champ vide.',
  'Ces informations seront utilisées pour les courriers et les factures. L\'email est recommandé pour l\'envoi automatique.',
  'Le délai de paiement et la devise seront appliqués par défaut à toutes les affaires de ce client.',
];

@Component({
  selector: 'app-client-new',
  imports: [ClientFormComponent, CardComponent, ButtonComponent],
  templateUrl: './client-new.component.html',
  styleUrl: './client-new.component.scss',
})
export class ClientNewComponent implements OnInit {
  private readonly svc    = inject(ClientService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  readonly paysId      = signal(0);
  readonly currentStep = signal(1);

  readonly formRef = viewChild(ClientFormComponent);

  readonly steps    = STEPS;
  readonly stepTips = STEP_TIPS;

  readonly stepTip   = computed(() => STEP_TIPS[this.currentStep() - 1]);
  readonly isSaving  = computed(() => this.formRef()?.saving() ?? false);

  readonly canGoNext = computed(() => {
    const form = this.formRef();
    if (!form) return false;
    if (this.currentStep() === 1) {
      return !!form.clientName()?.trim() && !!form.selectedSector()[0];
    }
    return true;
  });

  readonly stepValidationError = computed((): string | null => {
    if (this.currentStep() === 1 && !this.canGoNext()) {
      return 'Champs requis : nom du client · secteur d\'activité.';
    }
    return null;
  });

  ngOnInit(): void {
    this.svc.getPays().subscribe(pays => {
      if (pays.length > 0) this.paysId.set(pays[0].id);
    });
  }

  goNext(): void {
    if (this.currentStep() < 3) {
      if (!this.canGoNext()) {
        this.formRef()?.touched.set(true);
        return;
      }
      this.currentStep.update(s => s + 1);
    } else {
      this.formRef()?.submit();
    }
  }

  goPrev(): void {
    if (this.currentStep() > 1) this.currentStep.update(s => s - 1);
  }

  onSaved(client: ClientDetailDto): void {
    this.router.navigate(['..', client.id], { relativeTo: this.route });
  }

  goBack(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
