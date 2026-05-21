import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  dslText: string;
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
}
