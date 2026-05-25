import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import type { RuntimeSnapshot } from '@interactive-video/shared';

export interface SnapshotResponse {
  version: number;
  snapshotData: RuntimeSnapshot;
  publishedAt: string;
}

export interface SessionCreatedResponse {
  id: string;
  createdAt: string;
}

export interface CreateSessionBody {
  finalState: Record<string, unknown>;
  visitedScenes?: Array<Record<string, unknown>>;
  completedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class PlayerApiService {
  private readonly http = inject(HttpClient);

  getSnapshot(publicId: string): Observable<RuntimeSnapshot> {
    return this.http
      .get<SnapshotResponse>(`/api/runtime/${publicId}`)
      .pipe(map((res) => res.snapshotData));
  }

  saveSession(publicId: string, body: CreateSessionBody): Observable<SessionCreatedResponse> {
    return this.http.post<SessionCreatedResponse>(`/api/sessions/snapshot/${publicId}`, body);
  }
}
