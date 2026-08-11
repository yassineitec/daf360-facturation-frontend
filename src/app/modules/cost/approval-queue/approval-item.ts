import { BadgeVariant } from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { HiringCostApprovalDto } from '../hiring-cost-approval.service';
import { Urgency, urgency } from '../cost-display';

/**
 * This page merges **two independent queues** into one grid — cost lines awaiting a
 * finance decision, and hiring (salary) cost approvals. They share nothing in the API,
 * so the old template carried two near-identical 60-line card blocks that had already
 * drifted apart (different chips, different dot colours, different action rows).
 *
 * `ApprovalItem` is the one shape both are mapped onto, so the card view, the table
 * view and the filters all read the same thing.
 */
export type ApprovalKind = 'cost' | 'hiring';

export interface ApprovalMetric {
  label: string;
  value: string;
}

export interface ApprovalItem {
  /** `kind-id`: ids come from two different tables and can collide. */
  key:       string;
  kind:      ApprovalKind;
  id:        number;
  reference: string;
  title:     string;
  /** Approval level (`L1`–`L4`). Cost lines only — hiring requests carry no level. */
  level:     string | null;
  urgency:   Urgency;
  dateLabel: string;
  amountLabel: string;
  metrics:   ApprovalMetric[];
  /** Exactly one of these is set, per `kind`. */
  cost?:     CostLineDto;
  hiring?:   HiringCostApprovalDto;
}

export const KIND_BADGE_VARIANT: Record<ApprovalKind, BadgeVariant> = {
  cost:   'info',
  hiring: 'secondary',
};

export function kindKey(kind: ApprovalKind): string {
  return `COST.APPROVAL_QUEUE.KIND_${kind.toUpperCase()}`;
}

/**
 * A hiring request has no approval level, so it cannot be urgent by the cost-line rule.
 * It is treated as `normal` rather than borrowing a level it does not have.
 */
export function itemUrgency(kind: ApprovalKind, level: string | null): Urgency {
  return kind === 'cost' ? urgency(level) : 'normal';
}
