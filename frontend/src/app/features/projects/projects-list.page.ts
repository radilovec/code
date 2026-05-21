import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, switchMap, tap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectsApiService, ProjectSummary } from './projects.api';
import { NewProjectDialogComponent, NewProjectResult } from './new-project-dialog/new-project-dialog.component';

export type FilterType = 'all' | 'draft' | 'published';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  return `${Math.floor(days / 7)} нед. назад`;
}

@Component({
  selector: 'app-projects-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './projects-list.page.html',
  styleUrl: './projects-list.page.scss',
})
export class ProjectsListPageComponent {
  private readonly api = inject(ProjectsApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly allProjects = signal<ProjectSummary[]>([]);
  readonly loading = signal(true);
  readonly activeFilter = signal<FilterType>('all');
  readonly openMenuId = signal<string | null>(null);

  readonly draftCount = computed(() =>
    this.allProjects().filter(p => p._count.publishedSnapshots === 0).length,
  );
  readonly publishedCount = computed(() =>
    this.allProjects().filter(p => p._count.publishedSnapshots > 0).length,
  );

  readonly filteredProjects = computed(() => {
    const f = this.activeFilter();
    return this.allProjects().filter(p => {
      const isPub = p._count.publishedSnapshots > 0;
      if (f === 'draft') return !isPub;
      if (f === 'published') return isPub;
      return true;
    });
  });

  readonly userInitials = computed(() => {
    const email = this.auth.user()?.email ?? '';
    return email.slice(0, 2).toUpperCase();
  });

  constructor() {
    this.loadProjects();
  }

  relativeTime = relativeTime;

  isPublished(p: ProjectSummary): boolean {
    return p._count.publishedSnapshots > 0;
  }

  toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId.update(current => (current === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  openNewProjectDialog(): void {
    const ref = this.dialog.open(NewProjectDialogComponent, {
      backdropClass: 'sf-dialog-backdrop',
      panelClass: 'sf-dialog-panel',
      width: '600px',
      disableClose: false,
    });

    ref.afterClosed().pipe(
      filter((result): result is NewProjectResult => !!result),
      switchMap(result =>
        this.api.create({
          name: result.name,
          description: result.description,
          dslText: result.dslText,
        }).pipe(
          tap(project => {
            if (result.openAfterCreate) {
              void this.router.navigate(['/editor', project.id]);
            } else {
              this.loadProjects();
            }
          }),
        ),
      ),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  deleteProject(project: ProjectSummary, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    if (!window.confirm(`Удалить проект «${project.name}»? Это действие нельзя отменить.`)) {
      return;
    }
    this.api.remove(project.id).pipe(
      tap(() => this.allProjects.update(list => list.filter(p => p.id !== project.id))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  openProject(project: ProjectSummary): void {
    void this.router.navigate(['/editor', project.id]);
  }

  setFilter(f: FilterType): void {
    this.activeFilter.set(f);
  }

  private loadProjects(): void {
    this.loading.set(true);
    this.api.list().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: list => {
        this.allProjects.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
