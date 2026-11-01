import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PunchAction, PunchService } from './punch.service';

interface Status {
  kind: 'success' | 'warning' | 'error';
  text: string;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly punch = inject(PunchService);

  protected readonly actions: { action: PunchAction; label: string; css: string }[] = [
    { action: 'Login', label: 'Login', css: 'login' },
    { action: 'Logout', label: 'Logout', css: 'logout' },
    { action: 'Open Door', label: 'Open Door', css: 'door' },
  ];

  protected readonly hasPin = signal(!!this.punch.getPin());
  protected readonly pinInput = signal('');
  protected readonly busy = signal<PunchAction | 'pin' | null>(null);
  protected readonly status = signal<Status | null>(null);
  protected readonly now = signal(new Date());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async savePin(): Promise<void> {
    const pin = this.pinInput().trim();
    if (!pin) return;
    this.busy.set('pin');
    this.status.set(null);
    try {
      await this.punch.verifyPin(pin);
      this.punch.savePin(pin);
      this.pinInput.set('');
      this.hasPin.set(true);
    } catch (err) {
      this.status.set({ kind: 'error', text: this.errorText(err, 'Wrong PIN') });
    } finally {
      this.busy.set(null);
    }
  }

  protected changePin(): void {
    this.punch.clearPin();
    this.hasPin.set(false);
    this.status.set(null);
  }

  protected async log(action: PunchAction): Promise<void> {
    if (this.busy()) return;
    this.busy.set(action);
    this.status.set({ kind: 'warning', text: 'Getting location…' });

    const position = await this.punch.getLocation();
    const coords = position?.coords;
    this.status.set({ kind: 'warning', text: `Sending ${action}…` });

    try {
      const result = await this.punch.logAction({
        action,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracy: coords?.accuracy ?? null,
      });
      this.status.set({
        kind: coords ? 'success' : 'warning',
        text: coords
          ? `✓ ${result.action} logged at ${result.timestamp}`
          : `✓ ${result.action} logged at ${result.timestamp} (no location – check permission)`,
      });
      navigator.vibrate?.(80);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.changePin();
      }
      this.status.set({ kind: 'error', text: this.errorText(err, `${action} failed`) });
    } finally {
      this.busy.set(null);
    }
  }

  private errorText(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'No connection to server';
      if (err.status === 401) return 'PIN rejected – please re-enter it';
      return err.error?.error ?? fallback;
    }
    return fallback;
  }
}
