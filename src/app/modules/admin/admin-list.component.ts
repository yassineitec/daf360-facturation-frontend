import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { forkJoin }     from 'rxjs';
import { FactListService }    from '../../core/fact-list.service';
import { ClientService }      from '../clients/client.service';
import { ParameterSetService, ParameterSetDto } from '../../core/parameter-set.service';
import { ForexApiConfigService, ForexApiStatusDto } from '../../core/forex-api-config.service';
import { ListValueDto, ListTypeDto } from '../cost/cost.model';
import { PaysRefDto }         from '../affaires/affaire.model';

type AdminTab = 'lists' | 'forex' | 'forex-api';

interface ForexRow {
  code: string;
  eurParam: ParameterSetDto | null;
  chfParam: ParameterSetDto | null;
}

@Component({
  selector: 'app-admin-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-list.component.html',
  styleUrl: './admin-list.component.scss',
})
export class AdminListComponent implements OnInit {
  private readonly factListSvc  = inject(FactListService);
  private readonly clientSvc    = inject(ClientService);
  private readonly paramSvc     = inject(ParameterSetService);
  private readonly forexApiSvc  = inject(ForexApiConfigService);

  // ── Common ────────────────────────────────────────────────────────────────
  activeTab = signal<AdminTab>('lists');
  paysList  = signal<PaysRefDto[]>([]);
  paysId    = signal<number>(0);
  isLoading = signal(false);
  pageError = signal<string | null>(null);

  // ── Lists tab ─────────────────────────────────────────────────────────────
  listTypes      = signal<ListTypeDto[]>([]);
  activeListType = signal<string>('CURRENCY');
  listValues     = signal<ListValueDto[]>([]);
  listLoading    = signal(false);
  listError      = signal<string | null>(null);

  editMap     = signal<Record<number, { labelFr: string; labelEn: string }>>({});
  valueSaving = signal<number | null>(null);

  showAddValue     = signal(false);
  isCreatingValue  = signal(false);
  createValueError = signal<string | null>(null);
  newValue = { code: '', labelFr: '', labelEn: '', isDefault: false };

  // ── Forex tab ─────────────────────────────────────────────────────────────
  allParams    = signal<ParameterSetDto[]>([]);
  forexLoading = signal(false);
  forexError   = signal<string | null>(null);

  editingForex  = signal<string | null>(null);
  editEurRate   = '';
  editChfRate   = '';
  isSavingForex = signal(false);

  showAddForex  = signal(false);
  isAddingForex = signal(false);
  forexAddError = signal<string | null>(null);
  newForexCode  = '';
  newForexEur   = '';
  newForexChf   = '';

  forexRows = computed<ForexRow[]>(() => {
    const params = this.allParams();
    const eurMap = new Map(
      params.filter(p => p.paramKey.startsWith('RATE_EUR_'))
            .map(p => [p.paramKey.replace('RATE_EUR_', ''), p]),
    );
    const chfMap = new Map(
      params.filter(p => p.paramKey.startsWith('RATE_CHF_'))
            .map(p => [p.paramKey.replace('RATE_CHF_', ''), p]),
    );
    const codes = new Set([...eurMap.keys(), ...chfMap.keys()]);
    return [...codes].sort().map(code => ({
      code,
      eurParam: eurMap.get(code) ?? null,
      chfParam: chfMap.get(code) ?? null,
    }));
  });

