import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute }                                  from '@angular/router';
import { forkJoin }                                                            from 'rxjs';
import { ClientService }                                                       from '../client.service';
import { ClientDetailDto, ClientStatsDto }                                     from '../client.model';
import { PermissionDirective }                                                 from '../../../shared/permission.directive';
import { ClientFormComponent }                                                 from '../client-form.component';
import { ButtonComponent, StatusBadgeComponent, ModalService, ModalRef, BadgeOptions } from '@khalilrebhiitec/daf360';
import { TranslatePipe }                                                        from '@ngx-translate/core';
import { DecimalPipe }                                                          from '@angular/common';

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, DecimalPipe, PermissionDirective, ClientFormComponent,
            ButtonComponent, StatusBadgeComponent, TranslatePipe],
  templateUrl: './client-detail.component.html',
  styleUrl:    './client-detail.component.scss',
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

  openSections = signal<Set<string>>(new Set(['info']));

  private clientId = 0;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.params['id']);
    this.clientId = id;
    if (this.route.snapshot.queryParams['edit'] === 'true') {
      setTimeout(() => this.openEditModal());
    }
    this.loadClient(id);
  }

  toggleSection(key: string): void {
    this.openSections.update(s => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isOpen(key: string): boolean { return this.openSections().has(key); }

  openEditModal(): void {
    this.editModalRef = this.modal.open({
      title:           'Modifier ' + (this.client()?.clientName ?? 'le client'),
      icon:            'edit',
      size:            'lg',
      closeOnBackdrop: false,
      body:            this.editFormTpl,
    });
  }

  onEditFormClosed(): void { this.editModalRef?.close(); }

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

  readonly kycBadgeOptions = computed((): BadgeOptions => ({
    variant: this.client()?.isKycDone ? 'success' : 'warning',
    pill: true, size: 'sm',
  }));

  readonly activeBadgeOptions = computed((): BadgeOptions => ({
    variant: this.client()?.isActive ? 'success' : 'neutral',
    pill: true, size: 'sm',
  }));

  readonly formattedAddress = computed(() => {
    const c = this.client();
    if (!c) return '';
    return [c.address, c.city, c.postalCode].filter(part => !!part).join(', ');
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

  reactivateClient(): void {
    const c = this.client();
    if (!c) return;
    this.actionError.set(null);
    this.svc.reactivate(c.id).subscribe({
      next:  () => this.loadClient(c.id),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de la réactivation.'),
    });
  }

  retryLoad(): void { this.loadClient(this.clientId); }

  onClientSaved(updated: ClientDetailDto): void {
    this.client.set(updated);
    this.editModalRef?.close();
  }

  goBack(): void { this.router.navigate(['..'], { relativeTo: this.route }); }

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
