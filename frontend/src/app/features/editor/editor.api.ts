import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { LayoutData } from './graph/dagre-layout';

export interface LayoutRecord {
  id: string;
  data: LayoutData;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  dslText: string;
  layouts: LayoutRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  dslText?: string;
}

@Injectable({ providedIn: 'root' })
export class EditorApiService {
  private readonly http = inject(HttpClient);

  get(id: string): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`/api/projects/${id}`);
  }

  update(id: string, payload: UpdateProjectPayload): Observable<ProjectDetail> {
    return this.http.patch<ProjectDetail>(`/api/projects/${id}`, payload);
  }

  saveLayout(id: string, data: LayoutData): Observable<void> {
    return this.http.patch<void>(`/api/projects/${id}/layout`, { data });
  }
}