  ngOnInit(): void {
    this.isLoading.set(true);
    forkJoin({
      myPays:  this.clientSvc.getMyPays(),
      allPays: this.clientSvc.getPays(),
    }).subscribe({
      next: ({ myPays, allPays }) => {
        this.paysList.set(allPays);
        const resolved = myPays ?? (allPays.length > 0 ? allPays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.loadListTypes();
          this.loadListValues();
          this.loadForex();
        } else {
          this.pageError.set('Aucun pays configuré pour ce compte.');
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.pageError.set('Impossible de charger la configuration.');
        this.isLoading.set(false);
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.editMap.set({});
    this.showAddValue.set(false);
    this.createValueError.set(null);
    this.loadListValues();
  }

  // ── Lists ──────────────────────────────────────────────────────────────────

  loadListTypes(): void {
    this.factListSvc.getAllListTypes().subscribe(types => this.listTypes.set(types));
  }

  selectListType(code: string): void {
    if (code === this.activeListType()) return;
    this.activeListType.set(code);
    this.editMap.set({});
    this.showAddValue.set(false);
    this.createValueError.set(null);
    this.loadListValues();
  }

  loadListValues(): void {
    const typeCode = this.activeListType();
    const paysId   = this.paysId();
    if (!typeCode || !paysId) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.factListSvc.getAdminListValues(typeCode, paysId).subscribe({
      next: values => {
        this.listValues.set(values);
        this.listLoading.set(false);
      },
      error: err => {
        this.listError.set(err.error?.message ?? 'Erreur de chargement.');
        this.listLoading.set(false);
      },
    });
  }

  startEditValue(v: ListValueDto): void {
    this.editMap.update(m => ({ ...m, [v.id]: { labelFr: v.labelFr, labelEn: v.labelEn ?? '' } }));
  }

  patchEditFr(id: number, value: string): void {
    this.editMap.update(m => ({ ...m, [id]: { ...m[id], labelFr: value } }));
  }

  patchEditEn(id: number, value: string): void {
    this.editMap.update(m => ({ ...m, [id]: { ...m[id], labelEn: value } }));
  }

  cancelEditValue(id: number): void {
    this.editMap.update(m => { const c = { ...m }; delete c[id]; return c; });
  }

  saveEditValue(v: ListValueDto): void {
    const patch = this.editMap()[v.id];
    if (!patch) return;
    this.valueSaving.set(v.id);
    this.listError.set(null);
    this.factListSvc.updateListValue(v.id, this.paysId(), patch).subscribe({
      next: updated => {
        // v.id and updated.id may differ when a global value was overridden with a country copy
        this.listValues.update(list => [
          ...list.filter(x => x.id !== v.id),
          updated,
        ]);
        this.editMap.update(m => { const c = { ...m }; delete c[v.id]; return c; });
        this.valueSaving.set(null);
      },
      error: err => {
        this.listError.set(err.error?.message ?? 'Erreur de sauvegarde.');
        this.valueSaving.set(null);
      },
    });
  }

  deactivateValue(v: ListValueDto): void {
    if (!confirm(`Désactiver la valeur "${v.code}" ?`)) return;
    this.factListSvc.deactivateListValue(v.id).subscribe({
      next: () => this.listValues.update(list =>
        list.map(x => x.id === v.id ? { ...x, isActive: false } : x),
      ),
      error: err => this.listError.set(err.error?.message ?? 'Erreur.'),
    });
  }

  reactivateValue(v: ListValueDto): void {
    this.factListSvc.updateListValue(v.id, this.paysId(), { isActive: true }).subscribe({
      next: updated => this.listValues.update(list => [
        ...list.filter(x => x.id !== v.id),
        updated,
      ]),
      error: err => this.listError.set(err.error?.message ?? 'Erreur.'),
    });
  }

  createValue(): void {
    const paysId   = this.paysId();
    const typeCode = this.activeListType();
    if (!this.newValue.code || !this.newValue.labelFr || !paysId) {
      this.createValueError.set('Code et libellé FR sont requis.');
      return;
    }
    this.isCreatingValue.set(true);
    this.createValueError.set(null);
    this.factListSvc.createListValue(typeCode, {
      typeCode,
      paysId,
      code:      this.newValue.code.trim().toUpperCase(),
      labelFr:   this.newValue.labelFr.trim(),
      labelEn:   this.newValue.labelEn.trim() || undefined,
      isDefault: this.newValue.isDefault,
    }).subscribe({
      next: created => {
        this.listValues.update(list => [...list, created]);
        this.newValue = { code: '', labelFr: '', labelEn: '', isDefault: false };
        this.showAddValue.set(false);
        this.isCreatingValue.set(false);
      },
      error: err => {
        this.createValueError.set(err.error?.message ?? 'Erreur de création.');
        this.isCreatingValue.set(false);
      },
    });
  }

  // ── Forex ──────────────────────────────────────────────────────────────────

  loadForex(): void {
    this.forexLoading.set(true);
    this.forexError.set(null);
    this.paramSvc.getAll().subscribe({
      next: params => {
        this.allParams.set(params);
        this.forexLoading.set(false);
      },
      error: err => {
        this.forexError.set(err.error?.message ?? 'Erreur de chargement.');
        this.forexLoading.set(false);
      },
    });
  }

  startEditForex(row: ForexRow): void {
    this.editingForex.set(row.code);
    this.editEurRate = row.eurParam?.paramValue ?? '';
    this.editChfRate = row.chfParam?.paramValue ?? '';
    this.forexError.set(null);
  }

  cancelEditForex(): void {
    this.editingForex.set(null);
    this.editEurRate = '';
    this.editChfRate = '';
  }

  saveForex(row: ForexRow): void {
    const eurRate = this.editEurRate.trim();
    if (!eurRate || isNaN(Number(eurRate)) || Number(eurRate) <= 0) {
      this.forexError.set('Taux EUR invalide (nombre décimal positif requis).');
      return;
    }
    const chfRate = this.editChfRate.trim();
    if (chfRate && (isNaN(Number(chfRate)) || Number(chfRate) <= 0)) {
      this.forexError.set('Taux CHF invalide (nombre décimal positif requis).');
      return;
    }
    const ops = [
      this.paramSvc.upsert({ paramKey: `RATE_EUR_${row.code}`, paramValue: eurRate, description: `1 ${row.code} en EUR` }),
    ];
    if (chfRate) {
      ops.push(this.paramSvc.upsert({ paramKey: `RATE_CHF_${row.code}`, paramValue: chfRate, description: `1 ${row.code} en CHF` }));
    }
    this.isSavingForex.set(true);
    this.forexError.set(null);
    forkJoin(ops).subscribe({
      next: results => {
        results.forEach(updated => {
          this.allParams.update(list => {
            const idx = list.findIndex(p => p.paramKey === updated.paramKey);
            return idx >= 0
              ? list.map(p => p.paramKey === updated.paramKey ? updated : p)
              : [...list, updated];
          });
        });
        this.editingForex.set(null);
        this.isSavingForex.set(false);
      },
      error: err => {
        this.forexError.set(err.error?.message ?? 'Erreur de sauvegarde.');
        this.isSavingForex.set(false);
      },
    });
  }

  addNewForexRate(): void {
    const code    = this.newForexCode.trim().toUpperCase();
    const eurRate = this.newForexEur.trim();
    const chfRate = this.newForexChf.trim();

    if (!code || !eurRate) {
      this.forexAddError.set('Code devise et taux EUR sont requis.');
      return;
    }
    if (isNaN(Number(eurRate)) || Number(eurRate) <= 0) {
      this.forexAddError.set('Taux EUR invalide.');
      return;
    }
    if (this.allParams().some(p => p.paramKey === `RATE_EUR_${code}`)) {
      this.forexAddError.set(`Un taux EUR pour "${code}" existe déjà. Éditez la ligne existante.`);
      return;
    }
    const ops = [
      this.paramSvc.upsert({ paramKey: `RATE_EUR_${code}`, paramValue: eurRate, description: `1 ${code} en EUR` }),
    ];
    if (chfRate) {
      if (isNaN(Number(chfRate)) || Number(chfRate) <= 0) {
        this.forexAddError.set('Taux CHF invalide.');
        return;
      }
      ops.push(this.paramSvc.upsert({ paramKey: `RATE_CHF_${code}`, paramValue: chfRate, description: `1 ${code} en CHF` }));
    }
    this.isAddingForex.set(true);
    this.forexAddError.set(null);
    forkJoin(ops).subscribe({
      next: results => {
        results.forEach(p => this.allParams.update(list => [...list, p]));
        this.newForexCode = '';
        this.newForexEur  = '';
        this.newForexChf  = '';
        this.showAddForex.set(false);
        this.isAddingForex.set(false);
      },
      error: err => {
        this.forexAddError.set(err.error?.message ?? 'Erreur.');
        this.isAddingForex.set(false);
      },
    });
  }

  deleteForexParam(param: ParameterSetDto): void {
    if (!confirm(`Supprimer le paramètre "${param.paramKey}" ?`)) return;
    this.paramSvc.delete(param.id).subscribe({
      next: () => this.allParams.update(list => list.filter(p => p.id !== param.id)),
      error: err => this.forexError.set(err.error?.message ?? 'Erreur de suppression.'),
    });
  }

  // ── Forex API config tab ──────────────────────────────────────────────────

  forexApiProvider    = signal<string>('frankfurter');
  forexApiKey         = signal<string>('');
  forexApiCurrencies  = signal<string>('');
  forexApiAutoRefresh = signal<boolean>(false);
  forexApiSaving      = signal(false);
  forexRefreshing     = signal(false);
  forexApiError       = signal<string | null>(null);
  forexApiSuccess     = signal<string | null>(null);
  forexApiStatus      = signal<ForexApiStatusDto | null>(null);
  forexApiStatusLoading = signal(false);

  openForexApiTab(): void {
    this.activeTab.set('forex-api');
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    this.forexApiStatusLoading.set(true);
    this.forexApiSvc.getStatus().subscribe({
      next: s => {
        this.forexApiStatus.set(s);
        this.forexApiProvider.set(s.provider);
        this.forexApiAutoRefresh.set(s.autoRefresh);
        this.forexApiCurrencies.set(s.targetCurrencies);
        this.forexApiKey.set('');
        this.forexApiStatusLoading.set(false);
      },
      error: () => this.forexApiStatusLoading.set(false),
    });
  }

  saveForexApiConfig(): void {
    const toSave = [
      { paramKey: 'FOREX_API_PROVIDER',       paramValue: this.forexApiProvider(),                   description: 'Fournisseur API forex' },
      { paramKey: 'FOREX_AUTO_REFRESH',        paramValue: this.forexApiAutoRefresh() ? 'true' : 'false', description: 'Rafraîchissement automatique des taux' },
      { paramKey: 'FOREX_TARGET_CURRENCIES',   paramValue: this.forexApiCurrencies().trim(),           description: 'Devises cibles (séparées par virgule)' },
    ];
    const newKey = this.forexApiKey().trim();
    if (newKey) {
      toSave.push({ paramKey: 'FOREX_API_KEY', paramValue: newKey, description: 'Clé API forex' });
    }
    this.forexApiSaving.set(true);
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    forkJoin(toSave.map(dto => this.paramSvc.upsert(dto))).subscribe({
      next: results => {
        results.forEach(updated => {
          this.allParams.update(list => {
            const idx = list.findIndex(p => p.paramKey === updated.paramKey);
            return idx >= 0
              ? list.map(p => p.paramKey === updated.paramKey ? updated : p)
              : [...list, updated];
          });
        });
        this.forexApiStatus.update(s => s ? {
          ...s,
          provider:         this.forexApiProvider(),
          autoRefresh:      this.forexApiAutoRefresh(),
          targetCurrencies: this.forexApiCurrencies(),
          hasApiKey:        s.hasApiKey || !!newKey,
        } : s);
        this.forexApiKey.set('');
        this.forexApiSuccess.set('Configuration sauvegardée.');
        this.forexApiSaving.set(false);
      },
      error: err => {
        this.forexApiError.set(err.error?.message ?? 'Erreur de sauvegarde.');
        this.forexApiSaving.set(false);
      },
    });
  }

  triggerForexRefresh(): void {
    this.forexRefreshing.set(true);
    this.forexApiError.set(null);
    this.forexApiSuccess.set(null);
    this.forexApiSvc.refresh().subscribe({
      next: result => {
        if (result.success) {
          this.forexApiSuccess.set(result.message);
          this.loadForex();
        } else {
          this.forexApiError.set(result.message);
        }
        this.forexApiStatus.update(s => s ? {
          ...s,
          lastRefreshAt:     result.refreshedAt,
          lastRefreshStatus: result.success
            ? 'success:' + result.ratesUpdated + ' taux mis à jour'
            : 'error:' + result.message,
        } : s);
        this.forexRefreshing.set(false);
      },
      error: err => {
        this.forexApiError.set(err.error?.message ?? 'Erreur lors du rafraîchissement.');
        this.forexRefreshing.set(false);
      },
    });
  }

  chfFallback(row: ForexRow): string {
    if (!row.eurParam) return '—';
    const eur = parseFloat(row.eurParam.paramValue);
    return isNaN(eur) ? '—' : (eur * 0.965).toFixed(6);
  }
}
