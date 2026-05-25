import { Injectable, computed, signal } from '@angular/core';
import type {
  RuntimeSnapshot,
  RuntimeScene,
  RuntimeChoice,
  RuntimeState,
} from '@interactive-video/shared';
import { evaluate } from '@interactive-video/shared';

export interface HistoryEntry {
  sceneId: string;
  chosenLabel: string | null;
  timestamp: number;
}

@Injectable()
export class PlayerStore {
  private readonly _snapshot = signal<RuntimeSnapshot | null>(null);
  private readonly _currentSceneId = signal<string | null>(null);
  private readonly _variables = signal<RuntimeState>({});
  private readonly _history = signal<HistoryEntry[]>([]);
  private readonly _finished = signal(false);

  readonly snapshot = this._snapshot.asReadonly();
  readonly currentSceneId = this._currentSceneId.asReadonly();
  readonly variables = this._variables.asReadonly();
  readonly history = this._history.asReadonly();
  readonly finished = this._finished.asReadonly();

  readonly currentScene = computed<RuntimeScene | null>(() => {
    const snap = this._snapshot();
    const id = this._currentSceneId();
    if (!snap || !id) return null;
    return snap.scenes[id] ?? null;
  });

  readonly availableChoices = computed<RuntimeChoice[]>(() => {
    const scene = this.currentScene();
    if (!scene) return [];
    const vars = this._variables();
    return scene.choices.filter((c) => {
      if (!c.conditionAst) return true;
      try {
        return !!evaluate(c.conditionAst, vars);
      } catch {
        return false;
      }
    });
  });

  readonly isEnding = computed(() => {
    const scene = this.currentScene();
    if (!scene) return false;
    return scene.choices.length === 0 && !scene.autoTransition;
  });

  readonly sceneIndex = computed(() => {
    return this._history().length;
  });

  readonly totalScenes = computed(() => {
    const snap = this._snapshot();
    return snap ? Object.keys(snap.scenes).length : 0;
  });

  init(snapshot: RuntimeSnapshot): void {
    this._snapshot.set(snapshot);
    this._variables.set({ ...snapshot.initialState });
    this._currentSceneId.set(snapshot.startSceneId);
    this._history.set([
      {
        sceneId: snapshot.startSceneId,
        chosenLabel: null,
        timestamp: Date.now(),
      },
    ]);
    this._finished.set(false);
  }

  makeChoice(target: string, label: string): void {
    const snap = this._snapshot();
    if (!snap || !snap.scenes[target]) return;

    this._history.update((h) => [
      ...h,
      { sceneId: target, chosenLabel: label, timestamp: Date.now() },
    ]);
    this._currentSceneId.set(target);

    const nextScene = snap.scenes[target];
    if (nextScene.choices.length === 0 && !nextScene.autoTransition) {
      this._finished.set(true);
    }
  }

  followAutoTransition(): void {
    const scene = this.currentScene();
    if (!scene?.autoTransition) return;
    const target = scene.autoTransition;
    this._history.update((h) => [
      ...h,
      { sceneId: target, chosenLabel: null, timestamp: Date.now() },
    ]);
    this._currentSceneId.set(target);

    const snap = this._snapshot();
    if (snap) {
      const nextScene = snap.scenes[target];
      if (nextScene && nextScene.choices.length === 0 && !nextScene.autoTransition) {
        this._finished.set(true);
      }
    }
  }

  updateVariable(name: string, value: number | string | boolean): void {
    this._variables.update((v) => ({ ...v, [name]: value }));
  }

  restart(): void {
    const snap = this._snapshot();
    if (!snap) return;
    this.init(snap);
  }
}
