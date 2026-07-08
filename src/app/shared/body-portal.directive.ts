import { Directive, ElementRef, OnDestroy, OnInit, Renderer2, inject } from '@angular/core';

/**
 * Relocates the host element to <body> on init and removes it on destroy.
 *
 * Use it on a wrapper around `position: fixed` overlays (modals, drawers) that
 * live inside a card using `backdrop-filter` / `transform` / `filter`. Those
 * properties make the ancestor the containing block for fixed descendants, so
 * the overlay anchors to the card instead of the viewport and gets clipped by
 * `overflow: hidden`. Moving the wrapper to <body> restores viewport-relative
 * positioning. Angular keeps tracking the element (bindings, events, ngModel)
 * regardless of its DOM parent, so nothing else changes.
 */
@Directive({
  selector: '[appBodyPortal]',
  standalone: true,
})
export class BodyPortalDirective implements OnInit, OnDestroy {
  private readonly host     = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);

  ngOnInit(): void {
    this.renderer.appendChild(document.body, this.host.nativeElement);
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    // Detach ourselves; if Angular's view teardown runs afterwards it reads the
    // (now null) parent and skips, so there's no double-removal error.
    if (el.parentNode) {
      this.renderer.removeChild(el.parentNode, el);
    }
  }
}
