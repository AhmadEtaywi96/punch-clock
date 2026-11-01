import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PunchAction, PunchService } from './punch.service';

interface Status {
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface LastPunch {
  action: PunchAction;
  time: string;
}

const LAST_PUNCH_KEY = 'punchClockLast';
const TOAST_MS = 4000;

@Component({
  selector: 'app-root',
  imports: [FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly punch = inject(PunchService);
  private toastTimer?: ReturnType<typeof setTimeout>;

  protected readonly actions: { action: PunchAction; label: string; hint: string; css: string }[] = [
    { action: 'Login', label: 'Login', hint: 'Start your day', css: 'login' },
    { action: 'Logout', label: 'Logout', hint: 'End your day', css: 'logout' },
    { action: 'Open Door', label: 'Open Door', hint: 'Log door access', css: 'door' },
  ];

  protected readonly hasPin = signal(!!this.punch.getPin());
  protected readonly pinInput = signal('');
  protected readonly busy = signal<PunchAction | 'pin' | null>(null);
  protected readonly status = signal<Status | null>(null);
  protected readonly now = signal(new Date());
  protected readonly lastPunch = signal<LastPunch | null>(this.loadLastPunch());

  protected readonly greeting = computed(() => {
    const h = this.now().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.toastTimer);
    });
  }

  protected async savePin(): Promise<void> {
    const pin = this.pinInput().trim();
    if (!pin) return;
    this.busy.set('pin');
    this.showStatus(null);
    try {
      await this.punch.verifyPin(pin);
      this.punch.savePin(pin);
      this.pinInput.set('');
      this.hasPin.set(true);
    } catch (err) {
      this.showStatus({ kind: 'error', text: this.errorText(err, 'Wrong PIN') });
    } finally {
      this.busy.set(null);
    }
  }

  protected changePin(): void {
    this.punch.clearPin();
    this.hasPin.set(false);
    this.showStatus(null);
  }

  protected dismissStatus(): void {
    this.showStatus(null);
  }

  protected async log(action: PunchAction): Promise<void> {
    if (this.busy()) return;
    this.busy.set(action);
    this.showStatus({ kind: 'info', text: 'Getting location…' });

    const position = await this.punch.getLocation();
    const coords = position?.coords;
    this.showStatus({ kind: 'info', text: `Sending ${action}…` });

    try {
      const result = await this.punch.logAction({
        action,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracy: coords?.accuracy ?? null,
      });
      const time = result.timestamp.slice(11, 16);
      this.saveLastPunch({ action: result.action, time });
      this.showStatus(
        coords
          ? { kind: 'success', text: `${result.action} logged at ${time}` }
          : { kind: 'warning', text: `${result.action} logged at ${time} – no location, check permission` },
      );
      navigator.vibrate?.(80);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.changePin();
      }
      this.showStatus({ kind: 'error', text: this.errorText(err, `${action} failed`) });
    } finally {
      this.busy.set(null);
    }
  }

  // Success toasts dismiss themselves; progress, warnings and errors stay until replaced.
  private showStatus(status: Status | null): void {
    clearTimeout(this.toastTimer);
    this.status.set(status);
    if (status?.kind === 'success') {
      this.toastTimer = setTimeout(() => this.status.set(null), TOAST_MS);
    }
  }

  private loadLastPunch(): LastPunch | null {
    try {
      return JSON.parse(localStorage.getItem(LAST_PUNCH_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private saveLastPunch(last: LastPunch): void {
    this.lastPunch.set(last);
    localStorage.setItem(LAST_PUNCH_KEY, JSON.stringify(last));
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
