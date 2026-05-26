import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { FormsModule } from '@angular/forms';
import { EditorApiService, ProjectDetail } from './editor.api';
import { MonacoHostComponent } from './dsl/monaco-host.component';
import { GraphViewComponent } from './graph/graph-view.component';
import { EditorStore } from './editor.store';
import { ScenePropsComponent } from './scene-props/scene-props.component';
import { PublishDialogComponent } from './publish/publish-dialog.component';
import type { LayoutData } from './graph/dagre-layout';
import type { Character } from '@interactive-video/shared';

export type EditorTab = 'dsl' | 'graph' | 'split';

@Component({
  selector: 'app-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, MonacoHostComponent, GraphViewComponent, ScenePropsComponent],
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
  readonly analyticsOpen = signal(true);

  /** Split ratio (0–1) — fraction of width for the DSL pane. */
  readonly splitRatio = signal(0.6);
  private draggingSplitter = false;

  /** Search query for filtering characters in side-panel. */
  readonly characterSearch = signal('');
  /** Selected character name for highlighting related scenes. */
  readonly selectedCharacterName = signal<string | null>(null);

  /** Characters filtered by search query. */
  readonly filteredCharacters = computed(() => {
    const chars = this.store.characters();
    const query = this.characterSearch().toLowerCase().trim();
    if (!query) return chars;
    return chars.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.displayName?.toLowerCase().includes(query) ?? false)
    );
  });

  /** Scene IDs mentioned by the selected character (for highlighting in side-panel). */
  readonly highlightedSceneIds = computed(() => {
    const name = this.selectedCharacterName();
    if (!name) return new Set<string>();
    const char = this.store.characters().find(c => c.name === name);
    if (!char) return new Set<string>();
    return new Set(char.mentionedInScenes);
  });

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

  toggleAnalytics(): void {
    this.analyticsOpen.update(v => !v);
  }

  onSplitterMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.draggingSplitter = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!this.draggingSplitter) return;
      const mainArea = (event.target as HTMLElement).parentElement;
      if (!mainArea) return;
      const rect = mainArea.getBoundingClientRect();
      const ratio = Math.min(0.85, Math.max(0.15, (e.clientX - rect.left) / rect.width));
      this.splitRatio.set(ratio);
      this.monacoHost()?.getEditor()?.layout();
    };

    const onMouseUp = () => {
      this.draggingSplitter = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.monacoHost()?.getEditor()?.layout();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
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
        // Preserve latestPublicId/latestVersion from current project (PATCH doesn't return them)
        this.project.set({
          ...updated,
          latestPublicId: proj.latestPublicId,
          latestVersion: proj.latestVersion,
        });
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

  onCharacterSearchChange(query: string): void {
    this.characterSearch.set(query);
  }

  onCharacterClick(char: Character): void {
    const current = this.selectedCharacterName();
    if (current === char.name) {
      // Toggle off
      this.selectedCharacterName.set(null);
    } else {
      this.selectedCharacterName.set(char.name);
    }
  }

  /** Navigate to a character's definition in the DSL. */
  goToCharacterInDsl(charName: string): void {
    // Characters don't have a line number in the domain model,
    // so we search the DSL text for the character declaration.
    const dsl = this.store.dslText();
    const pattern = new RegExp(`^\\s*character\\s+${charName}\\s*\\{`, 'm');
    const match = pattern.exec(dsl);
    if (match) {
      const lineNumber = dsl.substring(0, match.index).split('\n').length;
      this.activeTab.set('dsl');
      setTimeout(() => {
        const host = this.monacoHost();
        if (host) {
          host.getEditor()?.layout();
          host.revealLine(lineNumber);
        }
      }, 0);
    }
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

    const ref = this.dialog.open(PublishDialogComponent, {
      data: { projectId: proj.id, scenes, variables, warnings },
      panelClass: 'sf-dialog-panel',
      backdropClass: 'sf-dialog-backdrop',
    });

    // After dialog closes, refresh project to pick up latestPublicId
    ref.afterClosed().pipe(
      switchMap(() => this.api.get(proj.id)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((updated) => this.project.set(updated));
  }
}
