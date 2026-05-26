import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, switchMap, tap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectsApiService, ProjectSummary, MiniGraph } from './projects.api';
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

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly allProjects = signal<ProjectSummary[]>([]);
  readonly loading = signal(true);
  readonly activeFilter = signal<FilterType>('all');
  readonly openMenuId = signal<string | null>(null);
  readonly searchQuery = signal('');

  readonly draftCount = computed(() =>
    this.allProjects().filter(p => p._count.publishedSnapshots === 0).length,
  );
  readonly publishedCount = computed(() =>
    this.allProjects().filter(p => p._count.publishedSnapshots > 0).length,
  );

  readonly filteredProjects = computed(() => {
    const f = this.activeFilter();
    const q = this.searchQuery().toLowerCase().trim();
    return this.allProjects().filter(p => {
      const isPub = p._count.publishedSnapshots > 0;
      if (f === 'draft' && isPub) return false;
      if (f === 'published' && !isPub) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
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

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.searchInput()?.nativeElement.focus();
    }
  }

  relativeTime = relativeTime;

  thumbLayout(graph: MiniGraph | null): {
    nodes: { id: string; type: string; cx: number; cy: number }[];
    edges: { x1: number; y1: number; x2: number; y2: number }[];
  } {
    if (!graph || graph.nodes.length === 0) return { nodes: [], edges: [] };

    const W = 480, H = 270, PAD_X = 50, PAD_Y = 40;

    // BFS layered layout from roots
    const children = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const n of graph.nodes) {
      children.set(n.id, []);
      inDegree.set(n.id, 0);
    }
    for (const e of graph.edges) {
      children.get(e.from)?.push(e.to);
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }

    const layers: string[][] = [];
    const visited = new Set<string>();
    let queue = graph.nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);
    if (queue.length === 0) queue = [graph.nodes[0].id];

    while (queue.length > 0) {
      layers.push(queue);
      queue.forEach(id => visited.add(id));
      const next: string[] = [];
      for (const id of queue) {
        for (const child of children.get(id) ?? []) {
          if (!visited.has(child) && !next.includes(child)) next.push(child);
        }
      }
      queue = next;
    }
    // Add any unvisited nodes to last layer
    for (const n of graph.nodes) {
      if (!visited.has(n.id)) {
        if (layers.length === 0) layers.push([]);
        layers[layers.length - 1].push(n.id);
      }
    }

    const typeMap = new Map(graph.nodes.map(n => [n.id, n.type]));
    const posMap = new Map<string, { cx: number; cy: number }>();
    const colCount = layers.length;

    for (let col = 0; col < colCount; col++) {
      const layer = layers[col];
      const x = colCount === 1 ? W / 2 : PAD_X + (col / (colCount - 1)) * (W - 2 * PAD_X);
      for (let row = 0; row < layer.length; row++) {
        const y = layer.length === 1 ? H / 2 : PAD_Y + (row / (layer.length - 1)) * (H - 2 * PAD_Y);
        posMap.set(layer[row], { cx: x, cy: y });
      }
    }

    const nodes = graph.nodes.map(n => ({
      id: n.id,
      type: n.type,
      ...posMap.get(n.id)!,
    }));

    const edges = graph.edges
      .filter(e => posMap.has(e.from) && posMap.has(e.to))
      .map(e => {
        const from = posMap.get(e.from)!;
        const to = posMap.get(e.to)!;
        return { x1: from.cx, y1: from.cy, x2: to.cx, y2: to.cy };
      });

    return { nodes, edges };
  }

  edgePath(e: { x1: number; y1: number; x2: number; y2: number }): string {
    const dx = (e.x2 - e.x1) / 2;
    return `M${e.x1},${e.y1} C${e.x1 + dx},${e.y1} ${e.x2 - dx},${e.y2} ${e.x2},${e.y2}`;
  }

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
