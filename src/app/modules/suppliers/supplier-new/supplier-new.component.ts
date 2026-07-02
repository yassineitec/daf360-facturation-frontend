import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CardComponent, ButtonComponent } from '@khalilrebhiitec/daf360';
import { SupplierService } from '../supplier.service';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto } from '../../affaires/affaire.model';

type Step = 1 | 2 | 3;

const STEPS = [
  { title: 'Identification',        icon: 'badge'           },
  { title: 'Informations fiscales', icon: 'receipt_long'    },
  { title: 'Coordonnées bancaires', icon: 'account_balance' },
];

const STEP_TIPS = [
  "Renseignez la raison sociale officielle et le pays d'enregistrement. Ces champs sont obligatoires.",
  "Le numéro TVA intracommunautaire est requis pour les échanges soumis à la TVA. La TVA unique active le contrôle automatique de conformité.",
  "L'IBAN est stocké de façon sécurisée et masqué par défaut. Il peut être révélé uniquement par un utilisateur autorisé.",
];

@Component({
  selector: 'app-supplier-new',
  standalone: true,
  imports: [ReactiveFormsModule, CardComponent, ButtonComponent],
  templateUrl: './supplier-new.component.html',
  styleUrl:    './supplier-new.component.scss',
})
export class SupplierNewComponent implements OnInit {
  private readonly svc        = inject(SupplierService);
  private readonly clientSvc  = inject(ClientService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly fb         = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  step     = signal<Step>(1);
  isSaving = signal(false);
  saveError = signal<string | null>(null);
  paysId   = signal(0);
  paysList = signal<PaysRefDto[]>([]);

  readonly steps = STEPS;

  readonly stepTip = computed(() => STEP_TIPS[this.step() - 1]);

  readonly canGoNext = computed(() => {
    if (this.step() === 1) {
      return !!this.form.controls['name'].value?.trim()
          && !!this.form.controls['paysCode'].value;
    }
    return true;
  });

  readonly summaryName = computed(() => this.form.controls['name'].value?.trim() || '—');
  readonly summaryPays = computed(() => {
    const code = this.form.controls['paysCode'].value;
    if (!code) return '—';
    const pays = this.paysList().find(p => p.isoCode === code);
    return pays ? `${code} — ${pays.frenchLabel}` : code;
  });
  readonly summaryTva = computed(() => this.form.controls['numeroTva'].value?.trim() || '—');

  form = this.fb.group({
    name:            ['', Validators.required],
    paysCode:        ['', Validators.required],
    paysLabel:       [''],
    numeroTva:       [''],
    tvaUniqueActive: [false],
    iban:            [''],
    notes:           [''],
  });

  ngOnInit(): void {
    this.clientSvc.getPays()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.paysList.set(list));

    this.clientSvc.getMyPays()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: id => { if (id && id > 0) this.paysId.set(id); } });
  }

  onPaysChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    const pays = this.paysList().find(p => p.isoCode === code);
    this.form.patchValue({ paysCode: code, paysLabel: pays?.frenchLabel ?? '' });
  }

  goNext(): void {
    if (this.step() < 3) {
      if (!this.canGoNext()) { this.form.markAllAsTouched(); return; }
      this.step.update(s => (s + 1) as Step);
    } else {
      this.save();
    }
  }

  goPrev(): void {
    if (this.step() > 1) this.step.update(s => (s - 1) as Step);
  }

  private save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const paysId = this.paysId();
    if (!paysId) { this.saveError.set('Pays introuvable. Rechargez la page.'); return; }

    const v = this.form.getRawValue();
    this.isSaving.set(true);
    this.saveError.set(null);

    this.svc.create({
      paysId,
      name:            v.name!,
      paysCode:        v.paysCode!,
      paysLabel:       v.paysLabel  || undefined,
      numeroTva:       v.numeroTva?.trim()  || undefined,
      iban:            v.iban?.trim()       || undefined,
      tvaUniqueActive: v.tvaUniqueActive ?? false,
      notes:           v.notes?.trim()      || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  () => { this.isSaving.set(false); this.router.navigate(['..'], { relativeTo: this.route }); },
      error: err => { this.isSaving.set(false); this.saveError.set(err?.error?.message ?? 'Erreur lors de la création.'); },
    });
  }

  cancel(): void { this.router.navigate(['..'], { relativeTo: this.route }); }
}
