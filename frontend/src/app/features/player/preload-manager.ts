import { Injectable, signal } from '@angular/core';
import type { RuntimeScene, RuntimeSnapshot } from '@interactive-video/shared';

export interface PreloadedVideo {
  sceneId: string;
  url: string;
  startSec: number;
  element: HTMLVideoElement;
}

/**
 * PreloadManagerService manages two video elements for seamless scene transitions.
 * Primary = currently visible, Secondary = preloading next scene in background.
 * On transition: if next scene is preloaded → swap (crossfade), else fallback to normal load.
 */
@Injectable()
export class PreloadManagerService {
  private snapshot: RuntimeSnapshot | null = null;

  /** The two video elements managed by this service */
  private primaryEl: HTMLVideoElement | null = null;
  private secondaryEl: HTMLVideoElement | null = null;

  /** What's currently preloaded in the secondary element */
  private preloaded = signal<PreloadedVideo | null>(null);

  /** Whether a preloaded video is ready for the given scene */
  isPreloadedFor(sceneId: string): boolean {
    const p = this.preloaded();
    return p !== null && p.sceneId === sceneId;
  }

  init(snapshot: RuntimeSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Register the two video DOM elements */
  setElements(primary: HTMLVideoElement, secondary: HTMLVideoElement): void {
    this.primaryEl = primary;
    this.secondaryEl = secondary;
  }

  /**
   * Called when a new scene starts playing.
   * Determines likely next scenes and preloads the first one with video.
   */
  preloadNextScenes(currentScene: RuntimeScene, variables: Record<string, unknown>): void {
    if (!this.snapshot || !this.secondaryEl) return;

    const candidates = this.getNextCandidates(currentScene);
    if (candidates.length === 0) {
      this.preloaded.set(null);
      return;
    }

    // Find first candidate that has video
    const nextWithVideo = candidates.find((id) => {
      const scene = this.snapshot!.scenes[id];
      return scene?.video != null;
    });

    if (!nextWithVideo) {
      this.preloaded.set(null);
      return;
    }

    const nextScene = this.snapshot.scenes[nextWithVideo];
    const video = nextScene.video!;

    // If already preloading this scene, skip
    const current = this.preloaded();
    if (current && current.sceneId === nextWithVideo && current.url === video.url) {
      return;
    }

    // Start preloading
    const el = this.secondaryEl;
    el.src = video.url;
    el.currentTime = video.startSec;
    el.preload = 'auto';
    el.load();

    this.preloaded.set({
      sceneId: nextWithVideo,
      url: video.url,
      startSec: video.startSec,
      element: el,
    });
  }

  /**
   * Attempt to use preloaded video for a transition.
   * Returns the secondary element if preloaded matches, otherwise null.
   * After swap, the old primary becomes the new secondary for future preloads.
   */
  trySwap(targetSceneId: string): HTMLVideoElement | null {
    const p = this.preloaded();
    if (!p || p.sceneId !== targetSceneId || !this.primaryEl || !this.secondaryEl) {
      return null;
    }

    // Swap references: secondary becomes primary, old primary becomes secondary
    const oldPrimary = this.primaryEl;
    this.primaryEl = this.secondaryEl;
    this.secondaryEl = oldPrimary;

    // Clear preloaded state
    this.preloaded.set(null);

    return this.primaryEl;
  }

  /** Get primary video element */
  getPrimary(): HTMLVideoElement | null {
    return this.primaryEl;
  }

  /** Get secondary video element */
  getSecondary(): HTMLVideoElement | null {
    return this.secondaryEl;
  }

  /** Stop all preloading */
  reset(): void {
    if (this.secondaryEl) {
      this.secondaryEl.src = '';
      this.secondaryEl.load();
    }
    this.preloaded.set(null);
  }

  /**
   * Get candidate scene IDs for preloading.
   * Priority: autoTransition > first choice target.
   */
  private getNextCandidates(scene: RuntimeScene): string[] {
    const candidates: string[] = [];

    if (scene.autoTransition) {
      candidates.push(scene.autoTransition);
    }

    for (const choice of scene.choices) {
      if (!candidates.includes(choice.target)) {
        candidates.push(choice.target);
      }
    }

    return candidates;
  }
}
