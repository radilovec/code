import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import { EditorApiService, ProjectDetail } from './editor.api';
import { MonacoHostComponent } from './dsl/monaco-host.component';
import { GraphViewComponent } from './graph/graph-view.component';
import { EditorStore } from './editor.store';

export type EditorTab = 'dsl' | 'graph' | 'split';

@Component({
  selector: 'app-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MonacoHostComponent, GraphViewComponent],
  providers: [EditorStore],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
})
export class EditorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EditorApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly store = inject(EditorStore);
  private readonly monacoHost = viewChild<MonacoHostComponent>('monacoHost');

  readonly project = signal<ProjectDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly activeTab = signal<EditorTab>('dsl');

  readonly scenesOpen = signal(true);
  readonly variablesOpen = signal(true);
  readonly charactersOpen = signal(true);

  constructor() {
    this.route.paramMap.pipe(
      switchMap(params => this.api.get(params.get('id')!)),
      tap(project => {
        this.project.set(project);
        this.loading.set(false);
        this.store.updateDsl(project.dslText);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/projects']);
      },
    });

    // Sync diagnostics → Monaco markers
    effect(() => {
      const diagnostics = this.store.diagnostics();
      const host = this.monacoHost();
      if (!host) return;

      host.setMarkers(diagnostics.map(d => ({
        severity: d.severity,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.endLine,
        endColumn: d.endColumn,
      })));
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey)) return;

    switch (event.key) {
      case '1':
        event.preventDefault();
        this.activeTab.set('dsl');
        break;
      case '2':
        event.preventDefault();
        this.activeTab.set('graph');
        break;
      case '3':
        event.preventDefault();
        this.activeTab.set('split');
        break;
    }
  }

  setTab(tab: EditorTab): void {
    this.activeTab.set(tab);
  }

  toggleScenes(): void {
    this.scenesOpen.update(v => !v);
  }

  toggleVariables(): void {
    this.variablesOpen.update(v => !v);
  }

  toggleCharacters(): void {
    this.charactersOpen.update(v => !v);
  }

  onDslChange(dslText: string): void {
    this.store.updateDsl(dslText);
  }

  onSaveDsl(dslText: string): void {
    const proj = this.project();
    if (!proj) return;

    this.saving.set(true);
    this.api.update(proj.id, { dslText }).pipe(
      tap(updated => {
        this.project.set(updated);
        this.saving.set(false);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      error: () => this.saving.set(false),
    });
  }

  goToScene(sceneId: string): void {
    this.store.selectScene(sceneId);
    const scene = this.store.scenes().find(s => s.id === sceneId);
    const host = this.monacoHost();
    if (scene && host) {
      host.revealLine(scene.line);
    }
  }

  onGraphSceneSelected(sceneId: string): void {
    this.store.selectScene(sceneId);
    // If split mode, also reveal in Monaco
    if (this.activeTab() === 'split') {
      const scene = this.store.scenes().find(s => s.id === sceneId);
      const host = this.monacoHost();
      if (scene && host) {
        host.revealLine(scene.line);
      }
    }
  }

  publish(): void {
    // T6.3 — реализуется в задаче публикации
  }
}
