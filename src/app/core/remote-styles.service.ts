import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RemoteStylesService {
  injectStyles(url: string): void {
    if (!url) return;
    const id = 'remote-styles-facturation';
    // Cache-bust on every call — without this, once the <link> exists the
    // browser (and this guard) both keep serving whatever styles.css was
    // fetched the first time this remote loaded in the session, so CSS
    // fixes only ever showed up after a full page refresh instead of on
    // the next navigation into /finance/*.
    const bustedUrl = url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      existing.href = bustedUrl;
      return;
    }
    const link = document.createElement('link');
    link.id   = id;
    link.rel  = 'stylesheet';
    link.href = bustedUrl;
    document.head.appendChild(link);
  }
}
