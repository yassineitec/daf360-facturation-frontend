import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute }                                  from '@angular/router';
import { forkJoin }                                                            from 'rxjs';
import { ClientService }                                                       from '../client.service';
import { ClientDetailDto, ClientStatsDto }                                     from '../client.model';
import { PermissionDirective }                                                 from '../../../shared/permission.directive';
import { ClientFormComponent }                                                 from '../client-form.component';
import { CardComponent, ModalService, ModalRef }                               from '@khalilrebhiitec/daf360';
import { TranslatePipe }                                                        from '@ngx-translate/core';

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, PermissionDirective, ClientFormComponent, CardComponent, TranslatePipe],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss',
})
export class ClientDetailComponent implements OnInit {
  private readonly svc    = inject(ClientService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly modal  = inject(ModalService);

  @ViewChild('editFormTpl') private editFormTpl!: TemplateRef<unknown>;
  private editModalRef?: ModalRef;

  client      = signal<ClientDetailDto | null>(null);
  stats       = signal<ClientStatsDto | null>(null);
  isLoading   = signal(true);
  actionError = signal<string | null>(null);

  private clientId = 0;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.params['id']);
    this.clientId = id;
    if (this.route.snapshot.queryParams['edit'] === 'true') {
      setTimeout(() => this.openEditModal());
    }
    this.loadClient(id);
  }

  openEditModal(): void {
    this.editModalRef = this.modal.open({
      title:           'Modifier ' + (this.client()?.clientName ?? 'le client'),
      icon:            'edit',
      size:            'lg',
      closeOnBackdrop: false,
      body:            this.editFormTpl,
    });
  }

  onEditFormClosed(): void {
    this.editModalRef?.close();
  }

  loadClient(id: number): void {
    this.isLoading.set(true);
    this.actionError.set(null);
    forkJoin({
      client: this.svc.getClient(id),
      stats:  this.svc.getClientStats(id),
    }).subscribe({
      next: ({ client, stats }) => {
        this.client.set(client);
        this.stats.set(stats);
        this.isLoading.set(false);
      },
      error: () => {
        this.actionError.set('Impossible de charger le client.');
        this.isLoading.set(false);
      },
    });
  }

  readonly clientKpis = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const currency = this.client()?.defaultCurrency ?? 'TND';
    return [
      { label: 'CLIENTS.DETAIL.KPI.TOTAL_PROJECTS',  value: String(s.totalAffaires) },
      { label: 'CLIENTS.DETAIL.KPI.ACTIVE_PROJECTS', value: String(s.activeAffaires) },
      { label: 'CLIENTS.DETAIL.KPI.TOTAL_INVOICED',  value: this.formatAmount(s.totalInvoiced, currency) },
      { label: 'CLIENTS.DETAIL.KPI.AVG_DELAY',       value: s.averagePaymentDelayDays != null
                                                              ? Math.round(s.averagePaymentDelayDays) + 'j'
                                                              : '—' },
    ];
  });

  readonly generalInfo = computed(() => {
    const c = this.client();
    if (!c) return [];
    const address = [c.address, c.city, c.postalCode].filter(Boolean).join(', ');
    return [
      { label: 'CLIENTS.DETAIL.INFO.CODE',    value: c.clientCode },
      { label: 'CLIENTS.DETAIL.INFO.TAX_ID',  value: c.taxId },
      { label: 'CLIENTS.DETAIL.INFO.SECTOR',  value: c.sector },
      { label: 'CLIENTS.DETAIL.INFO.COUNTRY', value: c.country },
      { label: 'CLIENTS.DETAIL.INFO.ADDRESS', value: address || null },
      { label: 'CLIENTS.DETAIL.INFO.PHONE',   value: c.phone },
      { label: 'CLIENTS.DETAIL.INFO.EMAIL',   value: c.email },
      { label: 'CLIENTS.DETAIL.INFO.WEBSITE', value: c.website },
    ].filter(i => i.value);
  });

  validateKyc(): void {
    const c = this.client();
    if (!c) return;
    this.actionError.set(null);
    this.svc.validateKyc(c.id).subscribe({
      next:  updated => this.client.set(updated),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de la validation KYC.'),
    });
  }

  revokeKyc(): void {
    const c = this.client();
    if (!c) return;
    if (!confirm('Révoquer la validation KYC de ce client ?')) return;
    this.actionError.set(null);
    this.svc.revokeKyc(c.id).subscribe({
      next:  updated => this.client.set(updated),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de la révocation KYC.'),
    });
  }

  deactivateClient(): void {
    const c = this.client();
    if (!c) return;
    if (!confirm('Désactiver ce client ? Cette action est réversible.')) return;
    this.actionError.set(null);
    this.svc.deactivate(c.id).subscribe({
      next:  () => this.router.navigate(['..'], { relativeTo: this.route }),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de la désactivation.'),
    });
  }

  retryLoad(): void {
    this.loadClient(this.clientId);
  }

  reactivateClient(): void {
    const c = this.client();
    if (!c) return;
    this.actionError.set(null);
    this.svc.reactivate(c.id).subscribe({
      next:  () => this.loadClient(c.id),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de la réactivation.'),
    });
  }

  onClientSaved(updated: ClientDetailDto): void {
    this.client.set(updated);
    this.editModalRef?.close();
  }

  formatAmount(v: number | null, currency = 'TND'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }
}
