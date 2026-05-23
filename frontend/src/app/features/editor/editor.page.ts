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
import { Subject, EMPTY, switchMap, tap, debounceTime } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { EditorApiService, ProjectDetail } from './editor.api';
import { MonacoHostComponent } from './dsl/monaco-host.component';
import { GraphViewComponent } from './graph/graph-view.component';
import { EditorStore } from './editor.store';
import { ScenePropsComponent } from './scene-props/scene-props.component';
import { PublishDialogComponent } from './publish/publish-dialog.component';
import type { LayoutData } from './graph/dagre-layout';

export type EditorTab = 'dsl' | 'graph' | 'split';

@Component({
  selector: 'app-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MonacoHostComponent, GraphViewComponent, ScenePropsComponent],
  providers: [EditorStore],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
})
export class EditorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EditorApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly store = inject(EditorStore);
  private readonly monacoHost = viewChild<MonacoHostComponent>('monacoHost');

  readonly project = signal<ProjectDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly activeTab = signal<EditorTab>('dsl');
  /** Saved graph layout loaded from the backend. Null until loaded. */
  readonly graphLayout = signal<LayoutData | null>(null);

  readonly scenesOpen = signal(true);
  readonly variablesOpen = signal(true);
  readonly charactersOpen = signal(true);

  private readonly layoutChange$ = new Subject<LayoutData>();

  constructor() {
    this.route.paramMap.pipe(
      switchMap(params => this.api.get(params.get('id')!)),
      tap(project => {
        this.project.set(project);
        this.loading.set(false);
        this.store.updateDsl(project.dslText);

        this.graphLayout.set(project.layouts[0]?.data ?? null);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/projects']);
      },
    });

    // Debounced layout persistence: save at most once per 800ms of quiet.
    this.layoutChange$.pipe(
      debounceTime(800),
      switchMap(data => {
        const proj = this.project();
        if (!proj) return EMPTY;
        return this.api.saveLayout(proj.id, data);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();

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
        setTimeout(() => this.monacoHost()?.getEditor()?.layout(), 0);
        break;
      case '2':
        event.preventDefault();
        this.activeTab.set('graph');
        break;
      case '3':
        event.preventDefault();
        this.activeTab.set('split');
        setTimeout(() => this.monacoHost()?.getEditor()?.layout(), 0);
        break;
    }
  }

  setTab(tab: EditorTab): void {
    this.activeTab.set(tab);
    if (tab === 'dsl' || tab === 'split') {
      // Monaco can't measure its container while it's hidden (display:none).
      // Defer layout() by one tick so the browser has re-laid out the pane first.
      setTimeout(() => this.monacoHost()?.getEditor()?.layout(), 0);
    }
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
    // Reveal line in Monaco regardless of active tab.
    // Monaco is always in the DOM (via [hidden]), so revealLine + setPosition
    // work even when the pane is hidden — the editor remembers the position
    // and shows it when the user switches to DSL or split mode.
    const scene = this.store.scenes().find(s => s.id === sceneId);
    const host = this.monacoHost();
    if (scene && host) {
      host.revealLine(scene.line);
    }
  }

  onLayoutReady(data: LayoutData): void {
    // Update local signal so if the graph re-renders it won't recompute dagre.
    this.graphLayout.set(data);
    // Debounce the network save.
    this.layoutChange$.next(data);
  }

  onCloseSceneProps(): void {
    this.store.selectScene(null);
  }

  onJumpToDsl(): void {
    const scene = this.store.selectedScene();
    const host = this.monacoHost();
    if (!scene || !host) return;

    this.activeTab.set('dsl');
    setTimeout(() => {
      this.monacoHost()?.getEditor()?.layout();
      host.revealLine(scene.line);
    }, 0);
  }

  publish(): void {
    const proj = this.project();
    if (!proj) return;

    const scenes = this.store.scenes();
    const variables = this.store.variables();
    const warnings = scenes.filter(s => s.unreachable);

    this.dialog.open(PublishDialogComponent, {
      data: { projectId: proj.id, scenes, variables, warnings },
      panelClass: 'sf-dialog-panel',
      backdropClass: 'sf-dialog-backdrop',
    });
  }
}
