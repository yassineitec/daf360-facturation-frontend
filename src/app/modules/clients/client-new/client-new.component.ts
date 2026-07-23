import { Component, OnInit, inject, signal, computed, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ClientService } from '../client.service';
import { ClientDetailDto } from '../client.model';
import { ClientFormComponent } from '../client-form.component';
import { CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';

const STEP_ICONS = ['badge', 'contacts', 'receipt_long'];

@Component({
  selector: 'app-client-new',
  imports: [ClientFormComponent, CardComponent, ButtonComponent, TranslatePipe],
  templateUrl: './client-new.component.html',
  styleUrl: './client-new.component.scss',
})
export class ClientNewComponent implements OnInit {
  private readonly svc    = inject(ClientService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly paysId      = signal(0);
  readonly currentStep = signal(1);

  readonly formRef = viewChild(ClientFormComponent);

  readonly steps = computed(() => {
    this.translate.currentLang();
    return STEP_ICONS.map((icon, i) => ({
      title: this.translate.instant(`CLIENTS.NEW.STEPS.${i}`),
      icon,
    }));
  });

  readonly stepTip   = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(`CLIENTS.NEW.TIPS.${this.currentStep() - 1}`);
  });
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
    this.translate.currentLang();
    if (this.currentStep() === 1 && !this.canGoNext()) {
      return this.translate.instant('CLIENTS.NEW.VALIDATION_REQUIRED');
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
