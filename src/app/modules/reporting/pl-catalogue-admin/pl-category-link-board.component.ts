import {
  Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
import { PlCostCategoryDto, PlCostLineDto } from '../pl-catalogue.model';

export interface CategoryLinkChange {
  categoryCode: string;
  /** `null` = the link is removed (the category becomes unlinked). */
  lineId: number | null;
}

interface Arrow {
  categoryCode: string;
  lineId: number;
  d: string;
  outOfPl: boolean;
}

/**
 * "Catégories de coût → lignes P&L": the pays' cost categories on the left, the P&L cost lines
 * on the right, one arrow per category. A category is linked by dragging it (or its handle)
 * onto a line, or by clicking it then clicking a line; linking it again moves its single arrow.
 * Clicking an arrow (or the × on a linked category) removes the link. Unlinked categories stay
 * red — the parent blocks saving until there are none.
 *
 * Purely presentational: `links` in, `linkChange` out. Below the `md` breakpoint the board is
 * replaced by one select per category (arrows need room).
 */
@Component({
  selector: 'app-pl-category-link-board',
  imports: [TranslatePipe, SelectComponent],
  host: { class: 'block' },
  template: `
    <!-- Narrow screens: one select per category -->
    <div class="md:hidden flex flex-col gap-2">
      @for (c of categories(); track c.code) {
        <div class="flex flex-col gap-1 rounded-xl border px-3 py-2"
             [class.border-danger]="!links()[c.code]" [class.border-neutral-200]="!!links()[c.code]">
          <span class="text-sm font-medium text-neutral-800">{{ c.labelFr }}</span>
          <span class="text-xs text-neutral-500">{{ c.code }}</span>
          <daf-select
            [options]="lineOptions()"
            [selected]="links()[c.code] ? ['' + links()[c.code]] : []"
            [config]="{ placeholder: ('REPORTING.PL_CATALOGUE.LINKS.PICK_LINE' | translate) }"
            [ariaLabel]="('REPORTING.PL_CATALOGUE.LINKS.PICK_LINE' | translate) + ' — ' + c.labelFr"
            (selectedChange)="onSelect(c.code, $event)" />
        </div>
      }
    </div>

    <!-- Board with arrows -->
    <div #board class="hidden md:grid relative select-none grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)_minmax(0,1fr)]"
         (pointermove)="onPointerMove($event)" (pointerup)="onPointerUp($event)"
         (pointercancel)="cancelDrag()" (keydown.escape)="cancelDrag(); pendingCategory.set(null)">

      <div class="flex flex-col gap-2 min-w-0">
        <div class="text-xs font-medium text-neutral-500 pb-1">
          {{ 'REPORTING.PL_CATALOGUE.LINKS.COL_CATEGORIES' | translate }}
        </div>
        @for (c of categories(); track c.code) {
          <div class="group relative flex items-center gap-2 rounded-xl border bg-white px-3 py-2 transition-shadow cursor-grab"
               [attr.data-cat]="c.code"
               [class.border-danger]="!links()[c.code]"
               [class.bg-danger/5]="!links()[c.code]"
               [class.border-neutral-200]="!!links()[c.code] && pendingCategory() !== c.code"
               [class.ring-2]="pendingCategory() === c.code"
               [class.ring-primary]="pendingCategory() === c.code"
               [class.border-primary]="pendingCategory() === c.code"
               [class.opacity-40]="isDimmedCategory(c.code)"
               (pointerdown)="startDrag($event, c.code)"
               (mouseenter)="hoveredCategory.set(c.code)" (mouseleave)="hoveredCategory.set(null)">
            <button type="button" class="flex-1 min-w-0 text-left outline-none focus-visible:underline"
                    [attr.aria-pressed]="pendingCategory() === c.code"
                    [attr.aria-label]="ariaForCategory(c)"
                    (click)="togglePending(c.code)">
              <span class="block truncate text-sm font-medium text-neutral-800" [title]="c.labelFr">{{ c.labelFr }}</span>
              <span class="block truncate text-xs text-neutral-500">{{ c.code }}</span>
            </button>
            @if (links()[c.code]) {
              <button type="button"
                      class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-neutral-400 hover:text-danger"
                      [attr.aria-label]="('REPORTING.PL_CATALOGUE.LINKS.UNLINK' | translate) + ' — ' + c.labelFr"
                      (pointerdown)="$event.stopPropagation()"
                      (click)="unlink(c.code)">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            } @else {
              <span class="text-xs font-medium text-danger whitespace-nowrap">
                {{ 'REPORTING.PL_CATALOGUE.LINKS.UNLINKED' | translate }}
              </span>
            }
            <span class="absolute -right-[7px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white"
                  [class.bg-primary]="!!links()[c.code]" [class.bg-danger]="!links()[c.code]"></span>
          </div>
        }
      </div>

      <div></div>

      <div class="flex flex-col gap-2 min-w-0">
        <div class="text-xs font-medium text-neutral-500 pb-1">
          {{ 'REPORTING.PL_CATALOGUE.LINKS.COL_LINES' | translate }}
        </div>
        @for (l of costLines(); track l.id) {
          <button type="button"
                  class="relative flex items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  [attr.data-line]="l.id"
                  [class.border-dashed]="l.code === 'OUT_OF_PL'"
                  [class.border-primary]="dropTarget() === l.id || hoveredLine() === l.id"
                  [class.bg-primary/5]="dropTarget() === l.id"
                  [class.border-neutral-200]="dropTarget() !== l.id && hoveredLine() !== l.id"
                  [class.opacity-40]="isDimmedLine(l.id)"
                  [attr.aria-label]="ariaForLine(l)"
                  (click)="linkPendingTo(l.id)"
                  (mouseenter)="hoveredLine.set(l.id)" (mouseleave)="hoveredLine.set(null)">
            <span class="absolute -left-[7px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white"
                  [class.bg-primary]="countFor(l.id) > 0" [class.bg-neutral-300]="countFor(l.id) === 0"></span>
            <span class="w-10 shrink-0 text-xs font-semibold tabular-nums text-neutral-500">
              {{ l.excelRow ? ('REPORTING.PL_CATALOGUE.LINKS.ROW' | translate: { row: l.excelRow }) : '—' }}
            </span>
            <span class="flex-1 min-w-0 truncate text-sm font-medium text-neutral-800">{{ lineLabel(l) }}</span>
            <span class="rounded-full px-2 py-0.5 text-xs tabular-nums"
                  [class.bg-primary/10]="countFor(l.id) > 0" [class.text-primary]="countFor(l.id) > 0"
                  [class.bg-neutral-100]="countFor(l.id) === 0" [class.text-neutral-400]="countFor(l.id) === 0">
              {{ countFor(l.id) }}
            </span>
          </button>
        }
      </div>

      <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary" aria-hidden="true">
        <defs>
          <marker id="pl-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <marker id="pl-link-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" class="fill-neutral-400" />
          </marker>
        </defs>
        @for (a of arrows(); track a.categoryCode) {
          <g class="pointer-events-auto cursor-pointer" (click)="unlink(a.categoryCode)"
             (mouseenter)="hoveredArrow.set(a.categoryCode)" (mouseleave)="hoveredArrow.set(null)">
            <title>{{ 'REPORTING.PL_CATALOGUE.LINKS.ARROW_HINT' | translate }}</title>
            <path [attr.d]="a.d" fill="none" stroke="transparent" stroke-width="14" />
            <path [attr.d]="a.d" fill="none"
                  [attr.stroke]="a.outOfPl ? null : 'currentColor'"
                  [class.stroke-neutral-400]="a.outOfPl"
                  [attr.stroke-dasharray]="a.outOfPl ? '5 4' : null"
                  [attr.stroke-width]="isHighlighted(a) ? 2.5 : 1.5"
                  [attr.opacity]="isDimmedArrow(a) ? 0.15 : (isHighlighted(a) ? 1 : 0.55)"
                  [attr.marker-end]="a.outOfPl ? 'url(#pl-link-arrow-muted)' : 'url(#pl-link-arrow)'"
                  [class.stroke-danger]="hoveredArrow() === a.categoryCode" />
          </g>
        }
        @if (dragPath(); as d) {
          <path [attr.d]="d" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"
                marker-end="url(#pl-link-arrow)" />
        }
      </svg>
    </div>
  `,
})
export class PlCategoryLinkBoardComponent {
  readonly categories = input.required<PlCostCategoryDto[]>();
  readonly costLines = input.required<PlCostLineDto[]>();
  /** categoryCode → linked cost line id. */
  readonly links = input.required<Record<string, number>>();
  readonly linkChange = output<CategoryLinkChange>();

  private readonly board = viewChild<ElementRef<HTMLElement>>('board');
  private readonly destroyRef = inject(DestroyRef);

  readonly pendingCategory = signal<string | null>(null);
  readonly hoveredCategory = signal<string | null>(null);
  readonly hoveredLine = signal<number | null>(null);
  readonly hoveredArrow = signal<string | null>(null);

  private readonly dragFrom = signal<string | null>(null);
  private readonly dragPoint = signal<{ x: number; y: number } | null>(null);
  readonly dropTarget = signal<number | null>(null);

  /** Anchor points measured off the DOM, relative to the board. */
  private readonly geometry = signal<{
    cats: Record<string, { x: number; y: number }>;
    lines: Record<number, { x: number; y: number }>;
  }>({ cats: {}, lines: {} });

  readonly lineOptions = computed<SelectOption[]>(() =>
    this.costLines().map(l => ({ value: String(l.id), label: this.lineLabel(l, true) })));

  private readonly counts = computed(() => {
    const counts = new Map<number, number>();
    for (const c of this.categories()) {
      const id = this.links()[c.code];
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });

  readonly arrows = computed<Arrow[]>(() => {
    const g = this.geometry();
    const outOfPl = new Set(this.costLines().filter(l => l.code === 'OUT_OF_PL').map(l => l.id));
    const result: Arrow[] = [];
    for (const c of this.categories()) {
      const lineId = this.links()[c.code];
      const from = g.cats[c.code];
      const to = lineId ? g.lines[lineId] : undefined;
      if (!from || !to) continue;
      result.push({ categoryCode: c.code, lineId, d: curve(from, to), outOfPl: outOfPl.has(lineId) });
    }
    return result;
  });

  readonly dragPath = computed(() => {
    const from = this.dragFrom();
    const p = this.dragPoint();
    const start = from ? this.geometry().cats[from] : undefined;
    return start && p ? curve(start, p) : null;
  });

  constructor() {
    // Re-measure after every render that changed the lists or the links; a ResizeObserver
    // covers width changes (sidebar toggle, window resize) that re-wrap the cards.
    afterRenderEffect(() => {
      this.categories();
      this.costLines();
      this.links();
      this.measure();
    });
    const ro = new ResizeObserver(() => this.measure());
    afterRenderEffect(() => {
      const el = this.board()?.nativeElement;
      if (el) ro.observe(el);
    });
    this.destroyRef.onDestroy(() => ro.disconnect());
  }

  private measure(): void {
    const el = this.board()?.nativeElement;
    if (!el || el.offsetParent === null) return;
    const origin = el.getBoundingClientRect();
    const cats: Record<string, { x: number; y: number }> = {};
    el.querySelectorAll<HTMLElement>('[data-cat]').forEach(n => {
      const r = n.getBoundingClientRect();
      cats[n.dataset['cat']!] = { x: r.right - origin.left, y: r.top + r.height / 2 - origin.top };
    });
    const lines: Record<number, { x: number; y: number }> = {};
    el.querySelectorAll<HTMLElement>('[data-line]').forEach(n => {
      const r = n.getBoundingClientRect();
      lines[Number(n.dataset['line'])] = { x: r.left - origin.left, y: r.top + r.height / 2 - origin.top };
    });
    const prev = this.geometry();
    if (JSON.stringify(prev) !== JSON.stringify({ cats, lines })) this.geometry.set({ cats, lines });
  }

  // ── click-to-link ──────────────────────────────────────────────────────────

  togglePending(code: string): void {
    if (this.suppressClick) { this.suppressClick = false; return; }
    this.pendingCategory.update(p => (p === code ? null : code));
  }

  linkPendingTo(lineId: number): void {
    const code = this.pendingCategory();
    if (!code) return;
    this.linkChange.emit({ categoryCode: code, lineId });
    this.pendingCategory.set(null);
  }

  unlink(code: string): void {
    this.hoveredArrow.set(null);
    this.linkChange.emit({ categoryCode: code, lineId: null });
  }

  onSelect(code: string, values: string[]): void {
    const id = Number(values[0]);
    this.linkChange.emit({ categoryCode: code, lineId: Number.isFinite(id) && id > 0 ? id : null });
  }

  // ── drag-to-link ───────────────────────────────────────────────────────────

  private dragStart: { x: number; y: number } | null = null;
  private suppressClick = false;

  startDrag(e: PointerEvent, code: string): void {
    if (e.button !== 0) return;
    this.dragFrom.set(code);
    this.dragStart = { x: e.clientX, y: e.clientY };
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragFrom() || !this.dragStart) return;
    // A few pixels of slack so a plain click stays a click (the pointer is only captured once
    // the drag really starts -- capturing on pointerdown would retarget the click itself).
    if (!this.dragPoint()) {
      if (Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 6) return;
      this.board()?.nativeElement.setPointerCapture(e.pointerId);
    }
    const origin = this.board()!.nativeElement.getBoundingClientRect();
    this.dragPoint.set({ x: e.clientX - origin.left, y: e.clientY - origin.top });
    this.dropTarget.set(this.lineAt(e.clientX, e.clientY));
  }

  onPointerUp(e: PointerEvent): void {
    const from = this.dragFrom();
    const dragged = this.dragPoint() !== null;
    if (from && dragged) {
      const lineId = this.lineAt(e.clientX, e.clientY);
      if (lineId) this.linkChange.emit({ categoryCode: from, lineId });
      this.suppressClick = true;
      this.pendingCategory.set(null);
    }
    this.cancelDrag();
  }

  cancelDrag(): void {
    this.dragFrom.set(null);
    this.dragPoint.set(null);
    this.dropTarget.set(null);
    this.dragStart = null;
  }

  private lineAt(clientX: number, clientY: number): number | null {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-line]');
    return el ? Number(el.dataset['line']) : null;
  }

  // ── highlighting ───────────────────────────────────────────────────────────

  countFor(lineId: number): number {
    return this.counts().get(lineId) ?? 0;
  }

  isHighlighted(a: Arrow): boolean {
    return this.hoveredLine() === a.lineId || this.hoveredCategory() === a.categoryCode
      || this.hoveredArrow() === a.categoryCode;
  }

  isDimmedArrow(a: Arrow): boolean {
    const line = this.hoveredLine();
    return line !== null && line !== a.lineId;
  }

  isDimmedCategory(code: string): boolean {
    const line = this.hoveredLine();
    return line !== null && !this.dragFrom() && this.links()[code] !== line;
  }

  isDimmedLine(lineId: number): boolean {
    const cat = this.hoveredCategory();
    if (cat === null || this.dragFrom() || this.pendingCategory()) return false;
    const linked = this.links()[cat];
    return !!linked && linked !== lineId;
  }

  lineLabel(l: PlCostLineDto, withRow = false): string {
    const label = l.code === 'OUT_OF_PL' ? 'Hors P&L' : l.label;
    return withRow && l.excelRow ? `${l.excelRow} · ${label}` : label;
  }

  ariaForCategory(c: PlCostCategoryDto): string {
    const lineId = this.links()[c.code];
    const line = this.costLines().find(l => l.id === lineId);
    return line ? `${c.labelFr} → ${this.lineLabel(line, true)}` : c.labelFr;
  }

  ariaForLine(l: PlCostLineDto): string {
    return `${this.lineLabel(l, true)} (${this.countFor(l.id)})`;
  }
}

/** Horizontal S-curve from a category's right edge to a line's left edge. */
function curve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(40, (to.x - from.x) / 2);
  return `M ${from.x + 7} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x - 9} ${to.y}`;
}
