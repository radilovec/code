import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { publishedSnapshots: number };
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  dslText: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<ProjectSummary[]> {
    return this.http.get<ProjectSummary[]>('/api/projects');
  }

  create(payload: CreateProjectPayload): Observable<ProjectSummary> {
    return this.http.post<ProjectSummary>('/api/projects', payload);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`);
  }
}
