import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ClientService } from '../client.service';
import { ClientDetailDto } from '../client.model';
import { ClientFormComponent } from '../client-form.component';

@Component({
  selector: 'app-client-new',
  imports: [ClientFormComponent],
  templateUrl: './client-new.component.html',
  styleUrl: './client-new.component.scss',
})
export class ClientNewComponent implements OnInit {
  private readonly svc   = inject(ClientService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  readonly paysId = signal(0);

  ngOnInit(): void {
    this.svc.getPays().subscribe(pays => {
      if (pays.length > 0) this.paysId.set(pays[0].id);
    });
  }

  onSaved(client: ClientDetailDto): void {
    this.router.navigate(['..', client.id], { relativeTo: this.route });
  }

  goBack(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
