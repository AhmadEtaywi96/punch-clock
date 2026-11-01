import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type PunchAction = 'Login' | 'Logout' | 'Open Door';

export interface PunchPayload {
  action: PunchAction;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface PunchResult {
  ok: boolean;
  action: PunchAction;
  timestamp: string;
  location: string;
}

const PIN_KEY = 'punchClockPin';

@Injectable({ providedIn: 'root' })
export class PunchService {
  private readonly http = inject(HttpClient);

  getPin(): string | null {
    return localStorage.getItem(PIN_KEY);
  }

  savePin(pin: string): void {
    localStorage.setItem(PIN_KEY, pin);
  }

  clearPin(): void {
    localStorage.removeItem(PIN_KEY);
  }

  verifyPin(pin: string): Promise<unknown> {
    return firstValueFrom(this.http.get('/api/verify-pin', { headers: this.authHeaders(pin) }));
  }

  logAction(payload: PunchPayload): Promise<PunchResult> {
    return firstValueFrom(
      this.http.post<PunchResult>('/api/log-action', payload, {
        headers: this.authHeaders(this.getPin() ?? ''),
      }),
    );
  }

  /** Resolves with the current position, or null if unavailable/denied. */
  getLocation(): Promise<GeolocationPosition | null> {
    if (!('geolocation' in navigator)) return Promise.resolve(null);
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }),
    );
  }

  private authHeaders(pin: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${pin}` });
  }
}
