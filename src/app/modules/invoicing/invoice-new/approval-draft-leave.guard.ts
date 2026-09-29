import { CanDeactivateFn } from '@angular/router';
// Type-only: the routes file imports this guard eagerly, the component must stay lazy.
import type { InvoiceNewComponent } from './invoice-new.component';

/**
 * Leaving the invoice stepper opened by a DF approval without saving must not strand the
 * draft invoice the approval created — the component decides (and asks) itself, see
 * InvoiceNewComponent.canDeactivate(). A no-op outside that flow.
 */
export const approvalDraftLeaveGuard: CanDeactivateFn<InvoiceNewComponent> =
  component => component.canDeactivate();
