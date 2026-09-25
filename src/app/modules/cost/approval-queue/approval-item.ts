import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { HiringCostApprovalDto } from '../hiring-cost-approval.service';
import { SalaryAdvanceDto } from '../salary-advances/salary-advance-approval.service';
import { Urgency, urgency } from '../cost-display';

/**
 * This page merges **three independent queues** into one grid — cost lines awaiting a
 * finance decision, hiring (salary) cost approvals, and salary advances (rh V103). They
 * share nothing in the API, so the old template carried near-identical card blocks that
 * had already drifted apart (different chips, different dot colours, different action rows).
 *
 * `ApprovalItem` is the one shape all three are mapped onto, so the card view, the table
 * view and the filters all read the same thing.
 */
export type ApprovalKind = 'cost' | 'hiring' | 'advance';

export interface ApprovalMetric {
  label: string;
  value: string;
}

export interface ApprovalItem {
  /** `kind-id`: ids come from different tables and can collide. */
  key:       string;
  kind:      ApprovalKind;
  id:        number;
  reference: string;
  title:     string;
  /** Approval level (`L1`–`L4`). Cost lines only — the other kinds carry no level. */
  level:     string | null;
  urgency:   Urgency;
  dateLabel: string;
  amountLabel: string;
  metrics:   ApprovalMetric[];
  /** Exactly one of these is set, per `kind`. */
  cost?:     CostLineDto;
  hiring?:   HiringCostApprovalDto;
  /** A salary advance awaiting finance's decision (payroll owns everything after it). */
  advance?:  SalaryAdvanceDto;
}

export const KIND_BADGE_VARIANT: Record<ApprovalKind, BadgeVariant> = {
  cost:    'info',
  hiring:  'secondary',
  advance: 'success',
};

export function kindKey(kind: ApprovalKind): string {
  return `COST.APPROVAL_QUEUE.KIND_${kind.toUpperCase()}`;
}

/**
 * Only a cost line has an approval level, so only a cost line can be urgent by the level
 * rule. The other kinds are treated as `normal` rather than borrowing a level they lack.
 */
export function itemUrgency(kind: ApprovalKind, level: string | null): Urgency {
  return kind === 'cost' ? urgency(level) : 'normal';
}
