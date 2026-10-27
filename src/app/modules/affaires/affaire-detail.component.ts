import { Component, OnInit, TemplateRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AvatarGroupComponent, BarChartComponent, ButtonComponent, ButtonOptions,
  ChipGroupComponent, DafCellDirective, DataTableComponent, MetricCardComponent,
  DrawerComponent, FilterChipsComponent, FilterComponent, FormFieldComponent, FormFieldOptions,
  GaugeComponent, ModalService,
  PageComponent, PageHeaderComponent, ProgressBarComponent, ProgressBarOptions,
  RadioGroupComponent, SearchToolbarComponent, SectionCardComponent, SelectComponent, SkeletonComponent,
  StatusBadgeComponent, TabsComponent,
  countActiveFilters, tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  AvatarData, BadgeCell, BadgeOptions, BarChartBar, BarChartLegendItem, BarChartOptions,
  BarChartSegmentVariant, BreadcrumbItem,
  ChipGroupConfig, ChipOption, DrawerConfig,
  MetricCardOptions, MetricDelta,
  FilterField, FilterOption, FilterResult, GaugeOptions, PageHeaderBadge, ProgressVariant, RadioOption, SelectOption,
  SearchToolbarFilterConfig, TabItem, TableAction, TableColumn, TableConfig, TableRow,
  ToolbarAction,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from './affaire.service';
import { AffaireWizardService } from './affaire-wizard.service';
import {
  AffaireDetail, RafDetailsDto, AffaireKpisDto, TsDto, TsHistoryEntry,
  AffaireInvoiceItem, AffairePaymentItem, PaysRefDto, paysLabel,
  AffaireChartBucket, AffaireChartsDto, AffaireChartsQuery, ChartGranularity, ChartWipAmounts, ChartWipStatus,
  AFFAIRE_STATUTS, STATUT_LABELS,
} from './affaire.model';
import { distinctResponsables } from './affaire-display';
import { UserStore } from '../../core/user.store';
import { ToastService } from '../../core/toast.service';
import { InvoiceTypeLabels } from '../../core/invoice-type-labels.service';
import { ExportService } from '../../core/export.service';
import { PermissionDirective } from '../../shared/permission.directive';
import { TsFormComponent } from './ts/ts-form.component';
import { TsRowMenuComponent, TsRowMenuItem } from './ts/ts-row-menu.component';
import { AffaireTsWipTabComponent } from './ts/affaire-ts-wip-tab.component';
import { AffaireWipTabComponent } from './wip/affaire-wip-tab.component';
import { AffaireRessourcesTabComponent } from './ressources/affaire-ressources-tab.component';
import { AffaireDepenseTabComponent } from './depense/affaire-depense-tab.component';
import { ExpenseFormComponent } from './billing/modes/expense-form.component';
import { ExpenseHistoryComponent } from './billing/modes/expense-history.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { searchTableRows, tableTools } from '../../shared/table-tools';
import { STATUT_BADGE_VARIANT } from './affaire-display';
import {
  INVOICE_STATUT_BADGE, TS_STATUT_BADGE, enumLabel,
} from '../../shared/enum-labels';
import { EmployeeAvatar, EmployeeAvatarService } from '../../core/employee-avatar.service';
import { ClientContactService } from '../clients/contacts/client-contact.service';
import { AffaireContactDto }    from '../clients/contacts/client-contact.model';
/** A read-only label/value pair. `label` is always a translation key. */
interface DetailField { label: string; value: string; }

/**
 * Un responsable de l'affaire tel que la fiche l'affiche : UNE ENTRÉE PAR PERSONNE,
 * ses activités et disciplines regroupées, son budget alloué cumulé.
 *
 * `affaire_responsables` porte une ligne par couple (personne, activité) depuis V26 :
 * lister les lignes brutes ferait apparaître deux fois la même personne dès qu'elle
 * porte deux activités.
 */
/**
 * Une ligne du bloc « Contrat » du panneau de gauche : deux colonnes, libellé à gauche
 * et valeur à droite. `ok` n'est renseigné que sur la ligne « Budget validé », la seule
 * qui se lit comme un état (point + Oui/Non) plutôt que comme une valeur.
 */
interface ContratRow { label: string; value: string; ok?: boolean; }

interface ResponsableEntry {
  userId:    number;
  fullName:  string;
  /** Rôle · activités · disciplines, dédoublonnés et joints — vide si rien n'est renseigné. */
  detail:    string;
  /** Somme des allocations de la personne, déjà formatée — vide si aucune n'est renseignée. */
  budget:    string;
}

/** One `daf-metric-card` of the right column's KPI row. `label` is a translation key. */
interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

interface RowDetail {
  titleKey: string;
  ref:      string;
  fields:   DetailField[];
  /** Optional footer button — hands the row over to its own module. */
  openAction?: { labelKey: string; run: () => void };
}

interface ActivityRow {
  id:       string;
  icon:     string;
  titleKey: string;
  params:   Record<string, string>;
  sub:      string;
  ts:       number;
}



/** Statuts de facture qui ne génèrent plus d'échéance à suivre. */
const SETTLED_INVOICE_STATUTS = new Set(['PAID', 'CANCELLED', 'CREDIT_NOTED']);

/** Statuts où la facture accepte encore une modification (cf. son propre écran). */
const EDITABLE_INVOICE_STATUTS = new Set(['DRAFT', 'RETURNED']);

/** Jour calendaire local → 'yyyy-MM-dd' — jamais toISOString() (UTC, décale d'un jour). */
function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Graphiques facturation / WIP / paiements ───────────────────────────────

/** Période des graphiques sans filtre : l'année civile en cours (demande du 2026-10-27). */
const DEFAULT_CHART_PERIOD = 'YTD';

/** Les diapositives du carrousel, dans l'ordre de lecture : facturé, déclaré, encaissé. */
const CHART_SLIDES = ['INVOICED', 'WIP', 'PAYMENTS'] as const;
type ChartSlideId = typeof CHART_SLIDES[number];

function isSlide(v: string | null | undefined): v is ChartSlideId {
  return (CHART_SLIDES as readonly string[]).includes(v ?? '');
}

function asSlide(v: string | null): ChartSlideId {
  return isSlide(v) ? v : CHART_SLIDES[0];
}

/** Une diapositive prête à rendre — voir `chartSlides`. */
interface ChartSlideView {
  id:         ChartSlideId;
  title:      string;
  totalLabel: string;
  total:      number;
  /** « 3 facture(s) », « 2 paiement(s) » sous le total ; null quand ça n'a pas de sens. */
  count:      string | null;
  note:       string | null;
  bars:       ChartBar[];
  options:    BarChartOptions;
}

/** 'yyyy-MM' → premier / dernier jour du mois, en dates locales (le daterange du panneau). */
function monthStart(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function monthEnd(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0);
}

/** Ordre d'empilement, du bas vers le haut : le facturé porte la barre, le refusé la coiffe. */
const WIP_STATUS_ORDER: readonly ChartWipStatus[] = ['INVOICED', 'PENDING', 'REJECTED'];

const WIP_STATUS_VARIANT: Record<ChartWipStatus, BarChartSegmentVariant> = {
  INVOICED: 'tertiary',
  PENDING:  'warning',
  REJECTED: 'neutral',
};

/** Une barre qui garde la clé de sa période, pour retrouver la période au clic. */
type ChartBar = BarChartBar & { key: string };

function wipAmount(w: ChartWipAmounts, s: ChartWipStatus): number {
  return s === 'INVOICED' ? w.invoiced : s === 'PENDING' ? w.pending : w.rejected;
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'yyyy-MM-dd' → minuit LOCAL ce jour-là (`new Date(iso)` serait minuit UTC). */
function localDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function asGranularity(v: string | null): ChartGranularity {
  return v === 'QUARTER' || v === 'YEAR' ? v : 'MONTH';
}

/** `cs=INVOICED,PENDING` → statuts connus, dans l'ordre d'empilement ; rien de valide = tous. */
function asStatuses(v: string | null): ChartWipStatus[] {
  const picked = WIP_STATUS_ORDER.filter(s => (v ?? '').split(',').includes(s));
  return picked.length ? picked : [...WIP_STATUS_ORDER];
}

/** Un jour ('yyyy-MM-dd…' ou date-heure ISO) dans la plage du filtre `daterange` (1 date =
 *  un seul jour). Sans plage : tout passe ; plage mais pas de date : exclu. */
function inDayRange(value: string | null | undefined, range: Date[] | null): boolean {
  if (!range || !range.length) return true;
  if (!value) return false;
  // Une date seule ('2026-09-01') est déjà un jour local ; une date-heure est ramenée au
  // jour local du lecteur.
  const day  = value.length <= 10 ? value : toIsoDay(new Date(value));
  const from = toIsoDay(range[0]);
  const to   = toIsoDay(range[1] ?? range[0]);
  return day >= from && day <= to;
}

/** Borne de montant saisie en texte ('1 500,50' accepté) → nombre, ou null si vide/invalide. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Montant dans [min, max] ; une borne nulle est ignorée, un montant absent est exclu dès
 *  qu'une borne est posée. */
function inAmountRange(amount: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (amount == null) return false;
  return (min == null || amount >= min) && (max == null || amount <= max);
}

const PRIORITY_BADGE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger', medium: 'warning', standard: 'neutral',
};

/** Tri de la colonne priorité des échéances : de la moins à la plus urgente. */
const PRIORITY_RANK: Record<string, number> = { standard: 0, medium: 1, high: 2 };

@Component({
  selector: 'app-affaire-detail',
  imports: [
    TranslatePipe, DisplayCurrencyPipe, DecimalPipe, PermissionDirective, RouterLink, DafCellDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent, ButtonComponent,
    ProgressBarComponent, StatusBadgeComponent, SearchToolbarComponent, DataTableComponent, MetricCardComponent,
    DrawerComponent, RadioGroupComponent, FormFieldComponent, SelectComponent,
    GaugeComponent, BarChartComponent, AvatarGroupComponent, ChipGroupComponent, FilterComponent, FilterChipsComponent, SkeletonComponent,
    TsFormComponent, TsRowMenuComponent, AffaireTsWipTabComponent, AffaireWipTabComponent, AffaireRessourcesTabComponent, AffaireDepenseTabComponent,
    // La fiche utilise les deux morceaux séparément : le formulaire dans la modale
    // « Frais remboursables », l'historique dans l'onglet « Frais ».
    ExpenseFormComponent, ExpenseHistoryComponent,
  ],
  // Injected to format amounts inside computeds (table rows, CSV, bar labels), so it
  // has to be provided — the pipe is only ambient in a template.
  providers: [DisplayCurrencyPipe],
  templateUrl: './affaire-detail.component.html',
  // ═══════════════════════════════════════════════════════════════════════════
  // Pourquoi des styles de composant, alors que la page est en styles inline
  //
  // La page évitait les classes parce que le `styles.css` d'un remote ne contient que les
  // classes que Tailwind a déjà vues à la compilation : une classe neuve n'existe pas dans
  // le CSS servi tant que le remote n'est pas reconstruit, et la mise en page retombe en
  // une colonne. Mais les styles d'un COMPOSANT ne passent pas par ce scan — ils sont
  // compilés dans le composant lui-même, donc ils voyagent avec lui.
  //
  // C'est ce qui débloque les MEDIA QUERIES, impossibles dans un attribut `style` : sans
  // elles, la seule mise en page possible était `flex-wrap` avec une base en pixels, et
  // c'est précisément ce qui cassait sur un écran de portable — quatre tuiles de base
  // 200 px dans 700 px de colonne se replient 3 + 1, laissant une tuile orpheline sur sa
  // propre ligne. Les rangées sont donc des GRILLES `auto-fit`/`minmax` (ce que les
  // commentaires du template décrivaient déjà sans que ce soit implémenté) : les colonnes
  // en `1fr` sont égales par construction et le nombre par ligne s'adapte tout seul.
  // ═══════════════════════════════════════════════════════════════════════════
  styles: [`
    /* ── Les deux colonnes ─────────────────────────────────────────────────── */
    .detail-split {
      display:     flex;
      flex-wrap:   wrap;
      gap:         2rem;
      align-items: flex-start;
    }

    /* Colonne gauche : ~30 % au-delà du portable, mais bornée en dur — au-delà de 420 px
       la carte d'informations n'a plus rien à faire de la largeur, autant la donner au
       graphique. */
    .detail-aside {
      flex:      0 1 30%;
      min-width: 320px;
      max-width: 420px;
    }

    .detail-main {
      flex:           1 1 480px;
      min-width:      0;
      display:        flex;
      flex-direction: column;
      gap:            1.5rem;
    }

    /* ── Rangées de cartes : des grilles, pas du flex-wrap ─────────────────── */
    .kpi-row, .tile-row {
      display: grid;
      gap:     1.5rem;
      align-items: stretch;
    }

    /* 170 px : les quatre indicateurs tiennent sur une ligne dès ~740 px de colonne, donc
       sur un portable de 1366 px. En dessous, la grille passe à trois puis deux colonnes
       ÉGALES — jamais une orpheline pleine largeur. */
    .kpi-row    { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .tile-row   { grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); }

    /* Les hôtes de carte : display:flex pour que la carte remplisse sa cellule, et
       min-width:0 pour qu'un contenu large (un montant, un libellé) ne pousse pas la
       colonne au-delà de son 1fr — c'est ce qui fait déborder une grille. */
    .kpi-cell, .tile-cell {
      display:        flex;
      flex-direction: column;
      min-width:      0;
    }
    .kpi-cell    { min-height: 118px; }
    .tile-cell   { min-height: 210px; height: auto; }

    /* ── Carrousel des graphiques ──────────────────────────────────────────── */
    /* En-tête : navigation (flèches + puces des trois graphiques) à gauche, Filtres +
       Exporter à droite. Repliée, la rangée d'actions reste alignée à droite. */
    .carousel-head {
      display:         flex;
      flex-wrap:       wrap;
      gap:             0.75rem 1rem;
      align-items:     center;
      justify-content: space-between;
    }
    .carousel-nav, .carousel-actions {
      display:     flex;
      flex-wrap:   wrap;
      gap:         0.5rem;
      align-items: center;
    }
    .carousel-actions { margin-left: auto; }

    /* Une seule diapositive rendue ; elle entre en glissant depuis le côté d'où l'on vient.
       overflow-x:clip et non hidden : seul l'axe horizontal est coupé (le glissement), la
       pastille de la plus haute barre peut toujours déborder vers le haut. */
    .carousel-viewport {
      overflow-x:   clip;
      touch-action: pan-y;
    }
    .carousel-slide {
      display:        flex;
      flex-direction: column;
      gap:            1rem;
      animation:      chart-slide-in 300ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .carousel-slide--back { animation-name: chart-slide-in-back; }
    @keyframes chart-slide-in {
      from { opacity: 0; transform: translateX(32px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes chart-slide-in-back {
      from { opacity: 0; transform: translateX(-32px); }
      to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .carousel-slide { animation: none; }
    }

    /* Titre + plage à gauche, total à droite ; le total passe dessous quand la carte est
       étroite, aligné à gauche pour ne pas flotter seul côté droit. */
    .chart-head {
      display:         flex;
      flex-wrap:       wrap;
      gap:             0.75rem 1.5rem;
      align-items:     flex-start;
      justify-content: space-between;
    }
    .chart-total { text-align: right; }

    /* Rechargement après un changement de filtre : on garde les barres précédentes,
       atténuées, plutôt que de les remplacer par un squelette qui ferait sauter la carte. */
    .chart-plot--loading {
      opacity:    0.5;
      transition: opacity 150ms ease;
    }

    /* ── Le tracé du graphique ─────────────────────────────────────────────── */
    /* Toute la largeur de la carte, quel que soit le nombre de barres (demande du
       2026-10-27 : l'ancien plafond par nombre de barres laissait la carte à moitié vide). */
    .chart-plot { width: 100%; }

    /* ── Portable et en dessous ────────────────────────────────────────────── */
    /* 1400 px : la fenêtre d'un portable moins la barre latérale de 256 px et les marges
       du shell, c'est ~1050 px de contenu. On resserre la gouttière et la colonne gauche
       pour rendre cette largeur au graphique et aux tableaux. */
    @media (max-width: 1400px) {
      .detail-split { gap: 1.5rem; }
      .detail-aside { min-width: 300px; max-width: 360px; }
    }

    /* En dessous de ~1150 px il n'y a plus de place pour deux colonnes : la carte
       d'informations passe pleine largeur au-dessus du reste, et son sticky n'a plus de
       sens (elle serait collée en haut devant le contenu qu'on lit). */
    @media (max-width: 1150px) {
      .detail-aside {
        flex:      1 1 100%;
        max-width: none;
        min-width: 0;
      }
      .detail-aside > div { position: static !important; }
    }

    @media (max-width: 640px) {
      .kpi-row, .tile-row, .bottom-row { gap: 1rem; }
      .carousel-actions { margin-left: 0; }
      .chart-total { text-align: left; }
    }

    /* ══ PANNEAU DE DÉTAILS (colonne gauche) ════════════════════════════════
       Toutes les couleurs viennent des jetons de la lib, avec un repli en dur
       pour le cas où la feuille de la lib n'est pas encore chargée.

       Pourquoi des styles de COMPOSANT et pas des classes utilitaires : cette
       maquette demande des tailles que l'échelle de la lib ne porte pas (9 px
       pour les micro-libellés, 10,5 px pour les rôles, 12,5 px pour les
       valeurs) et un interlettrage précis. Les écrire en classes Tailwind
       arbitraires («text-[12.5px]«, «tracking-[.14em]«) les ferait dépendre du
       scan de l'app consommatrice — l'encadré en tête du gabarit explique
       pourquoi c'est un piège dans un remote. Les styles de composant, eux,
       sont compilés avec le composant et voyagent avec lui.
       ═════════════════════════════════════════════════════════════════════ */

    .dp {
      display:        flex;
      flex-direction: column;
      gap:            12px;
    }

    /* La SURFACE (fond, bordure, rayon, survol) vient de « daf-section-card », comme
       partout ailleurs sur la page — ce conteneur ne fait que la colonne de blocs et
       leurs séparateurs. La refaire en dur ici donnait deux cartes qui ne réagissaient
       pas au survol comme leurs voisines. */
    .dp-card {
      display:        flex;
      flex-direction: column;
    }

    .dp-block {
      display:        flex;
      flex-direction: column;
      gap:            8px;
      padding:        14px 16px;
    }

    .dp-block__head {
      display:         flex;
      align-items:     center;
      justify-content: space-between;
      gap:             8px;
    }

    /* LE style de libellé du panneau — il n'y en a pas d'autre. Toute autre taille
       ou graisse pour un libellé de section rouvrirait la hiérarchie floue que
       cette refonte supprime. */
    .dp-label {
      margin:         0;
      font-size:      9px;
      font-weight:    700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color:          var(--color-on-surface-variant, #44474c);
    }

    .dp-count {
      font-size:   10.5px;
      font-weight: 700;
      color:       var(--color-on-surface-variant, #44474c);
    }

    /* 1 px = séparateur interne (Client → Contrat) ; 2 px = séparateur de section
       majeure (Contrat → Managers → Contacts). C'est le trait qui porte le
       groupement, pas le blanc : dans 300 px de large, doubler les marges pour
       séparer coûte un écran de haut. */
    .dp-rule {
      height:     1px;
      background: var(--color-outline-variant, #c5c6cd);
      opacity:    .55;
    }
    .dp-rule--major { height: 2px; opacity: .4; }

    /* ── Bloc Client ──────────────────────────────────────────────────────── */
    .dp-client {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             8px;
      min-width:       0;
    }
    .dp-client__name {
      flex:          1 1 auto;
      min-width:     0;
      font-size:     16px;
      font-weight:   600;
      color:         var(--color-on-surface, #191c1e);
      white-space:   nowrap;
      overflow:      hidden;
      text-overflow: ellipsis;
    }
    .dp-client__meta {
      flex-shrink: 0;
      font-size:   11px;
      color:       var(--color-on-surface-variant, #44474c);
    }

    /* Regroupe la méta (entité · devise) et, pour FACT_SUPER_ADMIN seulement, l'icône de
       bascule de l'entité propriétaire — les deux restent sur la même ligne de base que
       le nom du client. */
    .dp-client__actions {
      flex-shrink: 0;
      display:     inline-flex;
      align-items: center;
      gap:         4px;
    }

    /* Icône d'action discrète, réservée aux bascules admin posées à même une ligne de
       méta (ex. l'entité propriétaire) — jamais visible hors de FACT_SUPER_ADMIN. */
    .dp-icon-btn {
      display:         inline-flex;
      align-items:     center;
      justify-content: center;
      width:           18px;
      height:          18px;
      padding:         0;
      border:          none;
      border-radius:   4px;
      background:      transparent;
      color:            var(--color-on-surface-variant, #44474c);
      cursor:          pointer;
    }
    .dp-icon-btn:hover { background: var(--color-surface-container-high, #e7e9e4); }
    .dp-icon-btn .material-symbols-outlined { font-size: 14px; }

    /* ── Entités vendeuses : puces, pas une liste de personnes ──────────────── */
    .dp-chips {
      display:   flex;
      flex-wrap: wrap;
      gap:       6px;
    }
    .dp-chip {
      display:       inline-flex;
      align-items:   center;
      padding:       3px 10px;
      border-radius: 999px;
      font-size:     11px;
      font-weight:   600;
      color:         var(--color-on-secondary-container, #34369e);
      background:    var(--color-secondary-container, #e3e3fb);
    }
    .dp-chip-empty {
      margin:    0;
      font-size: 11px;
      color:     var(--color-on-surface-variant, #44474c);
    }

    /* Lien texte discret pour une action secondaire DANS un bloc (« Modifier » les
       entités vendeuses) — un « daf-button » serait trop lourd à côté d'un simple libellé. */
    .dp-link-btn {
      border:      none;
      background:  transparent;
      padding:     0;
      font-size:   10.5px;
      font-weight: 700;
      color:       var(--color-tertiary, #00c1ad);
      cursor:      pointer;
    }
    .dp-link-btn:hover { text-decoration: underline; }
    /* «nowrap« : la période est une unité de lecture, la couper autour de la flèche
       donnerait « 01 sept. 2026 → » sur une ligne et la fin sur la suivante. */
    .dp-period {
      margin:      0;
      font-size:   11px;
      color:       var(--color-on-surface-variant, #44474c);
      white-space: nowrap;
    }

    /* ── Bloc Contrat : deux colonnes, une paire par ligne ────────────────── */
    .dp-rows { margin: 0; }

    .dp-row {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             12px;
      padding:         6px 0;
      border-bottom:   1px solid var(--color-outline-variant, #c5c6cd);
    }
    /* Le filet de la dernière ligne doublerait le séparateur de section juste en
       dessous. */
    .dp-row--last { border-bottom: 0; padding-bottom: 0; }
    .dp-row--no-divider { border-bottom: 0; padding-bottom: 0; }

    .dp-row__key {
      margin:    0;
      font-size: 12px;
      color:     var(--color-on-surface-variant, #44474c);
    }
    .dp-row__val {
      margin:      0;
      font-size:   12.5px;
      font-weight: 600;
      color:       var(--color-on-surface, #191c1e);
      text-align:  right;
    }

    /* État « Budget validé » : point + texte. Le texte reste la source, le point
       n'est qu'un renfort — d'où «aria-hidden« sur le point dans le gabarit. */
    .dp-flag {
      display:     inline-flex;
      align-items: center;
      gap:         6px;
      font-weight: 600;
      color:       var(--color-on-surface-variant, #44474c);
    }
    .dp-flag__dot {
      width:         6px;
      height:        6px;
      border-radius: 50%;
      background:    var(--color-outline, #75777d);
      flex-shrink:   0;
    }
    .dp-flag--ok            { color: var(--color-tertiary, #00c1ad); }
    .dp-flag--ok .dp-flag__dot { background: var(--color-tertiary, #00c1ad); }

    /* ── Managers et contacts ─────────────────────────────────────────────── */
    .dp-people {
      list-style: none;
      margin:     0;
      padding:    0;
      display:        flex;
      flex-direction: column;
      gap:            10px;
    }

    .dp-person {
      display:     flex;
      align-items: flex-start;
      gap:         8px;
      min-width:   0;
    }

    .dp-avatar {
      flex-shrink:     0;
      width:           26px;
      height:          26px;
      border-radius:   50%;
      display:         inline-flex;
      align-items:     center;
      justify-content: center;
      background:      var(--color-secondary-container, #e3e3fb);
      color:           var(--color-on-secondary-container, #34369e);
      font-size:       10px;
      font-weight:     700;
      letter-spacing:  .02em;
    }

    .dp-person__body { min-width: 0; flex: 1 1 auto; }

    .dp-person__top {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             8px;
      min-width:       0;
    }
    .dp-person__name {
      min-width:     0;
      font-size:     12.5px;
      font-weight:   600;
      color:         var(--color-on-surface, #191c1e);
      white-space:   nowrap;
      overflow:      hidden;
      text-overflow: ellipsis;
    }
    /* Deux lignes au plus : « Responsable Génie Civil · Études · Structure » ne
       tient pas sur une, et le tronquer à une ligne n'en laisserait que le rôle. */
    .dp-person__role {
      display:            -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow:           hidden;
      font-size:          10.5px;
      line-height:        1.35;
      color:              var(--color-on-surface-variant, #44474c);
    }

    .dp-contact { min-width: 0; }
    .dp-contact__top {
      display:     flex;
      align-items: center;
      gap:         6px;
      min-width:   0;
    }
    .dp-contact__name {
      min-width:     0;
      font-size:     12.5px;
      font-weight:   600;
      color:         var(--color-on-surface, #191c1e);
      white-space:   nowrap;
      overflow:      hidden;
      text-overflow: ellipsis;
    }
    .dp-contact__mail {
      display:       block;
      font-size:     11px;
      color:         var(--color-on-surface-variant, #44474c);
      white-space:   nowrap;
      overflow:      hidden;
      text-overflow: ellipsis;
    }

    /* Angles droits, contrairement aux pastilles arrondies du reste de la page :
       ce n'est pas un badge de statut mais une étiquette accolée au nom. */
    .dp-tag {
      flex-shrink:     0;
      padding:         1px 4px;
      font-size:       8.5px;
      font-weight:     700;
      letter-spacing:  .1em;
      text-transform:  uppercase;
      color:           var(--color-on-tertiary-container, #00786b);
      background:      var(--color-tertiary-container, #d7f7f2);
    }

    .dp-notes {
      margin:      0;
      font-size:   11.5px;
      line-height: 1.5;
      white-space: pre-wrap;
      color:       var(--color-on-surface-variant, #44474c);
    }

    /* Sous le point de repli de la colonne, les deux cartes passent pleine largeur
       dans le MÊME ordre — « Actions rapides » reste après « Détails ». Rien à
       faire : «.dp« est déjà une colonne et «.detail-aside« s'étire (cf. la media
       query à 1150 px ci-dessus). Seule la gouttière se resserre. */
    @media (max-width: 640px) {
      .dp { gap: 10px; }
      .dp-block { padding: 12px 14px; }
    }
  `],
})
export class AffaireDetailComponent implements OnInit {
  // Bound from route param via withComponentInputBinding()
  id = input<string>();

  private readonly svc       = inject(AffaireService);
  private readonly wizardSvc = inject(AffaireWizardService);
  private readonly store     = inject(UserStore);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly exportSvc = inject(ExportService);
  /** Export Excel en cours (TS, factures ou paiements) — grise les boutons d'export. */
  readonly exporting = signal(false);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly modals    = inject(ModalService);
  private readonly toast     = inject(ToastService);
  private readonly avatarSvc = inject(EmployeeAvatarService);
  private readonly contactSvc = inject(ClientContactService);
  private readonly typeLabels = inject(InvoiceTypeLabels);

  private readonly rowDetailTpl   = viewChild.required<TemplateRef<unknown>>('rowDetailTpl');
  private readonly statutTpl      = viewChild.required<TemplateRef<unknown>>('statutTpl');
  private readonly tsValidationTpl = viewChild.required<TemplateRef<unknown>>('tsValidationTpl');
  private readonly expensesTpl    = viewChild.required<TemplateRef<unknown>>('expensesTpl');
  private readonly tsFormTpl      = viewChild.required<TemplateRef<unknown>>('tsFormTpl');
  private readonly tsDeleteTpl    = viewChild.required<TemplateRef<unknown>>('tsDeleteTpl');
  private readonly tsHistoryTpl   = viewChild.required<TemplateRef<unknown>>('tsHistoryTpl');
  private readonly ownerEntityTpl    = viewChild.required<TemplateRef<unknown>>('ownerEntityTpl');
  private readonly sellerEntitiesTpl = viewChild.required<TemplateRef<unknown>>('sellerEntitiesTpl');
  /** Le corps du formulaire TS : la modale délègue Confirmer / Annuler à ses méthodes. */
  private readonly tsForm         = viewChild<TsFormComponent>('tsForm');
  /** Idem pour le formulaire de frais remboursable. */
  private readonly expenseForm    = viewChild<ExpenseFormComponent>('expenseForm');
  private tsFormModalRef: { close: () => void } | null = null;

  affaire  = signal<AffaireDetail | null>(null);
  /** Libellés INVOICE_TYPE (/finance/admin) du pays de l'affaire — onglet Factures. */
  private readonly loadInvoiceTypes = effect(() => this.typeLabels.ensure([this.affaire()?.paysId]));
  raf      = signal<RafDetailsDto | null>(null);
  kpis     = signal<AffaireKpisDto | null>(null);
  tsList   = signal<TsDto[]>([]);
  invoices = signal<AffaireInvoiceItem[]>([]);
  payments = signal<AffairePaymentItem[]>([]);
  /** Contacts client rattachés à cette affaire — voir loadContacts. */
  contacts = signal<AffaireContactDto[]>([]);
  /** Photos RH de l'équipe, par user id. Vide = initiales, ce qui est un état normal. */
  avatars  = signal<Map<number, EmployeeAvatar>>(new Map());

  /** Whole-page skeleton on the very first load only (§5) — a re-fetch keeps the page. */
  firstLoad   = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);
  /** Error surfaced *inside* an open modal, where the page banner isn't visible. */
  modalError  = signal<string | null>(null);

  /** Adossé au paramètre d'URL — voir tabParam : survit au rechargement et au précédent. */
  activeTab          = tabParam(computed(() => this.tabs().map(t => t.id)), 'overview');
  activityDrawerOpen = signal(false);
  budgetLoading      = signal(false);
  // `showTsForm` a disparu avec la fenêtre maison : la modale TS est portée par
  // ModalService, dont la référence suffit à savoir si elle est ouverte.

  // Statut modal
  targetStatut = signal('');
  motif        = signal('');

  // TS validation modal
  private tsValidationTarget = signal<{ ts: TsDto; step: 'technique' | 'commerciale' } | null>(null);
  tsNotes = signal('');

  /** TS ouvert dans le formulaire en modification — `null` pour une création. */
  readonly tsEditTarget = signal<TsDto | null>(null);

  // Suppression (logique) d'un TS
  private tsDeleteTarget = signal<TsDto | null>(null);
  tsDeleteMotif = signal('');

  // Fenêtre « Consulter » d'un TS : onglets Détails / Historique
  readonly tsHistory        = signal<TsHistoryEntry[]>([]);
  readonly tsHistoryLoading = signal(false);

  // Row detail modal
  private modalRowState = signal<RowDetail | null>(null);
  readonly modalRow = this.modalRowState.asReadonly();

  // Filtres de tableaux
  tsSearch      = signal('');
  tsStatut      = signal('');
  /** Jour ou plage [début, fin] de création du TS (`createdAt`), ou null. */
  tsCreatedRange = signal<Date[] | null>(null);
  /** Montant estimé minimum, saisi en texte ('' = pas de borne). */
  tsAmountMin   = signal('');
  /** Montant estimé maximum, saisi en texte ('' = pas de borne). */
  tsAmountMax   = signal('');
  invoiceSearch = signal('');
  invoiceStatut = signal('');
  /** Type de facture (`invoiceType`), '' = tous. */
  invoiceType   = signal('');
  /** Jour ou plage [début, fin] d'émission (`dateEmission`), ou null. */
  invoiceEmittedRange = signal<Date[] | null>(null);
  /** Échéance dépassée et facture non soldée (hors SETTLED_INVOICE_STATUTS). */
  invoiceOverdueOnly = signal(false);
  paymentSearch = signal('');
  paymentMethod = signal('');
  /** Jour ou plage [début, fin] de règlement (`paymentDate`), ou null. */
  paymentDateRange = signal<Date[] | null>(null);
  /** Montant réglé minimum, saisi en texte ('' = pas de borne). */
  paymentAmountMin = signal('');
  /** Montant réglé maximum, saisi en texte ('' = pas de borne). */
  paymentAmountMax = signal('');

  get numId(): number { return Number(this.id()); }

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly affaireDevise = computed(() => this.affaire()?.devise || 'TND');

  /**
   * Le libellé lisible d'un code technique (`ENUMS.<domaine>.<code>`).
   *
   * La page affichait ses énumérations brutes — `EN_ATTENTE_RF`, `CREDIT_NOTED`,
   * `BANK_TRANSFER` — ou passait par des tables locales aux couleurs en dur. Tout
   * converge maintenant vers `shared/enum-labels`, donc un statut se lit pareil dans un
   * tableau, une pastille et un export.
   */
  private enumText(domain: string, code: string | null | undefined): string {
    return enumLabel(this.translate, domain, code);
  }

  /** Type de facture : libellé de la liste paramétrée dans /finance/admin. */
  private invoiceTypeText(code: string | null | undefined): string {
    return this.typeLabels.label(code, this.affaire()?.paysId);
  }

  /**
   * Le pays de l'affaire. La fiche ne reçoit qu'un `paysId` ; le référentiel est chargé
   * une fois et mémorisé pour la session par le service, donc l'afficher ici ne coûte
   * aucun appel supplémentaire quand on vient de la liste.
   */
  private readonly paysList = signal<PaysRefDto[]>([]);
  readonly paysLabel = computed(() => {
    const p = this.paysList().find(p => p.id === this.affaire()?.paysId);
    return p ? paysLabel(p, this.translate.currentLang()) : '—';
  });

  readonly headerSubtitle = computed(() => {
    const a = this.affaire();
    if (!a) return '';
    return [a.reference, a.clientName].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    this.translate.currentLang();

    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(STATUT_LABELS[a.statut] ?? a.statut),
      variant: STATUT_BADGE_VARIANT[a.statut] ?? 'neutral',
      dot:     true,
    }];

    const health = this.healthState();
    badges.push({ label: this.translate.instant(health.labelKey), variant: health.variant });

    if (!a.budgetValide) {
      badges.push({
        label:   this.translate.instant('AFFAIRES.DETAIL.BUDGET_NOT_VALIDATED'),
        variant: 'warning',
      });
    }

    // Pas de pastille d'alerte RAF ici : depuis la 4.18.0 le rappel est porté par
    // `DrawerConfig.signal`, donc par l'onglet qui ouvre le panneau où vit l'alerte.
    // Le doubler sur le titre ferait deux marqueurs pour une seule condition.
    return badges;
  });

  /**
   * Le fil « Affaires » est un vrai lien, et rien n'écoute `(breadcrumbNavigate)`.
   *
   * C'est ce qui clochait : la lib rend un `<a routerLink>` **et** émet
   * `breadcrumbNavigate` au clic. Avec les deux branchés, le lien allait bien sur la
   * liste puis le handler renavigait — et il pointait `['../..']`, soit `/finance`. La
   * seconde navigation gagnait, donc le fil ramenait à l'accueil du module.
   *
   * `['..']` relatif plutôt que `/finance/affaires` absolu : la route de détail est
   * `affaires/:id`, donc `..` EST la liste, et ça reste juste quand l'app est servie
   * seule sur son port (les routes sont alors à la racine, pas sous `/finance`) —
   * c'est aussi la convention du reste de la page (`['../../invoicing']`, etc.).
   * Le dernier fil n'est jamais un lien côté lib, il n'y a rien à traiter pour lui.
   */
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('AFFAIRES.DETAIL.BACK_TO_LIST'), link: ['..'] },
      { label: this.affaire()?.reference ?? '' },
    ];
  });

  // ═══ Centre d'actions ═════════════════════════════════════════════════════
  //
  // Trois niveaux de hiérarchie, trois traitements visuels — et non cinq boutons de
  // même poids comme avant, où « Statut » criait aussi fort que « Nouvelle facture » :
  //
  //   1. Émettre une facture      → appel à l'action pleine largeur, teinté marque
  //   2. Saisir temps / frais     → deux tuiles `daf-card` identiques, surface claire
  //   3. Modifier / Statut        → rangée de pied discrète, sous un filet
  //
  // Le libellé de l'étape 1 reste « Nouvelle facture » : c'est le vocabulaire du module
  // Facturation, le renommer ici désaccorderait la fiche et l'écran d'arrivée.

  /** Libellé de l'action de modification — un brouillon se « complète », il ne se corrige pas. */
  readonly editLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.affaire()?.statut === 'DRAFT'
      ? 'AFFAIRES.DETAIL.SIDEBAR.COMPLETE_DRAFT_BTN'
      : 'AFFAIRES.DETAIL.ACTIONS.EDIT_LONG');
  });


  /**
   * L'action principale : `variant: 'primary'` (la teinte marque), `size: 'lg'` et
   * `fullWidth`. La flèche de fin porte l'affordance « ça mène ailleurs » — cliquer
   * quitte la fiche pour l'écran Facturation ; la lib l'anime déjà au survol.
   */
  readonly newInvoiceOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'primary',
      size:      'lg',
      fullWidth: true,
      iconStart: 'receipt',
      iconEnd:   'arrow_forward',
      label:     this.translate.instant('AFFAIRES.DETAIL.SIDEBAR.NEW_INVOICE'),
    };
  });

  /**
   * Les deux actions opérationnelles : mêmes options à l'icône et au libellé près, donc
   * même hauteur et même poids visuel. `size: 'sm'` contre le `lg` de l'action principale,
   * et `variant: 'secondary'` contre `primary` : l'écart de hiérarchie tient aux deux
   * échelons de la lib, sans style maison.
   *
   * `fullWidth` : la largeur vient de la cellule de grille, sinon deux libellés de
   * longueurs différentes donnent deux boutons de largeurs différentes sur la même ligne.
   */
  /**
   * Le bouton disait « Saisir du temps » avec une icône d'horloge, mais il appelle
   * `openTsForm()` et il est gardé par `FACT_CREATE_TS` : il crée un TRAVAIL
   * SUPPLÉMENTAIRE, pas une saisie de temps. Le libellé et l'icône disaient donc une
   * fonctionnalité qui n'existe pas sur cette fiche. Il reprend maintenant le libellé
   * déjà employé partout ailleurs pour la même action (`ACTIONS.NEW_TS`).
   */
  readonly tsButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'post_add',
      label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.NEW_TS'),
    };
  });

  /**
   * « Ajouter des frais ». Sans garde de permission : le panneau ouvert applique déjà les
   * siennes, et RMB n'étant plus un mode de facturation, l'action doit être proposée sur
   * toute affaire — pas seulement sur celles qui portaient ce mode.
   */
  readonly expenseButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return {
      variant:   'secondary',
      size:      'sm',
      fullWidth: true,
      iconStart: 'receipt_long',
      label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.EXPENSES_TITLE'),
    };
  });

  readonly validateBudgetOptions = computed<ButtonOptions>(() => ({
    variant:   'primary',
    size:      'sm',
    fullWidth: true,
    iconStart: 'verified',
    label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.VALIDATE_BUDGET'),
    loading:   this.budgetLoading(),
  }));

  /**
   * La pastille de statut de la rangée de pied. Même variante et même point coloré que la
   * pastille de l'en-tête de page : c'est le même statut, il ne peut pas se présenter de
   * deux façons sur la même page.
   */
  readonly statusChipOptions = computed<BadgeOptions>(() => ({
    variant: STATUT_BADGE_VARIANT[this.affaire()?.statut ?? ''] ?? 'neutral',
    size:    'sm',
    dot:     true,
  }));

  readonly statusChipLabel = computed(() => {
    this.translate.currentLang();
    const s = this.affaire()?.statut ?? '';
    return this.translate.instant(STATUT_LABELS[s] ?? s);
  });

  /** Aucune transition possible = rien à ouvrir : la rangée montre le statut sans être cliquable. */
  readonly canChangeStatus = computed(() => this.availableTransitions().length > 0);


  // ═══ Colonne identité ═════════════════════════════════════════════════════

  /**
   * La ligne discrète en regard du nom du client : entité propriétaire et devise.
   *
   * Ces deux données étaient deux cases de la grille 2 × N, au même poids visuel que le
   * budget ou le mode de facturation. Ce sont des données de CONTEXTE — on ne vient pas
   * les lire, on veut juste les avoir sous les yeux — d'où leur place en méta du client
   * plutôt qu'en ligne à part entière.
   */
  readonly clientMeta = computed(() =>
    `${this.entiteMere()} · ${this.affaireDevise()}`);

  /**
   * La période en UNE ligne compacte, mois abrégés : « 01 sept. 2026 → 28 févr. 2029 ».
   *
   * `formatDate` (mois en entier) donnait « 01 septembre 2026 — 28 février 2029 », qui
   * ne tient pas dans 300 px et se repliait sur deux lignes en cassant autour du tiret.
   */
  readonly periodLine = computed(() => {
    const a = this.affaire();
    if (!a) return '';
    return `${this.formatDateShort(a.dateDebut)} → ${this.formatDateShort(a.dateFin)}`;
  });

  /**
   * TOUS les responsables de l'affaire, une entrée par personne — le bloc « Managers »
   * de la carte d'informations.
   *
   * La fiche n'affichait que `responsableFullName`, la colonne de compatibilité qui ne
   * désigne que le responsable principal : une affaire à quatre responsables se lisait
   * comme une affaire à un seul, alors que `affaire_responsables` les porte tous.
   */
  readonly responsables = computed<ResponsableEntry[]>(() => {
    const a = this.affaire();
    if (!a) return [];

    const rows = a.responsables ?? [];
    // Affaire créée hors assistant (ou avant V18) : aucune ligne de jointure, mais un
    // responsable principal quand même — `distinctResponsables` gère ce repli.
    if (!rows.length) {
      return distinctResponsables(a).map(r => ({
        userId: r.userId, fullName: r.fullName, detail: '', budget: '',
      }));
    }

    const devise = this.affaireDevise();
    const byUser = new Map<number, { entry: ResponsableEntry; parts: Set<string>; total: number | null }>();

    for (const r of rows) {
      let acc = byUser.get(r.userId);
      if (!acc) {
        acc = {
          entry: { userId: r.userId, fullName: r.fullName, detail: '', budget: '' },
          parts: new Set<string>(),
          total: null,
        };
        byUser.set(r.userId, acc);
      }
      for (const part of [r.role, r.activiteLabel, r.disciplineLabel]) {
        if (part) acc.parts.add(part);
      }
      if (r.budgetAllocation != null) acc.total = (acc.total ?? 0) + r.budgetAllocation;
    }

    return [...byUser.values()].map(({ entry, parts, total }) => ({
      ...entry,
      detail: [...parts].join(' · '),
      budget: total != null ? this.currency.transform(total, devise) : '',
    }));
  });

  /**
   * L'entité PROPRIÉTAIRE réelle de l'affaire, résolue depuis `arxEntities` — remplace
   * l'ancien `ARX ${pays}` qui n'était qu'une concaténation de texte, sans aucune donnée
   * réelle derrière : n'importe quel pays d'affaire produisait un libellé plausible.
   *
   * Repli sur `paysList` (liste COMPLÈTE, non filtrée ARX) via `this.paysLabel()` quand
   * l'entité n'est pas dans `arxEntities` : même leçon que le correctif du sélecteur du
   * wizard (tâche précédente) — une affaire créée avant le filtrage ARX, ou dont le pays a
   * depuis été retiré du groupe, porte un `paysId` historique hors de ce sous-ensemble, et
   * doit quand même afficher son vrai libellé plutôt qu'un tiret.
   */
  readonly entiteMere = computed(() => {
    const a = this.affaire();
    if (!a) return '—';
    const lang = this.translate.currentLang();
    const entity = this.arxEntities().find(p => p.id === a.paysId);
    return entity ? paysLabel(entity, lang) : this.paysLabel();
  });

  // ═══ Entités vendeuses & entité propriétaire ═══════════════════════════════

  /** Entités ARX réelles (`/ref/pays/arx-entities`) — sert aux deux listes de choix
   *  ci-dessous (entités vendeuses, bascule de l'entité propriétaire). Ne pas s'en servir
   *  pour résoudre le libellé d'une affaire existante : voir `entiteMere`. */
  readonly arxEntities = signal<PaysRefDto[]>([]);

  readonly arxEntityOptions = computed<SelectOption[]>(() =>
    this.arxEntities().map(p => ({ value: String(p.id), label: `${p.isoCode} — ${p.frenchLabel}` })));

  /** Libellés affichés des entités vendeuses — `#id` de repli si une entité a disparu du
   *  référentiel ARX entre temps (ne devrait pas arriver, mais ne doit jamais effacer la
   *  ligne silencieusement). */
  readonly sellerEntityLabels = computed(() => {
    const a = this.affaire();
    if (!a) return [];
    const lang = this.translate.currentLang();
    const entities = this.arxEntities();
    return (a.sellerEntityIds ?? []).map(id => {
      const p = entities.find(e => e.id === id);
      return p ? paysLabel(p, lang) : `#${id}`;
    });
  });

  /**
   * Éditeur des entités vendeuses — ouvert à QUICONQUE peut modifier l'affaire
   * (`FACT_UPDATE_AFFAIRE`), sans verrou : contrairement à l'entité propriétaire, ce
   * champ n'a aucun impact sur la référence ni sur la numérotation, c'est une donnée de
   * reporting pure.
   */
  readonly sellerEntitiesDraft = signal<number[]>([]);

  openSellerEntitiesModal(): void {
    this.sellerEntitiesDraft.set([...(this.affaire()?.sellerEntityIds ?? [])]);
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.SELLER_ENTITIES_TITLE'),
      icon:  'corporate_fare',
      size:  'md',
      body:  this.sellerEntitiesTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitSellerEntities(ref),
        },
      ],
    });
  }

  onSellerEntitiesDraftChange(values: string[]): void {
    this.sellerEntitiesDraft.set(values.map(v => Number(v)).filter(n => !Number.isNaN(n)));
  }

  private submitSellerEntities(ref: { close: () => void }): void {
    const a = this.affaire();
    if (!a) return;
    this.modalError.set(null);
    this.svc.updateAffaire(a.id, { sellerEntityIds: this.sellerEntitiesDraft() }).subscribe({
      next:  updated => { this.affaire.set(updated); ref.close(); },
      error: err => this.modalError.set(
        err?.error?.detail ?? err?.error?.message
        ?? this.translate.instant('AFFAIRES.DETAIL.SELLER_ENTITIES.SAVE_ERROR')),
    });
  }

  /**
   * Bascule de l'entité PROPRIÉTAIRE — réservée à `FACT_SUPER_ADMIN` (garde côté
   * template ET côté serveur) : contrairement aux entités vendeuses, ce champ porte la
   * séquence de référence de l'affaire et son unicité `(référence, pays)`, d'où la garde
   * anti-collision que le serveur peut opposer et qu'il faut savoir afficher.
   */
  readonly ownerEntityDraft = signal<number | null>(null);

  openOwnerEntityModal(): void {
    this.ownerEntityDraft.set(this.affaire()?.paysId ?? null);
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.OWNER_ENTITY_TITLE'),
      icon:  'account_balance',
      size:  'md',
      body:  this.ownerEntityTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitOwnerEntity(ref),
        },
      ],
    });
  }

  onOwnerEntityDraftChange(values: string[]): void {
    this.ownerEntityDraft.set(values.length ? Number(values[0]) : null);
  }

  private submitOwnerEntity(ref: { close: () => void }): void {
    const a = this.affaire();
    const paysId = this.ownerEntityDraft();
    if (!a || !paysId) return;
    this.modalError.set(null);
    this.svc.changeOwnerEntity(a.id, paysId).subscribe({
      next:  updated => { this.affaire.set(updated); ref.close(); },
      error: err => this.modalError.set(
        err?.error?.detail ?? err?.error?.message
        ?? this.translate.instant('AFFAIRES.DETAIL.OWNER_ENTITY.SAVE_ERROR')),
    });
  }

  /**
   * Somme des `budget_allocation` de tous les responsables, ou `null` si aucun n'en porte.
   * Le serveur valide déjà que la somme ne dépasse pas `budget_previsionnel` ; l'afficher
   * rend visible la part encore non répartie.
   */
  readonly budgetAllocated = computed<number | null>(() => {
    const rows = this.affaire()?.responsables ?? [];
    const total = rows.reduce((s, r) => s + (r.budgetAllocation ?? 0), 0);
    return rows.some(r => r.budgetAllocation != null) ? total : null;
  });

  /**
   * Le bloc « Contrat » : des lignes clé/valeur sur DEUX colonnes, une par ligne.
   *
   * Ce qui a disparu : la grille `flex-wrap` à deux cases par ligne. Elle appariait des
   * données sans rapport — « Entité mère » avec « Devise », « Budget prévisionnel » avec
   * « Mode de facturation » — donc deux libellés et deux valeurs sur la même ligne, sans
   * qu'aucune colonne ne s'aligne d'une ligne à l'autre. Rien ne se balayait du regard.
   * Ici les libellés sont tous à gauche, les valeurs toutes à droite : une colonne de
   * questions, une colonne de réponses.
   *
   * L'ordre des trois premières lignes est fixe (budget, mode, validation) ;
   * les suivantes ne sont là que si elles portent une valeur — voir chaque garde.
   */
  readonly contratRows = computed<ContratRow[]>(() => {
    const a = this.affaire();
    if (!a) return [];

    const rows: ContratRow[] = [
      // Le budget prévisionnel n'était nulle part sur la fiche : la ligne « Budget validé »
      // disait s'il était approuvé sans jamais dire de combien, et les quatre tuiles du haut
      // montrent CA, RAF, marge et WIP — pas le budget dont elles se déduisent.
      { label: 'AFFAIRES.DETAIL.INFO.BUDGET', value: this.money(a.budgetPrevisionnel) },
    ];

    // Pas de « type d'engagement » : `typeAffaire` n'est jamais renseigné par l'assistant
    // (il retombe systématiquement sur FORFAIT côté service), la ligne affichait donc
    // toujours la même valeur juste à côté du mode de facturation, qui est la vraie
    // information contractuelle.
    rows.push({ label: 'AFFAIRES.DETAIL.INFO.BILLING_MODE', value: this.enumText('BILLING_MODE', a.billingMode) });

    // `ok` renseigné = ligne d'ÉTAT : le gabarit y met un point coloré devant le
    // Oui/Non. Le texte reste, le point ne fait que le doubler — un état porté par la
    // seule couleur ne se lit pas en niveaux de gris ni au lecteur d'écran.
    rows.push({
      label: 'AFFAIRES.DETAIL.INFO.BUDGET_VALIDATED',
      value: this.translate.instant(a.budgetValide
        ? 'AFFAIRES.DETAIL.INFO.YES' : 'AFFAIRES.DETAIL.INFO.NO'),
      ok:    !!a.budgetValide,
    });

    // La somme allouée aux responsables, seulement si elle est renseignée ET qu'elle ne
    // couvre pas déjà exactement le budget : sinon la ligne répète le budget ci-dessus.
    const allocated = this.budgetAllocated();
    if (allocated != null && allocated !== (a.budgetPrevisionnel ?? 0)) {
      rows.push({ label: 'AFFAIRES.DETAIL.INFO.BUDGET_ALLOCATED', value: this.money(allocated) });
    }
    if (a.doc360Ref) rows.push({ label: 'AFFAIRES.DETAIL.INFO.DOC360', value: a.doc360Ref });
    // La référence ERP est montrée MÊME vide, contrairement aux autres lignes optionnelles :
    // c'est la clé de rapprochement avec l'ERP, et son absence est justement ce qu'on vient
    // vérifier sur la fiche. Une ligne escamotée ne distingue pas « pas de référence » de
    // « je ne sais pas où elle s'affiche ».
    rows.push({ label: 'AFFAIRES.DETAIL.INFO.ERP_REF', value: a.erpReference || '—' });
    return rows;
  });

  /**
   * Les initiales d'une personne, pour la pastille d'avatar du bloc Managers : première
   * lettre du prénom et du nom, deux au plus. Un nom à rallonge (« Jean-Pierre de la
   * Fontaine ») ne doit pas produire cinq lettres dans un cercle de 26 px.
   */
  initials(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0];
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }


  /**
   * Les 5 indicateurs financiers du haut de la colonne droite, sur `daf-metric-card` :
   * **Backlog, WIP, Total facturé, Total encaissé, TS**, dans cet ordre — de l'engagement
   * restant jusqu'à l'argent réellement reçu, la rangée se lit de gauche à droite comme
   * le cycle de vie du budget.
   *
   * Toutes les classes de couleur sont des **littéraux complets** (§3) : assemblées à
   * l'exécution elles ne survivraient pas au scan Tailwind de l'app consommatrice.
   *
   * La part du budget encore au backlog passe par `delta` — `daf-metric-card` n'a pas de
   * slot pastille, et `delta` est exactement ça : une valeur secondaire à côté du chiffre.
   * `direction: 'neutral'` parce que c'est une part, pas une variation.
   *
   * **`help` sur chacune** (lib 4.20.0) : une phrase, révélée au survol de la tuile —
   * sans icône ni bouton, la tuile est identique tant qu'on ne la survole pas. Une
   * INFOBULLE, pas de la documentation : elle dit ce que le chiffre représente, pas
   * comment il est calculé. Les règles de calcul complètes, leurs cas limites et leurs
   * pièges restent dans le bloc « D'où viennent les chiffres de la page » ci-dessous, à
   * destination de qui lit le code — les y laisser évite d'imposer un pavé à qui survole
   * simplement une carte.
   *
   * `helpPlacement` reste au défaut (`bottom`) : la rangée est en haut de la colonne, un
   * panneau au-dessus sortirait de l'écran.
   *
   * ⚠️ Le survol est une annotation, pas un contrôle : rien d'actionnable ni
   * d'indispensable ne va dedans, un écran tactile ne le lira pas.
   */
  readonly kpiTiles = computed<KpiTile[]>(() => {
    // `help` est résolu ICI et non par le pipe du template : sans cette lecture, changer
    // de langue laisserait les popovers dans l'ancienne. `label` reste une clé, il passe
    // par `| translate` dans le template.
    this.translate.currentLang();
    const k = this.kpis();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        label: 'AFFAIRES.DETAIL.KPI.BACKLOG',
        value: this.money(k?.backlog),
        // Même pastille que le RAF portait : la part encore disponible du budget. Le
        // dénominateur reste `budgetTotal()` (prévisionnel seul), donc la pastille et la
        // valeur mesurent bien la même enveloppe.
        delta: this.budgetTotal() > 0 && k
          ? { value: `${Math.round((k.backlog / this.budgetTotal()) * 100)}%`, direction: 'neutral' as const }
          : null,
        options: { icon: 'inventory_2', iconColor: 'text-teal', iconBg: 'bg-teal/10',
                   valueColor: 'text-primary',
                   help: t('AFFAIRES.DETAIL.KPI.BACKLOG_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.WIP',
        value: this.money(k?.wip),
        delta: null,
        options: { icon: 'pending_actions', iconColor: 'text-warning', iconBg: 'bg-warning/10',
                   help: t('AFFAIRES.DETAIL.KPI.WIP_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.INVOICED',
        value: this.money(k?.totalFacture),
        delta: null,
        options: { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10',
                   help: t('AFFAIRES.DETAIL.KPI.INVOICED_HELP') },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.CA',
        // `totalEncaisse` (factures au statut Encaissé) et NON `ca` (somme des règlements
        // reçus) : règle de gestion « Encaissé = somme des montants facturés dont le statut
        // est Encaissé ». `ca` reste servi par l'API et continue d'alimenter la marge et la
        // jauge « Santé du projet » plus bas — les deux divergent sur une facture
        // partiellement réglée, d'où deux champs distincts plutôt qu'une redéfinition.
        value: this.money(k?.totalEncaisse),
        delta: null,
        options: { icon: 'account_balance_wallet', iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
                   valueColor: 'text-secondary',
                   help: t('AFFAIRES.DETAIL.KPI.CA_HELP') },
      },
      {
        label: 'AFFAIRES.WIP.KPI_TS',
        value: this.money(this.raf()?.montantTsIntegres),
        delta: null,
        options: { icon: 'schedule', iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
                   help: t('AFFAIRES.WIP.KPI_TS_HELP') },
      },
    ];
  });

  readonly traceFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(a.createdAt) },
    ];
    if (a.updatedAt) {
      fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.LAST_MODIFIED', value: this.formatDate(a.updatedAt) });
    }
    fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.RAF_THRESHOLD', value: `${a.rafAlerteSeuilPct}%` });
    return fields;
  });

  /**
   * Les personnes rattachées à l'affaire — TOUS les responsables, pas seulement le
   * principal. La pile n'en montrait qu'un parce qu'elle lisait `responsableFullName` ;
   * elle lit maintenant `responsables()`, et `daf-avatar-group` gère le « +N » au-delà
   * de quatre.
   *
   * `AvatarData` directement : `daf-avatar` dérive les initiales (`deriveInitials`, la même
   * fonction que la cellule avatar de `daf-data-table`, donc une personne s'affiche pareil
   * dans un tableau et sur une carte) et retombe dessus tout seul si l'image échoue — ce
   * qui arrive souvent, `photo_url` étant renseigné sur des profils dont le fichier manque
   * du stockage. C'est ce qui a remplacé le handler `onAvatarError` local.
   */
  readonly team = computed<AvatarData[]>(() =>
    this.responsables().map(r => ({
      name:      r.fullName,
      avatarUrl: this.avatarSvc.photoUrl(this.avatars().get(r.userId)),
      // Un seul libellé de repli : « Principal » / « Responsable » distinguait deux rangs
      // qui n'existent plus.
      subtitle:  r.detail || this.translate.instant('AFFAIRES.DETAIL.INFO.MANAGER'),
    })),
  );

  /** Tous les noms de l'équipe — la tuile n'en montrait qu'un, la pile en compte N. */
  readonly teamNames = computed(() => this.team().map(m => m.name).join(', '));

  /** Les user ids dont on veut la photo : toute l'équipe, résolue en un seul appel groupé. */
  private teamUserIds(a: AffaireDetail): number[] {
    const ids = distinctResponsables(a).map(r => r.userId).filter(id => id > 0);
    return ids.length ? ids : (a.responsableUserId ? [a.responsableUserId] : []);
  }

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // D'où viennent les chiffres de la page
  //
  // Deux endpoints seulement alimentent tous les indicateurs, et AUCUN pourcentage
  // n'est calculé côté serveur — ils sont tous dérivés ici, ce qui est la raison
  // d'être de ce bloc.
  //
  //   GET /affaires/{id}/raf   → RafDetailsDto  : budgetPrevisionnel, totalFacturesEmises,
  //                                              montantTsIntegres, rafDisponible
  //   GET /affaires/{id}/kpis  → AffaireKpisDto : backlog, wip, totalFacture, ca,
  //                                              margeBrutePct
  //
  //   budgetPrevisionnel = raf.budgetPrevisionnel, sinon affaire.budgetPrevisionnel
  //                        (le RAF arrive après l'affaire : sans ce repli les tuiles
  //                        affichent 0 % pendant un instant au chargement)
  //   budgetTotal        = budgetPrevisionnel SEUL — le dénominateur de tous les taux.
  //                        Les TS intégrés n'y entrent PAS : un TS est vendu en plus du
  //                        contrat, les taux se mesurent sur l'engagement initial.
  //                        Budget 100, TS 20, facturé 60 → 60 %.
  //                        Corollaire : le serveur calcule RAF = budget + TS − facturé,
  //                        donc facturé + RAF ≠ budgetTotal dès qu'il y a des TS, et
  //                        rafAvailablePct peut dépasser 100 %.
  //   billingPct         = totalFacturesEmises / budgetTotal × 100   « taux de facturation »
  //   collectedPct       = kpis.ca / budgetTotal × 100               « santé du projet »
  //   tsIntegratedPct    = montantTsIntegres / budgetTotal × 100
  //   rafAvailablePct    = rafDisponible / budgetTotal × 100         (pastille RAF)
  //   healthState        = seuils sur billingPct, comparés au **seuil propre à
  //                        l'affaire** (rafAlerteSeuilPct) : < seuil = Optimale,
  //                        ≥ seuil = Vigilance, ≥ 100 % = Critique
  //   rafAlertActive     = billingPct ≥ rafAlerteSeuilPct (même règle, pour l'encart)
  //   budgetOverrun      = rafDisponible < 0, c'est-à-dire facturé > enveloppe
  //
  //   ⚠️ Les deux taux vont dans des SENS OPPOSÉS et n'ont donc pas la même échelle
  //   de couleur — c'est tout le sujet du bug « couleurs inversées » :
  //     · facturation : consommer le budget est neutre jusqu'à 100 %, la DÉPASSER
  //       est l'accident → échelle de risque (`healthState`), rouge au-delà de 100 % ;
  //     · encaissement : plus haut = mieux → rampe rouge → vert du composant `daf-gauge`.
  //   Faire porter `healthState` aux deux, ce que la page faisait, peignait la bonne
  //   nouvelle en rouge.
  //
  //   Il n'y a plus de « taux de consommation » : l'ancien valait
  //   (budget − RAF) / budget = (facturé − TS) / budget, donc un TS intégré le FAISAIT
  //   BAISSER sans que rien ne soit défacturé. Consommer le budget, ici, c'est la
  //   facturer — un TS l'agrandit, il n'en consomme rien.
  //
  //   Les cinq tuiles du haut sont, dans l'ordre : Backlog, WIP, Total facturé, Total
  //   encaissé, TS. Les quatre premières sont prises **telles quelles** dans les KPIs du
  //   backend, la page ne les recalcule pas (seule la pastille % du Backlog est dérivée
  //   ici) ; la cinquième vient du RAF. À savoir :
  //   Les trois premières se calculent toutes sur le MÊME « facturé », `totalFacture` :
  //     · totalFacture  = SUM(factures) dont le statut n'est PAS 'PAID' — à la lettre,
  //                       donc DRAFT et CANCELLED y entrent aussi.
  //     · backlog       = budgetPrevisionnel − totalFacture + TS non facturé.
  //     · wip           = somme des WIP déclarés (tous statuts) − totalFacture
  //                       + TS non facturé : le constaté pas encore passé en facture.
  //                       Le terme hors-TS est négatif quand on a facturé plus que ce
  //                       que l'onglet WIP a déclaré.
  //     · totalEncaisse = SUM(factures) au statut 'PAID' — complément exact de
  //                       totalFacture, donc totalFacture + totalEncaisse = tout le facturé.
  //   Un chiffre lu sur une tuile se retrouve donc tel quel dans le calcul des deux
  //   autres : budget + TS non facturé = backlog + totalFacture (le TS non facturé
  //   abonde les DEUX tuiles Backlog et WIP, règle du 2026-10-13 — les TS se vendent en
  //   plus du contrat, au même titre que le budget, donc le travail TS déjà validé mais
  //   pas encore en facture doit apparaître dans les deux). La tuile WIP se lit donc à
  //   partir de la tuile « Total facturé » affichée juste à côté, plus ce même terme TS.
  //
  //   ⚠️ Le sens de la soustraction du WIP a été inversé le 21/09 (il valait
  //   totalFacture − WIP du 18 au 21) : une capture d'écran de cette période se lit à
  //   l'opposé de ce que la page affiche aujourd'hui.
  //
  //   ⚠️ `ca` (SUM(payments.amount_local)) n'est PLUS la tuile « Total encaissé » — celle-ci
  //   lit `totalEncaisse`, les factures au statut Encaissé. `ca` reste servi par l'API et
  //   alimente toujours la marge et la jauge « Santé du projet » ci-dessous. Les deux
  //   divergent dès qu'une facture est partiellement réglée : un acompte entre dans `ca`,
  //   mais sa facture reste PARTIALLY_PAID donc dans `totalFacture`, pas dans
  //   `totalEncaisse`.
  //
  //   margeBrutePct et rafDisponible ne sont plus sur la rangée mais restent servis par
  //   les mêmes endpoints, et le RAF alimente toujours les anneaux du bas de page.
  //     · margeBrutePct = (ca − sous-traitance) / ca × 100, donc un % du CA et non du
  //       budget, nul dès que ca vaut 0 ; les coûts internes sont un placeholder à 0
  //       (pas de timesheet), la marge est donc surévaluée tant qu'ils manquent.
  //
  //   Graphique de facturation : DEUX NIVEAUX, voir la section « Facturation » plus bas.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Le budget prévisionnel — la valeur initiale saisie sur l'affaire. */
  readonly budgetPrevisionnel = computed(() =>
    this.raf()?.budgetPrevisionnel ?? this.affaire()?.budgetPrevisionnel ?? 0);

  /**
   * Le dénominateur de tous les taux de la page : le **budget prévisionnel SEUL**.
   *
   * Les TS intégrés n'entrent PAS dans le budget. Un TS est un travail supplémentaire
   * vendu en plus du contrat initial ; le taux de facturation mesure ce qui est facturé
   * par rapport à l'engagement d'origine, pas par rapport à une enveloppe qui grandit à
   * chaque avenant. Budget 100, TS 20, facturé 60 → 60 %, et non 60/120 = 50 %.
   *
   * ⚠️ Conséquence assumée : `rafDisponible` (serveur) vaut budget + TS − facturé, donc
   * `facturé + RAF` dépasse le dénominateur du montant des TS. Les barres du panneau RAF
   * ne se réconcilient pas à 100 %, et `rafAvailablePct` peut passer au-dessus de 100 %
   * quand l'affaire porte des TS non encore facturés. C'est le prix de la règle : le RAF
   * raisonne sur l'enveloppe réellement facturable, les taux sur le budget initial.
   */
  readonly budgetTotal = computed(() => this.budgetPrevisionnel());

  /** Taux de facturation : ce qui est facturé sur le budget prévisionnel. */
  readonly billingPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.totalFacturesEmises ?? 0) / b) * 100 : 0;
  });

  /** Encaissé réel — `kpis.ca`, la somme des paiements reçus. */
  readonly collectedAmount = computed(() => this.kpis()?.ca ?? 0);

  /** Santé du projet : encaissé / budget total. Plus c'est haut, mieux c'est. */
  readonly collectedPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? (this.collectedAmount() / b) * 100 : 0;
  });

  readonly tsIntegratedPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.montantTsIntegres ?? 0) / b) * 100 : 0;
  });

  readonly rafAvailablePct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.rafDisponible ?? 0) / b) * 100 : 0;
  });

  readonly rafAlertActive = computed(() => {
    const a = this.affaire();
    return !!a && this.budgetTotal() > 0 && this.billingPct() >= a.rafAlerteSeuilPct;
  });

  /**
   * Dépassement de budget : le RAF est passé négatif, donc l'affaire a facturé plus que
   * son enveloppe.
   *
   * Sur `rafDisponible < 0` et non sur un pourcentage : c'est le chiffre du serveur, donc
   * le bandeau ne peut pas contredire la tuile RAF, et il n'y a pas de division par zéro
   * à traiter. C'est le second niveau d'alerte, au-dessus de `rafAlertActive` (le seuil de
   * vigilance paramétré sur l'affaire) — et le seul à sortir du drawer pour s'afficher sur
   * la page, parce qu'un dépassement ne doit pas attendre qu'on ouvre un panneau.
   */
  readonly budgetOverrun = computed(() => (this.raf()?.rafDisponible ?? 0) < 0);

  /** Le montant du dépassement, positif. 0 quand il n'y a pas de dépassement. */
  readonly overrunAmount = computed(() => Math.max(0, -(this.raf()?.rafDisponible ?? 0)));

  /**
   * L'état de RISQUE de l'affaire : où en est la facturation par rapport au seuil d'alerte
   * paramétré sur l'affaire. Échelle « plus haut = pire » — elle habille la facturation et
   * la pastille d'en-tête, **jamais** l'encaissement.
   */
  readonly healthState = computed<{ variant: 'success' | 'warning' | 'danger' | 'neutral'; labelKey: string }>(() => {
    const a = this.affaire();
    if (!a || this.budgetTotal() <= 0) {
      return { variant: 'neutral', labelKey: 'AFFAIRES.DETAIL.HEALTH.UNKNOWN' };
    }
    const pct = this.billingPct();
    if (pct > 100)                  return { variant: 'danger',  labelKey: 'AFFAIRES.DETAIL.HEALTH.CRITICAL' };
    if (pct >= a.rafAlerteSeuilPct) return { variant: 'warning', labelKey: 'AFFAIRES.DETAIL.HEALTH.WATCH' };
    return { variant: 'success', labelKey: 'AFFAIRES.DETAIL.HEALTH.OPTIMAL' };
  });

  /** Pastille de la tuile « Santé du projet ». */
  readonly healthBadge = computed<PageHeaderBadge>(() => {
    const h = this.healthState();
    return { label: this.translate.instant(h.labelKey), variant: h.variant, size: 'sm' };
  });

  /**
   * L'anneau de la tuile « Santé du projet » — il affiche `collectedPct`, l'encaissé.
   *
   * **`ramp: true`** : la rampe du composant va du rouge (0) à l'ambre (50) au vert (100),
   * ce qui est exactement le sens de l'encaissement — n'avoir rien encaissé est mauvais,
   * avoir tout encaissé est l'objectif. C'est le correctif du bug de couleurs : l'anneau
   * prenait sa teinte de `healthState`, une échelle de risque « plus haut = pire », donc
   * une affaire intégralement encaissée s'affichait en rouge. `healthState` reste la
   * **pastille** à côté du titre, où « plus haut = pire » est le bon sens.
   *
   * Enveloppe absente (budget à 0) : pas de rampe, sinon un anneau à 0 % s'afficherait en
   * rouge alors que le taux n'est pas calculable — la pastille dit déjà « Indéterminée ».
   *
   * **Valeur seule au centre** : pas de `sublabel`, l'en-tête de la tuile dit de quoi il
   * s'agit. `ariaLabel` porte le sens pour les lecteurs d'écran.
   */
  readonly healthGaugeOptions = computed<GaugeOptions>(() => {
    const known = this.budgetTotal() > 0;
    return {
      size:      '116px',
      thickness: 10,
      ramp:      known,
      variant:   known ? undefined : 'primary',
      ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.HEALTH_TITLE')} : `
               + `${Math.round(this.collectedPct())}% — `
               + `${this.money(this.collectedAmount())} / ${this.money(this.budgetTotal())}`,
    };
  });

  // ── Barres de progression ────────────────────────────────────────────────
  readonly alertBarOptions: ProgressBarOptions = { variant: 'warning',   size: 'xs', showLabel: false, showPercent: false };

  /** Barre de la carte d'identité : le % est déjà affiché en gros au-dessus. */
  readonly identityBarOptions = computed<ProgressBarOptions>(() => ({
    ...this.billingBarOptions(), showLabel: false, showPercent: false,
  }));

  /**
   * La barre du taux de facturation — échelle de risque, `> 100` seul en rouge (facturer
   * pile son budget est l'objectif atteint). Le seuil de vigilance de l'affaire passe
   * par `healthState`, qui tient compte de `rafAlerteSeuilPct`.
   *
   * C'est cette barre que porte la tuile « Taux de facturation », à la place de l'ancienne
   * `consumptionBarOptions` qui prenait sa couleur telle quelle de `healthState` : une
   * affaire à 0 % facturé y sortait en vert vif et une affaire bien avancée en rouge.
   */
  readonly billingBarOptions = computed<ProgressBarOptions>(() => {
    const v = this.healthState().variant;
    return {
      variant: v === 'danger' ? 'danger' : v === 'warning' ? 'warning' : 'tertiary',
      size:    'sm',
    };
  });

  // ── Graphiques : facturation, WIP, paiements ─────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════
  // TROIS graphiques à barres dans UN carrousel, sous UN jeu de filtres
  //
  //   Facturation : le graphique d'origine, inchangé dans ses données — TTC de toutes les
  //                 factures émises de l'affaire, à leur date d'émission. Sa ligne
  //                 pointillée reste l'objectif « budget réparti sur la durée ».
  //   WIP         : le WIP déclaré, empilé par statut (facturé / en attente / refusé).
  //   Paiements   : les règlements reçus, par date de paiement.
  //
  // Les trois sont servis par `GET /affaires/{id}/charts` (AffaireChartService), agrégés
  // côté serveur. WIP et paiements reprennent EXACTEMENT les définitions des tuiles : sur
  // toute l'étendue avec les TS, la somme des barres WIP = la tuile WIP, et la somme des
  // paiements = `kpis.ca`.
  //
  // Un carrousel et non trois cartes : les trois graphiques partagent la même fenêtre de
  // temps, on passe de l'un à l'autre sans perdre ses repères (même axe, mêmes filtres,
  // même place à l'écran). Le (i) de la carte suit la diapositive affichée — chaque
  // graphique a sa propre règle de calcul.
  //
  // Les filtres passent par `daf-filter` (le bouton « Filtres » et son panneau, comme les
  // tableaux de la fiche) et s'affichent en puces sous l'en-tête. Ils vivent aussi dans
  // l'URL (`cp`, `cf`, `ct`, `cg`, `cv`, `cs`, `cts`, et `cc` pour la diapositive) : une vue
  // filtrée se partage et survit au rechargement.
  //
  //   Période     : année en cours (défaut), toute l'affaire, 12 derniers mois, une année,
  //                 ou une plage de dates (qui l'emporte). Le serveur coupe la plage à
  //                 l'étendue de l'affaire — un préréglage ne connaît pas ses dates.
  //   Granularité : mois (défaut), trimestre, année.
  //   Vue         : par période (défaut), ou cumulé — le cumul part de l'origine de
  //                 l'affaire (`opening*`), pas du début de la plage, et se lit contre le budget.
  //   Statuts WIP : lesquels empiler (vide = les trois). Retirés, ils sortent aussi du total.
  //   Exclure TS  : retire le WIP des TS.
  //
  // Chaque défaut vaut « vide » dans le panneau : un graphique non filtré n'affiche aucune
  // puce, et chaque puce dit exactement ce qui s'écarte de la vue de base.
  // ═══════════════════════════════════════════════════════════════════════════

  private readonly chartQueryParams = this.route.snapshot.queryParamMap;

  readonly chartPeriod      = signal<string>(this.chartQueryParams.get('cp') ?? DEFAULT_CHART_PERIOD);
  readonly chartCustomFrom  = signal<string | null>(this.chartQueryParams.get('cf'));
  readonly chartCustomTo    = signal<string | null>(this.chartQueryParams.get('ct'));
  readonly chartGranularity = signal<ChartGranularity>(asGranularity(this.chartQueryParams.get('cg')));
  readonly chartView        = signal<'PERIOD' | 'CUMUL'>(
    this.chartQueryParams.get('cv') === 'CUMUL' ? 'CUMUL' : 'PERIOD');
  readonly chartStatuses    = signal<ChartWipStatus[]>(asStatuses(this.chartQueryParams.get('cs')));
  readonly chartIncludeTs   = signal(this.chartQueryParams.get('cts') !== '0');
  readonly chartSlide       = signal<ChartSlideId>(asSlide(this.chartQueryParams.get('cc')));

  readonly charts          = signal<AffaireChartsDto | null>(null);
  readonly chartsLoading   = signal(false);
  readonly chartsError     = signal(false);
  /** Numéro de la dernière requête : une réponse plus ancienne arrivée après est ignorée. */
  private chartsRequestId = 0;
  /**
   * Le repli du défaut ne joue qu'au premier chargement, et seulement si l'URL n'imposait
   * pas de période : ensuite, une plage vide est un choix de l'utilisateur, à respecter.
   */
  private chartsDefaultFallbackPending = !this.chartQueryParams.has('cp');

  /** Plage `yyyy-MM` du préréglage choisi ; null = borne de l'étendue (le serveur coupe). */
  readonly chartRange = computed<{ from: string | null; to: string | null }>(() => {
    const p   = this.chartPeriod();
    const now = new Date();
    switch (p) {
      case 'ALL': return { from: null, to: null };
      case 'YTD': return { from: `${now.getFullYear()}-01`, to: `${now.getFullYear()}-12` };
      case 'L12': return { from: toYearMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
                           to:   toYearMonth(now) };
      case 'CUSTOM': {
        const f = this.chartCustomFrom(), t = this.chartCustomTo();
        return f && t && f > t ? { from: t, to: f } : { from: f, to: t };
      }
      default:
        return /^Y\d{4}$/.test(p) ? { from: `${p.slice(1)}-01`, to: `${p.slice(1)}-12` } : { from: null, to: null };
    }
  });

  private readonly chartsQuery = computed<AffaireChartsQuery>(() => ({
    ...this.chartRange(),
    granularity: this.chartGranularity(),
    includeTs:   this.chartIncludeTs(),
  }));

  /** Recharge à chaque changement de filtre, et quand l'affaire (ses dates) change. */
  private readonly chartsLoader = effect(() => {
    const q = this.chartsQuery();
    if (!this.affaire()) return;
    untracked(() => this.loadCharts(q));
  });

  /**
   * Filtres → URL. Seules les valeurs qui s'écartent du défaut sont écrites, et rien ne
   * part si l'URL porte déjà ces valeurs : au premier passage (filtres lus depuis l'URL)
   * aucune navigation n'est lancée, donc rien ne vient croiser celle de `tabParam`.
   */
  private readonly chartsUrlSync = effect(() => {
    const period = this.chartPeriod(), statuses = this.chartStatuses();
    const params: Record<string, string | null> = {
      cp:  period === DEFAULT_CHART_PERIOD ? null : period,
      cf:  period === 'CUSTOM' ? this.chartCustomFrom() : null,
      ct:  period === 'CUSTOM' ? this.chartCustomTo()   : null,
      cg:  this.chartGranularity() === 'MONTH' ? null : this.chartGranularity(),
      cv:  this.chartView() === 'PERIOD' ? null : this.chartView(),
      cs:  statuses.length === WIP_STATUS_ORDER.length ? null : statuses.join(','),
      cts: this.chartIncludeTs() ? null : '0',
      cc:  this.chartSlide() === CHART_SLIDES[0] ? null : this.chartSlide(),
    };
    untracked(() => {
      const current = this.route.snapshot.queryParamMap;
      if (Object.entries(params).every(([k, v]) => current.get(k) === v)) return;
      this.router.navigate([], {
        relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true,
      });
    });
  });

  loadCharts(q: AffaireChartsQuery = this.chartsQuery()): void {
    const id = ++this.chartsRequestId;
    this.chartsLoading.set(true);
    this.chartsError.set(false);
    this.svc.getAffaireCharts(this.numId, q).subscribe({
      next: c => {
        if (id !== this.chartsRequestId) return;
        // Défaut « année en cours » sur une affaire close avant cette année : rien à
        // montrer. On ouvre plutôt sa dernière année — la puce « Année N » dit pourquoi.
        if (this.chartsDefaultFallbackPending) {
          this.chartsDefaultFallbackPending = false;
          const lastYear = Number(c.dataTo.slice(0, 4));
          if (!c.buckets.length && lastYear < new Date().getFullYear()) {
            this.chartPeriod.set(`Y${lastYear}`);
            return;
          }
        }
        this.charts.set(c);
        this.chartsLoading.set(false);
      },
      error: () => {
        if (id !== this.chartsRequestId) return;
        this.chartsError.set(true);
        this.chartsLoading.set(false);
      },
    });
  }

  // ── Filtres (daf-filter) ──────────────────────────────────────────────────

  readonly chartFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: object) => this.translate.instant('AFFAIRES.DETAIL.CHARTS.' + k, p);
    const c = this.charts();
    const years: FilterOption[] = [];
    if (c) {
      const current = new Date().getFullYear();
      for (let y = Number(c.dataTo.slice(0, 4)); y >= Number(c.dataFrom.slice(0, 4)); y--) {
        // L'année en cours est déjà le défaut (« Année en cours ») : pas de doublon.
        if (y !== current) years.push({ value: `Y${y}`, label: t('PERIOD_YEAR', { year: y }) });
      }
    }
    return [
      { name: 'period', label: t('PERIOD'), type: 'select', placeholder: t('PERIOD_YTD'),
        options: [{ value: 'ALL', label: t('PERIOD_ALL') }, { value: 'L12', label: t('PERIOD_L12') }, ...years] },
      { name: 'range', label: t('RANGE'), type: 'daterange', hint: t('RANGE_HINT') },
      { name: 'granularity', label: t('GRANULARITY'), type: 'select', placeholder: t('GRAN_MONTH'),
        options: [{ value: 'QUARTER', label: t('GRAN_QUARTER') }, { value: 'YEAR', label: t('GRAN_YEAR') }] },
      { name: 'view', label: t('VIEW'), type: 'select', placeholder: t('VIEW_PERIOD'),
        options: [{ value: 'CUMUL', label: t('VIEW_CUMUL') }] },
      { name: 'statuses', label: t('WIP_STATUSES'), type: 'multiselect', placeholder: t('STATUS_ALL'),
        options: WIP_STATUS_ORDER.map(s => ({ value: s, label: this.wipStatusLabel(s) })) },
      { name: 'excludeTs', label: t('EXCLUDE_TS'), type: 'checkbox' },
    ];
  });

  /**
   * L'état appliqué, dans la forme du panneau. Chaque défaut y est « vide » — période
   * toute l'affaire, mois, par période, tous les statuts, TS inclus — pour que ni le
   * bouton ni les puces ne comptent un filtre que personne n'a posé.
   */
  readonly chartFilterValue = computed<FilterResult>(() => {
    const period = this.chartPeriod(), from = this.chartCustomFrom(), to = this.chartCustomTo();
    const statuses = this.chartStatuses();
    return {
      period:      period === DEFAULT_CHART_PERIOD || period === 'CUSTOM' ? null : period,
      range:       period === 'CUSTOM' && from ? [monthStart(from), monthEnd(to ?? from)] : null,
      granularity: this.chartGranularity() === 'MONTH' ? null : this.chartGranularity(),
      view:        this.chartView() === 'PERIOD' ? null : this.chartView(),
      statuses:    statuses.length === WIP_STATUS_ORDER.length ? [] : [...statuses],
      excludeTs:   !this.chartIncludeTs(),
    };
  });

  readonly chartFiltersActive = computed(() =>
    countActiveFilters(this.chartFilterFields(), this.chartFilterValue()) > 0);

  readonly chartFilterConfig = computed(() => ({
    ...this.filterConfig(),
    title: this.translate.instant('AFFAIRES.DETAIL.CHARTS.FILTERS_TITLE'),
  }));

  /** Une plage de dates l'emporte sur le préréglage : elle est la demande la plus précise. */
  onChartFilterApply(r: FilterResult): void {
    const range = this.asDateRange(r, 'range');
    if (range) {
      this.chartPeriod.set('CUSTOM');
      this.chartCustomFrom.set(toYearMonth(range[0]));
      this.chartCustomTo.set(toYearMonth(range[range.length - 1]));
    } else {
      this.chartPeriod.set(this.asFilterValue(r, 'period') || DEFAULT_CHART_PERIOD);
      this.chartCustomFrom.set(null);
      this.chartCustomTo.set(null);
    }
    this.chartGranularity.set(asGranularity(this.asFilterValue(r, 'granularity') || null));
    this.chartView.set(this.asFilterValue(r, 'view') === 'CUMUL' ? 'CUMUL' : 'PERIOD');
    const statuses = r['statuses'];
    this.chartStatuses.set(asStatuses(Array.isArray(statuses) ? (statuses as string[]).join(',') : null));
    this.chartIncludeTs.set(r['excludeTs'] !== true);
  }

  /** Le × d'une puce : ce seul filtre revient à son défaut. */
  onChartFilterRemove(name: string): void {
    switch (name) {
      case 'period':
      case 'range':
        this.chartPeriod.set(DEFAULT_CHART_PERIOD);
        this.chartCustomFrom.set(null);
        this.chartCustomTo.set(null);
        break;
      case 'granularity': this.chartGranularity.set('MONTH'); break;
      case 'view':        this.chartView.set('PERIOD'); break;
      case 'statuses':    this.chartStatuses.set([...WIP_STATUS_ORDER]); break;
      case 'excludeTs':   this.chartIncludeTs.set(true); break;
    }
  }

  resetChartFilters(): void {
    this.chartPeriod.set(DEFAULT_CHART_PERIOD);
    this.chartCustomFrom.set(null);
    this.chartCustomTo.set(null);
    this.chartGranularity.set('MONTH');
    this.chartView.set('PERIOD');
    this.chartStatuses.set([...WIP_STATUS_ORDER]);
    this.chartIncludeTs.set(true);
  }

  // ── Carrousel ─────────────────────────────────────────────────────────────

  readonly chartSlideIndex = computed(() => CHART_SLIDES.indexOf(this.chartSlide()));

  readonly chartSlideChips = computed<ChipOption[]>(() => {
    this.translate.currentLang();
    return CHART_SLIDES.map(id => ({ value: id, label: this.translate.instant('AFFAIRES.DETAIL.CHARTS.SLIDE_' + id) }));
  });

  readonly chartSlideChipConfig: ChipGroupConfig = { multiple: false };

  /** Sens du dernier déplacement (1 = vers la droite, -1 = vers la gauche) : celui de l'animation. */
  readonly chartSlideDirection = signal<1 | -1>(1);

  /**
   * La seule diapositive rendue, dans un tableau d'un élément : le @for du gabarit la suit
   * par son id, donc l'élément est recréé à chaque changement et son animation d'entrée
   * rejoue — sans piste à faire glisser ni diapositives cachées à neutraliser.
   */
  readonly activeChartSlides = computed(() => [this.chartSlides()[this.chartSlideIndex()]]);

  /** Puces à choix unique : décocher la puce active renvoie [] — on reste alors où l'on est. */
  selectChartSlide(selection: string[]): void {
    const next = selection[0];
    if (!isSlide(next) || next === this.chartSlide()) return;
    this.chartSlideDirection.set(CHART_SLIDES.indexOf(next) > this.chartSlideIndex() ? 1 : -1);
    this.chartSlide.set(next);
  }

  /** Bouclé : après Paiements vient Facturation — trois diapositives, pas de fin de course. */
  stepChartSlide(delta: number): void {
    const n = CHART_SLIDES.length;
    this.chartSlideDirection.set(delta < 0 ? -1 : 1);
    this.chartSlide.set(CHART_SLIDES[(this.chartSlideIndex() + delta + n) % n]);
  }

  /** Flèches gauche / droite quand le focus est dans le carrousel (hors champ de saisie). */
  onChartCarouselKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [role="listbox"], [role="dialog"]')) return;
    if (event.key === 'ArrowLeft')  { this.stepChartSlide(-1); event.preventDefault(); }
    if (event.key === 'ArrowRight') { this.stepChartSlide(1);  event.preventDefault(); }
  }

  /** Balayage au doigt : 50 px horizontaux, et plus horizontal que vertical (pas un défilement). */
  private chartSwipeStart: { x: number; y: number } | null = null;

  onChartPointerDown(event: PointerEvent): void {
    this.chartSwipeStart = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
  }

  onChartPointerUp(event: PointerEvent): void {
    const start = this.chartSwipeStart;
    this.chartSwipeStart = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.stepChartSlide(dx < 0 ? 1 : -1);
  }

  readonly chartPrevOptions = computed<ButtonOptions>(() => ({
    variant: 'ghost', size: 'sm', iconStart: 'chevron_left',
    title: this.translate.instant('AFFAIRES.DETAIL.CHARTS.PREV'),
  }));

  readonly chartNextOptions = computed<ButtonOptions>(() => ({
    variant: 'ghost', size: 'sm', iconStart: 'chevron_right',
    title: this.translate.instant('AFFAIRES.DETAIL.CHARTS.NEXT'),
  }));

  /** Le (i) de la carte suit la diapositive : chaque graphique a sa règle de calcul. */
  readonly chartSlideHelp = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('AFFAIRES.DETAIL.CHARTS.HELP_' + this.chartSlide());
  });

  // ── Séries ────────────────────────────────────────────────────────────────

  /** Le WIP d'une période sur les seuls statuts cochés. */
  private wipOf(w: ChartWipAmounts): number {
    const s = this.chartStatuses();
    return (s.includes('PENDING')  ? w.pending  : 0)
         + (s.includes('INVOICED') ? w.invoiced : 0)
         + (s.includes('REJECTED') ? w.rejected : 0);
  }

  /**
   * Les montants affichés par période : tels quels, ou cumulés depuis l'origine de
   * l'affaire (ouverture + périodes précédentes) en vue « cumulé ». Une seule passe, qui
   * sert les trois graphiques, leurs pastilles et leurs totaux.
   */
  private readonly chartSeries = computed(() => {
    const c = this.charts();
    if (!c) return [];
    const cumul = this.chartView() === 'CUMUL';
    const run = { ...c.openingWip, invoicedTtc: c.openingInvoiced, payments: c.openingPayments };
    return c.buckets.map(b => {
      if (!cumul) return { bucket: b, invoiced: b.invoiced, wip: b.wip, payments: b.payments };
      run.invoicedTtc += b.invoiced;
      run.pending     += b.wip.pending;
      run.invoiced    += b.wip.invoiced;
      run.rejected    += b.wip.rejected;
      run.payments    += b.payments;
      return {
        bucket:   b,
        invoiced: run.invoicedTtc,
        wip:      { pending: run.pending, invoiced: run.invoiced, rejected: run.rejected },
        payments: run.payments,
      };
    });
  });

  /** Total d'une série : la somme de la plage, ou la valeur cumulée en fin de plage. */
  private seriesTotal(rangeTotal: number, opening: number): number {
    return this.chartView() === 'CUMUL' ? opening + rangeTotal : rangeTotal;
  }

  /** La période qui contient aujourd'hui — surlignée sur les graphiques. */
  private readonly currentBucketKey = computed(() => {
    const now = new Date();
    const g = this.chartGranularity();
    if (g === 'YEAR') return String(now.getFullYear());
    if (g === 'QUARTER') return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
    return toYearMonth(now);
  });

  /**
   * Facturation — la série d'origine. Une seule facture dans la période : son numéro et sa
   * date en pastille, comme avant ; plusieurs : leur nombre (le détail est dans l'onglet
   * Factures, où mène le clic).
   */
  private readonly invoicedBars = computed<ChartBar[]>(() => {
    this.translate.currentLang();
    const current = this.currentBucketKey();
    const cumul   = this.chartView() === 'CUMUL';
    return this.chartSeries().map(({ bucket, invoiced }) => {
      const lines = [
        this.bucketLongLabel(bucket),
        `${this.translate.instant(cumul ? 'AFFAIRES.DETAIL.CHARTS.INVOICED_CUMUL' : 'AFFAIRES.DETAIL.CHARTS.INVOICED')} : ${this.money(invoiced)}`,
      ];
      if (bucket.invoiceCount === 1) {
        const inv = this.invoices().find(i => inDayRange(i.dateEmission, [localDay(bucket.start), localDay(bucket.end)]));
        if (inv) lines.push(`${inv.invoiceNumber ?? '—'} · ${this.formatDateShort(inv.dateEmission)}`);
      } else if (bucket.invoiceCount > 1) {
        lines.push(this.translate.instant('AFFAIRES.DETAIL.CHARTS.INVOICE_COUNT', { count: bucket.invoiceCount }));
      }
      return {
        label: this.bucketShortLabel(bucket), value: invoiced, tooltipLines: lines,
        highlight: bucket.key === current, key: bucket.key,
      };
    });
  });

  private readonly wipBars = computed<ChartBar[]>(() => {
    this.translate.currentLang();
    const statuses = this.chartStatuses();
    const current  = this.currentBucketKey();
    return this.chartSeries().map(({ bucket, wip }) => {
      const value = this.wipOf(wip);
      const lines = [this.bucketLongLabel(bucket)];
      for (const s of WIP_STATUS_ORDER) {
        if (statuses.includes(s)) lines.push(`${this.wipStatusLabel(s)} : ${this.money(wipAmount(wip, s))}`);
      }
      if (statuses.length > 1) {
        lines.push(`${this.translate.instant('AFFAIRES.DETAIL.CHARTS.TOTAL')} : ${this.money(value)}`);
      }
      return {
        label:        this.bucketShortLabel(bucket),
        value,
        tooltipLines: lines,
        highlight:    bucket.key === current,
        segments:     WIP_STATUS_ORDER.filter(s => statuses.includes(s))
          .map(s => ({ value: wipAmount(wip, s), variant: WIP_STATUS_VARIANT[s] })),
        key:          bucket.key,
      };
    });
  });

  private readonly paymentBars = computed<ChartBar[]>(() => {
    this.translate.currentLang();
    const cumul = this.chartView() === 'CUMUL';
    return this.chartSeries().map(({ bucket, payments }) => {
      const lines = [
        this.bucketLongLabel(bucket),
        `${this.translate.instant(cumul ? 'AFFAIRES.DETAIL.CHARTS.COLLECTED_CUMUL' : 'AFFAIRES.DETAIL.CHARTS.COLLECTED')} : ${this.money(payments)}`,
      ];
      if (bucket.paymentCount > 0) {
        lines.push(this.translate.instant('AFFAIRES.DETAIL.CHARTS.PAYMENT_COUNT', { count: bucket.paymentCount }));
      }
      return { label: this.bucketShortLabel(bucket), value: payments, tooltipLines: lines, key: bucket.key };
    });
  });

  // ── Lignes de référence ───────────────────────────────────────────────────

  /** Vue cumulée : le budget, plus les TS intégrés s'ils sont comptés. */
  private readonly chartBudgetTarget = computed(() => {
    const ts = this.chartIncludeTs() ? (this.raf()?.montantTsIntegres ?? 0) : 0;
    return this.budgetTotal() + ts;
  });

  private readonly chartBudgetLabel = computed(() => {
    this.translate.currentLang();
    const key = this.chartIncludeTs() && (this.raf()?.montantTsIntegres ?? 0) > 0
      ? 'AFFAIRES.DETAIL.CHARTS.TARGET_BUDGET_TS' : 'AFFAIRES.DETAIL.CHARTS.TARGET_BUDGET';
    return this.translate.instant(key);
  });

  /**
   * L'objectif du graphique Facturation d'origine, en vue par période : le budget
   * prévisionnel réparti linéairement sur la durée de l'affaire, rapporté à la période
   * (mois, trimestre, année). Ce n'est pas un objectif saisi — l'aide le dit.
   */
  private readonly invoicedPeriodTarget = computed(() => {
    const a = this.affaire();
    const b = this.budgetTotal();
    if (!a || b <= 0) return 0;
    const months = this.affaireMonths(a.dateDebut, a.dateFin);
    const perBucket = this.chartGranularity() === 'YEAR' ? 12 : this.chartGranularity() === 'QUARTER' ? 3 : 1;
    return months > 0 ? (b / months) * perBucket : 0;
  });

  /** Nombre de mois couverts par l'affaire, borné à [1, 60] — comme l'objectif d'origine. */
  private affaireMonths(debut: string | null, fin: string | null): number {
    if (!debut || !fin) return 12;
    const d = new Date(debut), f = new Date(fin);
    const months = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth()) + 1;
    return Math.min(Math.max(months, 1), 60);
  }

  private chartOptions(ariaTitle: string, total: number, variant: ProgressVariant,
                       legend: BarChartLegendItem[], target: number, targetLabel: string): BarChartOptions {
    const withLine = target > 0;
    return {
      orientation:  'vertical',
      height:       '240px',
      variant,
      clickable:    true,
      yAxis:        { ticks: 4, format: v => this.compactAmount(v) },
      target:       withLine ? target : undefined,
      targetLabel:  withLine ? `${targetLabel} : ${this.money(target)}` : undefined,
      legend:       withLine ? [...legend, { label: targetLabel, variant: 'neutral', line: true }] : legend,
      emptyMessage: this.translate.instant('AFFAIRES.DETAIL.CHARTS.EMPTY_RANGE'),
      ariaLabel:    `${ariaTitle} — ${this.chartRangeLabel()} — ${this.money(total)}`,
    };
  }

  // ── Les trois diapositives ────────────────────────────────────────────────

  /**
   * Tout ce qu'une diapositive affiche, prêt à rendre : le gabarit n'a qu'une boucle, et
   * les trois graphiques ne peuvent pas diverger de forme (en-tête, total, axe, légende).
   */
  readonly chartSlides = computed<ChartSlideView[]>(() => {
    this.translate.currentLang();
    const c = this.charts();
    const t = (k: string, p?: object) => this.translate.instant('AFFAIRES.DETAIL.CHARTS.' + k, p);
    const cumul = this.chartView() === 'CUMUL';
    const suffix = '_' + this.chartGranularity() + (cumul ? '_CUMUL' : '');
    const totalLabel = t(cumul ? 'TOTAL_END' : 'TOTAL_RANGE');

    const invoicedTotal = this.seriesTotal(c?.totalInvoiced ?? 0, c?.openingInvoiced ?? 0);
    const wipTotal = c ? (cumul
      ? (this.chartSeries().length ? this.wipOf(this.chartSeries().at(-1)!.wip) : this.wipOf(c.openingWip))
      : this.wipOf(c.totalWip)) : 0;
    const paymentsTotal = this.seriesTotal(c?.totalPayments ?? 0, c?.openingPayments ?? 0);

    const invoicedTarget = cumul ? this.chartBudgetTarget() : this.invoicedPeriodTarget();
    const invoicedTargetLabel = cumul ? this.chartBudgetLabel()
      : t('TARGET_' + this.chartGranularity());
    const budget = cumul ? this.chartBudgetTarget() : 0;

    const invoicedTitle = t('INV_TITLE' + suffix);
    const wipTitle      = t('WIP_TITLE' + suffix);
    const payTitle      = t('PAY_TITLE' + suffix);

    return [
      {
        id: 'INVOICED', title: invoicedTitle, totalLabel, total: invoicedTotal,
        count: c ? t('INVOICE_COUNT', { count: c.totalInvoiceCount }) : null,
        note: null,
        bars: this.invoicedBars(),
        options: this.chartOptions(invoicedTitle, invoicedTotal, 'tertiary',
          [{ label: t(cumul ? 'INVOICED_CUMUL' : 'INVOICED'), variant: 'tertiary' }],
          invoicedTarget, invoicedTargetLabel),
      },
      {
        id: 'WIP', title: wipTitle, totalLabel, total: wipTotal, count: null,
        note: this.chartWipModeOnlyTs() ? t('WIP_TS_ONLY') : null,
        bars: this.wipBars(),
        options: this.chartOptions(wipTitle, wipTotal, 'tertiary',
          WIP_STATUS_ORDER.filter(s => this.chartStatuses().includes(s))
            .map(s => ({ label: this.wipStatusLabel(s), variant: WIP_STATUS_VARIANT[s] })),
          budget, this.chartBudgetLabel()),
      },
      {
        id: 'PAYMENTS', title: payTitle, totalLabel, total: paymentsTotal,
        count: c ? t('PAYMENT_COUNT', { count: c.totalPaymentCount }) : null,
        note: null,
        bars: this.paymentBars(),
        options: this.chartOptions(payTitle, paymentsTotal, 'teal',
          [{ label: t(cumul ? 'COLLECTED_CUMUL' : 'COLLECTED'), variant: 'teal' }],
          budget, this.chartBudgetLabel()),
      },
    ];
  });

  /** « janv. 2025 – oct. 2026 » : la plage réellement servie, après coupe par le serveur. */
  readonly chartRangeLabel = computed(() => {
    this.translate.currentLang();
    const c = this.charts();
    if (!c || !c.buckets.length) return '';
    return `${this.monthYearLabel(c.from.slice(0, 7))} – ${this.monthYearLabel(c.to.slice(0, 7))}`;
  });

  /** Seuls FORFAIT, REGIE et LIVRABLE déclarent du WIP ; ailleurs seul celui des TS compte. */
  readonly chartWipModeOnlyTs = computed(() => {
    const mode = this.affaire()?.billingMode;
    return mode !== 'FORFAIT' && mode !== 'REGIE' && mode !== 'LIVRABLE';
  });

  // ── Clic sur une barre ────────────────────────────────────────────────────

  /**
   * Chaque barre mène là où vivent ses lignes : Facturation → Factures filtrées sur la
   * période ; WIP → l'onglet où ce WIP se déclare ; Paiements → Paiements filtrés.
   */
  onChartBarClick(slide: ChartSlideId, bar: BarChartBar): void {
    if (slide === 'WIP') {
      this.activeTab.set(this.chartWipModeOnlyTs() ? 'ts-wip' : 'wip');
      return;
    }
    const bucket = this.charts()?.buckets.find(b => b.key === (bar as ChartBar).key);
    if (!bucket) return;
    const range = [localDay(bucket.start), localDay(bucket.end)];
    if (slide === 'INVOICED') {
      this.invoiceEmittedRange.set(range);
      this.activeTab.set('factures');
    } else {
      this.paymentDateRange.set(range);
      this.activeTab.set('paiements');
    }
  }

  // ── Libellés ──────────────────────────────────────────────────────────────

  private wipStatusLabel(s: ChartWipStatus): string {
    return this.translate.instant('AFFAIRES.DETAIL.CHARTS.STATUS_' + s);
  }

  /** Légende d'axe : « MARS », « MARS 26 » si la plage couvre plusieurs années, « T1 26 », « 2026 ». */
  private bucketShortLabel(b: AffaireChartBucket): string {
    const [y, rest] = b.key.split('-');
    const yy = y.slice(2);
    if (!rest) return y;
    if (rest.startsWith('Q')) {
      return this.translate.instant('AFFAIRES.DETAIL.CHARTS.QUARTER_SHORT', { q: rest.slice(1), yy });
    }
    const month = this.translate.instant('COMMON.MONTHS_SHORT.M' + Number(rest));
    const c = this.charts();
    const multiYear = !!c && c.from.slice(0, 4) !== c.to.slice(0, 4);
    return multiYear ? `${month} ${yy}` : month;
  }

  /** En tête de pastille : « mars 2026 », « T1 2026 », « 2026 ». */
  private bucketLongLabel(b: AffaireChartBucket): string {
    const [y, rest] = b.key.split('-');
    if (!rest) return y;
    if (rest.startsWith('Q')) {
      return this.translate.instant('AFFAIRES.DETAIL.CHARTS.QUARTER_LONG', { q: rest.slice(1), year: y });
    }
    return this.monthYearLabel(b.key);
  }

  private monthYearLabel(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(this.chartLocale(), { month: 'short', year: 'numeric' });
  }

  /** Graduation de l'axe : « 12 k », « 1,2 M » — le montant exact est dans la pastille. */
  private compactAmount(v: number): string {
    return new Intl.NumberFormat(this.chartLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }

  private chartLocale(): string {
    const lang = this.translate.currentLang() || 'fr';
    return lang.startsWith('en') ? 'en-GB' : lang.startsWith('ar') ? 'ar' : 'fr-FR';
  }

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // L'onglet « Facturation » (les écrans par mode AV / JAL / TM / CP / RMB) est
    // supprimé — pas masqué. Il n'est plus conditionné à `billingMode`, il n'existe plus.
    const tabs: TabItem[] = [
      { id: 'overview', label: t('AFFAIRES.DETAIL.TABS.OVERVIEW') },
      { id: 'ts',       label: t('AFFAIRES.DETAIL.TABS.BUDGET_TS'), count: this.tsList().length },
      // TS WIP (submit -> client confirms -> DF validates) is unconditional, like Budget
      // TS above — a TS can exist on any affaire regardless of billingMode.
      { id: 'ts-wip',   label: t('AFFAIRES.DETAIL.TABS.TS_WIP') },
    ];
    // WIP n'a de sens que pour Forfaitaire, Régie et Livrable — les autres modes n'ont
    // pas de notion de travail en cours (ou de livrables à facturer) à valider avant
    // facturation.
    const wipMode = this.affaire()?.billingMode;
    if (wipMode === 'FORFAIT' || wipMode === 'REGIE' || wipMode === 'LIVRABLE') {
      tabs.push({ id: 'wip', label: t('AFFAIRES.DETAIL.TABS.WIP') });
    }
    // Ressources (taux TM par collaborateur) n'a de sens qu'en mode TM — AV/CP n'ont pas
    // de notion de ressource facturée à un taux individuel.
    if (wipMode === 'REGIE') {
      tabs.push({ id: 'ressources', label: t('AFFAIRES.DETAIL.TABS.RESSOURCES') });
    }
    // Dépense : visibilité en lecture seule des heures Timesheet + coût interne estimé,
    // pour les affaires Forfaitaire/Livrable — Régie a déjà cette information (et plus)
    // dans l'onglet Ressources ci-dessus. Timesheet n'a aucune notion de mode de
    // facturation : les heures peuvent être saisies quel que soit le mode de l'affaire.
    if (wipMode === 'FORFAIT' || wipMode === 'LIVRABLE') {
      tabs.push({ id: 'depense', label: t('AFFAIRES.DETAIL.TABS.DEPENSE') });
    }
    tabs.push(
      { id: 'factures',  label: t('AFFAIRES.DETAIL.TABS.INVOICES'), count: this.invoices().length },
      { id: 'paiements', label: t('AFFAIRES.DETAIL.TABS.PAYMENTS'), count: this.payments().length },
      // Frais remboursables : présent sur TOUTE affaire, quel que soit le mode de
      // facturation — les frais ne sont plus un mode mais une opération de la fiche.
      { id: 'frais',     label: t('AFFAIRES.EXPENSES.TAB') },
    );
    return tabs;
  });

  // ═══ Barres d'outils (recherche + filtre + export) ════════════════════════

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:       t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
      applyLabel:  t('AFFAIRES.DETAIL.TOOLBAR.APPLY'),
      cancelLabel: t('AFFAIRES.DETAIL.MODAL.CANCEL'),
      resetLabel:  t('AFFAIRES.DETAIL.TOOLBAR.RESET'),
      triggerLabel: t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
    };
  });

  private exportAction(disabled: boolean): ToolbarAction[] {
    return [{
      id:       'export',
      icon:     'download',
      label:    this.translate.instant('AFFAIRES.DETAIL.TOOLBAR.EXPORT'),
      position: 'right',
      disabled: disabled || this.exporting(),
    }];
  }

  readonly tsToolbarActions      = computed(() => this.exportAction(this.filteredTs().length === 0));
  readonly invoiceToolbarActions = computed(() => this.exportAction(this.filteredInvoices().length === 0));
  readonly paymentToolbarActions = computed(() => this.exportAction(this.filteredPayments().length === 0));

  readonly tsFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'statut',
      label:   t('AFFAIRES.DETAIL.INVOICES.STATUS'),
      type:    'select',
      options: [...new Set(this.tsList().map(ts => ts.statut))].sort()
        .map(value => ({ value, label: this.enumText('TS_STATUT', value) })),
    }, {
      name:  'createdRange',
      label: t('AFFAIRES.DETAIL.TOOLBAR.CREATED_PERIOD'),
      type:  'daterange',
    }, {
      name:        'amountMin',
      label:       t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_MIN'),
      type:        'text',
      placeholder: t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name:        'amountMax',
      label:       t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_MAX'),
      type:        'text',
      placeholder: t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_PH'),
    }];
  });

  readonly invoiceFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'statut',
      label:   t('AFFAIRES.DETAIL.INVOICES.STATUS'),
      type:    'select',
      options: [...new Set(this.invoices().map(i => i.statut).filter((s): s is string => !!s))]
        .sort().map(value => ({ value, label: this.enumText('INVOICE_STATUT', value) })),
    }, {
      name:    'type',
      label:   t('AFFAIRES.DETAIL.INVOICES.TYPE'),
      type:    'select',
      options: [...new Set(this.invoices().map(i => i.invoiceType).filter((s): s is string => !!s))]
        .sort().map(value => ({ value, label: this.invoiceTypeText(value) })),
    }, {
      name:  'emittedRange',
      label: t('AFFAIRES.DETAIL.TOOLBAR.EMITTED_PERIOD'),
      type:  'daterange',
    }, {
      name:  'overdueOnly',
      label: t('AFFAIRES.DETAIL.TOOLBAR.OVERDUE_ONLY'),
      type:  'checkbox',
    }];
  });

  readonly paymentFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'method',
      label:   t('AFFAIRES.DETAIL.PAYMENTS.METHOD'),
      type:    'select',
      options: [...new Set(this.payments().map(p => p.paymentMethod).filter((m): m is string => !!m))]
        .sort().map(value => ({ value, label: this.enumText('PAYMENT_METHOD', value) })),
    }, {
      name:  'dateRange',
      label: t('AFFAIRES.DETAIL.TOOLBAR.PAYMENT_PERIOD'),
      type:  'daterange',
    }, {
      name:        'amountMin',
      label:       t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_MIN'),
      type:        'text',
      placeholder: t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name:        'amountMax',
      label:       t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_MAX'),
      type:        'text',
      placeholder: t('AFFAIRES.DETAIL.TOOLBAR.AMOUNT_PH'),
    }];
  });

  // Un filterConfig par panneau : `daf-filter` ne seed son état qu'à la création, et chaque
  // barre est recréée au changement d'onglet (`@if`) — sans initialValues, revenir sur un
  // onglet montrait un panneau vide alors que le filtre restait appliqué. Forme interne du
  // panneau : select → string[], checkbox → boolean, daterange → Date[] | null.
  readonly tsFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfig(),
    initialValues: {
      statut:       this.tsStatut() ? [this.tsStatut()] : [],
      createdRange: this.tsCreatedRange(),
      amountMin:    this.tsAmountMin(),
      amountMax:    this.tsAmountMax(),
    },
  }));

  readonly invoiceFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfig(),
    initialValues: {
      statut:       this.invoiceStatut() ? [this.invoiceStatut()] : [],
      type:         this.invoiceType()   ? [this.invoiceType()]   : [],
      emittedRange: this.invoiceEmittedRange(),
      overdueOnly:  this.invoiceOverdueOnly(),
    },
  }));

  readonly paymentFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfig(),
    initialValues: {
      method:    this.paymentMethod() ? [this.paymentMethod()] : [],
      dateRange: this.paymentDateRange(),
      amountMin: this.paymentAmountMin(),
      amountMax: this.paymentAmountMax(),
    },
  }));

  /** `daf-filter` renders a select as `string[]` internally and emits a scalar — normalise both. */
  asFilterValue(result: FilterResult, key: string): string {
    const v = result[key];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  /** `daterange` émet Date[] (1 ou 2 dates) ; tout le reste → null. */
  private asDateRange(result: FilterResult, key: string): Date[] | null {
    const v = result[key];
    return Array.isArray(v) && v.length ? v as Date[] : null;
  }

  private asText(result: FilterResult, key: string): string {
    const v = result[key];
    return typeof v === 'string' ? v : '';
  }

  // Listes chargées en entier (pas de pagination) : filtrage client, aucune page à remettre à 0.
  onTsFilterApply(result: FilterResult): void {
    this.tsStatut.set(this.asFilterValue(result, 'statut'));
    this.tsCreatedRange.set(this.asDateRange(result, 'createdRange'));
    this.tsAmountMin.set(this.asText(result, 'amountMin'));
    this.tsAmountMax.set(this.asText(result, 'amountMax'));
  }

  onTsFilterReset(): void {
    this.tsStatut.set('');
    this.tsCreatedRange.set(null);
    this.tsAmountMin.set('');
    this.tsAmountMax.set('');
  }

  onInvoiceFilterApply(result: FilterResult): void {
    this.invoiceStatut.set(this.asFilterValue(result, 'statut'));
    this.invoiceType.set(this.asFilterValue(result, 'type'));
    this.invoiceEmittedRange.set(this.asDateRange(result, 'emittedRange'));
    this.invoiceOverdueOnly.set(result['overdueOnly'] === true);
  }

  onInvoiceFilterReset(): void {
    this.invoiceStatut.set('');
    this.invoiceType.set('');
    this.invoiceEmittedRange.set(null);
    this.invoiceOverdueOnly.set(false);
  }

  onPaymentFilterApply(result: FilterResult): void {
    this.paymentMethod.set(this.asFilterValue(result, 'method'));
    this.paymentDateRange.set(this.asDateRange(result, 'dateRange'));
    this.paymentAmountMin.set(this.asText(result, 'amountMin'));
    this.paymentAmountMax.set(this.asText(result, 'amountMax'));
  }

  onPaymentFilterReset(): void {
    this.paymentMethod.set('');
    this.paymentDateRange.set(null);
    this.paymentAmountMin.set('');
    this.paymentAmountMax.set('');
  }

  onTsToolbarAction(id: string): void      { if (id === 'export') this.exportTs(); }
  onInvoiceToolbarAction(id: string): void { if (id === 'export') this.exportInvoices(); }
  onPaymentToolbarAction(id: string): void { if (id === 'export') this.exportPayments(); }

  // ═══ Tableaux ═════════════════════════════════════════════════════════════

  readonly filteredTs = computed(() => {
    const q = this.tsSearch().trim().toLowerCase(), statut = this.tsStatut();
    const range = this.tsCreatedRange();
    const min = parseAmount(this.tsAmountMin()), max = parseAmount(this.tsAmountMax());
    return this.tsList().filter(t =>
      (!statut || t.statut === statut) &&
      inDayRange(t.createdAt, range) &&
      inAmountRange(t.montantEstime, min, max) &&
      (!q || `${t.referenceTs} ${t.intitule}`.toLowerCase().includes(q)));
  });

  readonly filteredInvoices = computed(() => {
    const q = this.invoiceSearch().trim().toLowerCase(), statut = this.invoiceStatut();
    const type = this.invoiceType(), range = this.invoiceEmittedRange();
    const overdueOnly = this.invoiceOverdueOnly(), today = toIsoDay(new Date());
    return this.invoices().filter(i =>
      (!statut || i.statut === statut) &&
      (!type || i.invoiceType === type) &&
      inDayRange(i.dateEmission, range) &&
      // Même règle que les échéances de la vue d'ensemble : échéance passée, pas soldée.
      (!overdueOnly || (!!i.dateEcheance && i.dateEcheance.slice(0, 10) < today
        && !(i.statut && SETTLED_INVOICE_STATUTS.has(i.statut)))) &&
      (!q || `${i.invoiceNumber ?? ''} ${i.invoiceType ?? ''} ${this.invoiceTypeText(i.invoiceType)}`.toLowerCase().includes(q)));
  });

  readonly filteredPayments = computed(() => {
    const q = this.paymentSearch().trim().toLowerCase(), method = this.paymentMethod();
    const range = this.paymentDateRange();
    const min = parseAmount(this.paymentAmountMin()), max = parseAmount(this.paymentAmountMax());
    return this.payments().filter(p =>
      (!method || p.paymentMethod === method) &&
      inDayRange(p.paymentDate, range) &&
      inAmountRange(p.amountLocal, min, max) &&
      (!q || `${p.invoiceNumber ?? ''} ${p.bankReference ?? ''}`.toLowerCase().includes(q)));
  });

  // Toutes les colonnes sont triables, en local : les TS, factures et paiements de
  // l'affaire arrivent entiers et ne sont pas paginés, la lib trie donc bien tout le
  // résultat. Les montants et les dates se trient sur la valeur brute (`sortAccessor`),
  // pas sur le texte formaté ; une pastille se trie sur son libellé (repli de la lib).

  readonly tsColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const src = (row: TableRow) => row['_source'] as TsDto;
    return [
      { key: 'reference', label: t('AFFAIRES.DETAIL.MODAL.TS_TITLE'), sortable: true },
      { key: 'intitule',  label: t('AFFAIRES.DETAIL.MODAL.TS_INTITULE'), sortable: true },
      // Clé propre au TS : `INVOICES.AMOUNT` est le montant d'une facture, or c'est ici
      // le `montant_estime` d'un travail supplémentaire, qui n'est pas encore facturé.
      { key: 'montant',   label: t('AFFAIRES.DETAIL.MODAL.TS_AMOUNT'), align: 'right', sortable: true,
        sortAccessor: row => src(row).montantEstime },
      { key: 'statut',    label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge', sortable: true },
      { key: 'integre',   label: t('AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT'), sortable: true,
        sortAccessor: row => src(row).integreAuBudgetAt },
      // Custom, not a plain text/link column type: the « Ouvrir la facture » link (only once
      // FACTURE, see affaire-ts-wip-tab.component.ts) plus, on the right, the « ⋮ » row menu
      // (app-ts-row-menu: validations, Modifier, Consulter, Historique, Supprimer).
      { key: 'invoice',   label: t('AFFAIRES.DETAIL.MODAL.TS_INVOICE'), type: 'custom' },
    ];
  });

  /** Items du menu d'une ligne, selon les mêmes règles que le serveur. */
  private tsMenuItems(ts: TsDto): TsRowMenuItem[] {
    const t = (k: string) => this.translate.instant(k);
    const items: TsRowMenuItem[] = [];
    // L'étape de validation suivante en tête : c'est l'action la plus fréquente sur un TS.
    if (this.canValidateTechnique(ts)) {
      items.push({ id: 'validate-tech', icon: 'fact_check', label: t('AFFAIRES.DETAIL.TS.VALIDATE_TECH') });
    }
    if (this.canValidateCommerciale(ts)) {
      items.push({ id: 'validate-comm', icon: 'handshake', label: t('AFFAIRES.DETAIL.TS.VALIDATE_COMM') });
    }
    if (this.canEditTs(ts)) items.push({ id: 'edit', icon: 'edit', label: t('AFFAIRES.DETAIL.TS.EDIT') });
    items.push({ id: 'view',    icon: 'visibility', label: t('AFFAIRES.DETAIL.TOOLBAR.VIEW') });
    items.push({ id: 'history', icon: 'history',    label: t('AFFAIRES.DETAIL.TS.HISTORY') });
    if (this.canDeleteTs(ts)) {
      items.push({ id: 'delete', icon: 'delete', label: t('AFFAIRES.DETAIL.TS.DELETE'), danger: true });
    }
    return items;
  }

  onTsMenu(ts: TsDto, id: string): void {
    if (id === 'validate-tech') this.openTsValidation(ts, 'technique');
    if (id === 'validate-comm') this.openTsValidation(ts, 'commerciale');
    if (id === 'edit')    this.openTsForm(ts);
    if (id === 'delete')  this.openTsDelete(ts);
    // Deux fenêtres distinctes : « Consulter » (détails) et « Historique ».
    if (id === 'view')    this.openTsView(ts);
    if (id === 'history') this.openTsHistory(ts);
  }

  readonly tsRows = computed<TableRow[]>(() => this.filteredTs().map(ts => ({
    id:        ts.id,
    reference: ts.referenceTs,
    intitule:  ts.intitule,
    montant:   this.currency.transform(ts.montantEstime, ts.devise || this.affaireDevise()),
    statut:    { label: this.enumText('TS_STATUT', ts.statut),
                 options: { variant: TS_STATUT_BADGE[ts.statut] ?? 'neutral', dot: true } } satisfies BadgeCell,
    integre:   this.formatDate(ts.integreAuBudgetAt),
    invoiceId: ts.invoiceId,
    // Calculés ici, une fois par ligne : un appel dans le template recréerait le tableau
    // à chaque détection de changement.
    menuItems: this.tsMenuItems(ts),
    _source:   ts,
  })));

  readonly tsConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.tsList().length === 0 ? 'AFFAIRES.DETAIL.OVERVIEW.NO_TS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    // Pas de `actions` : validations, Modifier, Historique et Supprimer sont toutes dans le
    // menu « ⋮ » de la colonne `menu` (app-ts-row-menu).
    ...tableTools(this.translate),
  }));

  readonly invoiceColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const src = (row: TableRow) => row['_source'] as AffaireInvoiceItem;
    return [
      { key: 'numero',   label: t('AFFAIRES.DETAIL.INVOICES.NUMBER'), sortable: true },
      { key: 'type',     label: t('AFFAIRES.DETAIL.INVOICES.TYPE'), sortable: true },
      { key: 'emission', label: t('AFFAIRES.DETAIL.INVOICES.EMITTED'), sortable: true,
        sortAccessor: row => src(row).dateEmission },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE'), sortable: true,
        sortAccessor: row => src(row).dateEcheance },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), align: 'right', sortable: true,
        sortAccessor: row => src(row).montantTtc },
      { key: 'statut',   label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge', sortable: true },
    ];
  });

  readonly invoiceRows = computed<TableRow[]>(() => this.filteredInvoices().map(inv => ({
    id:       inv.id,
    numero:   inv.invoiceNumber ?? '—',
    type:     this.invoiceTypeText(inv.invoiceType),
    emission: this.formatDate(inv.dateEmission),
    echeance: this.formatDate(inv.dateEcheance),
    montant:  this.currency.transform(inv.montantTtc, inv.devise || this.affaireDevise()),
    // Statut lisible ET coloré : la pastille était neutre pour tous les statuts, donc
    // « Payée » et « En litige » se présentaient exactement pareil.
    statut:   { label: this.enumText('INVOICE_STATUT', inv.statut),
                options: { variant: INVOICE_STATUT_BADGE[inv.statut ?? ''] ?? 'neutral', dot: true } } satisfies BadgeCell,
    _editable: this.canEditInvoice(inv),
    _source:   inv,
  })));

  readonly invoiceConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.invoices().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_INVOICES' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.invoiceActions(),
    ...tableTools(this.translate),
  }));

  readonly paymentColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const src = (row: TableRow) => row['_source'] as AffairePaymentItem;
    return [
      { key: 'date',     label: t('AFFAIRES.DETAIL.PAYMENTS.DATE'), sortable: true,
        sortAccessor: row => src(row).paymentDate },
      { key: 'facture',  label: t('AFFAIRES.DETAIL.PAYMENTS.INVOICE'), sortable: true },
      { key: 'methode',  label: t('AFFAIRES.DETAIL.PAYMENTS.METHOD'), sortable: true },
      { key: 'ref',      label: t('AFFAIRES.DETAIL.PAYMENTS.REFERENCE'), sortable: true },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.PAYMENTS.AMOUNT'), align: 'right', sortable: true,
        sortAccessor: row => src(row).amountLocal },
    ];
  });

  readonly paymentRows = computed<TableRow[]>(() => this.filteredPayments().map(p => ({
    id:      p.id,
    date:    this.formatDate(p.paymentDate),
    facture: p.invoiceNumber ?? '—',
    methode: this.enumText('PAYMENT_METHOD', p.paymentMethod),
    ref:     p.bankReference ?? '—',
    montant: this.currency.transform(p.amountLocal, p.currency || this.affaireDevise()),
    _source: p,
  })));

  readonly paymentConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.payments().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_PAYMENTS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.paymentActions(),
    ...tableTools(this.translate),
  }));

  // ── Actions de ligne ─────────────────────────────────────────────────────
  //
  // Sur `config.actions`, plus dans une colonne `dafCell="_actions"` projetée : les
  // prédicats `hidden` / `disabled` par ligne de `TableAction` (4.17.0) rendent le
  // conditionnel possible sans réimplémenter à la main le style de bouton de la lib
  // (§6b rule 4). Les trois colonnes projetées de cette page ont disparu avec.
  //
  // `id` résout l'icône quand elle est standard (`view` → visibility, `edit` → stylus) ;
  // les validations TS passent une icône explicite. La cellule d'actions de la lib
  // s'occupe déjà du stopPropagation.

  readonly invoiceActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openInvoiceView(row['_source'] as AffaireInvoiceItem),
      },
      {
        // Grisée plutôt que cachée : une facture non modifiable reste une facture, et
        // faire disparaître l'action d'une ligne sur deux se lit comme un bug.
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        disabled: row => !this.canEditInvoice(row['_source'] as AffaireInvoiceItem),
        onClick:  row => this.editInvoice(row['_source'] as AffaireInvoiceItem),
      },
    ];
  });

  readonly paymentActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openPaymentView(row['_source'] as AffairePaymentItem),
      },
      {
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        onClick: () => this.goToPayments(),
      },
    ];
  });

  // ═══ Drawer : échéances + activité ════════════════════════════════════════

  readonly activityDrawerConfig = computed<DrawerConfig>(() => {
    this.translate.currentLang();
    return {
      title:      this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_TITLE'),
      icon:       'insights',
      side:       'right',
      width:      '460px',
      closeLabel: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_BTN'),
      // L'onglet de bord de la lib remplace le bouton qu'il y avait dans pageActions
      // (~200 px de la ligne de titre). Pas de collision avec le FAB de devise du
      // shell : le tab est `fixed top-1/2` (centré verticalement), le FAB est en bas.
      showToggle: true,
      // Le marqueur d'alerte (4.18.0). Point simple, sans `count` : « il y a quelque
      // chose » se lit plus vite qu'un « 1 ». Il reste visible panneau ouvert — c'est une
      // condition active, pas du non-lu : il disparaît quand le RAF repasse sous le seuil,
      // pas quand on a regardé.
      //
      // Le libellé distingue les deux niveaux : dire « vigilance » sur une affaire qui a
      // déjà dépassé son budget sous-estime ce qui se passe. Le dépassement allume le point
      // même si le seuil de l'affaire est mal paramétré (> 100 %), sans quoi le cas le plus
      // grave serait le seul non signalé.
      signal: (this.rafAlertActive() || this.budgetOverrun())
        ? {
            tone:  'danger',
            label: this.translate.instant(this.budgetOverrun()
              ? 'AFFAIRES.DETAIL.SIDEBAR.BUDGET_OVERRUN_TITLE'
              : 'AFFAIRES.DETAIL.SIDEBAR.RAF_ALERT_TITLE'),
            pulse: true,
          }
        : undefined,
    };
  });

  readonly deadlineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'tache',    label: t('AFFAIRES.DETAIL.OVERVIEW.TASK'), sortable: true },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE'), sortable: true,
        sortAccessor: row => row['_date'] as string },
      // Rang d'urgence, pas l'ordre alphabétique du libellé.
      { key: 'priorite', label: t('AFFAIRES.DETAIL.OVERVIEW.PRIORITY'), type: 'badge', align: 'right', sortable: true,
        sortAccessor: row => PRIORITY_RANK[row['_priority'] as string] ?? 0 },
    ];
  });

  readonly deadlineRows = computed<TableRow[]>(() => {
    const a    = this.affaire();
    const now  = Date.now();
    const t    = (k: string, p?: Record<string, string>) => this.translate.instant(k, p);
    const rows: { date: string; tache: string; priority: string }[] = [];

    for (const inv of this.invoices()) {
      if (!inv.dateEcheance) continue;
      if (inv.statut && SETTLED_INVOICE_STATUTS.has(inv.statut)) continue;
      rows.push({
        date:     inv.dateEcheance,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_INVOICE', { ref: inv.invoiceNumber ?? '—' }),
        priority: this.priorityOf(inv.dateEcheance, now),
      });
    }

    if (a?.dateFin && a.statut !== 'CLOTUREE' && a.statut !== 'ARCHIVEE') {
      rows.push({
        date:     a.dateFin,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_END'),
        priority: this.priorityOf(a.dateFin, now),
      });
    }

    return rows
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
      .slice(0, 6)
      .map((r, i) => ({
        id:       i,
        _date:    r.date,
        _priority: r.priority,
        tache:    r.tache,
        echeance: this.formatDate(r.date),
        priorite: {
          label:   t(`AFFAIRES.DETAIL.OVERVIEW.PRIORITY_${r.priority.toUpperCase()}`),
          options: { variant: PRIORITY_BADGE[r.priority], dot: true },
        } satisfies BadgeCell,
      }));
  });

  /** Recherche de la barre ajoutée au-dessus des échéances (elle porte `[table]` :
   * réinitialiser + choix des colonnes). Filtre côté client sur les 6 lignes affichées. */
  readonly deadlineSearch = signal('');
  readonly filteredDeadlineRows = computed(() =>
    searchTableRows(this.deadlineRows(), this.deadlineColumns(), this.deadlineSearch()));

  readonly deadlineConfig = computed<TableConfig>(() => ({
    showHeader:   false,
    emptyMessage: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.NO_DEADLINES'),
    ...tableTools(this.translate),
  }));

  readonly activities = computed<ActivityRow[]>(() => {
    const a    = this.affaire();
    const cur  = this.affaireDevise();
    const rows: ActivityRow[] = [];

    for (const p of this.payments()) {
      if (!p.paymentDate) continue;
      rows.push({
        id: `pay-${p.id}`, icon: 'payments',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_PAYMENT',
        params: { ref: p.invoiceNumber ?? '—' },
        sub: `${this.money(p.amountLocal, p.currency || cur)} • ${this.formatDate(p.paymentDate)}`,
        ts: new Date(p.paymentDate).getTime(),
      });
    }

    for (const inv of this.invoices()) {
      if (!inv.dateEmission) continue;
      rows.push({
        id: `inv-${inv.id}`, icon: 'receipt_long',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_INVOICE',
        params: { ref: inv.invoiceNumber ?? '—' },
        sub: `${this.money(inv.montantTtc, inv.devise || cur)} • ${this.formatDate(inv.dateEmission)}`,
        ts: new Date(inv.dateEmission).getTime(),
      });
    }

    for (const ts of this.tsList()) {
      const integrated = !!ts.integreAuBudgetAt;
      const when = integrated ? ts.integreAuBudgetAt! : ts.createdAt;
      rows.push({
        id: `ts-${ts.id}`, icon: 'add_task',
        titleKey: integrated
          ? 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_INTEGRATED'
          : 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_CREATED',
        params: { ref: ts.referenceTs },
        sub: `${this.money(ts.montantEstime, ts.devise || cur)} • ${this.formatDate(when)}`,
        ts: new Date(when).getTime(),
      });
    }

    if (a) {
      if (a.updatedAt) {
        rows.push({
          id: 'affaire-updated', icon: 'edit_note',
          titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_UPDATED', params: {},
          sub: this.formatDate(a.updatedAt), ts: new Date(a.updatedAt).getTime(),
        });
      }
      rows.push({
        id: 'affaire-created', icon: 'flag',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_CREATED', params: {},
        sub: `${this.money(a.budgetPrevisionnel)} • ${this.formatDate(a.createdAt)}`,
        ts: new Date(a.createdAt).getTime(),
      });
    }

    return rows.sort((x, y) => y.ts - x.ts).slice(0, 8);
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  /**
   * Tous les statuts sauf celui en cours : la fiche autorise n'importe quel changement
   * depuis n'importe quel statut (décision du 2026-09-17). Il n'y a plus de graphe de
   * transitions — le serveur applique la même règle, et refuse seulement un statut
   * inconnu.
   */
  readonly availableTransitions = computed(() => {
    const a = this.affaire();
    return a ? AFFAIRE_STATUTS.filter(s => s !== a.statut) : [];
  });

  ngOnInit(): void {
    this.svc.getPays().subscribe(list => this.paysList.set(list));
    this.svc.getArxEntities().subscribe(list => this.arxEntities.set(list));
    this.loadAll();
  }

  loadAll(): void {
    const id = this.numId;
    if (!id) {
      this.error.set(this.translate.instant('AFFAIRES.DETAIL.INVALID_ID'));
      this.firstLoad.set(false);
      return;
    }
    this.error.set(null);

    this.svc.getAffaire(id).subscribe({
      next: a => {
        this.affaire.set(a);
        this.firstLoad.set(false);
        this.loadRaf();
        this.loadKpis();
        this.loadTs();
        this.loadInvoices();
        this.loadPayments();
        this.loadContacts();
        this.loadTeamAvatars(a);
      },
      error: () => {
        this.error.set(this.translate.instant('AFFAIRES.DETAIL.LOAD_ERROR'));
        this.firstLoad.set(false);
      },
    });
  }

  /**
   * Les contacts CLIENT de l'affaire — le pendant externe des managers. Chargés à
   * part et non dans `getAffaire` : la fiche affaire est déjà servie par un DTO
   * chargé, et ces lignes n'intéressent que la carte d'informations.
   */
  loadContacts(): void {
    this.contactSvc.getAffaireContacts(this.numId).subscribe(list => this.contacts.set(list));
  }

  /**
   * Recharge tout ce dont dépendent les cinq tuiles du haut, après une action qui vient
   * d'en changer une valeur. À appeler depuis CHAQUE écriture qui touche le WIP, les TS,
   * les factures ou les paiements — sans quoi les tuiles gardent les chiffres du
   * chargement initial jusqu'au prochain rechargement de page, ce qui est d'autant plus
   * trompeur que l'onglet WIP, lui, se met bien à jour tout seul juste en dessous.
   *
   * Les deux endpoints suffisent : Backlog / WIP / Total facturé / Total encaissé sortent
   * tous de `kpis`, et TS de `raf`. Les listes (factures, paiements, TS) sont rechargées
   * par leurs propres actions, pas ici — cette méthode ne sert que les indicateurs.
   *
   * Un seul aller-retour par endpoint, pas de debounce : ces actions sont des clics
   * humains, jamais des rafales.
   */
  refreshIndicators(): void {
    this.loadKpis();
    this.loadRaf();
    // Les graphiques découpent les mêmes totaux que les tuiles : ils bougent avec elles.
    this.loadCharts();
  }

  loadRaf():      void { this.svc.getAffaireRaf(this.numId).subscribe({ next: r => this.raf.set(r) }); }
  loadKpis():     void { this.svc.getAffaireKpis(this.numId).subscribe({ next: k => this.kpis.set(k) }); }
  loadTs():       void { this.svc.getTS(this.numId).subscribe({ next: ts => this.tsList.set(ts) }); }
  loadInvoices(): void { this.svc.getAffaireInvoices(this.numId).subscribe({ next: i => this.invoices.set(i) }); }
  loadPayments(): void { this.svc.getAffairePayments(this.numId).subscribe({ next: p => this.payments.set(p) }); }

  /**
   * Photos de l'équipe, via rh-service. Sans `error` handler : le service ne rejette
   * jamais (une panne RH renvoie une liste vide) et l'absence de photo se dégrade en
   * initiales, donc il n'y a rien à signaler à l'utilisateur.
   */
  loadTeamAvatars(a: AffaireDetail): void {
    const ids = this.teamUserIds(a);
    if (ids.length === 0) return;
    this.avatarSvc.resolve(ids).subscribe({
      next: rows => {
        this.avatars.set(new Map(rows.map(r => [r.userId, r])));

        // `daf-avatar` retombe sur les initiales dans trois cas indistinguables à l'écran :
        // pas de ligne pour cet utilisateur, `photo_url` nul en base, ou image en erreur.
        // En `debug` (masqué par défaut dans la console de Chrome, visible en « Verbose »)
        // pour ne pas faire de bruit tout en gardant la boucle de diagnostic fermée :
        // l'URL affichée est cliquable, et c'est elle qui dit si le fichier existe.
        for (const id of ids) {
          const row = rows.find(r => r.userId === id);
          console.debug(`[avatars] user ${id} →`,
            !row              ? 'aucune ligne RH (utilisateur inconnu ou profil supprimé)'
            : !row.profileId  ? 'pas de profil RH (initiales attendues)'
            : !row.photoUrl   ? 'profil sans photo (initiales attendues)'
            :                   this.avatarSvc.photoUrl(row));
        }
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  validerBudget(): void {
    if (this.budgetLoading()) return;
    this.budgetLoading.set(true);
    this.actionError.set(null);
    this.svc.validerBudget(this.numId).subscribe({
      next: () => { this.budgetLoading.set(false); this.loadAll(); },
      error: err => {
        this.budgetLoading.set(false);
        this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.BUDGET_ERROR'));
      },
    });
  }

  /**
   * Saisie d'un frais remboursable, dans une modale de taille moyenne : elle ne contient
   * que le formulaire, donc elle n'a pas besoin de la largeur d'un tableau.
   */
  private expensesModalRef: { close: () => void } | null = null;

  openExpenses(): void {
    this.expensesModalRef = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.EXPENSES_TITLE'),
      icon:  'receipt_long',
      size:  'md',
      body:  this.expensesTpl(),
      // Annuler / Soumettre côte à côte dans le pied, comme les modales de statut et de
      // validation TS. Le formulaire n'a plus de bouton à lui.
      buttons: [
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'),
          variant: 'secondary',
          action: r => { this.expenseForm()?.cancel(); r.close(); },
        },
        {
          label: this.translate.instant('AFFAIRES.EXPENSES.FORM.SUBMIT'),
          variant: 'primary',
          // Pas de `r.close()` ici : `submit()` est asynchrone et c'est `(submitted)` qui
          // ferme, une fois l'enregistrement confirmé. Fermer tout de suite masquerait
          // une erreur serveur et laisserait croire que le frais est enregistré.
          action: () => { this.expenseForm()?.submit(); },
        },
      ],
    });
  }

  /**
   * Après enregistrement : on ferme et on bascule sur l'onglet « Frais », où la ligne
   * qui vient d'être créée est visible. Rester dans un formulaire vidé ne dit pas si
   * l'enregistrement a abouti.
   */
  onExpenseSubmitted(): void {
    this.expensesModalRef?.close();
    this.expensesModalRef = null;
    this.activeTab.set('frais');
    // Un frais remboursable finit en ligne de facturation puis en facture : il déplace donc
    // Backlog et Total facturé, même s'il n'a rien à voir avec le WIP.
    this.refreshIndicators();
  }

  openStatutModal(): void {
    const transitions = this.availableTransitions();
    if (transitions.length === 0) return;
    this.targetStatut.set(transitions[0]);
    this.motif.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.STATUS_TITLE'),
      icon:  'swap_horiz',
      size:  'md',
      body:  this.statutTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitStatut(ref),
        },
      ],
    });
  }

  private submitStatut(ref: { close: () => void }): void {
    const statut = this.targetStatut();
    if (!statut) return;
    this.modalError.set(null);
    this.svc.changerStatut(this.numId, { newStatut: statut, reason: this.motif().trim() || null }).subscribe({
      next: () => { ref.close(); this.loadAll(); },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.STATUS_ERROR')),
    });
  }

  readonly statutRadioOptions = computed<RadioOption[]>(() => {
    this.translate.currentLang();
    return this.availableTransitions().map(s => ({
      value: s,
      label: this.translate.instant(STATUT_LABELS[s] ?? s),
    }));
  });

  readonly motifFieldOptions = computed<FormFieldOptions>(() => ({
    label:       this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON'),
    type:        'textarea',
    rows:        3,
    maxLength:   500,
    fullWidth:   true,
    placeholder: this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON_PLACEHOLDER'),
  }));

  // ── Validation d'un TS ───────────────────────────────────────────────────

  canValidateTechnique(ts: TsDto): boolean {
    return ts.statut === 'CREATED' && this.store.hasPermission('FACT_VALID_TECHNIQUE_TS');
  }

  canValidateCommerciale(ts: TsDto): boolean {
    return ts.statut === 'VALID_TECHNIQUE' && this.store.hasPermission('FACT_VALID_COMMERCIALE_TS');
  }

  readonly tsValidationSummary = computed(() => {
    const target = this.tsValidationTarget();
    if (!target) return '';
    return `${target.ts.referenceTs} · ${target.ts.intitule} — `
      + this.money(target.ts.montantEstime, target.ts.devise || this.affaireDevise());
  });

  readonly tsNotesFieldOptions = computed<FormFieldOptions>(() => ({
    label:     this.translate.instant('AFFAIRES.DETAIL.TS.NOTES'),
    type:      'textarea',
    rows:      3,
    maxLength: 500,
    fullWidth: true,
  }));

  openTsValidation(ts: TsDto, step: 'technique' | 'commerciale'): void {
    this.tsValidationTarget.set({ ts, step });
    this.tsNotes.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant(step === 'technique'
        ? 'AFFAIRES.DETAIL.TS.VALIDATE_TECH'
        : 'AFFAIRES.DETAIL.TS.VALIDATE_COMM'),
      icon: step === 'technique' ? 'fact_check' : 'handshake',
      size: 'md',
      body: this.tsValidationTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitTsValidation(ref),
        },
      ],
    });
  }

  private submitTsValidation(ref: { close: () => void }): void {
    const target = this.tsValidationTarget();
    if (!target) return;
    const notes = this.tsNotes().trim() || null;
    const call  = target.step === 'technique'
      ? this.svc.validerTechnique(target.ts.id, { notes })
      : this.svc.validerCommerciale(target.ts.id, { notes });

    this.modalError.set(null);
    call.subscribe({
      next: () => {
        ref.close();
        this.tsValidationTarget.set(null);
        this.loadTs();
        // Un TS validé peut passer INTEGRE, donc entrer dans la tuile TS : indicateurs
        // relus, pas seulement le RAF (que refreshIndicators recharge déjà).
        this.refreshIndicators();
      },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.TS.VALIDATE_ERROR')),
    });
  }

  // ── Modification / suppression d'un TS ───────────────────────────────────
  //
  // Mêmes règles que le serveur (TsService) : modifier seulement avant toute validation,
  // supprimer tant que le TS n'est ni intégré au budget ni facturé. La suppression est
  // logique (statut ANNULE) : la ligne et son historique restent consultables.

  canEditTs(ts: TsDto): boolean {
    return ts.statut === 'CREATED' && this.store.hasPermission('FACT_CREATE_TS');
  }

  canDeleteTs(ts: TsDto): boolean {
    return (ts.statut === 'CREATED' || ts.statut === 'VALID_TECHNIQUE')
      && this.store.hasPermission('FACT_CREATE_TS');
  }

  readonly tsDeleteSummary = computed(() => {
    const ts = this.tsDeleteTarget();
    return ts ? `${ts.referenceTs} · ${ts.intitule} — `
      + this.money(ts.montantEstime, ts.devise || this.affaireDevise()) : '';
  });

  readonly tsDeleteMotifOptions = computed<FormFieldOptions>(() => ({
    label:     this.translate.instant('AFFAIRES.DETAIL.TS.DELETE_MOTIF'),
    type:      'textarea',
    rows:      3,
    maxLength: 500,
    fullWidth: true,
  }));

  openTsDelete(ts: TsDto): void {
    this.tsDeleteTarget.set(ts);
    this.tsDeleteMotif.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.TS.DELETE_TITLE'),
      icon:  'delete',
      size:  'md',
      body:  this.tsDeleteTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.TS.DELETE_CONFIRM'),
          variant: 'primary',
          icon:    'delete',
          action: () => this.submitTsDelete(ref),
        },
      ],
    });
  }

  private submitTsDelete(ref: { close: () => void }): void {
    const ts = this.tsDeleteTarget();
    if (!ts) return;
    this.modalError.set(null);
    this.svc.annulerTS(ts.id, this.tsDeleteMotif().trim() || null).subscribe({
      next: () => {
        ref.close();
        this.tsDeleteTarget.set(null);
        this.loadTs();
        this.refreshIndicators();
      },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.TS.DELETE_ERROR')),
    });
  }

  /** Historique d'un TS, dans sa propre fenêtre (séparée de « Consulter »). */
  openTsHistory(ts: TsDto): void {
    this.tsHistory.set([]);
    this.tsHistoryLoading.set(true);
    this.modalError.set(null);
    this.svc.getTsHistory(ts.id).subscribe({
      next: list => { this.tsHistory.set(list); this.tsHistoryLoading.set(false); },
      error: () => {
        this.tsHistoryLoading.set(false);
        this.modalError.set(this.translate.instant('AFFAIRES.DETAIL.TS.HISTORY_ERROR'));
      },
    });

    this.modals.open({
      title: `${this.translate.instant('AFFAIRES.DETAIL.TS.HISTORY')} — ${ts.referenceTs}`,
      icon:  'history',
      size:  'lg',
      body:  this.tsHistoryTpl(),
    });
  }

  private static readonly TS_HISTORY_FIELDS: Record<string, string> = {
    statut:           'AFFAIRES.DETAIL.INVOICES.STATUS',
    intitule:         'AFFAIRES.DETAIL.MODAL.TS_INTITULE',
    montantEstime:    'AFFAIRES.DETAIL.MODAL.TS_AMOUNT',
    devise:           'AFFAIRES.ts.form.devise',
    perimetre:        'AFFAIRES.DETAIL.MODAL.TS_PERIMETRE',
    impactBudgetaire: 'AFFAIRES.DETAIL.MODAL.TS_IMPACT',
    description:      'AFFAIRES.ts.form.description',
    motif:            'AFFAIRES.DETAIL.TS.HISTORY_FIELD_MOTIF',
    detail:           'AFFAIRES.DETAIL.TS.HISTORY_FIELD_DETAIL',
  };

  tsHistoryActionText(action: string): string {
    const key = `AFFAIRES.DETAIL.TS.HISTORY_ACTIONS.${action}`;
    const label = this.translate.instant(key);
    return label === key ? action : label;
  }

  tsHistoryFieldText(field: string): string {
    const key = AffaireDetailComponent.TS_HISTORY_FIELDS[field];
    return key ? this.translate.instant(key) : field;
  }

  /** Valeur lisible : libellé du statut, `—` pour une valeur absente. */
  tsHistoryValueText(field: string, value: string | null): string {
    if (value === null || value === '') return '—';
    return field === 'statut' ? this.enumText('TS_STATUT', value) : value;
  }

  // ── Consultation d'une ligne ─────────────────────────────────────────────

  private openRowModal(row: RowDetail): void {
    this.modalRowState.set(row);
    const buttons = [
      { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CLOSE'), variant: 'secondary' as const,
        action: (r: { close: () => void }) => r.close() },
    ];
    if (row.openAction) {
      buttons.push({
        label: this.translate.instant(row.openAction.labelKey),
        variant: 'primary' as unknown as 'secondary',
        action: (r: { close: () => void }) => { r.close(); row.openAction!.run(); },
      });
    }
    this.modals.open({
      title: `${this.translate.instant(row.titleKey)} — ${row.ref}`,
      icon:  'visibility',
      size:  'md',
      body:  this.rowDetailTpl(),
      buttons,
    });
  }

  /**
   * Détail d'une facture. Les champs optionnels ne sont ajoutés que s'ils portent une
   * valeur : une ligne « Motif d'avoir — » sur une facture ordinaire, ou une période
   * vide sur un acompte, allongent la fenêtre sans rien apprendre.
   */
  openInvoiceView(inv: AffaireInvoiceItem): void {
    const devise = inv.devise || this.affaireDevise();
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.INVOICES.TYPE',    value: this.invoiceTypeText(inv.invoiceType) },
      { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',  value: this.enumText('INVOICE_STATUT', inv.statut) },
      { label: 'AFFAIRES.DETAIL.INFO.CLIENT',      value: inv.clientNom ?? this.affaire()?.clientName ?? '—' },
    ];
    if (inv.billingMode) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.BILLING_MODE', value: this.enumText('BILLING_MODE', inv.billingMode) });
    }
    if (inv.periodFrom || inv.periodTo) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.PERIOD',
                    value: `${this.formatDate(inv.periodFrom)} — ${this.formatDate(inv.periodTo)}` });
    }
    if (inv.progressPct != null) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.PROGRESS', value: `${inv.progressPct} %` });
    }
    fields.push(
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT_HT',  value: this.money(inv.montantHt ?? null, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT_TVA', value: this.money(inv.montantTva ?? null, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT',     value: this.money(inv.montantTtc, devise) },
      { label: 'AFFAIRES.DETAIL.INVOICES.SUBMITTED',  value: this.formatDate(inv.submittedAt) },
      { label: 'AFFAIRES.DETAIL.INVOICES.EMITTED',    value: this.formatDate(inv.dateEmission) },
      { label: 'AFFAIRES.DETAIL.INVOICES.SENT',       value: this.formatDate(inv.sentAt) },
      { label: 'AFFAIRES.DETAIL.INVOICES.DUE',        value: this.formatDate(inv.dateEcheance) },
    );
    if (inv.creditNoteReason) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.CREDIT_REASON', value: inv.creditNoteReason });
    }
    if (inv.disputeOpenedAt) {
      fields.push({ label: 'AFFAIRES.DETAIL.INVOICES.DISPUTE',
                    value: `${this.formatDate(inv.disputeOpenedAt)} → ${this.formatDate(inv.disputeResolvedAt)}` });
    }
    if (inv.notes) {
      fields.push({ label: 'AFFAIRES.DETAIL.INFO.NOTES', value: inv.notes });
    }

    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.INVOICE_TITLE',
      ref:      inv.invoiceNumber ?? `#${inv.id}`,
      fields,
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_INVOICE', run: () => this.goToInvoice(inv.id) },
    });
  }

  openPaymentView(p: AffairePaymentItem): void {
    const devise = p.currency || this.affaireDevise();
    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.PAYMENT_TITLE',
      ref:      p.invoiceNumber ?? `#${p.id}`,
      fields: [
        { label: 'AFFAIRES.DETAIL.PAYMENTS.DATE',      value: this.formatDate(p.paymentDate) },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.INVOICE',   value: p.invoiceNumber ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.METHOD',    value: this.enumText('PAYMENT_METHOD', p.paymentMethod) },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.REFERENCE', value: p.bankReference ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.AMOUNT',    value: this.money(p.amountLocal, devise) },
        { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(p.recordedAt) },
        { label: 'AFFAIRES.DETAIL.INFO.NOTES',         value: p.notes ?? '—' },
      ],
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_PAYMENTS', run: () => this.goToPayments() },
    });
  }

  /**
   * Détail d'un TS. Les deux validations sont montrées avec leur date ET leur note :
   * c'est l'historique de la décision, et c'est ce qu'on vient vérifier. Les notes
   * n'apparaissent que lorsqu'elles existent.
   */
  openTsView(ts: TsDto): void {
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.MODAL.TS_INTITULE',      value: ts.intitule },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_AMOUNT',        value: this.money(ts.montantEstime, ts.devise || this.affaireDevise()) },
      { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',        value: this.enumText('TS_STATUT', ts.statut) },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_PERIMETRE',     value: ts.perimetre ?? '—' },
      { label: 'AFFAIRES.DETAIL.MODAL.TS_IMPACT',        value: ts.impactBudgetaire ?? '—' },
      { label: 'AFFAIRES.DETAIL.TS.VALID_TECH_AT',       value: this.formatDate(ts.validTechniqueAt) },
    ];
    if (ts.validTechniqueNotes) {
      fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_TECH_NOTES', value: ts.validTechniqueNotes });
    }
    fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_COMM_AT', value: this.formatDate(ts.validCommercialeAt) });
    if (ts.validCommercialeNotes) {
      fields.push({ label: 'AFFAIRES.DETAIL.TS.VALID_COMM_NOTES', value: ts.validCommercialeNotes });
    }
    fields.push(
      { label: 'AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT', value: this.formatDate(ts.integreAuBudgetAt) },
      { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT',     value: this.formatDate(ts.createdAt) },
      { label: 'AFFAIRES.DETAIL.INFO.NOTES',             value: ts.description ?? '—' },
    );

    // Fenêtre propre au TS (et non `openRowModal`) : Modifier / Supprimer au pied,
    // affichés selon les mêmes règles que le serveur. L'historique a sa propre fenêtre.
    this.modalRowState.set({ titleKey: 'AFFAIRES.DETAIL.MODAL.TS_TITLE', ref: ts.referenceTs, fields });
    this.modalError.set(null);

    type Btn = { label: string; variant: 'primary' | 'secondary'; icon?: string;
                 action: (r: { close: () => void }) => void };
    // Pas de bouton « Fermer » : la croix de l'en-tête suffit. Sans action possible
    // (TS validé, intégré, annulé…), la modale n'a donc pas de pied du tout.
    const buttons: Btn[] = [];
    if (this.canDeleteTs(ts)) {
      buttons.push({
        label: this.translate.instant('AFFAIRES.DETAIL.TS.DELETE'), variant: 'secondary',
        action: r => { r.close(); this.openTsDelete(ts); },
      });
    }
    if (this.canEditTs(ts)) {
      buttons.push({
        label: this.translate.instant('AFFAIRES.DETAIL.TS.EDIT'), variant: 'primary', icon: 'edit',
        action: r => { r.close(); this.openTsForm(ts); },
      });
    }

    this.modals.open({
      title: `${this.translate.instant('AFFAIRES.DETAIL.MODAL.TS_TITLE')} — ${ts.referenceTs}`,
      icon:  'visibility',
      size:  'lg',
      body:  this.rowDetailTpl(),
      buttons: buttons.length ? buttons : undefined,
    });
  }

  // ── Édition d'une ligne ──────────────────────────────────────────────────
  //
  // Il n'existe pas d'API de mise à jour ligne-à-ligne : une facture ne se modifie
  // que par son propre écran (et seulement tant qu'elle est modifiable), un paiement
  // se gère dans le module Paiements.

  canEditInvoice(inv: AffaireInvoiceItem): boolean {
    return EDITABLE_INVOICE_STATUTS.has(inv.statut ?? '');
  }

  editInvoice(inv: AffaireInvoiceItem): void {
    if (this.canEditInvoice(inv)) this.goToInvoice(inv.id);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  // Plus de `goBack()` : le retour à la liste est le lien du fil d'Ariane. La méthode
  // pointait `['../..']` (soit `/finance`) et écrasait ce lien.
  openEdit():     void { this.router.navigate(['edit'],   { relativeTo: this.route }); }

  /** Suppression logique d'un brouillon, après confirmation, puis retour à la liste. */
  confirmDelete(): void {
    const a = this.affaire();
    if (!a) return;
    const t = (key: string) => this.translate.instant(key, { reference: a.reference, intitule: a.intitule });
    this.modals.open({
      title: t('AFFAIRES.LIST.DELETE.TITLE'),
      icon:  'delete',
      size:  'sm',
      body:  t('AFFAIRES.LIST.DELETE.BODY'),
      buttons: [
        { label: t('AFFAIRES.LIST.DELETE.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label:   t('AFFAIRES.LIST.DELETE.CONFIRM'),
          variant: 'primary',
          icon:    'delete',
          action:  r => {
            r.close();
            this.svc.deleteAffaire(a.id).subscribe({
              next: () => {
                this.toast.success(t('AFFAIRES.LIST.DELETE.SUCCESS'));
                this.router.navigate(['..'], { relativeTo: this.route });
              },
              error: err => this.toast.error(err?.error?.message ?? t('AFFAIRES.LIST.DELETE.ERROR')),
            });
          },
        },
      ],
    });
  }

  /**
   * Nouveau TS — le corps du formulaire dans une `daf-modal`, avec le bouton de
   * confirmation de la modale plutôt qu'un pied de page interne.
   *
   * `submit()` renvoie `false` quand la saisie est incomplète : la fenêtre reste alors
   * ouverte sur ses messages d'erreur, au lieu de se refermer en silence.
   */
  openTsForm(ts: TsDto | null = null): void {
    // Lu par le template au moment où la modale crée le formulaire : le poser avant `open`.
    this.tsEditTarget.set(ts);
    this.tsFormModalRef = this.modals.open({
      title: this.translate.instant(ts ? 'AFFAIRES.ts.form.edit_title' : 'AFFAIRES.ts.form.title'),
      icon:  ts ? 'edit' : 'post_add',
      size:  'md',
      body:  this.tsFormTpl(),
      buttons: [
        {
          label: this.translate.instant('AFFAIRES.ts.actions.cancel'),
          variant: 'secondary',
          action: r => { this.tsForm()?.cancel(); r.close(); },
        },
        {
          label: this.translate.instant(ts ? 'AFFAIRES.ts.form.save' : 'AFFAIRES.ts.form.create'),
          variant: 'primary',
          action: () => { this.tsForm()?.submit(); },
        },
      ],
    });
  }

  /**
   * « Nouvelle facture » ouvre l'ASSISTANT de création, affaire déjà sélectionnée — et
   * non plus la liste des factures filtrée, qui obligeait à recliquer sur « Nouvelle
   * facture » puis à rechercher l'affaire qu'on venait de quitter.
   * `step-affaire` lit `?affaire=` et joue sa propre sélection (RAF, mode, TS compris).
   */
  goToInvoicing(): void {
    this.router.navigate(['../../invoicing', 'new'], {
      relativeTo: this.route,
      queryParams: { affaire: this.numId },
    });
  }

  private goToInvoice(id: number): void {
    this.router.navigate(['../../invoicing', id], { relativeTo: this.route });
  }

  goToPayments(): void {
    this.router.navigate(['../../recouvrement'], { relativeTo: this.route, queryParams: { affaire: this.numId } });
  }

  onTsFormClosed(saved: boolean): void {
    this.tsFormModalRef?.close();
    this.tsFormModalRef = null;
    this.tsEditTarget.set(null);
    if (saved) { this.loadTs(); this.refreshIndicators(); }
  }

  // ═══ Export Excel ═════════════════════════════════════════════════════════
  //
  // Générés par le backend (AffaireExportController) : on envoie les ids des lignes
  // filtrées (pas seulement la page affichée), le serveur relit TS / factures / paiements
  // de l'affaire et les écrit dans cet ordre. Remplace les anciens CSV faits ici.

  exportTs(): void {
    const ref = this.affaire()?.reference ?? this.numId;
    this.exportSvc.download(this.exportSvc.affaireTs(this.numId, this.filteredTs().map(ts => ts.id)),
      `TS_${ref}.xlsx`, this.exporting);
  }

  exportInvoices(): void {
    const ref = this.affaire()?.reference ?? this.numId;
    this.exportSvc.download(this.exportSvc.affaireInvoices(this.numId, this.filteredInvoices().map(i => i.id)),
      `Factures_${ref}.xlsx`, this.exporting);
  }

  exportPayments(): void {
    const ref = this.affaire()?.reference ?? this.numId;
    this.exportSvc.download(this.exportSvc.affairePayments(this.numId, this.filteredPayments().map(p => p.id)),
      `Paiements_${ref}.xlsx`, this.exporting);
  }

  // ═══ Formatage ════════════════════════════════════════════════════════════

  /** Montant dans la devise d'affichage courante — même pipe que le reste du module. */
  private money(v: number | null | undefined, devise?: string): string {
    return this.currency.transform(v ?? null, devise ?? this.affaireDevise());
  }

  formatPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
  }

  // `undefined` admis en plus de `null` : les champs de facture ajoutés au modèle sont
  // optionnels (`periodFrom?`, `sentAt?`…), et une date absente s'affiche « — » dans les
  // deux cas. Élargir la signature évite de semer des `?? null` sur chaque appel.
  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /**
   * Jour + mois ABRÉGÉ + année : « 01 sept. 2026 ». La période du panneau de gauche en a
   * besoin sur une seule ligne dans 300 px, ce que le mois en entier ne permet pas.
   * L'année reste, elle : une affaire court sur plusieurs exercices.
   */
  private formatDateShort(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR',
      { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private priorityOf(date: string, now: number): 'high' | 'medium' | 'standard' {
    const days = (new Date(date).getTime() - now) / 86_400_000;
    return days < 0 ? 'high' : days <= 15 ? 'medium' : 'standard';
  }
}
