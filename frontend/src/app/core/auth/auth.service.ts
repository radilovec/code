import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, Subject, catchError, of, shareReplay, switchMap, take, tap } from 'rxjs';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
}

export interface CurrentUser {
  id: string;
  email: string;
}

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<CurrentUser | null>(this.restoreUser());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private refresh$: Observable<TokenPair> | null = null;

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  login(email: string, password: string): Observable<void> {
    return this.http.post<TokenPair>('/api/auth/login', { email, password }).pipe(
      tap((tokens) => this.saveTokens(tokens)),
      switchMap(() => of(void 0)),
    );
  }

  register(email: string, password: string, name?: string): Observable<void> {
    return this.http.post<TokenPair>('/api/auth/register', { email, password, name }).pipe(
      tap((tokens) => this.saveTokens(tokens)),
      switchMap(() => of(void 0)),
    );
  }

  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      this.http.post('/api/auth/logout', { refreshToken }).pipe(
        catchError(() => of(null)),
      ).subscribe();
    }
    this.clearTokens();
    this.router.navigate(['/login']);
  }

  /**
   * Refreshes the access token. Deduplicates concurrent calls via shareReplay.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refresh$) {
      return this.refresh$.pipe(
        take(1),
        switchMap((tokens) => of(tokens.accessToken)),
      );
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.clearTokens();
      throw new Error('No refresh token');
    }

    this.refresh$ = this.http.post<TokenPair>('/api/auth/refresh', { refreshToken }).pipe(
      tap((tokens) => {
        this.saveTokens(tokens);
        this.refresh$ = null;
      }),
      catchError((err) => {
        this.clearTokens();
        this.refresh$ = null;
        this.router.navigate(['/login']);
        throw err;
      }),
      shareReplay(1),
    );

    return this.refresh$.pipe(
      take(1),
      switchMap((tokens) => of(tokens.accessToken)),
    );
  }

  private saveTokens(tokens: TokenPair): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    this._user.set(this.decodeUser(tokens.accessToken));
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this._user.set(null);
  }

  private restoreUser(): CurrentUser | null {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const user = this.decodeUser(token);
    if (!user) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as JwtPayload;
      if (payload.exp * 1000 < Date.now()) {
        return null;
      }
    } catch {
      return null;
    }
    return user;
  }

  private decodeUser(token: string): CurrentUser | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as JwtPayload;
      return { id: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }
}
